import { randomUUID } from 'node:crypto';

import { and, eq, isNull, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import { RecentAuthenticationRequiredError } from '../../../../authentication/application/authentication-errors';
import { authSecurityEventsTable, authSessionsTable } from '../../../../authentication/infrastructure/persistence/drizzle/schema';
import { adminMembershipsTable } from '../../../../administration/infrastructure/persistence/drizzle/schema';
import { dictionariesTable } from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import { activeOwnerMutationLock } from '../../../../administration/infrastructure/persistence/drizzle/owner-lock';
import { usersTable } from './schema';
import { accountDeletionRequestsTable } from './account-deletion-schema';
import {
    AccountDeletionConflictError,
    AccountDeletionOwnerTransferRequiredError,
} from '../../../application/account-deletion-service';
import type { AccountDeletionStore } from '../../../application/ports/account-deletion-store';

type Database = PostgresJsDatabase<typeof databaseSchema>;

export class DrizzleAccountDeletionStore implements AccountDeletionStore {
    public constructor(private readonly database: Database) {}

    public schedule(input: {
        beforeCommit(userVersion: number, scheduledAt: Date): Promise<void>;
        now: Date;
        purgeAt: Date;
        sessionId: string;
        userId: string;
    }) {
        return this.database.transaction(async (transaction) => {
            // Membership mutations and cancellation acquire this lock before
            // touching the deletion request, preventing an owner-transfer race.
            await transaction.execute(
                sql.raw('select pg_advisory_xact_lock(' + activeOwnerMutationLock + ')'),
            );
            const [request] = await transaction
                .select({ state: accountDeletionRequestsTable.state })
                .from(accountDeletionRequestsTable)
                .where(eq(accountDeletionRequestsTable.userId, input.userId))
                .limit(1)
                .for('update');
            if (request && request.state !== 'cancelled') {
                throw new AccountDeletionConflictError();
            }

            // Match authentication's session-before-user row lock order.
            const [session] = await transaction
                .select({ id: authSessionsTable.id, authenticatedAt: authSessionsTable.authenticatedAt,
                    absoluteExpiresAt: authSessionsTable.absoluteExpiresAt,
                    revokedAt: authSessionsTable.revokedAt, rotatedAt: authSessionsTable.rotatedAt })
                .from(authSessionsTable)
                .where(
                    and(
                        eq(authSessionsTable.id, input.sessionId),
                        eq(authSessionsTable.userId, input.userId),
                    ),
                )
                .limit(1)
                .for('update');
            if (!session) throw new RecentAuthenticationRequiredError();

            const [user] = await transaction
                .select({ status: usersTable.status, version: usersTable.version })
                .from(usersTable)
                .where(eq(usersTable.id, input.userId))
                .limit(1)
                .for('update');
            if (
                !user ||
                user.status !== 'active'
            ) {
                throw new AccountDeletionConflictError();
            }
            const [membership] = await transaction
                .select({ id: adminMembershipsTable.id })
                .from(adminMembershipsTable)
                .where(
                    and(
                        eq(adminMembershipsTable.userId, input.userId),
                        isNull(adminMembershipsTable.revokedAt),
                    ),
                )
                .limit(1);
            if (membership) throw new AccountDeletionOwnerTransferRequiredError();

            const [clock] = await transaction.select({ value: sql<string>`clock_timestamp()::text` })
                .from(usersTable).where(eq(usersTable.id, input.userId)).limit(1);
            const operationTime = new Date(clock?.value ?? Number.NaN);
            if (Number.isNaN(operationTime.getTime()) || session.revokedAt || session.rotatedAt ||
                session.absoluteExpiresAt <= operationTime ||
                session.authenticatedAt < new Date(operationTime.getTime() - 5 * 60_000)) {
                throw new RecentAuthenticationRequiredError();
            }
            const purgeAt = new Date(operationTime.getTime() + 30 * 24 * 60 * 60_000);

            await input.beforeCommit(user.version + 1, operationTime);

            const [changed] = await transaction
                .update(usersTable)
                .set({
                    status: 'deletion_pending',
                    updatedAt: operationTime,
                    version: user.version + 1,
                })
                .where(
                    and(
                        eq(usersTable.id, input.userId),
                        eq(usersTable.status, 'active'),
                        eq(usersTable.version, user.version),
                    ),
                )
                .returning({ version: usersTable.version });
            if (!changed) throw new AccountDeletionConflictError();

            const scheduleValues = {
                attemptCount: 0,
                completedAt: null,
                leaseDeadline: null,
                leaseWorkerId: null,
                nextAttemptAt: purgeAt,
                purgeAt,
                scheduledAt: operationTime,
                state: 'pending' as const,
                updatedAt: operationTime,
            };
            if (request) {
                await transaction
                    .update(accountDeletionRequestsTable)
                    .set(scheduleValues)
                    .where(eq(accountDeletionRequestsTable.userId, input.userId));
            } else {
                await transaction.insert(accountDeletionRequestsTable).values({
                    ...scheduleValues,
                    userId: input.userId,
                });
            }
            await transaction
                .update(authSessionsTable)
                .set({
                    revokedAt: operationTime,
                    revocationReason: 'account_deletion',
                    updatedAt: operationTime,
                })
                .where(
                    and(
                        eq(authSessionsTable.userId, input.userId),
                        isNull(authSessionsTable.revokedAt),
                    ),
                );
            // Unlisted links have no bearer session. Revoke their locators in the
            // same commit so shared readers lose access immediately too.
            await transaction.update(dictionariesTable).set({
                shareKeyDigest: null,
                shareKeyRotatedAt: null,
                shareKeyVersion: null,
                shareLocator: null,
                updatedAt: operationTime,
                visibility: 'private',
                version: sql`${dictionariesTable.version} + 1`,
            }).where(eq(dictionariesTable.ownerId, input.userId));
            await transaction.insert(authSecurityEventsTable).values({
                correlationId: randomUUID(),
                eventType: 'auth.account_deletion_scheduled',
                expiresAt: new Date(operationTime.getTime() + 180 * 24 * 60 * 60_000),
                id: randomUUID(),
                metadata: { purgeAt: purgeAt.toISOString() },
                occurredAt: operationTime,
                outcome: 'success',
                sessionId: input.sessionId,
                userId: input.userId,
            });
            return {
                purgeAt,
                scheduledAt: operationTime,
                userVersion: changed.version,
            };
        });
    }
}
