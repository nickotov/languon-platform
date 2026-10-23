import type {
    AdminAuditEventsQuery,
    AdminDashboardResponse,
    AdminUserDetail,
    AdminUsersQuery,
    AdminUsersResponse,
} from '@languon/contracts';
import {
    and,
    count,
    desc,
    eq,
    ilike,
    isNull,
    or,
    sql,
    type SQL,
} from 'drizzle-orm';
import {
    authPasskeysTable,
    authSessionsTable,
} from '../../../../authentication/infrastructure/persistence/drizzle/schema';
import {
    userEmailsTable,
    usersTable,
} from '../../../../users/infrastructure/persistence/drizzle/schema';
import type { AdminAuditWrite } from '../../../application/ports/administration-store';
import {
    auditSelection,
    auditValues,
    mapAuditEvent,
    mapUserSummary,
    userSummarySelection,
    uuidPattern,
    type AdministrationStoreContext,
    type QueryDatabase,
} from './administration-persistence-support';
import { adminAuditEventsTable, adminMembershipsTable } from './schema';

export async function findActiveMembership(
    persistence: AdministrationStoreContext,
    userId: string,
) {
    const [membership] = await persistence.database
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

export async function dashboard(
    persistence: AdministrationStoreContext,
): Promise<AdminDashboardResponse> {
    const [counts, recentAuditEvents] = await Promise.all([
        dashboardCounts(persistence),
        listAuditEvents(persistence, { page: 1, pageSize: 10 }),
    ]);

    return { counts, recentAuditEvents: recentAuditEvents.data };
}

export async function listUsers(
    persistence: AdministrationStoreContext,
    input: AdminUsersQuery,
): Promise<AdminUsersResponse> {
    const where = userWhere(persistence, input);
    const offset = (input.page - 1) * input.pageSize;
    const [rows, totals] = await Promise.all([
        persistence.database
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
        persistence.database
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

export function findUser(
    persistence: AdministrationStoreContext,
    userId: string,
): Promise<AdminUserDetail | null> {
    return readUser(persistence, persistence.database, userId);
}

export async function listAuditEvents(
    persistence: AdministrationStoreContext,
    input: AdminAuditEventsQuery,
) {
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
        persistence.database
            .select(auditSelection())
            .from(adminAuditEventsTable)
            .where(where)
            .orderBy(
                desc(adminAuditEventsTable.occurredAt),
                desc(adminAuditEventsTable.id),
            )
            .limit(input.pageSize)
            .offset((input.page - 1) * input.pageSize),
        persistence.database
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

export async function recordAudit(
    persistence: AdministrationStoreContext,
    input: AdminAuditWrite,
): Promise<void> {
    await persistence.database
        .insert(adminAuditEventsTable)
        .values(auditValues(input));
}

export async function readUser(
    persistence: AdministrationStoreContext,
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

export function userWhere(
    persistence: AdministrationStoreContext,
    input: AdminUsersQuery,
): SQL | undefined {
    const conditions: SQL[] = [];
    if (input.status) conditions.push(eq(usersTable.status, input.status));
    if (input.search) {
        const matches: SQL[] = [
            ilike(userEmailsTable.email, `%${input.search}%`),
        ];

        if (uuidPattern.test(input.search)) {
            matches.push(eq(usersTable.id, input.search));
        }

        conditions.push(matches.length === 1 ? matches[0]! : or(...matches)!);
    }

    return conditions.length ? and(...conditions) : undefined;
}

export async function dashboardCounts(persistence: AdministrationStoreContext) {
    const [row] = await persistence.database
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
