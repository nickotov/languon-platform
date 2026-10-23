import { and, eq, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import {
    userEmailsTable,
    usersTable,
} from '../../../../users/infrastructure/persistence/drizzle/schema';
import type {
    AuthenticationAccount,
    ChallengeIssueResult,
    NewStoredAuthenticationSession,
    NewStoredVerificationChallenge,
} from '../../../application/ports/auth-store';
import type { SessionRevocationReason } from '../../../domain/refresh-session';
import {
    mapPasswordCredential,
    sessionInsertValues,
} from './auth-record-mapping';
import {
    authSessionsTable,
    authVerificationChallengesTable,
    passwordCredentialsTable,
} from './schema';

export type AuthenticationDatabase = PostgresJsDatabase<typeof databaseSchema>;

export type AuthenticationTransaction = Parameters<
    Parameters<AuthenticationDatabase['transaction']>[0]
>[0];

export type QueryDatabase = AuthenticationDatabase | AuthenticationTransaction;

export const resendCooldownMilliseconds = 60_000;

export const sendWindowMilliseconds = 60 * 60_000;

export const recentAuthenticationMilliseconds = 5 * 60_000;

export const maximumActivePasskeysPerUser = 50;

export interface Argon2Parameters {
    memoryCostKiB: number;
    parallelism: number;
    timeCost: number;
}

export async function findAccount(
    database: QueryDatabase,
    where: ReturnType<typeof eq>,
): Promise<AuthenticationAccount | null> {
    const rows = await database
        .select({
            createdAt: usersTable.createdAt,
            email: userEmailsTable.email,
            emailId: userEmailsTable.id,
            emailVerifiedAt: userEmailsTable.verifiedAt,
            handle: usersTable.handle,
            password: passwordCredentialsTable,
            status: usersTable.status,
            userId: usersTable.id,
        })
        .from(usersTable)
        .innerJoin(
            userEmailsTable,
            and(
                eq(userEmailsTable.userId, usersTable.id),
                eq(userEmailsTable.isPrimary, true),
            ),
        )
        .leftJoin(
            passwordCredentialsTable,
            eq(passwordCredentialsTable.userId, usersTable.id),
        )
        .where(where)
        .limit(1);
    const row = rows[0];

    return row
        ? {
              createdAt: row.createdAt,
              email: row.email,
              emailId: row.emailId,
              emailVerifiedAt: row.emailVerifiedAt,
              handle: row.handle,
              passwordCredential: mapPasswordCredential(row.password),
              status: row.status,
              userId: row.userId,
          }
        : null;
}

export async function findChallengeForUpdate(
    transaction: AuthenticationTransaction,
    flowId: string,
): Promise<typeof authVerificationChallengesTable.$inferSelect | null> {
    const rows = await transaction
        .select()
        .from(authVerificationChallengesTable)
        .where(eq(authVerificationChallengesTable.flowId, flowId))
        .limit(1)
        .for('update');

    return rows[0] ?? null;
}

export async function lockUser(
    transaction: AuthenticationTransaction,
    userId: string,
): Promise<(typeof usersTable.$inferSelect)['status'] | null> {
    const rows = await transaction
        .select({ status: usersTable.status })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1)
        .for('update');

    return rows[0]?.status ?? null;
}

export async function lockPasswordCredential(
    transaction: AuthenticationTransaction,
    userId: string,
): Promise<void> {
    await transaction
        .select({ userId: passwordCredentialsTable.userId })
        .from(passwordCredentialsTable)
        .where(eq(passwordCredentialsTable.userId, userId))
        .limit(1)
        .for('update');
}

export function challengeIsUnavailable(
    challenge: typeof authVerificationChallengesTable.$inferSelect,
    now: Date,
): boolean {
    return Boolean(
        challenge.consumedAt ||
        challenge.invalidatedAt ||
        challenge.attempts >= challenge.maxAttempts ||
        now >= challenge.expiresAt,
    );
}

export async function recordIncorrectChallengeAttempt(
    transaction: AuthenticationTransaction,
    challenge: typeof authVerificationChallengesTable.$inferSelect,
    now: Date,
): Promise<void> {
    await transaction
        .update(authVerificationChallengesTable)
        .set({ attempts: challenge.attempts + 1, updatedAt: now })
        .where(eq(authVerificationChallengesTable.flowId, challenge.flowId));
}

export async function revokeUserSessions(
    transaction: AuthenticationTransaction,
    input: { reason: SessionRevocationReason; revokedAt: Date; userId: string },
): Promise<void> {
    await transaction
        .update(authSessionsTable)
        .set({
            revocationReason: input.reason,
            revokedAt: input.revokedAt,
            updatedAt: input.revokedAt,
        })
        .where(
            and(
                eq(authSessionsTable.userId, input.userId),
                isNull(authSessionsTable.revokedAt),
            ),
        );
}

export async function revokeSessionFamily(
    transaction: AuthenticationTransaction,
    input: {
        familyId: string;
        reason: SessionRevocationReason;
        revokedAt: Date;
        userId: string;
    },
): Promise<void> {
    await transaction
        .update(authSessionsTable)
        .set({
            revocationReason: input.reason,
            revokedAt: input.revokedAt,
            updatedAt: input.revokedAt,
        })
        .where(
            and(
                eq(authSessionsTable.familyId, input.familyId),
                eq(authSessionsTable.userId, input.userId),
                isNull(authSessionsTable.revokedAt),
            ),
        );
}

export async function insertSession(
    transaction: AuthenticationTransaction,
    session: NewStoredAuthenticationSession,
): Promise<void> {
    await transaction
        .insert(authSessionsTable)
        .values(sessionInsertValues(session));
}

export async function assessChallengeIssue(
    transaction: AuthenticationTransaction,
    challenge: NewStoredVerificationChallenge,
): Promise<{
    decision: ChallengeIssueResult | null;
    previous: typeof authVerificationChallengesTable.$inferSelect | null;
    rolling: Array<typeof authVerificationChallengesTable.$inferSelect>;
}> {
    const challengeRows = await transaction
        .select()
        .from(authVerificationChallengesTable)
        .where(
            and(
                eq(authVerificationChallengesTable.userId, challenge.userId),
                eq(authVerificationChallengesTable.purpose, challenge.purpose),
            ),
        )
        .for('update');
    const activeRows = challengeRows.filter(
        ({ consumedAt, invalidatedAt }) => !consumedAt && !invalidatedAt,
    );
    const active = activeRows[0];
    if (active) {
        const cooldownEndsAt =
            active.lastSentAt.getTime() + resendCooldownMilliseconds;

        if (challenge.issuedAt.getTime() < cooldownEndsAt) {
            return {
                decision: {
                    kind: 'limited',
                    retryAfterSeconds: Math.max(
                        1,
                        Math.ceil(
                            (cooldownEndsAt - challenge.issuedAt.getTime()) /
                                1_000,
                        ),
                    ),
                },
                previous: active,
                rolling: [],
            };
        }
    }

    const rolling = challengeRows.filter(
        ({ lastSentAt }) =>
            lastSentAt.getTime() >
            challenge.issuedAt.getTime() - sendWindowMilliseconds,
    );

    if (rolling.length >= 5) {
        const oldest = rolling.reduce((candidate, row) =>
            row.lastSentAt < candidate.lastSentAt ? row : candidate,
        );
        const retryAt = oldest.lastSentAt.getTime() + sendWindowMilliseconds;

        return {
            decision: {
                kind: 'limited',
                retryAfterSeconds: Math.max(
                    1,
                    Math.ceil((retryAt - challenge.issuedAt.getTime()) / 1_000),
                ),
            },
            previous: active ?? null,
            rolling,
        };
    }

    if (activeRows.length > 0) {
        await transaction
            .update(authVerificationChallengesTable)
            .set({
                invalidatedAt: challenge.issuedAt,
                updatedAt: challenge.issuedAt,
            })
            .where(
                and(
                    eq(
                        authVerificationChallengesTable.userId,
                        challenge.userId,
                    ),
                    eq(
                        authVerificationChallengesTable.purpose,
                        challenge.purpose,
                    ),
                    isNull(authVerificationChallengesTable.consumedAt),
                    isNull(authVerificationChallengesTable.invalidatedAt),
                ),
            );
    }

    return { decision: null, previous: active ?? null, rolling };
}

export function rollingSendWindow(
    challenge: NewStoredVerificationChallenge,
    rolling: Array<typeof authVerificationChallengesTable.$inferSelect>,
): { sendCount: number; sendWindowStartedAt: Date } {
    const oldest = rolling.reduce<
        typeof authVerificationChallengesTable.$inferSelect | null
    >(
        (candidate, row) =>
            !candidate || row.lastSentAt < candidate.lastSentAt
                ? row
                : candidate,
        null,
    );

    return {
        sendCount: rolling.length + 1,
        sendWindowStartedAt: oldest?.lastSentAt ?? challenge.issuedAt,
    };
}

export interface AuthStoreContext {
    readonly database: AuthenticationDatabase;
}
