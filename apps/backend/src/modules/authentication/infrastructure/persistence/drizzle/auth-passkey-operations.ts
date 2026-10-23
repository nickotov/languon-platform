import { and, eq, isNull } from 'drizzle-orm';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import type {
    NewStoredAuthenticationPasskey,
    NewStoredAuthenticationSession,
    PasskeyAuthenticationCommitResult,
    StoredAuthenticationPasskey,
} from '../../../application/ports/auth-store';
import {
    findAccount,
    insertSession,
    lockUser,
    maximumActivePasskeysPerUser,
    type AuthStoreContext,
} from './auth-persistence-support';
import {
    assertInitialSession,
    mapPasskey,
    normalizePasskeyName,
    passkeyInsertValues,
} from './auth-record-mapping';
import { findRecentSession } from './auth-session-operations';
import { throwMappedAuthenticationConflict } from './drizzle-authentication-repository';
import { authPasskeysTable } from './schema';

export function registerPasskey(
    persistence: AuthStoreContext,
    input: {
        now: Date;
        passkey: NewStoredAuthenticationPasskey;
        sessionId: string;
        userId: string;
    },
): Promise<boolean> {
    if (input.passkey.revokedAt !== null || input.passkey.lastUsedAt !== null) {
        throw new Error('A new passkey cannot already be used or revoked.');
    }

    return persistence.database.transaction(async (transaction) => {
        const session = await findRecentSession(
            persistence,
            transaction,
            input.now,
            input.sessionId,
            input.userId,
        );

        if (!session || input.passkey.userId !== input.userId) return false;
        const activePasskeys = await transaction
            .select({ id: authPasskeysTable.id })
            .from(authPasskeysTable)
            .where(
                and(
                    eq(authPasskeysTable.userId, input.userId),
                    isNull(authPasskeysTable.revokedAt),
                ),
            )
            .limit(maximumActivePasskeysPerUser);

        if (activePasskeys.length >= maximumActivePasskeysPerUser) return false;
        try {
            await transaction
                .insert(authPasskeysTable)
                .values(passkeyInsertValues(input.passkey));

            return true;
        } catch (error) {
            throwMappedAuthenticationConflict(error);
        }
    });
}

export function commitPasskeyAuthentication(
    persistence: AuthStoreContext,
    input: {
        expectedCounter: number;
        now: Date;
        passkeyId: string;
        session: NewStoredAuthenticationSession;
        verifiedBackedUp: boolean;
        verifiedCounter: number;
        verifiedDeviceType: StoredAuthenticationPasskey['deviceType'];
    },
): Promise<PasskeyAuthenticationCommitResult> {
    assertInitialSession(input.session, 'passkey', input.now);

    return persistence.database.transaction(async (transaction) => {
        const rows = await transaction
            .select()
            .from(authPasskeysTable)
            .where(eq(authPasskeysTable.id, input.passkeyId))
            .limit(1)
            .for('update');
        const passkey = rows[0];
        if (!passkey || passkey.revokedAt) return { kind: 'unavailable' };
        if (passkey.counter !== input.expectedCounter) {
            return { kind: 'counter_conflict' };
        }

        await lockUser(transaction, passkey.userId);
        const account = await findAccount(
            transaction,
            eq(usersTable.id, passkey.userId),
        );

        if (
            !account ||
            account.status !== 'active' ||
            input.session.userId !== account.userId
        ) {
            return { kind: 'unavailable' };
        }

        const updated = await transaction
            .update(authPasskeysTable)
            .set({
                backedUp: input.verifiedBackedUp,
                counter: input.verifiedCounter,
                credentialDeviceType: input.verifiedDeviceType,
                lastUsedAt: input.now,
                updatedAt: input.now,
            })
            .where(
                and(
                    eq(authPasskeysTable.id, passkey.id),
                    eq(authPasskeysTable.counter, input.expectedCounter),
                    isNull(authPasskeysTable.revokedAt),
                ),
            )
            .returning({ id: authPasskeysTable.id });

        if (updated.length !== 1) return { kind: 'counter_conflict' };
        await insertSession(transaction, input.session);

        return { account, kind: 'authenticated' };
    });
}

export function renamePasskey(
    persistence: AuthStoreContext,
    input: {
        name: string;
        now: Date;
        passkeyId: string;
        userId: string;
    },
): Promise<StoredAuthenticationPasskey | null> {
    return persistence.database.transaction(async (transaction) => {
        const name = normalizePasskeyName(input.name);
        try {
            const renamed = await transaction
                .update(authPasskeysTable)
                .set({ ...name, updatedAt: input.now })
                .where(
                    and(
                        eq(authPasskeysTable.id, input.passkeyId),
                        eq(authPasskeysTable.userId, input.userId),
                        isNull(authPasskeysTable.revokedAt),
                    ),
                )
                .returning();

            return renamed[0] ? mapPasskey(renamed[0]) : null;
        } catch (error) {
            throwMappedAuthenticationConflict(error);
        }
    });
}

export function revokePasskey(
    persistence: AuthStoreContext,
    input: {
        now: Date;
        passkeyId: string;
        sessionId: string;
        userId: string;
    },
): Promise<boolean> {
    return persistence.database.transaction(async (transaction) => {
        const session = await findRecentSession(
            persistence,
            transaction,
            input.now,
            input.sessionId,
            input.userId,
        );

        if (!session) return false;
        const revoked = await transaction
            .update(authPasskeysTable)
            .set({ revokedAt: input.now, updatedAt: input.now })
            .where(
                and(
                    eq(authPasskeysTable.id, input.passkeyId),
                    eq(authPasskeysTable.userId, input.userId),
                    isNull(authPasskeysTable.revokedAt),
                ),
            )
            .returning({ id: authPasskeysTable.id });

        return revoked.length === 1;
    });
}
