import { sql } from 'drizzle-orm';
import {
    pgTable,
    uuid,
    text,
    timestamp,
    primaryKey,
    check,
    index,
} from 'drizzle-orm/pg-core';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import type { NavigationResourceKind } from '@languon/contracts';
export const navigationResourcesTable = pgTable(
    'navigation_resources',
    {
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        kind: text('kind').$type<NavigationResourceKind>().notNull(),
        resourceId: uuid('resource_id').notNull(),
        lastOpenedAt: timestamp('last_opened_at', { withTimezone: true }),
        pinnedAt: timestamp('pinned_at', { withTimezone: true }),
    },
    (t) => [
        primaryKey({ columns: [t.ownerId, t.kind, t.resourceId] }),
        check(
            'navigation_resources_kind_check',
            sql`${t.kind} in ('dictionary','text','knowledge')`,
        ),
        index('navigation_resources_owner_recent_idx').on(
            t.ownerId,
            t.lastOpenedAt,
        ),
        index('navigation_resources_owner_pin_idx').on(
            t.ownerId,
            t.kind,
            t.pinnedAt,
        ),
    ],
);
