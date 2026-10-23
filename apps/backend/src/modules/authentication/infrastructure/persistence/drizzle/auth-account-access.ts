import { and, eq, gt, isNull } from 'drizzle-orm';
import {
    userEmailsTable,
    usersTable,
} from '../../../../users/infrastructure/persistence/drizzle/schema';
import type {
    AuthenticationAccount,
    StoredAuthenticationPasskey,
    StoredAuthenticationSession,
    StoredVerificationChallenge,
} from '../../../application/ports/auth-store';
import { findAccount, type AuthStoreContext } from './auth-persistence-support';
import { mapChallenge, mapPasskey, mapSession } from './auth-record-mapping';
import {
    authPasskeysTable,
    authSessionsTable,
    authVerificationChallengesTable,
} from './schema';

export function findAccountByCanonicalEmail(
    persistence: AuthStoreContext,
    canonicalEmail: string,
): Promise<AuthenticationAccount | null> {
    return findAccount(
        persistence.database,
        eq(userEmailsTable.canonicalEmail, canonicalEmail),
    );
}

export function findAccountByUserId(
    persistence: AuthStoreContext,
    userId: string,
): Promise<AuthenticationAccount | null> {
    return findAccount(persistence.database, eq(usersTable.id, userId));
}

export async function findChallenge(
    persistence: AuthStoreContext,
    input: {
        flowId: string;
        purpose: StoredVerificationChallenge['purpose'];
    },
): Promise<StoredVerificationChallenge | null> {
    const rows = await persistence.database
        .select()
        .from(authVerificationChallengesTable)
        .where(
            and(
                eq(authVerificationChallengesTable.flowId, input.flowId),
                eq(authVerificationChallengesTable.purpose, input.purpose),
            ),
        )
        .limit(1);

    return rows[0] ? mapChallenge(rows[0]) : null;
}

export async function findActiveChallengeForUser(
    persistence: AuthStoreContext,
    input: {
        purpose: StoredVerificationChallenge['purpose'];
        userId: string;
    },
): Promise<StoredVerificationChallenge | null> {
    const rows = await persistence.database
        .select()
        .from(authVerificationChallengesTable)
        .where(
            and(
                eq(authVerificationChallengesTable.userId, input.userId),
                eq(authVerificationChallengesTable.purpose, input.purpose),
                isNull(authVerificationChallengesTable.consumedAt),
                isNull(authVerificationChallengesTable.invalidatedAt),
            ),
        )
        .limit(1);

    return rows[0] ? mapChallenge(rows[0]) : null;
}

export async function findPasskeyByCredentialId(
    persistence: AuthStoreContext,
    credentialId: string,
): Promise<StoredAuthenticationPasskey | null> {
    const rows = await persistence.database
        .select()
        .from(authPasskeysTable)
        .where(eq(authPasskeysTable.credentialId, credentialId))
        .limit(1);

    return rows[0] ? mapPasskey(rows[0]) : null;
}

export async function findRefreshSessionByDigest(
    persistence: AuthStoreContext,
    digest: string,
): Promise<StoredAuthenticationSession | null> {
    const rows = await persistence.database
        .select()
        .from(authSessionsTable)
        .where(eq(authSessionsTable.refreshTokenDigest, digest))
        .limit(1);

    return rows[0] ? mapSession(rows[0]) : null;
}

export async function getActiveSession(
    persistence: AuthStoreContext,
    input: {
        now: Date;
        sessionId: string;
        userId: string;
    },
): Promise<StoredAuthenticationSession | null> {
    const rows = await persistence.database
        .select({ session: authSessionsTable })
        .from(authSessionsTable)
        .innerJoin(usersTable, eq(usersTable.id, authSessionsTable.userId))
        .where(
            and(
                eq(authSessionsTable.id, input.sessionId),
                eq(authSessionsTable.userId, input.userId),
                eq(usersTable.status, 'active'),
                isNull(authSessionsTable.revokedAt),
                isNull(authSessionsTable.rotatedAt),
                gt(authSessionsTable.absoluteExpiresAt, input.now),
            ),
        )
        .limit(1);

    return rows[0] ? mapSession(rows[0].session) : null;
}

export async function listActivePasskeys(
    persistence: AuthStoreContext,
    userId: string,
): Promise<StoredAuthenticationPasskey[]> {
    const rows = await persistence.database
        .select()
        .from(authPasskeysTable)
        .where(
            and(
                eq(authPasskeysTable.userId, userId),
                isNull(authPasskeysTable.revokedAt),
            ),
        )
        .orderBy(authPasskeysTable.createdAt);

    return rows.map(mapPasskey);
}
