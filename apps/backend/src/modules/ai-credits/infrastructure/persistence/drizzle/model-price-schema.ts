import { sql } from 'drizzle-orm';
import {
    check,
    integer,
    jsonb,
    pgTable,
    text,
    timestamp,
    unique,
    uuid,
} from 'drizzle-orm/pg-core';
import type { ModelPrice } from '@languon/contracts';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';

export const modelPriceRevisionsTable = pgTable(
    'model_price_revisions',
    {
        id: uuid('id').primaryKey(),
        providerId: text('provider_id').notNull(),
        modelId: text('model_id').notNull(),
        meter: text('meter').notNull(),
        version: integer('version').notNull(),
        rates: jsonb('rates')
            .$type<
                Pick<
                    ModelPrice,
                    | 'creditsPer1000Characters'
                    | 'minimumCredits'
                    | 'inputCreditsPerMillionTokens'
                    | 'outputCreditsPerMillionTokens'
                    | 'provisional'
                >
            >()
            .notNull(),
        createdAt: timestamp('created_at', {
            withTimezone: true,
            mode: 'date',
        }).notNull(),
        createdBy: uuid('created_by').references(() => usersTable.id, {
            onDelete: 'set null',
        }),
        reason: text('reason').notNull(),
    },
    (table) => [
        unique('model_price_revision_version_unique').on(
            table.providerId,
            table.modelId,
            table.version,
        ),
        check('model_price_revision_positive', sql`${table.version} > 0`),
        check(
            'model_price_meter_closed',
            sql`${table.meter} in ('speech-characters', 'text-tokens')`,
        ),
        check(
            'model_price_reason_bounded',
            sql`char_length(${table.reason}) between 5 and 500`,
        ),
    ],
);
