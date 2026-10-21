import { sql, type SQL } from 'drizzle-orm';
import type { NavigationResourceKind } from '@languon/contracts';
import type {
    NavigationEntry,
    NavigationResourceReader,
} from '../application/navigation-ports';
import type { NavigationDatabase } from './persistence/drizzle/drizzle-navigation-metadata-store';
import { navigationResourcesTable } from './persistence/drizzle/schema';
import { usersTable } from '../../users/infrastructure/persistence/drizzle/schema';
/** Each source adapter supplies only owned active summaries, never bodies or share capabilities. */
export function createNavigationReader(
    database: NavigationDatabase,
    kind: NavigationResourceKind,
    source: (ownerId: string) => SQL,
): NavigationResourceReader {
    return {
        kind,
        async count(ownerId) {
            const [row] = await database.execute<{
                total: string | number;
            }>(sql`
                select count(*) as total from (${source(ownerId)}) r
                inner join ${usersTable} u on u.id = ${ownerId}::uuid and u.status = 'active'
            `);
            return Number(row?.total ?? 0);
        },
        async read(ownerId, query) {
            const condition = query.id
                ? sql`r.id = ${query.id}::uuid`
                : query.q
                  ? sql`strpos(lower(r.title),lower(${query.q})) > 0`
                  : query.recentOnly
                    ? sql`m.last_opened_at is not null`
                    : query.kind
                      ? sql`true`
                      : sql`(m.last_opened_at is not null or m.pinned_at is not null)`;
            const order = query.q
                ? sql`r.title asc, r.id asc`
                : query.recentOnly
                  ? sql`m.last_opened_at desc nulls last, r.id asc`
                  : sql`(m.pinned_at is not null) desc, m.last_opened_at desc nulls last, r.activity_at desc, r.id asc`;
            const rows = await database.execute<{
                id: string;
                title: string;
                activity_at: Date | string;
                href: string;
                description: string | null;
                language: string | null;
                pinned_at: Date | string | null;
                last_opened_at: Date | string | null;
            }>(sql`
            select r.*, m.pinned_at, m.last_opened_at from (${source(ownerId)}) r
            inner join ${usersTable} u on u.id = ${ownerId}::uuid and u.status = 'active'
            left join ${navigationResourcesTable} m on m.owner_id = ${ownerId}::uuid and m.kind = ${kind} and m.resource_id = r.id
            where ${condition} order by ${order} limit ${query.limit}
        `);
            return rows.map(
                (row) =>
                    ({
                        id: row.id,
                        activityAt: new Date(row.activity_at).toISOString(),
                        kind,
                        title: row.title,
                        href: row.href,
                        ...(row.description
                            ? { description: row.description }
                            : {}),
                        ...(row.language ? { language: row.language } : {}),
                        pinned: row.pinned_at !== null,
                        pinnedAt: row.pinned_at
                            ? new Date(row.pinned_at).toISOString()
                            : null,
                        lastOpenedAt: row.last_opened_at
                            ? new Date(row.last_opened_at).toISOString()
                            : null,
                    }) satisfies NavigationEntry,
            );
        },
    };
}
