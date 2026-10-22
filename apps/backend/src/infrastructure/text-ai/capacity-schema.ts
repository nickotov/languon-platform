import { sql } from 'drizzle-orm';
import {
    bigint,
    boolean,
    check,
    index,
    pgTable,
    primaryKey,
    text,
    timestamp,
    uuid,
} from 'drizzle-orm/pg-core';

/** Admission reads bounded operational projections, never feature history. */
export const textAiCapacityJobsTable = pgTable(
    'text_ai_capacity_jobs',
    {
        source: text('source').notNull(),
        id: uuid('id').notNull(),
        ownerId: uuid('owner_id').notNull(),
        jobKind: text('job_kind').notNull(),
        state: text('state').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
        nextAttemptAt: timestamp('next_attempt_at', {
            withTimezone: true,
        }).notNull(),
        runnable: boolean('runnable').notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.source, t.id] }),
        index('text_ai_capacity_jobs_runnable_idx')
            .on(t.nextAttemptAt, t.createdAt)
            .where(sql`${t.state} = 'queued' and ${t.runnable}`),
        index('text_ai_capacity_jobs_kind_idx').on(t.jobKind),
    ],
);
export const textAiCapacityQueueTotalsTable = pgTable(
    'text_ai_capacity_queue_totals',
    {
        scope: text('scope').primaryKey(),
        queued: bigint('queued', { mode: 'bigint' }).notNull(),
        running: bigint('running', { mode: 'bigint' }).notNull(),
    },
    (t) => [
        check(
            'text_ai_capacity_queue_nonnegative',
            sql`${t.queued} >= 0 and ${t.running} >= 0`,
        ),
    ],
);
export const textAiCapacityProviderUsageTable = pgTable(
    'text_ai_capacity_provider_usage',
    {
        id: uuid('id').notNull(),
        jobKind: text('job_kind').notNull(),
        ownerId: uuid('owner_id').notNull(),
        cohort: text('cohort').notNull(),
        state: text('state').notNull(),
        cost: bigint('cost', { mode: 'bigint' }).notNull(),
        inputTokens: bigint('input_tokens', { mode: 'bigint' }).notNull(),
        outputTokens: bigint('output_tokens', { mode: 'bigint' }).notNull(),
        settledAt: timestamp('settled_at', { withTimezone: true }),
        archived: boolean('archived').default(false).notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.id, t.jobKind] }),
        index('text_ai_capacity_usage_boundary_idx')
            .on(t.cohort, t.settledAt, t.ownerId)
            .where(sql`${t.state} = 'settled'`),
        index('text_ai_capacity_usage_cleanup_idx')
            .on(t.settledAt)
            .where(sql`${t.state} = 'settled'`),
        index('text_ai_capacity_usage_overlap_idx').on(
            t.jobKind,
            t.state,
            t.settledAt,
        ),
        check(
            'text_ai_capacity_usage_nonnegative',
            sql`${t.cost} >= 0 and ${t.inputTokens} >= 0 and ${t.outputTokens} >= 0`,
        ),
    ],
);
export const textAiCapacityActiveTotalsTable = pgTable(
    'text_ai_capacity_active_totals',
    {
        scope: text('scope').notNull(),
        cohort: text('cohort').notNull(),
        cost: bigint('cost', { mode: 'bigint' }).notNull(),
        inputTokens: bigint('input_tokens', { mode: 'bigint' }).notNull(),
        outputTokens: bigint('output_tokens', { mode: 'bigint' }).notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.scope, t.cohort] }),
        check(
            'text_ai_capacity_active_nonnegative',
            sql`${t.cost} >= 0 and ${t.inputTokens} >= 0 and ${t.outputTokens} >= 0`,
        ),
    ],
);
export const textAiCapacitySettledBucketsTable = pgTable(
    'text_ai_capacity_settled_buckets',
    {
        scope: text('scope').notNull(),
        cohort: text('cohort').notNull(),
        minute: timestamp('minute', { withTimezone: true }).notNull(),
        cost: bigint('cost', { mode: 'bigint' }).notNull(),
        inputTokens: bigint('input_tokens', { mode: 'bigint' }).notNull(),
        outputTokens: bigint('output_tokens', { mode: 'bigint' }).notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.scope, t.cohort, t.minute] }),
        check(
            'text_ai_capacity_settled_nonnegative',
            sql`${t.cost} >= 0 and ${t.inputTokens} >= 0 and ${t.outputTokens} >= 0`,
        ),
    ],
);
