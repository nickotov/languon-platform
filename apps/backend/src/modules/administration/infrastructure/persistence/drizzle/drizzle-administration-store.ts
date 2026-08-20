import {
    and,
    count,
    desc,
    eq,
    gt,
    ilike,
    isNull,
    or,
    sql,
    type SQL,
} from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type {
    AdminAuditEvent,
    AdminAuditEventsQuery,
    AdminDashboardResponse,
    AdminUserDetail,
    AdminUsersQuery,
    AdminUsersResponse,
} from '@languon/contracts';

import type { databaseSchema } from '../../../../../infrastructure/database/schema';
import {
    authPasskeysTable,
    authSessionsTable,
} from '../../../../authentication/infrastructure/persistence/drizzle/schema';
import { User } from '../../../../users/domain/user';
import {
    userEmailsTable,
    usersTable,
} from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    AdminAccessDeniedError,
    AdminLastOwnerForbiddenError,
    AdminUserNotFoundError,
    AdminUserStateConflictError,
} from '../../../application/administration-errors';
import { RecentAuthenticationRequiredError } from '../../../../authentication/application/authentication-errors';
import type {
    AdministrationStore,
    AdminAuditWrite,
    AdminUserMutationInput,
} from '../../../application/ports/administration-store';
import { adminAuditEventsTable, adminMembershipsTable } from './schema';
import { activeOwnerMutationLock } from './owner-lock';

type AdministrationDatabase = PostgresJsDatabase<typeof databaseSchema>;
type AdministrationTransaction = Parameters<
    Parameters<AdministrationDatabase['transaction']>[0]
>[0];
type QueryDatabase = AdministrationDatabase | AdministrationTransaction;
const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class DrizzleAdministrationStore implements AdministrationStore {
    public constructor(private readonly database: AdministrationDatabase) {}

    public async findActiveMembership(userId: string) {
        const [membership] = await this.database
            .select({
                grantedAt: adminMembershipsTable.grantedAt,
                id: adminMembershipsTable.id,
                role: adminMembershipsTable.role,
                userId: adminMembershipsTable.userId,
            })
            .from(adminMembershipsTable)
            .where(
                and(
                    eq(adminMembershipsTable.userId, userId),
                    isNull(adminMembershipsTable.revokedAt),
                ),
            )
            .limit(1);
        return membership ?? null;
    }

    public async dashboard(): Promise<AdminDashboardResponse> {
        const [counts, recentAuditEvents] = await Promise.all([
            this.dashboardCounts(),
            this.listAuditEvents({ page: 1, pageSize: 10 }),
        ]);
        return { counts, recentAuditEvents: recentAuditEvents.data };
    }

    public async listUsers(
        input: AdminUsersQuery,
    ): Promise<AdminUsersResponse> {
        const where = this.userWhere(input);
        const offset = (input.page - 1) * input.pageSize;
        const [rows, totals] = await Promise.all([
            this.database
                .select(userSummarySelection())
                .from(usersTable)
                .innerJoin(
                    userEmailsTable,
                    and(
                        eq(userEmailsTable.userId, usersTable.id),
                        eq(userEmailsTable.isPrimary, true),
                    ),
                )
                .leftJoin(
                    adminMembershipsTable,
                    and(
                        eq(adminMembershipsTable.userId, usersTable.id),
                        isNull(adminMembershipsTable.revokedAt),
                    ),
                )
                .where(where)
                .orderBy(desc(usersTable.createdAt), desc(usersTable.id))
                .limit(input.pageSize)
                .offset(offset),
            this.database
                .select({ value: count() })
                .from(usersTable)
                .innerJoin(
                    userEmailsTable,
                    and(
                        eq(userEmailsTable.userId, usersTable.id),
                        eq(userEmailsTable.isPrimary, true),
                    ),
                )
                .where(where),
        ]);
        return {
            data: rows.map(mapUserSummary),
            page: input.page,
            pageSize: input.pageSize,
            total: totals[0]?.value ?? 0,
        };
    }

    public findUser(userId: string): Promise<AdminUserDetail | null> {
        return this.readUser(this.database, userId);
    }

    public async listAuditEvents(input: AdminAuditEventsQuery) {
        const conditions: SQL[] = [];
        if (input.action) {
            conditions.push(eq(adminAuditEventsTable.action, input.action));
        }
        if (input.outcome) {
            conditions.push(eq(adminAuditEventsTable.outcome, input.outcome));
        }
        if (input.actorUserId) {
            conditions.push(
                eq(adminAuditEventsTable.actorUserId, input.actorUserId),
            );
        }
        if (input.targetUserId) {
            conditions.push(
                eq(adminAuditEventsTable.targetUserId, input.targetUserId),
            );
        }
        const where = conditions.length ? and(...conditions) : undefined;
        const [rows, totals] = await Promise.all([
            this.database
                .select(auditSelection())
                .from(adminAuditEventsTable)
                .where(where)
                .orderBy(
                    desc(adminAuditEventsTable.occurredAt),
                    desc(adminAuditEventsTable.id),
                )
                .limit(input.pageSize)
                .offset((input.page - 1) * input.pageSize),
            this.database
                .select({ value: count() })
                .from(adminAuditEventsTable)
                .where(where),
        ]);
        return {
            data: rows.map(mapAuditEvent),
            page: input.page,
            pageSize: input.pageSize,
            total: totals[0]?.value ?? 0,
        };
    }

    public async recordAudit(input: AdminAuditWrite): Promise<void> {
        await this.database
            .insert(adminAuditEventsTable)
            .values(auditValues(input));
    }

    public disableUser(input: AdminUserMutationInput) {
        return this.mutateUser(input, 'disable');
    }

    public restoreUser(input: AdminUserMutationInput) {
        return this.mutateUser(input, 'restore');
    }

    private async mutateUser(
        input: AdminUserMutationInput,
        operation: 'disable' | 'restore',
    ): Promise<AdminUserDetail> {
        return this.database.transaction(async (transaction) => {
            await transaction.execute(
                sql`select pg_advisory_xact_lock(${activeOwnerMutationLock})`,
            );
            const [clock] = await transaction
                .select({ value: sql<string>`clock_timestamp()::text` })
                .from(usersTable)
                .limit(1);
            const operationTime = new Date(clock?.value ?? Number.NaN);
            if (Number.isNaN(operationTime.getTime())) {
                throw new AdminAccessDeniedError();
            }
            await this.assertActorCanMutate(transaction, input, operationTime);
            const [row] = await transaction
                .select({
                    createdAt: usersTable.createdAt,
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

            if (operation === 'disable' && row.status === 'active') {
                await this.assertNotLastOwner(transaction, row.id);
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
                        operation === 'disable'
                            ? 'user_disabled'
                            : 'user_restored',
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

            const detail = await this.readUser(transaction, updated.id);
            if (!detail) throw new AdminUserNotFoundError();
            return detail;
        });
    }

    private async assertActorCanMutate(
        transaction: AdministrationTransaction,
        input: AdminUserMutationInput,
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

    private async assertNotLastOwner(
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

    private async readUser(
        database: QueryDatabase,
        userId: string,
    ): Promise<AdminUserDetail | null> {
        const [row] = await database
            .select({
                ...userSummarySelection(),
                activeSessionCount: sql<number>`cast((select count(*) from ${authSessionsTable} s where s.user_id = ${usersTable.id} and s.revoked_at is null and s.rotated_at is null and s.absolute_expires_at > now()) as integer)`,
                passkeyCount: sql<number>`cast((select count(*) from ${authPasskeysTable} p where p.user_id = ${usersTable.id} and p.revoked_at is null) as integer)`,
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
                adminMembershipsTable,
                and(
                    eq(adminMembershipsTable.userId, usersTable.id),
                    isNull(adminMembershipsTable.revokedAt),
                ),
            )
            .where(eq(usersTable.id, userId))
            .limit(1);
        return row
            ? {
                  ...mapUserSummary(row),
                  activeSessionCount: row.activeSessionCount,
                  passkeyCount: row.passkeyCount,
              }
            : null;
    }

    private userWhere(input: AdminUsersQuery): SQL | undefined {
        const conditions: SQL[] = [];
        if (input.status) conditions.push(eq(usersTable.status, input.status));
        if (input.search) {
            const matches: SQL[] = [
                ilike(userEmailsTable.email, `%${input.search}%`),
            ];
            if (uuidPattern.test(input.search)) {
                matches.push(eq(usersTable.id, input.search));
            }
            conditions.push(
                matches.length === 1 ? matches[0]! : or(...matches)!,
            );
        }
        return conditions.length ? and(...conditions) : undefined;
    }

    private async dashboardCounts() {
        const [row] = await this.database
            .select({
                activeUsers: sql<number>`cast(count(*) filter (where ${usersTable.status} = 'active') as integer)`,
                disabledUsers: sql<number>`cast(count(*) filter (where ${usersTable.status} = 'disabled') as integer)`,
                pendingUsers: sql<number>`cast(count(*) filter (where ${usersTable.status} = 'pending') as integer)`,
                users: sql<number>`cast(count(*) as integer)`,
                owners: sql<number>`cast((select count(*) from ${adminMembershipsTable} m join ${usersTable} ou on ou.id = m.user_id where m.revoked_at is null and ou.status = 'active') as integer)`,
            })
            .from(usersTable);
        return (
            row ?? {
                activeUsers: 0,
                disabledUsers: 0,
                owners: 0,
                pendingUsers: 0,
                users: 0,
            }
        );
    }
}

function userSummarySelection() {
    return {
        createdAt: usersTable.createdAt,
        email: userEmailsTable.email,
        id: usersTable.id,
        isOwner: sql<boolean>`${adminMembershipsTable.id} is not null`,
        status: usersTable.status,
        updatedAt: usersTable.updatedAt,
        verifiedAt: userEmailsTable.verifiedAt,
        version: usersTable.version,
    };
}

function mapUserSummary(row: {
    createdAt: Date;
    email: string;
    id: string;
    isOwner: boolean;
    status: 'active' | 'disabled' | 'pending';
    updatedAt: Date;
    verifiedAt: Date | null;
    version: number;
}) {
    return {
        createdAt: row.createdAt.toISOString(),
        emailVerified: row.verifiedAt !== null,
        id: row.id,
        isOwner: row.isOwner,
        primaryEmail: row.email.toLowerCase(),
        status: row.status,
        updatedAt: row.updatedAt.toISOString(),
        version: row.version,
    };
}

function auditSelection() {
    return {
        action: adminAuditEventsTable.action,
        actorEmail: sql<string>`(select ue.email from ${userEmailsTable} ue where ue.user_id = ${adminAuditEventsTable.actorUserId} and ue.is_primary = true limit 1)`,
        actorUserId: adminAuditEventsTable.actorUserId,
        afterStatus: adminAuditEventsTable.afterStatus,
        afterVersion: adminAuditEventsTable.afterVersion,
        beforeStatus: adminAuditEventsTable.beforeStatus,
        beforeVersion: adminAuditEventsTable.beforeVersion,
        correlationId: adminAuditEventsTable.correlationId,
        expiresAt: adminAuditEventsTable.expiresAt,
        id: adminAuditEventsTable.id,
        occurredAt: adminAuditEventsTable.occurredAt,
        outcome: adminAuditEventsTable.outcome,
        reason: adminAuditEventsTable.reason,
        targetEmail: sql<
            string | null
        >`(select ue.email from ${userEmailsTable} ue where ue.user_id = ${adminAuditEventsTable.targetUserId} and ue.is_primary = true limit 1)`,
        targetUserId: adminAuditEventsTable.targetUserId,
    };
}

function mapAuditEvent(
    row: ReturnType<typeof auditSelection> extends Record<string, never>
        ? never
        : {
              action: AdminAuditEvent['action'];
              actorEmail: string;
              actorUserId: string;
              afterStatus: AdminAuditEvent['afterStatus'];
              afterVersion: number | null;
              beforeStatus: AdminAuditEvent['beforeStatus'];
              beforeVersion: number | null;
              correlationId: string;
              expiresAt: Date;
              id: string;
              occurredAt: Date;
              outcome: AdminAuditEvent['outcome'];
              reason: string | null;
              targetEmail: string | null;
              targetUserId: string | null;
          },
): AdminAuditEvent {
    return {
        ...row,
        actorEmail: row.actorEmail.toLowerCase(),
        expiresAt: row.expiresAt.toISOString(),
        occurredAt: row.occurredAt.toISOString(),
        targetEmail: row.targetEmail?.toLowerCase() ?? null,
    };
}

function auditValues(input: AdminAuditWrite) {
    return {
        action: input.action,
        actorUserId: input.actorUserId,
        afterStatus: input.afterStatus ?? null,
        afterVersion: input.afterVersion ?? null,
        beforeStatus: input.beforeStatus ?? null,
        beforeVersion: input.beforeVersion ?? null,
        correlationId: input.correlationId,
        expiresAt: input.expiresAt,
        id: input.id,
        metadata: input.metadata ?? {},
        occurredAt: input.occurredAt,
        outcome: input.outcome,
        reason: input.reason ?? null,
        targetUserId: input.targetUserId ?? null,
    };
}
