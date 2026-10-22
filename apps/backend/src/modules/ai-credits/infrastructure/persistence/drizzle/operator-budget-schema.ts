import { sql } from 'drizzle-orm';
import {
    bigint,
    check,
    index,
    pgTable,
    primaryKey,
    text,
    timestamp,
    uuid,
} from 'drizzle-orm/pg-core';

/** Daily scopes are shared across every capability, provider and price revision. */
export const aiOperatorDailyBudgetsTable = pgTable(
    'ai_operator_daily_budgets',
    {
        day: text('day').notNull(),
        scope: text('scope').notNull(),
        reservedMicros: bigint('reserved_micros', { mode: 'bigint' })
            .notNull()
            .default(sql`0`),
        consumedMicros: bigint('consumed_micros', { mode: 'bigint' })
            .notNull()
            .default(sql`0`),
    },
    (t) => [
        primaryKey({ columns: [t.day, t.scope] }),
        check(
            'ai_operator_daily_nonnegative',
            sql`${t.reservedMicros} >= 0 and ${t.consumedMicros} >= 0`,
        ),
    ],
);
export const aiOperatorActionBudgetsTable = pgTable(
    'ai_operator_action_budgets',
    {
        actionId: uuid('action_id').primaryKey(),
        ownerId: uuid('owner_id'),
        day: text('day').notNull(),
        reservedMicros: bigint('reserved_micros', { mode: 'bigint' }).notNull(),
        consumedMicros: bigint('consumed_micros', { mode: 'bigint' }),
        ownerDayLimitMicros: bigint('owner_day_limit_micros', {
            mode: 'bigint',
        }).notNull(),
        globalDayLimitMicros: bigint('global_day_limit_micros', {
            mode: 'bigint',
        }).notNull(),
        state: text('state').$type<'active' | 'settled'>().notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
        settledAt: timestamp('settled_at', { withTimezone: true }),
    },
    (t) => [
        index('ai_operator_action_owner_idx').on(t.ownerId, t.state),
        check(
            'ai_operator_action_amount',
            sql`${t.reservedMicros} >= 0 and ${t.reservedMicros} <= 9007199254740991`,
        ),
        check(
            'ai_operator_action_terminal',
            sql`(${t.state}='active' and ${t.consumedMicros} is null and ${t.settledAt} is null) or (${t.state}='settled' and ${t.consumedMicros} is not null and ${t.consumedMicros} between 0 and ${t.reservedMicros} and ${t.settledAt} is not null)`,
        ),
    ],
);
export const aiOperatorAttemptCostsTable = pgTable(
    'ai_operator_attempt_costs',
    {
        attemptId: uuid('attempt_id').primaryKey(),
        actionId: uuid('action_id')
            .notNull()
            .references(() => aiOperatorActionBudgetsTable.actionId),
        reservedMicros: bigint('reserved_micros', { mode: 'bigint' }).notNull(),
        consumedMicros: bigint('consumed_micros', { mode: 'bigint' }),
        measurement: text('measurement').$type<'measured' | 'conservative'>(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
        settledAt: timestamp('settled_at', { withTimezone: true }),
    },
    (t) => [
        index('ai_operator_attempt_action_idx').on(t.actionId),
        check('ai_operator_attempt_nonnegative', sql`${t.reservedMicros} >= 0`),
        check(
            'ai_operator_attempt_terminal',
            sql`(${t.settledAt} is null and ${t.consumedMicros} is null and ${t.measurement} is null) or (${t.settledAt} is not null and ${t.consumedMicros} is not null and ${t.measurement} is not null and ${t.consumedMicros} between 0 and ${t.reservedMicros} and ${t.measurement} in ('measured','conservative'))`,
        ),
    ],
);
