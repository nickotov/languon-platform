import { sql } from 'drizzle-orm';
import {
    pgTable,
    uuid,
    integer,
    jsonb,
    timestamp,
    text,
    check,
    unique,
} from 'drizzle-orm/pg-core';
import type { TextAiRoutingConfiguration } from '@languon/contracts';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';

export const textAiRoutingRevisionsTable = pgTable(
    'text_ai_routing_revisions',
    {
        id: uuid('id').primaryKey(),
        version: integer('version').notNull(),
        configuration: jsonb('configuration')
            .$type<TextAiRoutingConfiguration>()
            .notNull(),
        createdAt: timestamp('created_at', {
            mode: 'date',
            withTimezone: true,
        }).notNull(),
        createdBy: uuid('created_by')
            .references(() => usersTable.id, { onDelete: 'restrict' })
            .notNull(),
        reason: text('reason').notNull(),
    },
    (t) => [
        unique('text_ai_routing_revisions_version_unique').on(t.version),
        check(
            'text_ai_routing_revisions_version_positive',
            sql`${t.version} > 0`,
        ),
        check(
            'text_ai_routing_revisions_configuration_bounded',
            sql`jsonb_typeof(${t.configuration}) = 'object' and octet_length(${t.configuration}::text) <= 65536`,
        ),
        check(
            'text_ai_routing_revisions_reason_bounded',
            sql`char_length(${t.reason}) between 3 and 500`,
        ),
    ],
);
export const textAiRoutingStateTable = pgTable(
    'text_ai_routing_state',
    {
        id: text('id').primaryKey().default('global'),
        activeRevisionId: uuid('active_revision_id')
            .notNull()
            .references(() => textAiRoutingRevisionsTable.id, {
                onDelete: 'restrict',
            }),
        updatedAt: timestamp('updated_at', {
            mode: 'date',
            withTimezone: true,
        }).notNull(),
    },
    (t) => [check('text_ai_routing_state_singleton', sql`${t.id} = 'global'`)],
);
