import { pgTable, uuid, jsonb, text, timestamp } from 'drizzle-orm/pg-core';
import { aiCreditActionAttemptsTable } from '../../../../ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import type { TextAiExecutionSnapshot } from '../../../application/text-ai-provider-catalog';
import type { ProviderPrice } from '@languon/contracts';

/** Exact immutable execution provenance for each actual provider call. */
export const textAiRouteDispatchesTable = pgTable('text_ai_route_dispatches', {
    attemptId: uuid('attempt_id')
        .primaryKey()
        .references(() => aiCreditActionAttemptsTable.id, {
            onDelete: 'cascade',
        }),
    routeId: text('route_id').notNull(),
    snapshot: jsonb('snapshot').$type<TextAiExecutionSnapshot>().notNull(),
    providerPrice: jsonb('provider_price').$type<ProviderPrice>().notNull(),
    createdAt: timestamp('created_at', {
        mode: 'date',
        withTimezone: true,
    }).notNull(),
});
