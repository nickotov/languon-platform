import { Buffer } from "node:buffer";

import { and, eq, gt, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type { databaseSchema } from "../../../../../infrastructure/database/schema";
import {
  type AuthenticationTransactionRepository,
  type NewSecurityEvent,
  RefreshSessionRotationConflictError,
  type StoredPasskey,
  type StoredPasswordCredential,
  type StoredRefreshSession,
  type StoredVerificationChallenge,
  mapStoredPasskey,
  mapStoredRefreshSession,
  throwMappedAuthenticationConflict,
} from "./drizzle-authentication-repository";
import {
  authPasskeysTable,
  authSecurityEventsTable,
  authSessionsTable,
  authVerificationChallengesTable,
  passwordCredentialsTable,
} from "./schema";

type AuthenticationTransaction = Parameters<
  Parameters<PostgresJsDatabase<typeof databaseSchema>["transaction"]>[0]
>[0];

// Intentionally local to the unit-of-work module. No exported factory accepts a
// structurally compatible root database handle for write-capable construction.
class TransactionalAuthenticationRepository implements AuthenticationTransactionRepository {
  public constructor(private readonly transaction: AuthenticationTransaction) {}

  public async findPasswordCredentialByUserId(
    userId: string,
  ): Promise<StoredPasswordCredential | null> {
    const rows = await this.transaction
      .select()
      .from(passwordCredentialsTable)
      .where(eq(passwordCredentialsTable.userId, userId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    if (row.algorithm !== "argon2id") {
      throw new Error("Persisted password algorithm is unsupported.");
    }
    return { ...row, algorithm: "argon2id" };
  }

  public async savePasswordCredential(
    credential: StoredPasswordCredential,
  ): Promise<void> {
    await this.transaction
      .insert(passwordCredentialsTable)
      .values(credential)
      .onConflictDoUpdate({
        set: {
          algorithm: credential.algorithm,
          algorithmVersion: credential.algorithmVersion,
          hash: credential.hash,
          memoryCostKiB: credential.memoryCostKiB,
          parallelism: credential.parallelism,
          timeCost: credential.timeCost,
          updatedAt: credential.updatedAt,
        },
        target: passwordCredentialsTable.userId,
      });
  }

  public async insertVerificationChallenge(
    challenge: StoredVerificationChallenge,
  ): Promise<void> {
    try {
      await this.transaction.insert(authVerificationChallengesTable).values({
        attempts: challenge.attemptsUsed,
        codeDigest: challenge.codeDigest,
        consumedAt: challenge.consumedAt,
        createdAt: challenge.issuedAt,
        emailId: challenge.emailId,
        expiresAt: challenge.expiresAt,
        flowId: challenge.flowId,
        invalidatedAt: challenge.invalidatedAt,
        lastSentAt: challenge.lastSentAt,
        purpose: challenge.purpose,
        sendCount: challenge.sendCount,
        sendWindowStartedAt: challenge.issuedAt,
        updatedAt: challenge.updatedAt,
        userId: challenge.userId,
      });
    } catch (error) {
      throwMappedAuthenticationConflict(error);
    }
  }

  public async invalidateActiveVerificationChallenges(input: {
    invalidatedAt: Date;
    purpose: StoredVerificationChallenge["purpose"];
    userId: string;
  }): Promise<number> {
    const invalidated = await this.transaction
      .update(authVerificationChallengesTable)
      .set({
        invalidatedAt: input.invalidatedAt,
        updatedAt: input.invalidatedAt,
      })
      .where(
        and(
          eq(authVerificationChallengesTable.userId, input.userId),
          eq(authVerificationChallengesTable.purpose, input.purpose),
          isNull(authVerificationChallengesTable.consumedAt),
          isNull(authVerificationChallengesTable.invalidatedAt),
        ),
      )
      .returning({ flowId: authVerificationChallengesTable.flowId });
    return invalidated.length;
  }

  public async findVerificationChallengeForUpdate(input: {
    flowId: string;
    purpose: StoredVerificationChallenge["purpose"];
  }): Promise<StoredVerificationChallenge | null> {
    const rows = await this.transaction
      .select()
      .from(authVerificationChallengesTable)
      .where(
        and(
          eq(authVerificationChallengesTable.flowId, input.flowId),
          eq(authVerificationChallengesTable.purpose, input.purpose),
        ),
      )
      .limit(1)
      .for("update");
    const row = rows[0];
    return row
      ? {
          attemptsUsed: row.attempts,
          codeDigest: row.codeDigest,
          consumedAt: row.consumedAt,
          emailId: row.emailId,
          expiresAt: row.expiresAt,
          flowId: row.flowId,
          invalidatedAt: row.invalidatedAt,
          issuedAt: row.createdAt,
          lastSentAt: row.lastSentAt,
          purpose: row.purpose,
          sendCount: row.sendCount,
          updatedAt: row.updatedAt,
          userId: row.userId,
        }
      : null;
  }

  public async updateVerificationChallengeState(input: {
    attemptsUsed: number;
    consumedAt: Date | null;
    flowId: string;
    invalidatedAt: Date | null;
    updatedAt: Date;
  }): Promise<boolean> {
    const updated = await this.transaction
      .update(authVerificationChallengesTable)
      .set({
        attempts: input.attemptsUsed,
        consumedAt: input.consumedAt,
        invalidatedAt: input.invalidatedAt,
        updatedAt: input.updatedAt,
      })
      .where(eq(authVerificationChallengesTable.flowId, input.flowId))
      .returning({ flowId: authVerificationChallengesTable.flowId });
    return updated.length === 1;
  }

  public async insertRefreshSession(
    session: StoredRefreshSession,
  ): Promise<void> {
    try {
      await this.transaction.insert(authSessionsTable).values({
        absoluteExpiresAt: session.absoluteExpiresAt,
        authenticatedAt: session.authenticatedAt,
        authenticationMethod: session.authenticationMethod,
        clientLabel: session.clientLabel,
        createdAt: session.createdAt,
        familyId: session.familyId,
        id: session.id,
        lastUsedAt: session.lastUsedAt,
        predecessorSessionId: session.predecessorSessionId,
        refreshTokenDigest: session.refreshDigest,
        replayDetectedAt: session.replayDetectedAt,
        revokedAt: session.revokedAt,
        revocationReason: session.revocationReason,
        rotatedAt: session.consumedAt,
        rotatedToSessionId: session.successorId,
        updatedAt: session.updatedAt,
        userId: session.userId,
      });
    } catch (error) {
      throwMappedAuthenticationConflict(error);
    }
  }

  public async findRefreshSessionByDigestForUpdate(
    refreshDigest: string,
  ): Promise<StoredRefreshSession | null> {
    const rows = await this.transaction
      .select()
      .from(authSessionsTable)
      .where(eq(authSessionsTable.refreshTokenDigest, refreshDigest))
      .limit(1)
      .for("update");
    return rows[0] ? mapStoredRefreshSession(rows[0]) : null;
  }

  public async findRefreshSessionById(
    id: string,
  ): Promise<StoredRefreshSession | null> {
    const rows = await this.transaction
      .select()
      .from(authSessionsTable)
      .where(eq(authSessionsTable.id, id))
      .limit(1);
    return rows[0] ? mapStoredRefreshSession(rows[0]) : null;
  }

  public async saveRefreshSessionRotation(input: {
    consumedAt: Date;
    predecessorId: string;
    successor: StoredRefreshSession;
  }): Promise<void> {
    try {
      await this.transaction.insert(authSessionsTable).values({
        absoluteExpiresAt: input.successor.absoluteExpiresAt,
        authenticatedAt: input.successor.authenticatedAt,
        authenticationMethod: input.successor.authenticationMethod,
        clientLabel: input.successor.clientLabel,
        createdAt: input.successor.createdAt,
        familyId: input.successor.familyId,
        id: input.successor.id,
        lastUsedAt: input.successor.lastUsedAt,
        predecessorSessionId: input.predecessorId,
        refreshTokenDigest: input.successor.refreshDigest,
        updatedAt: input.successor.updatedAt,
        userId: input.successor.userId,
      });
    } catch (error) {
      throwMappedAuthenticationConflict(error);
    }

    const consumed = await this.transaction
      .update(authSessionsTable)
      .set({
        rotatedAt: input.consumedAt,
        rotatedToSessionId: input.successor.id,
        updatedAt: input.consumedAt,
      })
      .where(
        and(
          eq(authSessionsTable.id, input.predecessorId),
          isNull(authSessionsTable.revokedAt),
          isNull(authSessionsTable.rotatedAt),
          gt(authSessionsTable.absoluteExpiresAt, input.consumedAt),
        ),
      )
      .returning({ id: authSessionsTable.id });
    if (consumed.length !== 1) {
      throw new RefreshSessionRotationConflictError();
    }
  }

  public async revokeRefreshSessionFamily(input: {
    familyId: string;
    reason: string;
    replayDetectedSessionId?: string;
    revokedAt: Date;
  }): Promise<number> {
    const revoked = await this.transaction
      .update(authSessionsTable)
      .set({
        revocationReason: input.reason,
        revokedAt: input.revokedAt,
        updatedAt: input.revokedAt,
      })
      .where(
        and(
          eq(authSessionsTable.familyId, input.familyId),
          isNull(authSessionsTable.revokedAt),
        ),
      )
      .returning({ id: authSessionsTable.id });
    if (input.replayDetectedSessionId) {
      await this.transaction
        .update(authSessionsTable)
        .set({
          replayDetectedAt: input.revokedAt,
          revocationReason: input.reason,
          revokedAt: input.revokedAt,
          updatedAt: input.revokedAt,
        })
        .where(eq(authSessionsTable.id, input.replayDetectedSessionId));
    }
    return revoked.length;
  }

  public async insertPasskey(passkey: StoredPasskey): Promise<void> {
    try {
      await this.transaction.insert(authPasskeysTable).values({
        backedUp: passkey.backedUp,
        canonicalName: passkey.canonicalName,
        counter: passkey.counter,
        createdAt: passkey.createdAt,
        credentialDeviceType: passkey.deviceType,
        credentialId: passkey.credentialId,
        id: passkey.id,
        lastUsedAt: passkey.lastUsedAt,
        name: passkey.name,
        publicKey: Buffer.from(passkey.credentialPublicKey).toString(
          "base64url",
        ),
        revokedAt: passkey.revokedAt,
        transports: passkey.transports,
        updatedAt: passkey.updatedAt,
        userHandle: passkey.userHandle,
        userId: passkey.userId,
      });
    } catch (error) {
      throwMappedAuthenticationConflict(error);
    }
  }

  public async findPasskeyByCredentialIdForUpdate(
    credentialId: string,
  ): Promise<StoredPasskey | null> {
    const rows = await this.transaction
      .select()
      .from(authPasskeysTable)
      .where(eq(authPasskeysTable.credentialId, credentialId))
      .limit(1)
      .for("update");
    return rows[0] ? mapStoredPasskey(rows[0]) : null;
  }

  public async updatePasskeyUse(input: {
    backedUp: boolean;
    deviceType: StoredPasskey["deviceType"];
    expectedCounter: number;
    id: string;
    lastUsedAt: Date;
    nextCounter: number;
  }): Promise<boolean> {
    const updated = await this.transaction
      .update(authPasskeysTable)
      .set({
        backedUp: input.backedUp,
        counter: input.nextCounter,
        credentialDeviceType: input.deviceType,
        lastUsedAt: input.lastUsedAt,
        updatedAt: input.lastUsedAt,
      })
      .where(
        and(
          eq(authPasskeysTable.id, input.id),
          eq(authPasskeysTable.counter, input.expectedCounter),
          isNull(authPasskeysTable.revokedAt),
        ),
      )
      .returning({ id: authPasskeysTable.id });
    return updated.length === 1;
  }

  public async renamePasskey(input: {
    canonicalName: string;
    id: string;
    name: string;
    updatedAt: Date;
    userId: string;
  }): Promise<boolean> {
    try {
      const renamed = await this.transaction
        .update(authPasskeysTable)
        .set({
          canonicalName: input.canonicalName,
          name: input.name,
          updatedAt: input.updatedAt,
        })
        .where(
          and(
            eq(authPasskeysTable.id, input.id),
            eq(authPasskeysTable.userId, input.userId),
            isNull(authPasskeysTable.revokedAt),
          ),
        )
        .returning({ id: authPasskeysTable.id });
      return renamed.length === 1;
    } catch (error) {
      throwMappedAuthenticationConflict(error);
    }
  }

  public async revokePasskey(input: {
    id: string;
    revokedAt: Date;
    userId: string;
  }): Promise<boolean> {
    const revoked = await this.transaction
      .update(authPasskeysTable)
      .set({ revokedAt: input.revokedAt, updatedAt: input.revokedAt })
      .where(
        and(
          eq(authPasskeysTable.id, input.id),
          eq(authPasskeysTable.userId, input.userId),
          isNull(authPasskeysTable.revokedAt),
        ),
      )
      .returning({ id: authPasskeysTable.id });
    return revoked.length === 1;
  }

  public async appendSecurityEvent(event: NewSecurityEvent): Promise<void> {
    await this.transaction.insert(authSecurityEventsTable).values({
      correlationId: event.correlationId,
      errorCategory: event.errorCategory,
      eventType: event.eventType,
      expiresAt: event.expiresAt,
      id: event.id,
      metadata: event.metadata,
      occurredAt: event.occurredAt,
      outcome: event.outcome,
      sessionId: event.sessionId,
      userId: event.userId,
    });
  }
}

export interface DrizzleAuthenticationRepositories {
  authentication: AuthenticationTransactionRepository;
}

export class DrizzleAuthenticationUnitOfWork {
  public constructor(
    private readonly database: PostgresJsDatabase<typeof databaseSchema>,
  ) {}

  public execute<T>(
    work: (repositories: DrizzleAuthenticationRepositories) => Promise<T>,
  ): Promise<T> {
    return this.database.transaction((transaction) =>
      work({
        authentication: new TransactionalAuthenticationRepository(transaction),
      }),
    );
  }
}
