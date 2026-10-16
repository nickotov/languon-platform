import { sql } from 'drizzle-orm';
import {
    pgTable,
    uuid,
    text,
    integer,
    bigint,
    boolean,
    jsonb,
    timestamp,
    index,
    unique,
    check,
} from 'drizzle-orm/pg-core';
import type { TextAiExecutionSnapshot } from '../../../../text-ai/application/text-ai-provider-catalog';
import type {
    TextJobInput,
    TextJobResult,
} from '../../../application/ports/texts-ai-provider';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { dictionaryAiConfigurationRevisionsTable } from '../../../../text-ai/infrastructure/persistence/drizzle/configuration-schema';
import { textFoldersTable, textsTable } from './schema';
const date = (name: string) =>
    timestamp(name, { withTimezone: true, mode: 'date' });
export const textsAiJobsTable = pgTable(
    'texts_ai_jobs',
    {
        id: uuid('id').primaryKey(),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        folderId: uuid('folder_id')
            .notNull()
            .references(() => textFoldersTable.id, { onDelete: 'cascade' }),
        textId: uuid('text_id').references(() => textsTable.id, {
            onDelete: 'cascade',
        }),
        expectedTextVersion: integer('expected_text_version'),
        appliedTextId: uuid('applied_text_id').references(() => textsTable.id, {
            onDelete: 'set null',
        }),
        operationId: uuid('operation_id').notNull(),
        requestFingerprint: text('request_fingerprint').notNull(),
        jobKind: text('job_kind')
            .$type<'text-detection' | 'text-translation'>()
            .notNull(),
        format: text('format').notNull(),
        executionState: text('execution_state')
            .$type<
                'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
            >()
            .notNull()
            .default('queued'),
        inputPayload: jsonb('input_payload').$type<TextJobInput>(),
        resultPayload: jsonb('result_payload').$type<TextJobResult>(),
        failureCategory: text('failure_category'),
        expiresAt: date('expires_at').notNull(),
        selectedExecutionSnapshot: jsonb('selected_execution_snapshot')
            .$type<TextAiExecutionSnapshot>()
            .notNull(),
        selectedExecutionVersion: integer('selected_execution_version')
            .notNull()
            .default(1),
        executionRevisionId: uuid('execution_revision_id')
            .notNull()
            .references(() => dictionaryAiConfigurationRevisionsTable.id, {
                onDelete: 'restrict',
            }),
        attemptCount: integer('attempt_count').notNull().default(0),
        maxAttempts: integer('max_attempts').notNull().default(3),
        fencingToken: bigint('fencing_token', { mode: 'bigint' })
            .notNull()
            .default(sql`0`),
        workerId: text('worker_id'),
        leaseDeadline: date('lease_deadline'),
        heartbeatAt: date('heartbeat_at'),
        cancellationRequestedAt: date('cancellation_requested_at'),
        nextAttemptAt: date('next_attempt_at').notNull().defaultNow(),
        completedAt: date('completed_at'),
        createdAt: date('created_at').notNull().defaultNow(),
        updatedAt: date('updated_at').notNull().defaultNow(),
        aiCreditAccounted: boolean('ai_credit_accounted')
            .notNull()
            .default(false),
        aiCreditReservationId: uuid('ai_credit_reservation_id'),
        aiCreditProviderDispatchedAt: date('ai_credit_provider_dispatched_at'),
        aiCreditPolicyMode: text('ai_credit_policy_mode'),
        aiCreditPricingRevision: integer('ai_credit_pricing_revision'),
        aiCreditMaxCreditsPerAttempt: integer(
            'ai_credit_max_credits_per_attempt',
        ),
        aiCreditInputCreditsPerMillionTokens: integer(
            'ai_credit_input_credits_per_million_tokens',
        ),
        aiCreditOutputCreditsPerMillionTokens: integer(
            'ai_credit_output_credits_per_million_tokens',
        ),
        providerInputCostMicrosPerMillionTokens: integer(
            'provider_input_cost_micros_per_million_tokens',
        )
            .notNull()
            .default(0),
        providerOutputCostMicrosPerMillionTokens: integer(
            'provider_output_cost_micros_per_million_tokens',
        )
            .notNull()
            .default(0),
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
            .notNull()
            .default('released'),
        providerReservedAttempts: integer('provider_reserved_attempts')
            .notNull()
            .default(0),
        providerReservedCostMicros: integer('provider_reserved_cost_micros')
            .notNull()
            .default(0),
        providerReservedInputTokens: integer('provider_reserved_input_tokens')
            .notNull()
            .default(0),
        providerReservedOutputTokens: integer('provider_reserved_output_tokens')
            .notNull()
            .default(0),
        providerReservationSettledAt: date('provider_reservation_settled_at'),
        providerActualCostMicros: integer('provider_actual_cost_micros'),
        providerActualInputTokens: integer('provider_actual_input_tokens'),
        providerActualOutputTokens: integer('provider_actual_output_tokens'),
    },
    (t) => [
        unique('texts_ai_jobs_operation_unique').on(t.ownerId, t.operationId),
        index('texts_ai_jobs_owner_idx').on(t.ownerId, t.executionState),
        index('texts_ai_jobs_folder_idx').on(t.folderId),
        index('texts_ai_jobs_text_idx').on(t.textId),
        index('texts_ai_jobs_applied_text_idx').on(t.appliedTextId),
        index('texts_ai_jobs_revision_idx').on(t.executionRevisionId),
        index('texts_ai_jobs_queue_idx').on(
            t.executionState,
            t.nextAttemptAt,
            t.createdAt,
        ),
        index('texts_ai_jobs_expiry_idx').on(t.expiresAt),
        check(
            'texts_ai_jobs_kind_format',
            sql`(${t.jobKind}='text-detection' and ${t.format}='text-detection:v1') or (${t.jobKind}='text-translation' and ${t.format} in ('text-translation:v1','text-translation:v2'))`,
        ),
        check(
            'texts_ai_jobs_versions',
            sql`${t.selectedExecutionVersion}=1 and ${t.attemptCount}>=0 and ${t.maxAttempts}>0 and ${t.fencingToken}>=0 and ((${t.textId} is null and ${t.expectedTextVersion} is null) or (${t.textId} is not null and ${t.expectedTextVersion}>0))`,
        ),
        check(
            'texts_ai_jobs_lease',
            sql`(${t.executionState}='running' and ${t.workerId} is not null and ${t.leaseDeadline} is not null and ${t.heartbeatAt} is not null) or (${t.executionState}<>'running' and ${t.workerId} is null and ${t.leaseDeadline} is null and ${t.heartbeatAt} is null)`,
        ),
        check(
            'texts_ai_jobs_state',
            sql`${t.executionState} in ('queued','running','completed','failed','cancelled') and ((${t.executionState} in ('completed','failed','cancelled'))=(${t.completedAt} is not null))`,
        ),
    ],
);
