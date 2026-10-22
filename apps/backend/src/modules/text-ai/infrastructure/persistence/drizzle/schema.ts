import { sql } from 'drizzle-orm';
import {
    check,
    integer,
    pgTable,
    text,
    timestamp,
    uuid,
} from 'drizzle-orm/pg-core';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';

export const textAiPreferencesTable = pgTable(
    'user_text_ai_preferences',
    {
        userId: uuid('user_id')
            .primaryKey()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        mode: text('mode')
            .$type<'auto' | 'explicit'>()
            .default('auto')
            .notNull(),
        modelId: text('model_id'),
        version: integer('version').default(0).notNull(),
        maxCreditsPerAction: text('max_credits_per_action'),
        createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
    },
    (table) => [
        check(
            'user_text_ai_preferences_action_budget_valid',
            sql`${table.maxCreditsPerAction} is null or (${table.maxCreditsPerAction} ~ '^(0|[1-9][0-9]{0,9})(\\.[0-9]{1,3})?$' and ${table.maxCreditsPerAction}::numeric > 0)`,
        ),
        check(
            'user_text_ai_preferences_selection_valid',
            sql`(${table.mode} = 'auto' and ${table.modelId} is null) or (${table.mode} = 'explicit' and ${table.modelId} is not null and char_length(${table.modelId}) between 1 and 160)`,
        ),
        check(
            'user_text_ai_preferences_version_nonnegative',
            sql`${table.version} >= 0`,
        ),
    ],
);
