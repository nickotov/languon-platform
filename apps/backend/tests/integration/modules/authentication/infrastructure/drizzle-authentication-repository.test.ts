import { randomUUID } from "node:crypto";

import { and, count, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createDrizzleDatabase,
  type PostgresClient,
  type PostgresJsDatabase,
} from "@languon/database";

import { databaseSchema } from "../../../../../src/infrastructure/database/schema";
import {
  DrizzleAuthStore,
  DrizzleAuthenticationRepository,
  DrizzleAuthenticationUnitOfWork,
  type StoredPasskey,
  type StoredRefreshSession,
  type StoredVerificationChallenge,
} from "../../../../../src/modules/authentication/infrastructure/persistence";
import type {
  NewStoredAuthenticationPasskey,
  NewStoredAuthenticationSession,
  StoredPasswordCredential as AuthStorePasswordCredential,
} from "../../../../../src/modules/authentication/application/ports/auth-store";
import { EmailAddress } from "../../../../../src/modules/users/domain/email-address";
import { User } from "../../../../../src/modules/users/domain/user";
import { DrizzleUsersUnitOfWork } from "../../../../../src/modules/users/infrastructure/persistence/drizzle/drizzle-users-unit-of-work";
import {
  authPasskeysTable,
  authSecurityEventsTable,
  authSessionsTable,
  authVerificationChallengesTable,
  passwordCredentialsTable,
} from "../../../../../src/modules/authentication/infrastructure/persistence/drizzle/schema";
import {
  userEmailsTable,
  usersTable,
} from "../../../../../src/modules/users/infrastructure/persistence/drizzle/schema";
import {
  createTestPostgresClient,
  isDatabaseIntegrationEnabled,
  migrateTestDatabase,
  resetTestDatabase,
} from "../../../support/test-database";

let client: PostgresClient;
let database: PostgresJsDatabase<typeof databaseSchema>;
let authenticationUnitOfWork: DrizzleAuthenticationUnitOfWork;
let usersUnitOfWork: DrizzleUsersUnitOfWork;
let reader: DrizzleAuthenticationRepository;
let authStore: DrizzleAuthStore;

const now = new Date("2026-08-13T12:00:00.000Z");
const expiresAt = new Date("2026-08-27T12:00:00.000Z");
const passwordHash =
  "$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$SGFzaEhhc2hIYXNoSGFzaEhhc2hIYXNoSGFzaA";

async function createIdentity(email: string) {
  const emailId = randomUUID();
  const user = User.createPending({ id: randomUUID(), now });

  await usersUnitOfWork.execute((users) =>
    users.addWithPrimaryEmail({
      emailId,
      primaryEmail: EmailAddress.create(email),
      user,
    }),
  );

  return { emailId, userId: user.id };
}

function createChallenge(input: {
  emailId: string;
  purpose?: StoredVerificationChallenge["purpose"];
  userId: string;
}): StoredVerificationChallenge {
  return {
    attemptsUsed: 0,
    codeDigest: `hmac-sha256:v1:${"c".repeat(43)}`,
    consumedAt: null,
    emailId: input.emailId,
    expiresAt: new Date("2026-08-13T12:10:00.000Z"),
    flowId: randomUUID(),
    invalidatedAt: null,
    issuedAt: now,
    lastSentAt: now,
    purpose: input.purpose ?? "email_verification",
    sendCount: 1,
    updatedAt: now,
    userId: input.userId,
  };
}

function createSession(input: {
  familyId?: string;
  id?: string;
  predecessorSessionId?: string | null;
  refreshDigest?: string;
  userId: string;
}): StoredRefreshSession {
  return {
    absoluteExpiresAt: expiresAt,
    authenticatedAt: now,
    authenticationMethod: "password",
    clientLabel: null,
    consumedAt: null,
    createdAt: now,
    familyId: input.familyId ?? randomUUID(),
    id: input.id ?? randomUUID(),
    lastUsedAt: null,
    predecessorSessionId: input.predecessorSessionId ?? null,
    refreshDigest:
      input.refreshDigest ?? randomUUID().replaceAll("-", "").padEnd(43, "x"),
    replayDetectedAt: null,
    revokedAt: null,
    revocationReason: null,
    successorId: null,
    updatedAt: now,
    userId: input.userId,
  };
}

function createPasskey(input: {
  credentialId?: string;
  name?: string;
  userId: string;
}): StoredPasskey {
  const name = input.name ?? "Laptop";

  return {
    backedUp: false,
    canonicalName: name.trim().toLowerCase(),
    counter: 0,
    createdAt: now,
    credentialId: input.credentialId ?? randomUUID().replaceAll("-", ""),
    credentialPublicKey: new Uint8Array([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]),
    deviceType: "single_device",
    id: randomUUID(),
    lastUsedAt: null,
    name,
    revokedAt: null,
    transports: ["internal", "hybrid"],
    updatedAt: now,
    userHandle: randomUUID().replaceAll("-", ""),
    userId: input.userId,
  };
}

function createAuthStorePasswordCredential(
  userId: string,
  marker: "a" | "b" = "a",
): AuthStorePasswordCredential {
  return {
    createdAt: now,
    encoded: `${passwordHash.slice(0, -1)}${marker}`,
    parametersVersion: 1,
    updatedAt: now,
    userId,
  };
}

function createAuthStoreSession(input: {
  digest?: string;
  familyId?: string;
  id?: string;
  method?: NewStoredAuthenticationSession["authenticationMethod"];
  predecessorId?: string | null;
  userId: string;
}): NewStoredAuthenticationSession {
  const issuedAt = new Date("2026-08-13T12:01:00.000Z");
  return {
    absoluteExpiresAt: expiresAt,
    authenticatedAt: issuedAt,
    authenticationMethod: input.method ?? "password",
    clientLabel: null,
    consumedAt: null,
    createdAt: issuedAt,
    familyId: input.familyId ?? randomUUID(),
    id: input.id ?? randomUUID(),
    predecessorSessionId: input.predecessorId ?? null,
    refreshDigest: input.digest ?? "u".repeat(43),
    revokedAt: null,
    revocationReason: null,
    successorId: null,
    userId: input.userId,
  };
}

function createAuthStorePasskey(input: {
  credentialId: string;
  name: string;
  userId: string;
}): NewStoredAuthenticationPasskey {
  const passkey = createPasskey(input);
  return {
    backedUp: passkey.backedUp,
    counter: passkey.counter,
    createdAt: passkey.createdAt,
    credentialId: passkey.credentialId,
    credentialPublicKey: passkey.credentialPublicKey,
    deviceType: passkey.deviceType,
    id: passkey.id,
    lastUsedAt: passkey.lastUsedAt,
    name: passkey.name,
    revokedAt: passkey.revokedAt,
    transports: ["internal", "hybrid"],
    userHandle: passkey.userHandle,
    userId: passkey.userId,
  };
}

async function createVerifiedAuthStoreAccount(email: string) {
  const userId = randomUUID();
  const emailId = randomUUID();
  const flowId = randomUUID();
  const session = createAuthStoreSession({
    digest: "v".repeat(43),
    method: "email_verification",
    userId,
  });
  await authStore.registerOrReplacePendingSignup({
    account: {
      canonicalEmail: email,
      createdAt: now,
      email,
      emailId,
      userId,
    },
    challenge: {
      ...createChallenge({ emailId, userId }),
      flowId,
    },
    credential: createAuthStorePasswordCredential(userId),
  });
  const result = await authStore.commitEmailVerification({
    codeMatches: true,
    flowId,
    now: session.createdAt,
    session,
  });
  if (result.kind !== "verified") {
    throw new Error("Test account verification failed.");
  }
  return { emailId, session, userId };
}

describe.runIf(isDatabaseIntegrationEnabled())(
  "DrizzleAuthenticationRepository",
  () => {
    beforeAll(async () => {
      client = createTestPostgresClient();
      database = createDrizzleDatabase(client, databaseSchema);
      authenticationUnitOfWork = new DrizzleAuthenticationUnitOfWork(database);
      usersUnitOfWork = new DrizzleUsersUnitOfWork(database);
      reader = DrizzleAuthenticationRepository.readOnly(database);
      authStore = new DrizzleAuthStore(database);
      await resetTestDatabase(client);
      await migrateTestDatabase(client);
    });

    beforeEach(async () => {
      await database.delete(authSecurityEventsTable);
      await database.delete(authPasskeysTable);
      await database.delete(authSessionsTable);
      await database.delete(authVerificationChallengesTable);
      await database.delete(passwordCredentialsTable);
      await database.delete(userEmailsTable);
      await database.delete(usersTable);
    });

    afterAll(async () => {
      await client.end();
    });

    it("stores only a versioned Argon2id credential and rolls writes back atomically", async () => {
      const identity = await createIdentity("password@example.com");
      const credential = {
        algorithm: "argon2id" as const,
        algorithmVersion: 19,
        createdAt: now,
        hash: passwordHash,
        memoryCostKiB: 19_456,
        parallelism: 1,
        timeCost: 2,
        updatedAt: now,
        userId: identity.userId,
      };

      await expect(
        authenticationUnitOfWork.execute(async ({ authentication }) => {
          await authentication.savePasswordCredential(credential);
          throw new Error("forced rollback");
        }),
      ).rejects.toThrow("forced rollback");
      await expect(
        reader.findPasswordCredentialByUserId(identity.userId),
      ).resolves.toBeNull();

      await authenticationUnitOfWork.execute(({ authentication }) =>
        authentication.savePasswordCredential(credential),
      );
      await expect(
        reader.findPasswordCredentialByUserId(identity.userId),
      ).resolves.toEqual(credential);

      const secretColumns = await client<{ column_name: string }[]>`
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'password_credentials'
          and column_name in ('password', 'password_plaintext', 'plaintext')
      `;
      expect(secretColumns).toEqual([]);
    });

    it("requires a transaction for writes and enforces safe Argon2id parameters", async () => {
      const identity = await createIdentity("unsafe@example.com");
      const credential = {
        algorithm: "argon2id" as const,
        algorithmVersion: 19,
        createdAt: now,
        hash: passwordHash,
        memoryCostKiB: 19_455,
        parallelism: 1,
        timeCost: 2,
        updatedAt: now,
        userId: identity.userId,
      };

      expect("savePasswordCredential" in reader).toBe(false);
      await expect(
        authenticationUnitOfWork.execute(({ authentication }) =>
          authentication.savePasswordCredential(credential),
        ),
      ).rejects.toMatchObject({ cause: { code: "23514" } });
    });

    it("keeps one active challenge per user and purpose while preserving purpose separation", async () => {
      const identity = await createIdentity("challenge@example.com");
      const verification = createChallenge(identity);
      const reset = createChallenge({
        ...identity,
        purpose: "password_reset",
      });

      await authenticationUnitOfWork.execute(async ({ authentication }) => {
        await authentication.insertVerificationChallenge(verification);
        await authentication.insertVerificationChallenge(reset);
      });

      await expect(
        authenticationUnitOfWork.execute(({ authentication }) =>
          authentication.insertVerificationChallenge(createChallenge(identity)),
        ),
      ).rejects.toMatchObject({
        kind: "active_challenge",
      });

      await authenticationUnitOfWork.execute(async ({ authentication }) => {
        expect(
          await authentication.invalidateActiveVerificationChallenges({
            invalidatedAt: new Date("2026-08-13T12:01:00.000Z"),
            purpose: "email_verification",
            userId: identity.userId,
          }),
        ).toBe(1);
        await authentication.insertVerificationChallenge(
          createChallenge(identity),
        );
      });

      const persisted = await database
        .select({ value: count() })
        .from(authVerificationChallengesTable);
      expect(persisted[0]?.value).toBe(3);
    });

    it("cannot bind a challenge to another user's email", async () => {
      const firstIdentity = await createIdentity("challenge-one@example.com");
      const secondIdentity = await createIdentity("challenge-two@example.com");

      await expect(
        authenticationUnitOfWork.execute(({ authentication }) =>
          authentication.insertVerificationChallenge(
            createChallenge({
              emailId: secondIdentity.emailId,
              userId: firstIdentity.userId,
            }),
          ),
        ),
      ).rejects.toMatchObject({ cause: { code: "23503" } });

      await expect(
        authenticationUnitOfWork.execute(({ authentication }) =>
          authentication.insertVerificationChallenge({
            ...createChallenge(firstIdentity),
            codeDigest: "c".repeat(43),
          }),
        ),
      ).rejects.toMatchObject({ cause: { code: "23514" } });
    });

    it("serializes refresh rotation and retains predecessor digests for replay response", async () => {
      const identity = await createIdentity("refresh@example.com");
      const initial = createSession({
        refreshDigest: "r".repeat(43),
        userId: identity.userId,
      });
      await authenticationUnitOfWork.execute(({ authentication }) =>
        authentication.insertRefreshSession(initial),
      );

      const rotate = (digestCharacter: string) =>
        authenticationUnitOfWork.execute(async ({ authentication }) => {
          const locked =
            await authentication.findRefreshSessionByDigestForUpdate(
              initial.refreshDigest,
            );
          if (!locked || locked.consumedAt) {
            return "replay" as const;
          }

          const consumedAt = new Date("2026-08-13T12:01:00.000Z");
          await authentication.saveRefreshSessionRotation({
            consumedAt,
            predecessorId: locked.id,
            successor: {
              ...createSession({
                familyId: locked.familyId,
                refreshDigest: digestCharacter.repeat(43),
                userId: locked.userId,
              }),
              authenticatedAt: locked.authenticatedAt,
              createdAt: consumedAt,
              updatedAt: consumedAt,
            },
          });
          return "rotated" as const;
        });

      const outcomes = await Promise.all([rotate("s"), rotate("t")]);
      expect(outcomes.sort()).toEqual(["replay", "rotated"]);

      const generations = await database
        .select()
        .from(authSessionsTable)
        .where(eq(authSessionsTable.familyId, initial.familyId));
      expect(generations).toHaveLength(2);
      expect(generations.find(({ id }) => id === initial.id)).toMatchObject({
        refreshTokenDigest: initial.refreshDigest,
        rotatedAt: new Date("2026-08-13T12:01:00.000Z"),
      });

      await authenticationUnitOfWork.execute(async ({ authentication }) => {
        expect(
          await authentication.revokeRefreshSessionFamily({
            familyId: initial.familyId,
            reason: "refresh_replay",
            replayDetectedSessionId: initial.id,
            revokedAt: new Date("2026-08-13T12:02:00.000Z"),
          }),
        ).toBe(2);
      });
      const revoked = await database
        .select()
        .from(authSessionsTable)
        .where(eq(authSessionsTable.familyId, initial.familyId));
      expect(revoked).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: initial.id,
            replayDetectedAt: new Date("2026-08-13T12:02:00.000Z"),
            revocationReason: "refresh_replay",
          }),
        ]),
      );
      expect(revoked.every(({ revokedAt }) => revokedAt !== null)).toBe(true);
    });

    it("enforces global passkey credentials, per-user names, and atomic counter updates", async () => {
      const firstIdentity = await createIdentity("passkey-one@example.com");
      const secondIdentity = await createIdentity("passkey-two@example.com");
      const passkey = createPasskey(firstIdentity);

      await authenticationUnitOfWork.execute(({ authentication }) =>
        authentication.insertPasskey(passkey),
      );

      await authenticationUnitOfWork.execute(({ authentication }) =>
        authentication.insertPasskey({
          ...createPasskey({
            name: "Ключ И",
            userId: firstIdentity.userId,
          }),
          canonicalName: "ключ и",
        }),
      );
      await expect(
        authenticationUnitOfWork.execute(({ authentication }) =>
          authentication.insertPasskey(
            createPasskey({
              credentialId: passkey.credentialId,
              name: "Other key",
              userId: secondIdentity.userId,
            }),
          ),
        ),
      ).rejects.toMatchObject({
        kind: "passkey_credential",
      });
      await expect(
        authenticationUnitOfWork.execute(({ authentication }) =>
          authentication.insertPasskey(
            createPasskey({ name: "Laptop", userId: firstIdentity.userId }),
          ),
        ),
      ).rejects.toMatchObject({
        kind: "passkey_name",
      });

      const updates = await Promise.all([
        authenticationUnitOfWork.execute(({ authentication }) =>
          authentication.updatePasskeyUse({
            backedUp: true,
            deviceType: "multi_device",
            expectedCounter: 0,
            id: passkey.id,
            lastUsedAt: new Date("2026-08-13T12:01:00.000Z"),
            nextCounter: 1,
          }),
        ),
        authenticationUnitOfWork.execute(({ authentication }) =>
          authentication.updatePasskeyUse({
            backedUp: true,
            deviceType: "multi_device",
            expectedCounter: 0,
            id: passkey.id,
            lastUsedAt: new Date("2026-08-13T12:01:00.000Z"),
            nextCounter: 1,
          }),
        ),
      ]);
      expect(updates.sort()).toEqual([false, true]);

      await authenticationUnitOfWork.execute(async ({ authentication }) => {
        const stored = await authentication.findPasskeyByCredentialIdForUpdate(
          passkey.credentialId,
        );
        expect(stored?.credentialPublicKey).toEqual(
          passkey.credentialPublicKey,
        );
      });

      await authenticationUnitOfWork.execute(async ({ authentication }) => {
        expect(
          await authentication.revokePasskey({
            id: passkey.id,
            revokedAt: new Date("2026-08-13T12:02:00.000Z"),
            userId: firstIdentity.userId,
          }),
        ).toBe(true);
        await authentication.insertPasskey(
          createPasskey({ name: "Laptop", userId: firstIdentity.userId }),
        );
      });
    });

    it("bounds structured security metadata and requires an explicit retention horizon", async () => {
      const identity = await createIdentity("events@example.com");

      await authenticationUnitOfWork.execute(({ authentication }) =>
        authentication.appendSecurityEvent({
          correlationId: "request-123",
          eventType: "password.login",
          expiresAt: new Date("2027-02-09T12:00:00.000Z"),
          id: randomUUID(),
          metadata: { category: "credential" },
          occurredAt: now,
          outcome: "failure",
          userId: identity.userId,
        }),
      );

      await expect(
        authenticationUnitOfWork.execute(({ authentication }) =>
          authentication.appendSecurityEvent({
            correlationId: "request-oversized",
            eventType: "password.login",
            expiresAt: new Date("2027-02-09T12:00:00.000Z"),
            id: randomUUID(),
            metadata: { value: "x".repeat(4_097) },
            occurredAt: now,
            outcome: "failure",
          }),
        ),
      ).rejects.toMatchObject({ cause: { code: "23514" } });

      const events = await database.select().from(authSecurityEventsTable);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        correlationId: "request-123",
        eventType: "password.login",
        metadata: { category: "credential" },
      });
    });

    it("atomically serializes and replaces concurrent pending signup state", async () => {
      const canonicalEmail = "concurrent-signup@example.com";
      const inputs = (["a", "b"] as const).map((marker) => {
        const userId = randomUUID();
        const emailId = randomUUID();
        return {
          account: {
            canonicalEmail,
            createdAt: now,
            email:
              marker === "a" ? "Concurrent-Signup@Example.com" : canonicalEmail,
            emailId,
            userId,
          },
          challenge: {
            ...createChallenge({ emailId, userId }),
            codeDigest: `hmac-sha256:v1:${marker.repeat(43)}`,
            flowId: randomUUID(),
          },
          credential: createAuthStorePasswordCredential(userId, marker),
          marker,
        };
      });

      const signupResults = await Promise.all(
        inputs.map((input) => authStore.registerOrReplacePendingSignup(input)),
      );
      expect(signupResults).toEqual(
        expect.arrayContaining([
          "pending_created",
          expect.objectContaining({ kind: "limited" }),
        ]),
      );

      const account =
        await authStore.findAccountByCanonicalEmail(canonicalEmail);
      const challenge = account
        ? await authStore.findActiveChallengeForUser({
            purpose: "email_verification",
            userId: account.userId,
          })
        : null;
      const marker = challenge?.codeDigest.at(-1) as "a" | "b" | undefined;
      expect(account).toMatchObject({ status: "pending" });
      expect(marker).toMatch(/^[ab]$/);
      if (!account || !marker)
        throw new Error("Pending signup state is missing.");
      expect(account?.passwordCredential?.encoded).toBe(
        createAuthStorePasswordCredential(account.userId, marker).encoded,
      );

      const counts = await database.select({ value: count() }).from(usersTable);
      expect(counts[0]?.value).toBe(1);
    });

    it("activates and issues one session on the correct fifth verification attempt", async () => {
      const userId = randomUUID();
      const emailId = randomUUID();
      const flowId = randomUUID();
      const session = createAuthStoreSession({
        method: "email_verification",
        userId,
      });
      await authStore.registerOrReplacePendingSignup({
        account: {
          canonicalEmail: "fifth-attempt@example.com",
          createdAt: now,
          email: "fifth-attempt@example.com",
          emailId,
          userId,
        },
        challenge: {
          ...createChallenge({ emailId, userId }),
          flowId,
        },
        credential: createAuthStorePasswordCredential(userId),
      });

      for (let attempt = 0; attempt < 4; attempt += 1) {
        await expect(
          authStore.commitEmailVerification({
            codeMatches: false,
            flowId,
            now: new Date(now.getTime() + attempt * 1_000),
            session,
          }),
        ).resolves.toEqual({ kind: "incorrect" });
      }
      await expect(
        authStore.commitEmailVerification({
          codeMatches: true,
          flowId,
          now: session.createdAt,
          session,
        }),
      ).resolves.toMatchObject({
        account: { status: "active", userId },
        kind: "verified",
      });
      await expect(
        authStore.commitEmailVerification({
          codeMatches: true,
          flowId,
          now: session.createdAt,
          session,
        }),
      ).resolves.toEqual({ kind: "unavailable" });
      await expect(
        authStore.getActiveSession({
          now: session.createdAt,
          sessionId: session.id,
          userId,
        }),
      ).resolves.toMatchObject({ id: session.id, userId });
    });

    it("revokes only the replayed refresh family under concurrent rotation", async () => {
      const { session, userId } = await createVerifiedAuthStoreAccount(
        "rotation@example.com",
      );
      const independent = createAuthStoreSession({
        digest: "i".repeat(43),
        userId,
      });
      await expect(
        authStore.issueSessionForActiveUser({
          session: independent,
          userId,
        }),
      ).resolves.toMatchObject({ kind: "issued" });

      const rotate = (digestCharacter: "x" | "y") =>
        authStore.rotateRefreshSession({
          digest: session.refreshDigest,
          now: new Date("2026-08-13T12:02:00.000Z"),
          successor: {
            ...createAuthStoreSession({
              digest: digestCharacter.repeat(43),
              familyId: session.familyId,
              predecessorId: session.id,
              userId,
            }),
            absoluteExpiresAt: session.absoluteExpiresAt,
            authenticationMethod: session.authenticationMethod,
            createdAt: new Date("2026-08-13T12:02:00.000Z"),
          },
        });
      const results = await Promise.all([rotate("x"), rotate("y")]);
      expect(results.map(({ kind }) => kind).sort()).toEqual([
        "replay",
        "rotated",
      ]);

      const replayedFamily = await database
        .select()
        .from(authSessionsTable)
        .where(eq(authSessionsTable.familyId, session.familyId));
      expect(replayedFamily).toHaveLength(2);
      expect(
        replayedFamily.every(
          ({ revocationReason, revokedAt }) =>
            revocationReason === "refresh_replay" && revokedAt !== null,
        ),
      ).toBe(true);
      await expect(
        authStore.getActiveSession({
          now: new Date("2026-08-13T12:02:00.000Z"),
          sessionId: independent.id,
          userId,
        }),
      ).resolves.toMatchObject({ id: independent.id });
    });

    it("revokes a rotated refresh family when logout presents a stale predecessor", async () => {
      const { session, userId } = await createVerifiedAuthStoreAccount(
        "stale-logout@example.com",
      );
      const successor = {
        ...createAuthStoreSession({
          digest: "s".repeat(43),
          familyId: session.familyId,
          predecessorId: session.id,
          userId,
        }),
        absoluteExpiresAt: session.absoluteExpiresAt,
        authenticatedAt: session.authenticatedAt,
        authenticationMethod: session.authenticationMethod,
        createdAt: new Date("2026-08-13T12:02:00.000Z"),
      };
      await expect(
        authStore.rotateRefreshSession({
          digest: session.refreshDigest,
          now: successor.createdAt,
          successor,
        }),
      ).resolves.toMatchObject({ kind: "rotated" });

      await authStore.revokeSessionFamilyByDigest({
        digest: session.refreshDigest,
        reason: "logout",
        revokedAt: new Date("2026-08-13T12:03:00.000Z"),
      });

      const family = await database
        .select()
        .from(authSessionsTable)
        .where(eq(authSessionsTable.familyId, session.familyId));
      expect(family).toHaveLength(2);
      expect(
        family.every(({ revocationReason }) => revocationReason === "logout"),
      ).toBe(true);
    });

    it("serializes stale-token logout with refresh rotation", async () => {
      const { session, userId } = await createVerifiedAuthStoreAccount(
        "concurrent-logout@example.com",
      );
      const successor = {
        ...createAuthStoreSession({
          digest: "q".repeat(43),
          familyId: session.familyId,
          predecessorId: session.id,
          userId,
        }),
        absoluteExpiresAt: session.absoluteExpiresAt,
        authenticatedAt: session.authenticatedAt,
        authenticationMethod: session.authenticationMethod,
        createdAt: new Date("2026-08-13T12:02:00.000Z"),
      };
      await Promise.all([
        authStore.rotateRefreshSession({
          digest: session.refreshDigest,
          now: successor.createdAt,
          successor,
        }),
        authStore.revokeSessionFamilyByDigest({
          digest: session.refreshDigest,
          reason: "logout",
          revokedAt: new Date("2026-08-13T12:02:00.000Z"),
        }),
      ]);

      const family = await database
        .select()
        .from(authSessionsTable)
        .where(eq(authSessionsTable.familyId, session.familyId));
      expect(family.length).toBeGreaterThanOrEqual(1);
      expect(family.every(({ revokedAt }) => revokedAt !== null)).toBe(true);
      expect(
        family.every(({ revocationReason }) => revocationReason === "logout"),
      ).toBe(true);
    });

    it("persists reset resend cooldown and five-send window state", async () => {
      const { emailId, userId } = await createVerifiedAuthStoreAccount(
        "reset-window@example.com",
      );
      const issueAt = (minute: number) => {
        const issuedAt = new Date(
          `2026-08-13T12:${String(minute).padStart(2, "0")}:00.000Z`,
        );
        return authStore.issuePasswordResetChallenge({
          challenge: {
            ...createChallenge({
              emailId,
              purpose: "password_reset",
              userId,
            }),
            expiresAt: new Date(issuedAt.getTime() + 10 * 60_000),
            flowId: randomUUID(),
            issuedAt,
            lastSentAt: issuedAt,
          },
          expectedStatus: "active",
        });
      };

      for (const minute of [2, 3, 4, 5, 6]) {
        await expect(issueAt(minute)).resolves.toMatchObject({
          kind: "issued",
        });
      }
      await expect(issueAt(7)).resolves.toMatchObject({
        kind: "limited",
        retryAfterSeconds: 55 * 60,
      });
      await expect(
        authStore.findActiveChallengeForUser({
          purpose: "password_reset",
          userId,
        }),
      ).resolves.toMatchObject({ sendCount: 5 });
    });

    it("counts repeated pending signups in the same rolling send window", async () => {
      const userId = randomUUID();
      const emailId = randomUUID();
      const issueAt = (minute: number) => {
        const issuedAt = new Date(
          `2026-08-13T12:${String(minute).padStart(2, "0")}:00.000Z`,
        );
        return authStore.registerOrReplacePendingSignup({
          account: {
            canonicalEmail: "signup-window@example.com",
            createdAt: issuedAt,
            email: "signup-window@example.com",
            emailId,
            userId,
          },
          challenge: {
            ...createChallenge({ emailId, userId }),
            expiresAt: new Date(issuedAt.getTime() + 10 * 60_000),
            flowId: randomUUID(),
            issuedAt,
            lastSentAt: issuedAt,
          },
          credential: {
            ...createAuthStorePasswordCredential(userId),
            updatedAt: issuedAt,
          },
        });
      };

      for (const minute of [0, 1, 2, 3, 4]) {
        await expect(issueAt(minute)).resolves.toBe("pending_created");
      }
      await expect(issueAt(5)).resolves.toEqual({
        kind: "limited",
        retryAfterSeconds: 55 * 60,
      });
    });

    it("allows at most fifty active passkeys for one user", async () => {
      const { session, userId } = await createVerifiedAuthStoreAccount(
        "passkey-cap@example.com",
      );
      const register = (index: number) =>
        authStore.registerPasskey({
          now: new Date("2026-08-13T12:02:00.000Z"),
          passkey: createAuthStorePasskey({
            credentialId: `passkey-cap-credential-${index}`,
            name: `Passkey ${index}`,
            userId,
          }),
          sessionId: session.id,
          userId,
        });

      for (let index = 0; index < 50; index += 1) {
        await expect(register(index)).resolves.toBe(true);
      }
      await expect(register(50)).resolves.toBe(false);

      const rows = await database
        .select({ value: count() })
        .from(authPasskeysTable)
        .where(
          and(
            eq(authPasskeysTable.userId, userId),
            isNull(authPasskeysTable.revokedAt),
          ),
        );
      expect(rows[0]?.value).toBe(50);
    });

    it("serializes concurrent registrations at the fifty-passkey boundary", async () => {
      const { session, userId } = await createVerifiedAuthStoreAccount(
        "concurrent-passkey-cap@example.com",
      );
      const outcomes = await Promise.all(
        Array.from({ length: 51 }, (_, index) =>
          authStore.registerPasskey({
            now: new Date("2026-08-13T12:02:00.000Z"),
            passkey: createAuthStorePasskey({
              credentialId: `concurrent-passkey-credential-${index}`,
              name: `Concurrent passkey ${index}`,
              userId,
            }),
            sessionId: session.id,
            userId,
          }),
        ),
      );

      expect(outcomes.filter(Boolean)).toHaveLength(50);
      expect(outcomes.filter((outcome) => !outcome)).toHaveLength(1);
      const rows = await database
        .select({ value: count() })
        .from(authPasskeysTable)
        .where(
          and(
            eq(authPasskeysTable.userId, userId),
            isNull(authPasskeysTable.revokedAt),
          ),
        );
      expect(rows[0]?.value).toBe(50);
    });
  },
);
