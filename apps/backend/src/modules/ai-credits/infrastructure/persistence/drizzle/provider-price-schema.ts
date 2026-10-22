import { sql } from 'drizzle-orm';
import {
    check,
    index,
    integer,
    jsonb,
    pgTable,
    text,
    timestamp,
    unique,
    uuid,
} from 'drizzle-orm/pg-core';
import type { ProviderPricePublishRequest } from '@languon/contracts';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';

export const aiProviderPriceRevisionsTable = pgTable(
    'ai_provider_price_revisions',
    {
        id: uuid('id').primaryKey(),
        providerId: text('provider_id').notNull(),
        modelId: text('model_id').notNull(),
        meter: text('meter').notNull(),
        version: integer('version').notNull(),
        effectiveAt: timestamp('effective_at', {
            withTimezone: true,
            mode: 'date',
        }).notNull(),
        createdAt: timestamp('created_at', {
            withTimezone: true,
            mode: 'date',
        }).notNull(),
        createdBy: uuid('created_by').references(() => usersTable.id, {
            onDelete: 'set null',
        }),
        data: jsonb('data')
            .$type<Omit<ProviderPricePublishRequest, 'expectedVersion'>>()
            .notNull(),
    },
    (t) => [
        unique('ai_provider_price_revision_version').on(
            t.providerId,
            t.modelId,
            t.meter,
            t.version,
        ),
        index('ai_provider_price_effective_idx').on(
            t.providerId,
            t.modelId,
            t.meter,
            t.effectiveAt,
        ),
        check('ai_provider_price_version_positive', sql`${t.version}>0`),
        check(
            'ai_provider_price_meter',
            sql`${t.meter} in ('text-tokens','speech-characters')`,
        ),
    ],
);
