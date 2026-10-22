import { sql } from 'drizzle-orm';
import {
    bigint,
    check,
    index,
    jsonb,
    pgTable,
    primaryKey,
    text,
    timestamp,
    uuid,
} from 'drizzle-orm/pg-core';
import type {
    AccountingRecordRequest,
    AccountingReport,
} from '@languon/contracts';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { aiCreditGrantsTable } from './schema';
import { aiCreditActionAttemptsTable } from './action-accounting-schema';

export const aiAccountingRecordsTable = pgTable(
    'ai_accounting_records',
    {
        id: uuid('id').primaryKey(),
        idempotencyKey: uuid('idempotency_key').notNull().unique(),
        kind: text('kind').notNull(),
        providerId: text('provider_id'),
        paymentId: uuid('payment_id'),
        ownerId: uuid('owner_id').references(() => usersTable.id, {
            onDelete: 'set null',
        }),
        grantId: uuid('grant_id').references(() => aiCreditGrantsTable.id, {
            onDelete: 'set null',
        }),
        amountUsdMicros: bigint('amount_usd_micros', {
            mode: 'bigint',
        }).notNull(),
        feeUsdMicros: bigint('fee_usd_micros', { mode: 'bigint' })
            .notNull()
            .default(sql`0`),
        occurredAt: timestamp('occurred_at', {
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
        data: jsonb('data').$type<AccountingRecordRequest>().notNull(),
    },
    (t) => [
        check(
            'ai_accounting_record_kind',
            sql`${t.kind} in ('payment','refund','provider_deposit','provider_balance','provider_bill')`,
        ),
        check(
            'ai_accounting_record_amount',
            sql`${t.amountUsdMicros} >= 0 and ${t.feeUsdMicros} >= 0`,
        ),
        index('ai_accounting_records_time_idx').on(t.occurredAt),
        index('ai_accounting_records_owner_idx').on(t.ownerId),
        index('ai_accounting_records_provider_time_idx').on(
            t.providerId,
            t.occurredAt,
        ),
        index('ai_accounting_records_payment_idx').on(t.paymentId),
    ],
);

/** Per-attempt provider expense facts; never infer unknown expense as zero. */
export const aiProviderExpenseRecordsTable = pgTable(
    'ai_provider_expense_records',
    {
        id: uuid('id').primaryKey(),
        attemptReference: text('attempt_reference').notNull().unique(),
        sourceKind: text('source_kind')
            .$type<'text-attempt' | 'speech-attempt' | 'legacy-unverified'>()
            .notNull()
            .default('legacy-unverified'),
        attemptId: uuid('attempt_id')
            .unique()
            .references(() => aiCreditActionAttemptsTable.id, {
                onDelete: 'set null',
            }),
        actionId: uuid('action_id').notNull(),
        costSource: text('cost_source').notNull(),
        providerId: text('provider_id').notNull(),
        modelId: text('model_id').notNull(),
        measurement: text('measurement').notNull(),
        amountUsdMicros: bigint('amount_usd_micros', { mode: 'bigint' }),
        occurredAt: timestamp('occurred_at', {
            withTimezone: true,
            mode: 'date',
        }).notNull(),
    },
    (t) => [
        check(
            'ai_provider_expense_source_kind',
            sql`${t.sourceKind} in ('text-attempt','speech-attempt','legacy-unverified')`,
        ),
        check(
            'ai_provider_expense_cost_source',
            sql`${t.costSource} in ('calculated','provider_reported','unknown') and ((${t.costSource} = 'unknown' and ${t.amountUsdMicros} is null) or (${t.costSource} <> 'unknown' and ${t.amountUsdMicros} is not null))`,
        ),
        check(
            'ai_provider_expense_measurement',
            sql`${t.measurement} in ('measured','estimated','unknown') and (${t.amountUsdMicros} is null or ${t.amountUsdMicros} >= 0)`,
        ),
        index('ai_provider_expense_provider_time_idx').on(
            t.providerId,
            t.occurredAt,
        ),
    ],
);

/** Durable, demand-driven report materialization. No history aggregation runs in HTTP handlers. */
export const aiAccountingReportSnapshotsTable = pgTable(
    'ai_accounting_report_snapshots',
    {
        key: text('key').primaryKey(),
        from: timestamp('period_from', {
            withTimezone: true,
            mode: 'date',
        }).notNull(),
        to: timestamp('period_to', {
            withTimezone: true,
            mode: 'date',
        }).notNull(),
        requestedAt: timestamp('requested_at', {
            withTimezone: true,
            mode: 'date',
        }).notNull(),
        generatedAt: timestamp('generated_at', {
            withTimezone: true,
            mode: 'date',
        }),
        leaseUntil: timestamp('lease_until', {
            withTimezone: true,
            mode: 'date',
        }),
        report: jsonb('report').$type<AccountingReport>(),
        changeVersion: bigint('change_version', { mode: 'bigint' })
            .notNull()
            .default(sql`0`),
        computedVersion: bigint('computed_version', { mode: 'bigint' })
            .notNull()
            .default(sql`-1`),
    },
    (t) => [
        index('ai_accounting_report_refresh_idx').on(
            t.requestedAt,
            t.generatedAt,
        ),
        check(
            'ai_accounting_report_period',
            sql`${t.to} > ${t.from} and ${t.to} <= ${t.from} + interval '366 days'`,
        ),
    ],
);

/** Content-free financial facts survive deletion of the private learner wallet. */
export const aiAccountingRetiredPurchaseLotsTable = pgTable(
    'ai_accounting_retired_purchase_lots',
    {
        paymentId: uuid('payment_id')
            .primaryKey()
            .references(() => aiAccountingRecordsTable.id),
        retiredAt: timestamp('retired_at', {
            withTimezone: true,
            mode: 'date',
        }).notNull(),
        issuedMilli: bigint('issued_milli', { mode: 'bigint' }).notNull(),
    },
    (t) => [check('ai_accounting_retired_issued', sql`${t.issuedMilli}>0`)],
);
export const aiAccountingArchivedPurchaseMovementsTable = pgTable(
    'ai_accounting_archived_purchase_movements',
    {
        paymentId: uuid('payment_id')
            .notNull()
            .references(() => aiAccountingRetiredPurchaseLotsTable.paymentId),
        occurredAt: timestamp('occurred_at', {
            withTimezone: true,
            mode: 'date',
        }).notNull(),
        kind: text('kind').$type<'consumed' | 'removed'>().notNull(),
        creditsMilli: bigint('credits_milli', { mode: 'bigint' }).notNull(),
        allocatedUsdMicros: bigint('allocated_usd_micros', {
            mode: 'bigint',
        }).notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.paymentId, t.occurredAt, t.kind] }),
        check(
            'ai_accounting_archived_movement',
            sql`${t.kind} in ('consumed','removed') and ${t.creditsMilli}>0 and ${t.allocatedUsdMicros}>=0`,
        ),
        index('ai_accounting_archived_time_idx').on(t.occurredAt),
    ],
);
