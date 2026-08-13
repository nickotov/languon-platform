import { Buffer } from "node:buffer";

import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type { databaseSchema } from "../../../../../infrastructure/database/schema";
import type { authPasskeysTable } from "./schema";
import { authSessionsTable, passwordCredentialsTable } from "./schema";

type AuthenticationReadDatabase = Pick<
  PostgresJsDatabase<typeof databaseSchema>,
  "select"
>;

interface DatabaseError {
  cause?: unknown;
  code?: unknown;
  constraint_name?: unknown;
}

export type AuthenticationConflictKind =
  | "active_challenge"
  | "passkey_credential"
  | "passkey_name"
  | "refresh_digest"
  | "session_rotation";

export class AuthenticationPersistenceConflictError extends Error {
  public constructor(public readonly kind: AuthenticationConflictKind) {
    super("Authentication persistence conflict.");
    this.name = "AuthenticationPersistenceConflictError";
  }
}

export class RefreshSessionRotationConflictError extends Error {
  public constructor() {
    super("The refresh session can no longer be rotated.");
    this.name = "RefreshSessionRotationConflictError";
  }
}

export interface StoredPasswordCredential {
  algorithm: "argon2id";
  algorithmVersion: number;
  createdAt: Date;
  hash: string;
  memoryCostKiB: number;
  parallelism: number;
  timeCost: number;
  updatedAt: Date;
  userId: string;
}

export interface StoredVerificationChallenge {
  attemptsUsed: number;
  codeDigest: string;
  consumedAt: Date | null;
  emailId: string;
  expiresAt: Date;
  flowId: string;
  invalidatedAt: Date | null;
  issuedAt: Date;
  lastSentAt: Date;
  purpose: "email_verification" | "password_reset";
  sendCount: number;
  updatedAt: Date;
  userId: string;
}

export interface StoredRefreshSession {
  absoluteExpiresAt: Date;
  authenticatedAt: Date;
  authenticationMethod: "email_verification" | "passkey" | "password";
  clientLabel: string | null;
  consumedAt: Date | null;
  createdAt: Date;
  familyId: string;
  id: string;
  lastUsedAt: Date | null;
  predecessorSessionId: string | null;
  refreshDigest: string;
  replayDetectedAt: Date | null;
  revokedAt: Date | null;
  revocationReason: string | null;
  successorId: string | null;
  updatedAt: Date;
  userId: string;
}

export interface StoredPasskey {
  backedUp: boolean;
  canonicalName: string;
  counter: number;
  createdAt: Date;
  credentialId: string;
  credentialPublicKey: Uint8Array;
  deviceType: "multi_device" | "single_device";
  id: string;
  lastUsedAt: Date | null;
  name: string;
  revokedAt: Date | null;
  transports: string[];
  updatedAt: Date;
  userHandle: string;
  userId: string;
}

export interface NewSecurityEvent {
  correlationId: string;
  errorCategory?: string | null;
  eventType: string;
  expiresAt: Date;
  id: string;
  metadata?: Record<string, boolean | number | string | null>;
  occurredAt: Date;
  outcome: "failure" | "success";
  sessionId?: string | null;
  userId?: string | null;
}

export interface AuthenticationTransactionRepository {
  appendSecurityEvent(event: NewSecurityEvent): Promise<void>;
  findPasskeyByCredentialIdForUpdate(
    credentialId: string,
  ): Promise<StoredPasskey | null>;
  findPasswordCredentialByUserId(
    userId: string,
  ): Promise<StoredPasswordCredential | null>;
  findRefreshSessionByDigestForUpdate(
    refreshDigest: string,
  ): Promise<StoredRefreshSession | null>;
  findRefreshSessionById(id: string): Promise<StoredRefreshSession | null>;
  findVerificationChallengeForUpdate(input: {
    flowId: string;
    purpose: StoredVerificationChallenge["purpose"];
  }): Promise<StoredVerificationChallenge | null>;
  insertPasskey(passkey: StoredPasskey): Promise<void>;
  insertRefreshSession(session: StoredRefreshSession): Promise<void>;
  insertVerificationChallenge(
    challenge: StoredVerificationChallenge,
  ): Promise<void>;
  invalidateActiveVerificationChallenges(input: {
    invalidatedAt: Date;
    purpose: StoredVerificationChallenge["purpose"];
    userId: string;
  }): Promise<number>;
  renamePasskey(input: {
    canonicalName: string;
    id: string;
    name: string;
    updatedAt: Date;
    userId: string;
  }): Promise<boolean>;
  revokePasskey(input: {
    id: string;
    revokedAt: Date;
    userId: string;
  }): Promise<boolean>;
  revokeRefreshSessionFamily(input: {
    familyId: string;
    reason: string;
    replayDetectedSessionId?: string;
    revokedAt: Date;
  }): Promise<number>;
  savePasswordCredential(credential: StoredPasswordCredential): Promise<void>;
  saveRefreshSessionRotation(input: {
    consumedAt: Date;
    predecessorId: string;
    successor: StoredRefreshSession;
  }): Promise<void>;
  updatePasskeyUse(input: {
    backedUp: boolean;
    deviceType: StoredPasskey["deviceType"];
    expectedCounter: number;
    id: string;
    lastUsedAt: Date;
    nextCounter: number;
  }): Promise<boolean>;
  updateVerificationChallengeState(input: {
    attemptsUsed: number;
    consumedAt: Date | null;
    flowId: string;
    invalidatedAt: Date | null;
    updatedAt: Date;
  }): Promise<boolean>;
}

export function throwMappedAuthenticationConflict(error: unknown): never {
  const visited = new Set<unknown>();
  let candidate: unknown = error;

  while (
    candidate &&
    typeof candidate === "object" &&
    !visited.has(candidate)
  ) {
    visited.add(candidate);
    const databaseError = candidate as DatabaseError;
    if (
      databaseError.code === "23505" &&
      typeof databaseError.constraint_name === "string"
    ) {
      const conflicts: Partial<
        Record<string, AuthenticationPersistenceConflictError>
      > = {
        auth_passkeys_credential_id_unique:
          new AuthenticationPersistenceConflictError("passkey_credential"),
        auth_passkeys_user_canonical_name_unique:
          new AuthenticationPersistenceConflictError("passkey_name"),
        auth_sessions_predecessor_unique:
          new AuthenticationPersistenceConflictError("session_rotation"),
        auth_sessions_refresh_digest_unique:
          new AuthenticationPersistenceConflictError("refresh_digest"),
        auth_verification_challenges_one_active_user_purpose:
          new AuthenticationPersistenceConflictError("active_challenge"),
      };
      const conflict = conflicts[databaseError.constraint_name];
      if (conflict) {
        throw conflict;
      }
    }
    candidate = databaseError.cause;
  }

  throw error;
}

export function mapStoredRefreshSession(
  row: typeof authSessionsTable.$inferSelect,
): StoredRefreshSession {
  return {
    absoluteExpiresAt: row.absoluteExpiresAt,
    authenticatedAt: row.authenticatedAt,
    authenticationMethod: row.authenticationMethod,
    clientLabel: row.clientLabel,
    consumedAt: row.rotatedAt,
    createdAt: row.createdAt,
    familyId: row.familyId,
    id: row.id,
    lastUsedAt: row.lastUsedAt,
    predecessorSessionId: row.predecessorSessionId,
    refreshDigest: row.refreshTokenDigest,
    replayDetectedAt: row.replayDetectedAt,
    revokedAt: row.revokedAt,
    revocationReason: row.revocationReason,
    successorId: row.rotatedToSessionId,
    updatedAt: row.updatedAt,
    userId: row.userId,
  };
}

export function mapStoredPasskey(
  row: typeof authPasskeysTable.$inferSelect,
): StoredPasskey {
  return {
    backedUp: row.backedUp,
    canonicalName: row.canonicalName,
    counter: row.counter,
    createdAt: row.createdAt,
    credentialId: row.credentialId,
    credentialPublicKey: new Uint8Array(
      Buffer.from(row.publicKey, "base64url"),
    ),
    deviceType: row.credentialDeviceType,
    id: row.id,
    lastUsedAt: row.lastUsedAt,
    name: row.name,
    revokedAt: row.revokedAt,
    transports: row.transports,
    updatedAt: row.updatedAt,
    userHandle: row.userHandle,
    userId: row.userId,
  };
}

// Root composition gets read access only. Write authority is implemented by a
// non-exported repository that the unit of work constructs from Drizzle's
// transaction callback, so a root database handle cannot manufacture it.
export class DrizzleAuthenticationRepository {
  private constructor(private readonly database: AuthenticationReadDatabase) {}

  public static readOnly(
    database: AuthenticationReadDatabase,
  ): DrizzleAuthenticationRepository {
    return new DrizzleAuthenticationRepository(database);
  }

  public async findPasswordCredentialByUserId(
    userId: string,
  ): Promise<StoredPasswordCredential | null> {
    const rows = await this.database
      .select()
      .from(passwordCredentialsTable)
      .where(eq(passwordCredentialsTable.userId, userId))
      .limit(1);
    const row = rows[0];

    if (!row) {
      return null;
    }
    if (row.algorithm !== "argon2id") {
      throw new Error("Persisted password algorithm is unsupported.");
    }

    return { ...row, algorithm: "argon2id" };
  }

  public async findRefreshSessionById(
    id: string,
  ): Promise<StoredRefreshSession | null> {
    const rows = await this.database
      .select()
      .from(authSessionsTable)
      .where(eq(authSessionsTable.id, id))
      .limit(1);

    return rows[0] ? mapStoredRefreshSession(rows[0]) : null;
  }
}
