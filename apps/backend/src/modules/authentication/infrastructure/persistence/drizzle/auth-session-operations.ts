import { and, eq, gt, gte, isNull } from 'drizzle-orm';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import type {
    NewStoredAuthenticationSession,
    RefreshRotationCommitResult,
    SessionIssueCommitResult,
    StoredPasswordCredential,
} from '../../../application/ports/auth-store';
import type { SessionRevocationReason } from '../../../domain/refresh-session';
import {
    findAccount,
    insertSession,
    lockPasswordCredential,
    lockUser,
    recentAuthenticationMilliseconds,
    revokeSessionFamily,
    revokeUserSessions,
    type AuthenticationTransaction,
    type AuthStoreContext,
} from './auth-persistence-support';
import {
    assertInitialSession,
    savePasswordCredential,
} from './auth-record-mapping';
import { authSessionsTable } from './schema';

export function issueSessionForActiveUser(
    persistence: AuthStoreContext,
    input: {
        expectedPasswordHash?: string;
        replacementCredential?: StoredPasswordCredential;
        session: NewStoredAuthenticationSession;
        userId: string;
    },
): Promise<SessionIssueCommitResult> {
    assertInitialSession(input.session, 'password');
    if (input.replacementCredential && !input.expectedPasswordHash) {
        throw new Error('Credential replacement requires the expected hash.');
    }

    return persistence.database.transaction(async (transaction) => {
        await lockUser(transaction, input.userId);
        await lockPasswordCredential(transaction, input.userId);
        const account = await findAccount(
            transaction,
            eq(usersTable.id, input.userId),
        );

        if (
            !account ||
            account.status !== 'active' ||
            input.session.userId !== input.userId ||
            (input.expectedPasswordHash !== undefined &&
                account.passwordCredential?.encoded !==
                    input.expectedPasswordHash)
        ) {
            return { kind: 'unavailable' };
        }

        if (input.replacementCredential) {
            if (input.replacementCredential.userId !== input.userId) {
                throw new Error(
                    'The replacement credential belongs to another user.',
                );
            }

            await savePasswordCredential(
                transaction,
                input.replacementCredential,
            );
        }

        await insertSession(transaction, input.session);

        return { account, kind: 'issued' };
    });
}

export function changePasswordAndReplaceSessions(
    persistence: AuthStoreContext,
    input: {
        expectedPasswordHash: string;
        newCredential: StoredPasswordCredential;
        replacementSession: NewStoredAuthenticationSession;
        revokedAt: Date;
        userId: string;
    },
): Promise<SessionIssueCommitResult> {
    assertInitialSession(input.replacementSession, 'password', input.revokedAt);

    return persistence.database.transaction(async (transaction) => {
        await lockUser(transaction, input.userId);
        await lockPasswordCredential(transaction, input.userId);
        const account = await findAccount(
            transaction,
            eq(usersTable.id, input.userId),
        );

        if (
            !account ||
            account.status !== 'active' ||
            account.passwordCredential?.encoded !==
                input.expectedPasswordHash ||
            input.newCredential.userId !== input.userId ||
            input.replacementSession.userId !== input.userId
        ) {
            return { kind: 'unavailable' };
        }

        await savePasswordCredential(transaction, input.newCredential);
        await revokeUserSessions(transaction, {
            reason: 'password_change',
            revokedAt: input.revokedAt,
            userId: input.userId,
        });

        await insertSession(transaction, input.replacementSession);
        const updated = await findAccount(
            transaction,
            eq(usersTable.id, input.userId),
        );

        if (!updated) throw new Error('The password account disappeared.');

        return { account: updated, kind: 'issued' };
    });
}

export function revokeAllSessions(
    persistence: AuthStoreContext,
    input: {
        reason: SessionRevocationReason;
        revokedAt: Date;
        userId: string;
    },
): Promise<void> {
    return persistence.database.transaction((transaction) =>
        revokeUserSessions(transaction, input),
    );
}

export async function revokeSessionFamilyByDigest(
    persistence: AuthStoreContext,
    input: {
        digest: string;
        reason: SessionRevocationReason;
        revokedAt: Date;
    },
): Promise<void> {
    await persistence.database.transaction(async (transaction) => {
        const rows = await transaction
            .select({
                familyId: authSessionsTable.familyId,
                userId: authSessionsTable.userId,
            })
            .from(authSessionsTable)
            .where(eq(authSessionsTable.refreshTokenDigest, input.digest))
            .limit(1)
            .for('update');
        const session = rows[0];
        if (!session) return;
        await revokeSessionFamily(transaction, {
            familyId: session.familyId,
            reason: input.reason,
            revokedAt: input.revokedAt,
            userId: session.userId,
        });
    });
}

export function rotateRefreshSession(
    persistence: AuthStoreContext,
    input: {
        digest: string;
        now: Date;
        successor: NewStoredAuthenticationSession;
    },
): Promise<RefreshRotationCommitResult> {
    return persistence.database.transaction(async (transaction) => {
        const rows = await transaction
            .select()
            .from(authSessionsTable)
            .where(eq(authSessionsTable.refreshTokenDigest, input.digest))
            .limit(1)
            .for('update');
        const current = rows[0];
        if (!current) return { kind: 'unavailable' };
        if (current.rotatedAt) {
            await revokeSessionFamily(transaction, {
                familyId: current.familyId,
                reason: 'refresh_replay',
                revokedAt: input.now,
                userId: current.userId,
            });

            await transaction
                .update(authSessionsTable)
                .set({ replayDetectedAt: input.now, updatedAt: input.now })
                .where(eq(authSessionsTable.id, current.id));

            return { kind: 'replay' };
        }

        if (current.revokedAt || input.now >= current.absoluteExpiresAt) {
            return { kind: 'unavailable' };
        }

        await lockUser(transaction, current.userId);
        const account = await findAccount(
            transaction,
            eq(usersTable.id, current.userId),
        );

        if (!account || account.status !== 'active')
            return { kind: 'unavailable' };
        if (
            input.successor.userId !== current.userId ||
            input.successor.familyId !== current.familyId ||
            input.successor.absoluteExpiresAt.getTime() !==
                current.absoluteExpiresAt.getTime() ||
            input.successor.predecessorSessionId !== current.id ||
            input.successor.authenticatedAt.getTime() !==
                current.authenticatedAt.getTime() ||
            input.successor.authenticationMethod !==
                current.authenticationMethod ||
            input.successor.createdAt > input.now ||
            input.successor.consumedAt !== null ||
            input.successor.revokedAt !== null ||
            input.successor.successorId !== null
        ) {
            throw new Error(
                'The refresh successor does not preserve its family.',
            );
        }

        await insertSession(transaction, input.successor);
        await transaction
            .update(authSessionsTable)
            .set({
                rotatedAt: input.now,
                rotatedToSessionId: input.successor.id,
                updatedAt: input.now,
            })
            .where(eq(authSessionsTable.id, current.id));

        return { account, kind: 'rotated' };
    });
}

export async function findRecentSession(
    persistence: AuthStoreContext,
    transaction: AuthenticationTransaction,
    now: Date,
    sessionId: string,
    userId: string,
): Promise<typeof authSessionsTable.$inferSelect | null> {
    const recentAfter = new Date(
        now.getTime() - recentAuthenticationMilliseconds,
    );
    const rows = await transaction
        .select({ session: authSessionsTable })
        .from(authSessionsTable)
        .innerJoin(usersTable, eq(usersTable.id, authSessionsTable.userId))
        .where(
            and(
                eq(authSessionsTable.id, sessionId),
                eq(authSessionsTable.userId, userId),
                eq(usersTable.status, 'active'),
                isNull(authSessionsTable.revokedAt),
                isNull(authSessionsTable.rotatedAt),
                gt(authSessionsTable.absoluteExpiresAt, now),
                gte(authSessionsTable.authenticatedAt, recentAfter),
            ),
        )
        .limit(1)
        .for('update', { of: authSessionsTable });
    const session = rows[0]?.session ?? null;
    if (!session) return null;

    return (await lockUser(transaction, session.userId)) === 'active'
        ? session
        : null;
}
