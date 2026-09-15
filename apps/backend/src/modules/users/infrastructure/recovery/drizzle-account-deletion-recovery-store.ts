import { and, eq, isNull, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { databaseSchema } from '../../../../infrastructure/database/schema';
import { authSessionsTable } from '../../../authentication/infrastructure/persistence/drizzle/schema';
import { dictionariesTable } from '../../../dictionaries/infrastructure/persistence/drizzle/schema';
import { accountDeletionRequestsTable } from '../persistence/drizzle/account-deletion-schema';
import { usersTable } from '../persistence/drizzle/schema';
import type {
    RecoveredUser,
    RecoveryStore,
} from './account-deletion-recovery-gate';

const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

/** Only use against a restored DB while application traffic and workers are stopped. */
export class DrizzleAccountDeletionRecoveryStore implements RecoveryStore {
    public constructor(
        private readonly database: PostgresJsDatabase<typeof databaseSchema>,
        private readonly now: () => Date = () => new Date(),
    ) {}

    public async findUser(userId: string): Promise<RecoveredUser | null> {
        const [user] = await this.database
            .select({
                id: usersTable.id,
                status: usersTable.status,
                version: usersTable.version,
                deletionState: accountDeletionRequestsTable.state,
            })
            .from(usersTable)
            .leftJoin(
                accountDeletionRequestsTable,
                eq(accountDeletionRequestsTable.userId, usersTable.id),
            )
            .where(eq(usersTable.id, userId))
            .limit(1);
        return user ?? null;
    }

    public async blockAccount(input: {
        scheduledAt: Date;
        userId: string;
        userVersion: number;
    }): Promise<void> {
        await this.database.transaction(async (transaction) => {
            // Match purge and administrative cancellation's request-before-user lock order.
            const [request] = await transaction
                .select({ state: accountDeletionRequestsTable.state })
                .from(accountDeletionRequestsTable)
                .where(eq(accountDeletionRequestsTable.userId, input.userId))
                .for('update')
                .limit(1);
            const [user] = await transaction
                .select({
                    status: usersTable.status,
                    version: usersTable.version,
                })
                .from(usersTable)
                .where(eq(usersTable.id, input.userId))
                .for('update')
                .limit(1);
            if (!user || user.status === 'purged') return;
            if (
                request?.state === 'cancelled' &&
                user.version > input.userVersion
            )
                return;
            if (
                user.status === 'deletion_pending' &&
                user.version >= input.userVersion &&
                (request?.state === 'pending' ||
                    request?.state === 'running' ||
                    request?.state === 'complete')
            )
                return;

            const now = this.now();
            const updatedAt = new Date(
                Math.max(now.getTime(), input.scheduledAt.getTime()),
            );
            const purgeAt = new Date(
                input.scheduledAt.getTime() + thirtyDaysMs,
            );
            if (
                user.status !== 'deletion_pending' ||
                user.version < input.userVersion
            ) {
                await transaction
                    .update(usersTable)
                    .set({
                        status: 'deletion_pending',
                        updatedAt,
                        version: Math.max(user.version + 1, input.userVersion),
                    })
                    .where(eq(usersTable.id, input.userId));
            }

            await transaction
                .insert(accountDeletionRequestsTable)
                .values({
                    userId: input.userId,
                    scheduledAt: input.scheduledAt,
                    purgeAt,
                    nextAttemptAt: purgeAt,
                    updatedAt,
                    state: 'pending',
                })
                .onConflictDoUpdate({
                    target: accountDeletionRequestsTable.userId,
                    set: {
                        scheduledAt: input.scheduledAt,
                        purgeAt,
                        nextAttemptAt: purgeAt,
                        state: 'pending',
                        updatedAt,
                        leaseDeadline: null,
                        leaseWorkerId: null,
                        completedAt: null,
                    },
                });
            await transaction
                .update(authSessionsTable)
                .set({
                    revokedAt: sql`greatest(${updatedAt.toISOString()}::timestamptz, ${authSessionsTable.createdAt})`,
                    revocationReason: 'account_recovery_gate',
                    updatedAt: sql`greatest(${updatedAt.toISOString()}::timestamptz, ${authSessionsTable.createdAt})`,
                })
                .where(
                    and(
                        eq(authSessionsTable.userId, input.userId),
                        isNull(authSessionsTable.revokedAt),
                    ),
                );

            // Share locators are deliberately irrecoverable after scheduling.
            await transaction
                .update(dictionariesTable)
                .set({
                    visibility: 'private',
                    shareLocator: null,
                    shareKeyDigest: null,
                    shareKeyVersion: null,
                    shareKeyRotatedAt: null,
                    version: sql`${dictionariesTable.version} + 1`,
                    updatedAt: sql`greatest(${updatedAt.toISOString()}::timestamptz, ${dictionariesTable.createdAt})`,
                })
                .where(eq(dictionariesTable.ownerId, input.userId));
        });
    }
}
