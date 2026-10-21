import { sql } from 'drizzle-orm';
import {
    check,
    index,
    integer,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';

/** Numerical accounting only. No source/chat FK: settlement must survive content
 * erasure and an ambiguous dispatched call must never be silently forgotten. */
export const portraitInterviewProviderCallsTable = pgTable(
    'learner_portrait_interview_provider_calls',
    {
        id: uuid('id').primaryKey(),
        operationId: uuid('operation_id').notNull(),
        ownerId: uuid('owner_id').notNull(),
        ordinal: integer('ordinal').notNull(),
        purpose: text('purpose').notNull().$type<'actor'>(),
        reservationId: uuid('reservation_id').notNull(),
        state: text('state')
            .notNull()
            .$type<'reserved' | 'dispatched' | 'settled'>(),
        reservedCostMicros: integer('reserved_cost_micros').notNull(),
        reservedInputTokens: integer('reserved_input_tokens').notNull(),
        reservedOutputTokens: integer('reserved_output_tokens').notNull(),
        actualCostMicros: integer('actual_cost_micros').notNull().default(0),
        actualInputTokens: integer('actual_input_tokens').notNull().default(0),
        actualOutputTokens: integer('actual_output_tokens')
            .notNull()
            .default(0),
        inputCostMicrosPerMillionTokens: integer(
            'input_cost_micros_per_million_tokens',
        ).notNull(),
        outputCostMicrosPerMillionTokens: integer(
            'output_cost_micros_per_million_tokens',
        ).notNull(),
        maxCostMicrosPerAttempt: integer(
            'max_cost_micros_per_attempt',
        ).notNull(),
        maxInputTokensPerAttempt: integer(
            'max_input_tokens_per_attempt',
        ).notNull(),
        maxOutputTokensPerAttempt: integer(
            'max_output_tokens_per_attempt',
        ).notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
        dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
        settledAt: timestamp('settled_at', { withTimezone: true }),
    },
    (t) => [
        uniqueIndex('portrait_interview_call_ordinal_unique').on(
            t.operationId,
            t.ordinal,
        ),
        uniqueIndex('portrait_interview_call_reservation_unique').on(
            t.reservationId,
        ),
        index('portrait_interview_call_state_idx').on(t.state, t.settledAt),
        index('portrait_interview_call_owner_idx').on(t.ownerId),
        check(
            'portrait_interview_call_state_check',
            sql`${t.state} in ('reserved','dispatched','settled')`,
        ),
        check(
            'portrait_interview_call_purpose_check',
            sql`${t.purpose} in ('actor')`,
        ),
        check(
            'portrait_interview_call_ordinal_check',
            sql`${t.ordinal} between 1 and 5`,
        ),
        check(
            'portrait_interview_call_settlement_check',
            sql`(${t.state} = 'settled') = (${t.settledAt} is not null)`,
        ),
        check(
            'portrait_interview_call_amounts_check',
            sql`${t.reservedCostMicros} >= 0 and ${t.reservedInputTokens} >= 0 and ${t.reservedOutputTokens} >= 0 and ${t.actualCostMicros} >= 0 and ${t.actualInputTokens} >= 0 and ${t.actualOutputTokens} >= 0`,
        ),
    ],
);
