import { sql } from 'drizzle-orm';
import {
    bigint,
    check,
    index,
    integer,
    jsonb,
    pgTable,
    primaryKey,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';
import type { TextAiProviderBudgetPolicy } from '../../../../text-ai/application/text-ai-provider-catalog';
import type { ActionTariff } from '../../../domain/action-pricing';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { aiCreditGrantsTable } from './schema';

/** All monetary amounts in these tables are integer thousandths of a credit. */
export const aiCreditActionsTable = pgTable(
    'ai_credit_actions',
    {
        id: uuid('id').primaryKey(),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        capability: text('capability').notNull(),
        funding: text('funding')
            .$type<'customer' | 'operator' | 'unlimited'>()
            .notNull(),
        policyVersion: integer('policy_version').notNull(),
        tariff: jsonb('tariff').$type<ActionTariff>().notNull(),
        state: text('state').$type<'active' | 'settled'>().notNull(),
        outcome: text('outcome').$type<'success' | 'stopped' | 'failure'>(),
        heldMilli: bigint('held_milli', { mode: 'bigint' }).notNull(),
        chargedMilli: bigint('charged_milli', { mode: 'bigint' }),
        budgetMilli: bigint('budget_milli', { mode: 'bigint' }).notNull(),
        outputLimit: integer('output_limit').notNull(),
        measurement: text('measurement').$type<'measured' | 'unknown'>(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
        deadlineAt: timestamp('deadline_at', { withTimezone: true }).notNull(),
        settledAt: timestamp('settled_at', { withTimezone: true }),
    },
    (t) => [
        index('ai_credit_action_owner_state_idx').on(t.ownerId, t.state),
        index('ai_credit_action_recovery_idx').on(t.state, t.deadlineAt),
        check(
            'ai_credit_action_states',
            sql`${t.state} in ('active','settled') and ${t.funding} in ('customer','operator','unlimited')`,
        ),
        check(
            'ai_credit_action_money',
            sql`${t.heldMilli} >= 0 and ${t.budgetMilli} >= ${t.heldMilli} and ${t.budgetMilli} <= 9007199254740991 and (${t.funding} = 'customer' or ${t.heldMilli} = 0)`,
        ),
        check(
            'ai_credit_action_output_limit',
            sql`${t.outputLimit} between 1 and 10000`,
        ),
        check(
            'ai_credit_action_terminal',
            sql`(${t.state}='active' and ${t.settledAt} is null and ${t.chargedMilli} is null and ${t.outcome} is null and ${t.measurement} is null) or (${t.state}='settled' and ${t.settledAt} is not null and ${t.outcome} is not null and ${t.chargedMilli} is not null and ${t.measurement} is not null and ${t.outcome} in ('success','stopped','failure') and ${t.measurement} in ('measured','unknown') and ${t.chargedMilli} between 0 and ${t.heldMilli} and (${t.outcome}<>'failure' or ${t.chargedMilli}=0))`,
        ),
    ],
);
export const aiCreditActionAllocationsTable = pgTable(
    'ai_credit_action_allocations',
    {
        actionId: uuid('action_id')
            .notNull()
            .references(() => aiCreditActionsTable.id, { onDelete: 'cascade' }),
        grantId: uuid('grant_id')
            .notNull()
            .references(() => aiCreditGrantsTable.id, { onDelete: 'cascade' }),
        allocatedMilli: bigint('allocated_milli', { mode: 'bigint' }).notNull(),
        settledMilli: bigint('settled_milli', { mode: 'bigint' })
            .notNull()
            .default(sql`0`),
    },
    (t) => [
        primaryKey({ columns: [t.actionId, t.grantId] }),
        index('ai_credit_action_allocation_grant_idx').on(t.grantId),
        check(
            'ai_credit_action_allocation_amount',
            sql`${t.allocatedMilli}>0 and ${t.settledMilli} between 0 and ${t.allocatedMilli}`,
        ),
    ],
);
export const aiCreditActionAttemptsTable = pgTable(
    'ai_credit_action_attempts',
    {
        id: uuid('id').primaryKey(),
        actionId: uuid('action_id')
            .notNull()
            .references(() => aiCreditActionsTable.id, { onDelete: 'cascade' }),
        executionJobId: uuid('execution_job_id').notNull(),
        ordinal: integer('ordinal').notNull(),
        purpose: text('purpose').notNull(),
        state: text('state').$type<'dispatched' | 'settled'>().notNull(),
        budget: jsonb('budget').$type<TextAiProviderBudgetPolicy>().notNull(),
        reservedCostMicros: integer('reserved_cost_micros').notNull(),
        actualCostMicros: integer('actual_cost_micros'),
        inputLimit: integer('input_limit').notNull(),
        outputLimit: integer('output_limit').notNull(),
        inputTokens: integer('input_tokens'),
        cacheReadTokens: integer('cache_read_tokens'),
        cacheWriteTokens: integer('cache_write_tokens'),
        outputTokens: integer('output_tokens'),
        successful: integer('successful').notNull().default(0),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
        settledAt: timestamp('settled_at', { withTimezone: true }),
    },
    (t) => [
        uniqueIndex('ai_credit_action_attempt_ordinal').on(
            t.actionId,
            t.ordinal,
        ),
        check(
            'ai_credit_action_attempt_limits',
            sql`${t.ordinal} between 1 and 5 and ${t.inputLimit} >= 0 and ${t.outputLimit} between 1 and 10000 and ${t.successful} in (0,1)`,
        ),
        check(
            'ai_credit_action_attempt_meter',
            sql`(${t.inputTokens} is null and ${t.outputTokens} is null) or (${t.inputTokens} is not null and ${t.outputTokens} is not null and ${t.inputTokens} between 0 and ${t.inputLimit} and ${t.outputTokens} between 0 and ${t.outputLimit})`,
        ),
        check(
            'ai_credit_action_attempt_terminal',
            sql`(${t.state}='dispatched' and ${t.settledAt} is null) or (${t.state}='settled' and ${t.settledAt} is not null)`,
        ),
    ],
);

/** A server-owned offer carries no credit hold and never authorizes dispatch by itself. */
export const aiCreditActionQuotesTable = pgTable(
    'ai_credit_action_quotes',
    {
        id: uuid('id').primaryKey(),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        conversationId: uuid('conversation_id').notNull(),
        requestId: uuid('request_id').notNull(),
        fingerprint: text('fingerprint').notNull(),
        authorizationFingerprint: text('authorization_fingerprint').notNull(),
        heldMilli: bigint('held_milli', { mode: 'bigint' }).notNull(),
        outputAllowance: integer('output_allowance').notNull(),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    },
    (t) => [
        uniqueIndex('ai_credit_action_quote_request').on(
            t.ownerId,
            t.conversationId,
            t.requestId,
        ),
        index('ai_credit_action_quote_expiry').on(t.expiresAt),
        check(
            'ai_credit_action_quote_allowance',
            sql`${t.heldMilli}>0 and ${t.outputAllowance} between 1 and 10000`,
        ),
    ],
);
