import { dictionariesTable } from '../../dictionaries/infrastructure/persistence/drizzle/schema';
import { activeOwnerMutationLock } from './persistence/drizzle/owner-lock';
import { RecentAuthenticationRequiredError } from '../../authentication/application/authentication-errors';
import { and, asc, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm';
import { authSessionsTable as sessionsTable } from '../../authentication/infrastructure/persistence/drizzle/schema';
import {
    usersTable,
    userEmailsTable,
} from '../../users/infrastructure/persistence/drizzle/schema';
import {
    adminAuditEventsTable,
    adminMembershipsTable,
} from './persistence/drizzle/schema';
import type { SentenceLibraryAdminHooks } from '../../learning/infrastructure/persistence/drizzle/drizzle-sentence-library-store';
import { AdminAccessDeniedError } from '../application/administration-errors';
import { sentenceLibraryAuditAction } from '../application/administration-service';

/** Both the live actor guard and successful audit commit with the learning mutation. */
export function createSentenceLibraryAdministrationHooks(): SentenceLibraryAdminHooks {
    return {
        async authorizeAdmin(transaction, scope, write, now) {
            await transaction.execute(
                sql`select pg_advisory_xact_lock(${activeOwnerMutationLock})`,
            );
            // Match learning's stable user-lock order, including the actor before any actor row lock.
            const dictionary = scope.dictionaryId
                ? (
                      await transaction
                          .select({ ownerId: dictionariesTable.ownerId })
                          .from(dictionariesTable)
                          .where(eq(dictionariesTable.id, scope.dictionaryId))
                  )[0]
                : undefined;
            const userIds = [
                ...new Set([
                    scope.actorId,
                    scope.targetUserId,
                    ...(dictionary ? [dictionary.ownerId] : []),
                ]),
            ].sort();
            await transaction
                .select({ id: usersTable.id })
                .from(usersTable)
                .where(inArray(usersTable.id, userIds))
                .orderBy(asc(usersTable.id))
                .for('update');
            const clock = await transaction.execute<{ value: string }>(
                sql`select clock_timestamp()::text as value`,
            );
            now = new Date(clock[0]?.value ?? Number.NaN);
            if (!Number.isFinite(now.getTime()))
                throw new AdminAccessDeniedError();
            const [actor] = await transaction
                .select({
                    userId: usersTable.id,
                    role: adminMembershipsTable.role,
                    authenticatedAt: sessionsTable.authenticatedAt,
                })
                .from(usersTable)
                .innerJoin(
                    adminMembershipsTable,
                    eq(adminMembershipsTable.userId, usersTable.id),
                )
                .innerJoin(
                    sessionsTable,
                    and(
                        eq(sessionsTable.id, scope.actorSessionId),
                        eq(sessionsTable.userId, usersTable.id),
                        isNull(sessionsTable.revokedAt),
                        gt(sessionsTable.absoluteExpiresAt, now),
                        isNull(sessionsTable.rotatedAt),
                    ),
                )
                .innerJoin(
                    userEmailsTable,
                    and(
                        eq(userEmailsTable.userId, usersTable.id),
                        eq(userEmailsTable.isPrimary, true),
                        sql`${userEmailsTable.verifiedAt} is not null`,
                    ),
                )
                .where(
                    and(
                        eq(usersTable.id, scope.actorId),
                        eq(usersTable.status, 'active'),

                        isNull(adminMembershipsTable.revokedAt),
                    ),
                )
                .for('update', {
                    of: [usersTable, adminMembershipsTable, sessionsTable],
                });
            if (!actor || actor.role !== 'owner')
                throw new AdminAccessDeniedError();
            const age = actor.authenticatedAt
                ? now.getTime() - actor.authenticatedAt.getTime()
                : Number.POSITIVE_INFINITY;
            if (write && (age < 0 || age >= 5 * 60 * 1000))
                throw new RecentAuthenticationRequiredError();
        },
        async onAdminMutation(transaction, scope, input, result, now) {
            await transaction.insert(adminAuditEventsTable).values({
                id: scope.audit.id,
                actorUserId: scope.actorId,
                targetUserId: scope.targetUserId,
                action: sentenceLibraryAuditAction(input.operation),
                outcome: 'success',
                reason: input.reason,
                correlationId: scope.audit.correlationId,
                beforeVersion: null,
                afterVersion: null,
                metadata: {
                    targetKind: 'sentence_library',
                    dictionaryId: scope.dictionaryId,
                    operationId: input.operationId,
                    selectionKind: input.selection.type,
                    affectedCount: result.affectedCount,
                },
                occurredAt: now,
                expiresAt: scope.audit.expiresAt,
            });
            await transaction
                .delete(adminAuditEventsTable)
                .where(lte(adminAuditEventsTable.expiresAt, now));
        },
    };
}
