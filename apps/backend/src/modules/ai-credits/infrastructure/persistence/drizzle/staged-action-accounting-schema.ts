import { sql } from 'drizzle-orm';
import {
    bigint,
    boolean,
    check,
    index,
    numeric,
    pgTable,
    text,
    timestamp,
    uuid,
} from 'drizzle-orm/pg-core';
import {
    aiCreditActionsTable,
    aiCreditActionAttemptsTable,
} from './action-accounting-schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';

/** Provider observations stay immutable; customer eligibility has a separate fenced receipt. */
export const aiCreditStructuredCallValidationsTable = pgTable(
    'ai_credit_structured_call_validations',
    {
        attemptId: uuid('attempt_id')
            .primaryKey()
            .references(() => aiCreditActionAttemptsTable.id, {
                onDelete: 'cascade',
            }),
        validationId: text('validation_id').notNull(),
        accepted: boolean('accepted'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
        validatedAt: timestamp('validated_at', { withTimezone: true }),
    },
    (t) => [
        check(
            'ai_credit_structured_validation_state',
            sql`(${t.accepted} is null and ${t.validatedAt} is null) or (${t.accepted} is not null and ${t.validatedAt} is not null)`,
        ),
    ],
);

/** Contains no private run content and survives deletion of its feature-owned run. */
export const aiCreditSeriesTotalsTable = pgTable(
    'ai_credit_series_totals',
    {
        seriesId: uuid('series_id').primaryKey(),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        numerator: numeric('numerator', { precision: 40, scale: 0 })
            .notNull()
            .default('0'),
        chargedMilli: bigint('charged_milli', { mode: 'bigint' })
            .notNull()
            .default(sql`0`),
    },
    (t) => [
        check(
            'ai_credit_series_totals_amount',
            sql`${t.numerator} >= 0 and ${t.chargedMilli} >= 0 and ${t.chargedMilli} = ceil(${t.numerator}/1000000)`,
        ),
    ],
);

export const aiCreditActionSeriesTable = pgTable(
    'ai_credit_action_series',
    {
        actionId: uuid('action_id')
            .primaryKey()
            .references(() => aiCreditActionsTable.id, { onDelete: 'cascade' }),
        seriesId: uuid('series_id')
            .notNull()
            .references(() => aiCreditSeriesTotalsTable.seriesId, {
                onDelete: 'cascade',
            }),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
    },
    (t) => [index('ai_credit_action_series_series_idx').on(t.seriesId)],
);
