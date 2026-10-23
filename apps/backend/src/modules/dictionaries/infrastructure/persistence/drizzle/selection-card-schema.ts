import { sql } from 'drizzle-orm';
import {
    pgTable,
    uuid,
    text,
    integer,
    bigint,
    numeric,
    timestamp,
    jsonb,
    boolean,
    index,
    uniqueIndex,
    check,
} from 'drizzle-orm/pg-core';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import type { TextSelectionRequest } from '@languon/contracts';
import type { DictionaryCardAuthoringProviderInput } from '../../../domain/card-authoring';
import type { TextAiExecutionSnapshot } from '../../../../text-ai/application/text-ai-provider-catalog';
import type { SelectionSourceAuthority } from '../../../application/ports/text-selection-store';
const date = (name: string) =>
    timestamp(name, { mode: 'date', withTimezone: true });

export const dictionaryTextSelectionJobsTable = pgTable(
    'dictionary_text_selection_jobs',
    {
        id: uuid('id').primaryKey(),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        sourceOwnerId: uuid('source_owner_id'),
        operationId: uuid('operation_id').notNull(),
        requestHash: text('request_hash').notNull(),
        jobKind: text('job_kind').notNull().default('text-selection-card'),
        format: text('format').notNull().default('text-selection-card:v1'),
        executionState: text('execution_state')
            .$type<
                'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
            >()
            .notNull()
            .default('queued'),
        inputPayload:
            jsonb(
                'input_payload',
            ).$type<DictionaryCardAuthoringProviderInput>(),
        sourceAuthority:
            jsonb('source_authority').$type<SelectionSourceAuthority>(),
        target: jsonb('target').$type<TextSelectionRequest['target']>(),
        confirmDuplicate: boolean('confirm_duplicate').notNull().default(false),
        dictionaryId: uuid('dictionary_id'),
        cardId: uuid('card_id'),
        failureCode: text('failure_code'),
        selectedExecutionVersion: integer('selected_execution_version')
            .notNull()
            .default(1),
        executionRevisionId: uuid('execution_revision_id'),
        maxAttempts: integer('max_attempts').notNull().default(1),
        aiCreditPricingRevision: integer('ai_credit_pricing_revision')
            .notNull()
            .default(1),
        providerReservedCostMicros: integer(
            'provider_reserved_cost_micros',
        ).notNull(),
        providerReservedInputTokens: integer(
            'provider_reserved_input_tokens',
        ).notNull(),
        providerReservedOutputTokens: integer(
            'provider_reserved_output_tokens',
        ).notNull(),
        selectedExecutionSnapshot: jsonb('selected_execution_snapshot')
            .$type<TextAiExecutionSnapshot>()
            .notNull(),
        providerInputCostMicrosPerMillionTokens: integer(
            'provider_input_cost_micros_per_million_tokens',
        ).notNull(),
        providerOutputCostMicrosPerMillionTokens: integer(
            'provider_output_cost_micros_per_million_tokens',
        ).notNull(),
        providerMaxCostMicrosPerAttempt: integer(
            'provider_max_cost_micros_per_attempt',
        ).notNull(),
        providerMaxInputTokensPerAttempt: integer(
            'provider_max_input_tokens_per_attempt',
        ).notNull(),
        providerMaxOutputTokensPerAttempt: integer(
            'provider_max_output_tokens_per_attempt',
        ).notNull(),
        providerReservationState: text('provider_reservation_state')
            .$type<'active' | 'settled' | 'released'>()
            .notNull()
            .default('active'),
        providerReservationSettledAt: date('provider_reservation_settled_at'),
        providerActualCostMicros: integer('provider_actual_cost_micros')
            .notNull()
            .default(0),
        providerActualInputTokens: integer('provider_actual_input_tokens')
            .notNull()
            .default(0),
        providerActualOutputTokens: integer('provider_actual_output_tokens')
            .notNull()
            .default(0),
        aiCreditAccounted: boolean('ai_credit_accounted')
            .notNull()
            .default(false),
        aiCreditReservationId: uuid('ai_credit_reservation_id'),
        aiCreditPolicyMode: text('ai_credit_policy_mode').$type<
            'limited' | 'unlimited'
        >(),
        aiCreditMaxCreditsPerAttempt: bigint(
            'ai_credit_max_credits_per_attempt',
            { mode: 'number' },
        ),
        aiCreditInputCreditsPerMillionTokens: numeric(
            'ai_credit_input_credits_per_million_tokens',
            { precision: 18, scale: 3, mode: 'number' },
        ),
        aiCreditOutputCreditsPerMillionTokens: numeric(
            'ai_credit_output_credits_per_million_tokens',
            { precision: 18, scale: 3, mode: 'number' },
        ),
        aiCreditProviderDispatchedAt: date('ai_credit_provider_dispatched_at'),
        workerId: text('worker_id'),
        fencingToken: integer('fencing_token').notNull().default(0),
        attemptCount: integer('attempt_count').notNull().default(0),
        leaseDeadline: date('lease_deadline'),
        heartbeatAt: date('heartbeat_at'),
        nextAttemptAt: date('next_attempt_at').notNull().defaultNow(),
        cancellationRequestedAt: date('cancellation_requested_at'),
        createdAt: date('created_at').notNull().defaultNow(),
        updatedAt: date('updated_at').notNull().defaultNow(),
        expiresAt: date('expires_at').notNull(),
    },
    (t) => [
        index('dictionary_text_selection_source_owner_idx').on(t.sourceOwnerId),
        uniqueIndex('dictionary_text_selection_operation_unique').on(
            t.ownerId,
            t.operationId,
        ),
        index('dictionary_text_selection_queue_idx').on(
            t.executionState,
            t.nextAttemptAt,
        ),
        check(
            'dictionary_text_selection_states',
            sql`${t.executionState} in ('queued','running','completed','failed','cancelled')`,
        ),
        check(
            'dictionary_text_selection_fixed_kind',
            sql`${t.jobKind}='text-selection-card' and ${t.format}='text-selection-card:v1'`,
        ),
        check(
            'dictionary_text_selection_transient_input',
            sql`(${t.executionState} in ('queued','running') and ${t.inputPayload} is not null and ${t.sourceAuthority} is not null and ${t.target} is not null) or (${t.executionState} in ('completed','failed','cancelled') and ${t.inputPayload} is null and ${t.sourceAuthority} is null and ${t.target} is null)`,
        ),
    ],
);
