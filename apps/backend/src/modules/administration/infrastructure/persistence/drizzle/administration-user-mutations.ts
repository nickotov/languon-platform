import type { AdminUserDetail } from '@languon/contracts';
import { and, count, eq, gt, isNull, sql } from 'drizzle-orm';
import { RecentAuthenticationRequiredError } from '../../../../authentication/application/authentication-errors';
import { authSessionsTable } from '../../../../authentication/infrastructure/persistence/drizzle/schema';
import { User } from '../../../../users/domain/user';
import { accountDeletionRequestsTable } from '../../../../users/infrastructure/persistence/drizzle/account-deletion-schema';
import {
    userEmailsTable,
    usersTable,
} from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    AdminAccessDeniedError,
    AdminCancellationJournalUnavailableError,
    AdminDeletionCancellationUnavailableError,
    AdminLastOwnerForbiddenError,
    AdminUserNotFoundError,
    AdminUserStateConflictError,
} from '../../../application/administration-errors';
import type {
    AdminAiCreditAdjustmentMutationInput,
    AdminAiCreditPolicyMutationInput,
    AdminAiSettingsMutationInput,
    AdminUserMutationInput,
} from '../../../application/ports/administration-store';
import {
    auditValues,
    type AdministrationStoreContext,
    type AdministrationTransaction,
} from './administration-persistence-support';
import { readUser } from './administration-read-operations';
import { activeOwnerMutationLock } from './owner-lock';
import { adminAuditEventsTable, adminMembershipsTable } from './schema';

export function disableUser(
    persistence: AdministrationStoreContext,
    input: AdminUserMutationInput,
) {
    return mutateUser(persistence, input, 'disable');
}

export function restoreUser(
    persistence: AdministrationStoreContext,
    input: AdminUserMutationInput,
) {
    return mutateUser(persistence, input, 'restore');
}

export function cancelUserDeletion(
    persistence: AdministrationStoreContext,
    input: AdminUserMutationInput,
): Promise<AdminUserDetail> {
    return persistence.database.transaction(async (transaction) => {
        await transaction.execute(
            sql`select pg_advisory_xact_lock(${activeOwnerMutationLock})`,
        );

        await transaction.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${input.targetUserId}, 76021941))`,
        );

        const [clock] = await transaction
            .select({ value: sql<string>`clock_timestamp()::text` })
            .from(usersTable)
            .limit(1);
        const operationTime = new Date(clock?.value ?? Number.NaN);
        if (Number.isNaN(operationTime.getTime())) {
            throw new AdminAccessDeniedError();
        }

        await assertActorCanMutate(
            persistence,
            transaction,
            input,
            operationTime,
        );

        // The purge worker takes these same locks in this order. Its claim
        // and this cancellation cannot both commit for one request.
        const [request] = await transaction
            .select({ state: accountDeletionRequestsTable.state })
            .from(accountDeletionRequestsTable)
            .where(eq(accountDeletionRequestsTable.userId, input.targetUserId))
            .limit(1)
            .for('update');

        if (request?.state !== 'pending') {
            throw new AdminDeletionCancellationUnavailableError();
        }

        const [row] = await transaction
            .select({
                createdAt: usersTable.createdAt,
                handle: usersTable.handle,
                id: usersTable.id,
                status: usersTable.status,
                updatedAt: usersTable.updatedAt,
                version: usersTable.version,
            })
            .from(usersTable)
            .where(eq(usersTable.id, input.targetUserId))
            .limit(1)
            .for('update');

        if (!row) throw new AdminUserNotFoundError();
        if (row.version !== input.expectedVersion) {
            throw new AdminUserStateConflictError();
        }

        if (row.status !== 'deletion_pending') {
            throw new AdminDeletionCancellationUnavailableError();
        }

        // Fail closed if the independent recovery journal cannot record
        // the cancellation while both rows are still locked. A journal
        // write followed by SQL rollback is harmless: the recovery gate
        // requires a committed active user at this exact version.
        try {
            await persistence.cancellationJournal.recordCancellation({
                cancelledAt: operationTime,
                userId: row.id,
                userVersion: row.version + 1,
            });
        } catch {
            // The transport failure is intentionally not logged here:
            // the writer owns diagnostics, and user data must stay out of logs.
            throw new AdminCancellationJournalUnavailableError();
        }

        const changed = await transaction
            .update(accountDeletionRequestsTable)
            .set({
                leaseDeadline: null,
                leaseWorkerId: null,
                state: 'cancelled',
                updatedAt: operationTime,
            })
            .where(
                and(
                    eq(accountDeletionRequestsTable.userId, input.targetUserId),
                    eq(accountDeletionRequestsTable.state, 'pending'),
                ),
            )
            .returning({ userId: accountDeletionRequestsTable.userId });

        if (changed.length !== 1) {
            throw new AdminDeletionCancellationUnavailableError();
        }

        const updated = await transaction
            .update(usersTable)
            .set({
                status: 'active',
                updatedAt: operationTime,
                version: row.version + 1,
            })
            .where(
                and(
                    eq(usersTable.id, row.id),
                    eq(usersTable.status, 'deletion_pending'),
                    eq(usersTable.version, row.version),
                ),
            )
            .returning({ id: usersTable.id });

        if (updated.length !== 1) throw new AdminUserStateConflictError();
        await transaction.insert(adminAuditEventsTable).values(
            auditValues({
                action: 'user_deletion_cancelled',
                actorUserId: input.actorUserId,
                afterStatus: 'active',
                afterVersion: row.version + 1,
                beforeStatus: row.status,
                beforeVersion: row.version,
                ...input.audit,
                expiresAt: new Date(
                    operationTime.getTime() +
                        (input.audit.expiresAt.getTime() -
                            input.audit.occurredAt.getTime()),
                ),
                occurredAt: operationTime,
                outcome: 'success',
                reason: input.reason,
                targetUserId: input.targetUserId,
            }),
        );

        const detail = await readUser(persistence, transaction, row.id);
        if (!detail) throw new AdminUserNotFoundError();

        return detail;
    });
}

export async function mutateUser(
    persistence: AdministrationStoreContext,
    input: AdminUserMutationInput,
    operation: 'disable' | 'restore',
): Promise<AdminUserDetail> {
    return persistence.database.transaction(async (transaction) => {
        await transaction.execute(
            sql`select pg_advisory_xact_lock(${activeOwnerMutationLock})`,
        );

        await transaction.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${input.targetUserId}, 76021941))`,
        );

        const [clock] = await transaction
            .select({ value: sql<string>`clock_timestamp()::text` })
            .from(usersTable)
            .limit(1);
        const operationTime = new Date(clock?.value ?? Number.NaN);
        if (Number.isNaN(operationTime.getTime())) {
            throw new AdminAccessDeniedError();
        }

        await assertActorCanMutate(
            persistence,
            transaction,
            input,
            operationTime,
        );

        const [row] = await transaction
            .select({
                createdAt: usersTable.createdAt,
                handle: usersTable.handle,
                id: usersTable.id,
                status: usersTable.status,
                updatedAt: usersTable.updatedAt,
                verifiedAt: userEmailsTable.verifiedAt,
                version: usersTable.version,
            })
            .from(usersTable)
            .innerJoin(
                userEmailsTable,
                and(
                    eq(userEmailsTable.userId, usersTable.id),
                    eq(userEmailsTable.isPrimary, true),
                ),
            )
            .where(eq(usersTable.id, input.targetUserId))
            .limit(1)
            .for('update');

        if (!row) throw new AdminUserNotFoundError();
        if (row.version !== input.expectedVersion) {
            throw new AdminUserStateConflictError();
        }

        if (row.status === 'deletion_pending' || row.status === 'purged') {
            throw new AdminUserStateConflictError();
        }

        if (operation === 'disable' && row.status === 'active') {
            await assertNotLastOwner(persistence, transaction, row.id);
        }

        const current = User.restore(row);
        let updated: User;
        try {
            updated =
                operation === 'disable'
                    ? current.disable(operationTime)
                    : current.restoreAvailability(
                          row.verifiedAt !== null,
                          operationTime,
                      );
        } catch {
            throw new AdminUserStateConflictError();
        }

        const changed = await transaction
            .update(usersTable)
            .set({
                status: updated.status,
                updatedAt: updated.updatedAt,
                version: updated.version,
            })
            .where(
                and(
                    eq(usersTable.id, updated.id),
                    eq(usersTable.version, input.expectedVersion),
                ),
            )
            .returning({ id: usersTable.id });

        if (changed.length !== 1) throw new AdminUserStateConflictError();

        if (operation === 'disable') {
            await transaction
                .update(authSessionsTable)
                .set({
                    revokedAt: operationTime,
                    revocationReason: 'disabled_user',
                    updatedAt: operationTime,
                })
                .where(
                    and(
                        eq(authSessionsTable.userId, input.targetUserId),
                        isNull(authSessionsTable.revokedAt),
                    ),
                );
        }

        await transaction.insert(adminAuditEventsTable).values(
            auditValues({
                action:
                    operation === 'disable' ? 'user_disabled' : 'user_restored',
                actorUserId: input.actorUserId,
                afterStatus: updated.status,
                afterVersion: updated.version,
                beforeStatus: current.status,
                beforeVersion: current.version,
                ...input.audit,
                expiresAt: new Date(
                    operationTime.getTime() +
                        (input.audit.expiresAt.getTime() -
                            input.audit.occurredAt.getTime()),
                ),
                occurredAt: operationTime,
                outcome: 'success',
                reason: input.reason,
                targetUserId: input.targetUserId,
            }),
        );

        const detail = await readUser(persistence, transaction, updated.id);
        if (!detail) throw new AdminUserNotFoundError();

        return detail;
    });
}

export async function assertActorCanMutate(
    persistence: AdministrationStoreContext,
    transaction: AdministrationTransaction,
    input: Pick<
        | AdminUserMutationInput
        | AdminAiSettingsMutationInput
        | AdminAiCreditPolicyMutationInput
        | AdminAiCreditAdjustmentMutationInput,
        'actorSessionId' | 'actorUserId'
    >,
    operationTime: Date,
): Promise<void> {
    const [actor] = await transaction
        .select({ authenticatedAt: authSessionsTable.authenticatedAt })
        .from(authSessionsTable)
        .innerJoin(usersTable, eq(usersTable.id, authSessionsTable.userId))
        .innerJoin(
            userEmailsTable,
            and(
                eq(userEmailsTable.userId, usersTable.id),
                eq(userEmailsTable.isPrimary, true),
                sql`${userEmailsTable.verifiedAt} is not null`,
            ),
        )
        .innerJoin(
            adminMembershipsTable,
            and(
                eq(adminMembershipsTable.userId, usersTable.id),
                isNull(adminMembershipsTable.revokedAt),
            ),
        )
        .where(
            and(
                eq(authSessionsTable.id, input.actorSessionId),
                eq(authSessionsTable.userId, input.actorUserId),
                eq(usersTable.status, 'active'),
                isNull(authSessionsTable.revokedAt),
                isNull(authSessionsTable.rotatedAt),
                gt(authSessionsTable.absoluteExpiresAt, operationTime),
            ),
        )
        .limit(1)
        .for('update', { of: authSessionsTable });

    if (!actor) throw new AdminAccessDeniedError();
    if (
        actor.authenticatedAt.getTime() + 5 * 60_000 <=
        operationTime.getTime()
    ) {
        throw new RecentAuthenticationRequiredError();
    }
}

export async function assertNotLastOwner(
    persistence: AdministrationStoreContext,
    transaction: AdministrationTransaction,
    targetUserId: string,
): Promise<void> {
    const [targetMembership, ownerCount] = await Promise.all([
        transaction
            .select({ id: adminMembershipsTable.id })
            .from(adminMembershipsTable)
            .where(
                and(
                    eq(adminMembershipsTable.userId, targetUserId),
                    isNull(adminMembershipsTable.revokedAt),
                ),
            )
            .limit(1),
        transaction
            .select({ value: count() })
            .from(adminMembershipsTable)
            .innerJoin(
                usersTable,
                eq(usersTable.id, adminMembershipsTable.userId),
            )
            .where(
                and(
                    isNull(adminMembershipsTable.revokedAt),
                    eq(adminMembershipsTable.role, 'owner'),
                    eq(usersTable.status, 'active'),
                ),
            ),
    ]);

    if (targetMembership.length && (ownerCount[0]?.value ?? 0) <= 1) {
        throw new AdminLastOwnerForbiddenError();
    }
}
