import { sql } from 'drizzle-orm';
import {
    bigint,
    check,
    index,
    integer,
    pgEnum,
    pgTable,
    primaryKey,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';

import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';

export const aiCreditPolicyModeEnum = pgEnum('ai_credit_policy_mode', [
    'limited',
    'unlimited',
]);
export const aiCreditGrantSourceEnum = pgEnum('ai_credit_grant_source', [
    'admin',
    'subscription',
    'purchase',
    'migration',
]);
export const aiCreditReservationStateEnum = pgEnum(
    'ai_credit_reservation_state',
    ['active', 'settled', 'released'],
);
export const aiCreditMeasurementEnum = pgEnum('ai_credit_measurement', [
    'provider_reported',
    'estimated',
    'unmetered',
]);
export const aiCreditHistoryKindEnum = pgEnum('ai_credit_history_kind', [
    'grant',
    'admin_removal',
    'reservation',
    'settlement',
    'release',
    'policy_update',
]);

export const aiCreditAccountsTable = pgTable(
    'ai_credit_accounts',
    {
        createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        managementVersion: integer('management_version').default(1).notNull(),
        mode: aiCreditPolicyModeEnum('mode').default('limited').notNull(),
        unlimitedUntil: timestamp('unlimited_until', {
            mode: 'date',
            withTimezone: true,
        }),
        updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        userId: uuid('user_id')
            .primaryKey()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
    },
    (table) => [
        check(
            'ai_credit_accounts_management_version_positive',
            sql`${table.managementVersion} > 0`,
        ),
        check(
            'ai_credit_accounts_unlimited_until_policy',
            sql`${table.mode} = 'unlimited' or ${table.unlimitedUntil} is null`,
        ),
        check(
            'ai_credit_accounts_updated_after_created',
            sql`${table.updatedAt} >= ${table.createdAt}`,
        ),
    ],
);

export const aiCreditGrantsTable = pgTable(
    'ai_credit_grants',
    {
        amount: bigint('amount', { mode: 'bigint' }).notNull(),
        createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        expiresAt: timestamp('expires_at', {
            mode: 'date',
            withTimezone: true,
        }),
        id: uuid('id').primaryKey(),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        source: aiCreditGrantSourceEnum('source').notNull(),
        sourceReference: text('source_reference').notNull(),
    },
    (table) => [
        check(
            'ai_credit_grants_amount_bounded',
            sql`${table.amount} between 1 and 9007199254740991`,
        ),
        check(
            'ai_credit_admin_grants_amount_bounded',
            sql`${table.source} <> 'admin' or ${table.amount} <= 1000000000000`,
        ),
        check(
            'ai_credit_grants_source_reference_bounded',
            sql`${table.sourceReference} = btrim(${table.sourceReference}) and char_length(${table.sourceReference}) between 1 and 200`,
        ),
        check(
            'ai_credit_grants_expiry_after_creation',
            sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.createdAt}`,
        ),
        check(
            'ai_credit_purchase_grants_do_not_expire',
            sql`${table.source} <> 'purchase' or ${table.expiresAt} is null`,
        ),
        uniqueIndex('ai_credit_grants_source_reference_unique').on(
            table.source,
            table.sourceReference,
        ),
        index('ai_credit_grants_owner_expiry_idx').on(
            table.ownerId,
            table.expiresAt,
            table.createdAt,
        ),
    ],
);

export const aiCreditReservationsTable = pgTable(
    'ai_credit_reservations',
    {
        attempt: integer('attempt').notNull(),
        chargedCredits: bigint('charged_credits', { mode: 'bigint' }),
        createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        dispatchedAt: timestamp('dispatched_at', {
            mode: 'date',
            withTimezone: true,
        }),
        id: uuid('id').primaryKey(),
        jobId: uuid('job_id').notNull(),
        measuredCredits: bigint('measured_credits', { mode: 'bigint' }),
        measurement: aiCreditMeasurementEnum('measurement'),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        policyMode: aiCreditPolicyModeEnum('policy_mode').notNull(),
        reservedCredits: bigint('reserved_credits', {
            mode: 'bigint',
        }).notNull(),
        settledAt: timestamp('settled_at', {
            mode: 'date',
            withTimezone: true,
        }),
        state: aiCreditReservationStateEnum('state')
            .default('active')
            .notNull(),
        unlimitedUntil: timestamp('unlimited_until', {
            mode: 'date',
            withTimezone: true,
        }),
    },
    (table) => [
        check(
            'ai_credit_reservations_attempt_positive',
            sql`${table.attempt} > 0`,
        ),
        check(
            'ai_credit_reservations_reserved_nonnegative',
            sql`${table.reservedCredits} between 0 and 9007199254740991`,
        ),
        check(
            'ai_credit_reservations_policy_amount',
            sql`(${table.policyMode} = 'unlimited' and ${table.reservedCredits} = 0) or (${table.policyMode} = 'limited' and ${table.reservedCredits} > 0)`,
        ),
        check(
            'ai_credit_reservations_policy_expiry',
            sql`${table.policyMode} = 'unlimited' or ${table.unlimitedUntil} is null`,
        ),
        check(
            'ai_credit_reservations_timestamps_ordered',
            sql`(${table.dispatchedAt} is null or ${table.dispatchedAt} >= ${table.createdAt}) and (${table.settledAt} is null or ${table.settledAt} >= ${table.createdAt}) and (${table.dispatchedAt} is null or ${table.settledAt} is null or ${table.settledAt} >= ${table.dispatchedAt})`,
        ),
        check(
            'ai_credit_reservations_terminal_state',
            sql`(${table.state} = 'active' and ${table.settledAt} is null and ${table.measurement} is null and ${table.chargedCredits} is null and ${table.measuredCredits} is null) or (${table.state} = 'released' and ${table.settledAt} is not null and ${table.measurement} is null and ${table.chargedCredits} = 0 and ${table.measuredCredits} is null) or (${table.state} = 'settled' and ${table.settledAt} is not null and ${table.measurement} is not null and ${table.chargedCredits} between 0 and 9007199254740991 and ((${table.measurement} = 'provider_reported' and ${table.measuredCredits} between 0 and 9007199254740991) or (${table.measurement} in ('estimated', 'unmetered') and ${table.measuredCredits} is null)))`,
        ),
        uniqueIndex('ai_credit_reservations_job_attempt_unique').on(
            table.jobId,
            table.attempt,
        ),
        index('ai_credit_reservations_owner_state_idx').on(
            table.ownerId,
            table.state,
        ),
    ],
);

export const aiCreditReservationAllocationsTable = pgTable(
    'ai_credit_reservation_allocations',
    {
        allocatedCredits: bigint('allocated_credits', {
            mode: 'bigint',
        }).notNull(),
        grantId: uuid('grant_id')
            .notNull()
            .references(() => aiCreditGrantsTable.id, { onDelete: 'cascade' }),
        settledCredits: bigint('settled_credits', { mode: 'bigint' })
            .default(sql`0`)
            .notNull(),
        reservationId: uuid('reservation_id')
            .notNull()
            .references(() => aiCreditReservationsTable.id, {
                onDelete: 'cascade',
            }),
    },
    (table) => [
        primaryKey({ columns: [table.reservationId, table.grantId] }),
        check(
            'ai_credit_reservation_allocations_amount',
            sql`${table.allocatedCredits} between 1 and 9007199254740991 and ${table.settledCredits} >= 0 and ${table.settledCredits} <= ${table.allocatedCredits}`,
        ),
        index('ai_credit_reservation_allocations_grant_idx').on(table.grantId),
    ],
);

export const aiCreditAdminRemovalsTable = pgTable(
    'ai_credit_admin_removals',
    {
        amount: bigint('amount', { mode: 'bigint' }).notNull(),
        createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        id: uuid('id').primaryKey(),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        reason: text('reason').notNull(),
        sourceReference: text('source_reference').notNull(),
    },
    (table) => [
        check(
            'ai_credit_admin_removals_amount_bounded',
            sql`${table.amount} between 1 and 1000000000000`,
        ),
        check(
            'ai_credit_admin_removals_reason_bounded',
            sql`${table.reason} = btrim(${table.reason}) and char_length(${table.reason}) between 1 and 500`,
        ),
        uniqueIndex('ai_credit_admin_removals_source_reference_unique').on(
            table.sourceReference,
        ),
        index('ai_credit_admin_removals_owner_created_idx').on(
            table.ownerId,
            table.createdAt,
        ),
    ],
);

export const aiCreditAdminRemovalAllocationsTable = pgTable(
    'ai_credit_admin_removal_allocations',
    {
        allocatedCredits: bigint('allocated_credits', {
            mode: 'bigint',
        }).notNull(),
        grantId: uuid('grant_id')
            .notNull()
            .references(() => aiCreditGrantsTable.id, { onDelete: 'cascade' }),
        removalId: uuid('removal_id')
            .notNull()
            .references(() => aiCreditAdminRemovalsTable.id, {
                onDelete: 'cascade',
            }),
    },
    (table) => [
        primaryKey({ columns: [table.removalId, table.grantId] }),
        check(
            'ai_credit_admin_removal_allocations_positive',
            sql`${table.allocatedCredits} between 1 and 1000000000000`,
        ),
        index('ai_credit_admin_removal_allocations_grant_idx').on(
            table.grantId,
        ),
    ],
);

export const aiCreditHistoryTable = pgTable(
    'ai_credit_history',
    {
        amount: bigint('amount', { mode: 'bigint' }).notNull(),
        createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        expiresAt: timestamp('expires_at', {
            mode: 'date',
            withTimezone: true,
        }),
        grantSource: aiCreditGrantSourceEnum('grant_source'),
        id: uuid('id').primaryKey(),
        kind: aiCreditHistoryKindEnum('kind').notNull(),
        measurement: aiCreditMeasurementEnum('measurement'),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        reason: text('reason'),
    },
    (table) => [
        check(
            'ai_credit_history_amount_bounded',
            sql`${table.amount} between -9007199254740991 and 9007199254740991`,
        ),
        check(
            'ai_credit_history_reason_bounded',
            sql`${table.reason} is null or (${table.reason} = btrim(${table.reason}) and char_length(${table.reason}) between 1 and 500)`,
        ),
        index('ai_credit_history_owner_created_idx').on(
            table.ownerId,
            table.createdAt,
            table.id,
        ),
    ],
);
