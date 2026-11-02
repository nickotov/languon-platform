import { sql } from 'drizzle-orm';
import type { KnowledgeLearningSourceBinding } from '../../../../knowledge/application/learning-source-binding';
import {
    pgTable,
    uuid,
    text,
    integer,
    numeric,
    bigint,
    boolean,
    jsonb,
    timestamp,
    primaryKey,
    unique,
    index,
    check,
    foreignKey,
} from 'drizzle-orm/pg-core';
import type {
    SentenceDirection,
    SentenceExercise,
    SentenceFeedback,
    SentencePrepareRequest,
} from '@languon/contracts';
import type {
    SentenceGenerationInput,
    SentenceCheckInput,
} from '../../../domain/sentence-types';
import type { TextAiExecutionSnapshot } from '../../../../text-ai/application/text-ai-provider-catalog';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    dictionariesTable,
    dictionaryCardsTable,
} from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import { dictionaryAiConfigurationRevisionsTable } from '../../../../text-ai/infrastructure/persistence/drizzle/configuration-schema';
const date = (name: string) =>
    timestamp(name, { withTimezone: true, mode: 'date' });
const learner = () =>
    uuid('learner_id')
        .notNull()
        .references(() => usersTable.id, { onDelete: 'cascade' });
const dictionary = () =>
    uuid('dictionary_id')
        .notNull()
        .references(() => dictionariesTable.id, { onDelete: 'cascade' });

export const sentenceExercisesTable = pgTable(
    'sentence_exercises',
    {
        id: uuid('id').primaryKey(),
        creatorId: uuid('creator_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        dictionaryId: dictionary(),
        direction: text('direction').$type<SentenceDirection>().notNull(),
        shared: boolean('shared').notNull(),
        publicContent: jsonb('public_content')
            .$type<SentenceExercise>()
            .notNull(),
        referenceTranslation: text('reference_translation').notNull(),
        generationPolicyVersion: integer('generation_policy_version')
            .notNull()
            .default(1),
        createdAt: date('created_at').notNull().defaultNow(),
    },
    (t) => [
        index('sentence_exercises_creator_idx').on(t.creatorId),
        index('sentence_exercises_pool_idx').on(
            t.dictionaryId,
            t.direction,
            t.createdAt,
            t.id,
        ),
        check(
            'sentence_exercises_generation_policy',
            sql`${t.generationPolicyVersion} in (1,2) and (${t.publicContent}->>'generationPolicyVersion' = ${t.generationPolicyVersion}::text) is true`,
        ),
        check(
            'sentence_exercises_direction',
            sql`${t.direction} in ('source-to-target','target-to-source')`,
        ),
    ],
);
export const sentenceExerciseEntriesTable = pgTable(
    'sentence_exercise_entries',
    {
        exerciseId: uuid('exercise_id')
            .notNull()
            .references(() => sentenceExercisesTable.id, {
                onDelete: 'cascade',
            }),
        dictionaryId: dictionary(),
        entryId: uuid('entry_id').notNull(),
        learningVersion: integer('learning_version').notNull(),
        sourceText: text('source_text').notNull(),
        targetText: text('target_text').notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.exerciseId, t.entryId] }),
        foreignKey({
            columns: [t.entryId, t.dictionaryId],
            foreignColumns: [
                dictionaryCardsTable.id,
                dictionaryCardsTable.dictionaryId,
            ],
        }).onDelete('cascade'),
        index('sentence_exercise_entries_entry_idx').on(
            t.dictionaryId,
            t.entryId,
        ),
        check('sentence_exercise_entries_version', sql`${t.learningVersion}>0`),
    ],
);
export const sentenceAttemptsTable = pgTable(
    'sentence_attempts',
    {
        id: uuid('id').primaryKey(),
        learnerId: learner(),
        dictionaryId: dictionary(),
        exerciseId: uuid('exercise_id')
            .notNull()
            .references(() => sentenceExercisesTable.id, {
                onDelete: 'cascade',
            }),
        operationId: uuid('operation_id').notNull(),
        sessionId: uuid('session_id').notNull(),
        answer: text('answer').notNull(),
        referenceRevealed: boolean('reference_revealed')
            .notNull()
            .default(false),
        explanationLanguage: text('explanation_language').notNull(),
        revealedHintIds: jsonb('revealed_hint_ids').$type<string[]>().notNull(),
        feedback: jsonb('feedback').$type<SentenceFeedback>().notNull(),
        createdAt: date('created_at').notNull().defaultNow(),
    },
    (t) => [
        unique('sentence_attempts_operation_unique').on(
            t.learnerId,
            t.operationId,
        ),
        index('sentence_attempts_dictionary_idx').on(t.dictionaryId),
        index('sentence_attempts_exercise_fk_idx').on(t.exerciseId),
        index('sentence_attempts_history_idx').on(
            t.learnerId,
            t.dictionaryId,
            t.createdAt,
            t.id,
        ),
        index('sentence_attempts_exercise_idx').on(t.learnerId, t.exerciseId),
    ],
);
export const sentenceManualReviewsTable = pgTable(
    'sentence_manual_reviews',
    {
        id: uuid('id').primaryKey(),
        learnerId: learner(),
        dictionaryId: dictionary(),
        exerciseId: uuid('exercise_id')
            .notNull()
            .references(() => sentenceExercisesTable.id, {
                onDelete: 'cascade',
            }),
        operationId: uuid('operation_id').notNull(),
        sessionId: uuid('session_id').notNull(),
        requestFingerprint: text('request_fingerprint').notNull(),
        createdAt: date('created_at').notNull().defaultNow(),
    },
    (t) => [
        unique('sentence_manual_reviews_operation_unique').on(
            t.learnerId,
            t.operationId,
        ),
        index('sentence_manual_reviews_dictionary_idx').on(t.dictionaryId),
        index('sentence_manual_reviews_exercise_idx').on(t.exerciseId),
        index('sentence_manual_reviews_history_idx').on(
            t.learnerId,
            t.dictionaryId,
            t.createdAt,
            t.id,
        ),
        index('sentence_manual_reviews_session_idx').on(
            t.learnerId,
            t.exerciseId,
            t.sessionId,
        ),
    ],
);

export const sentenceExposuresTable = pgTable(
    'sentence_exposures',
    {
        learnerId: learner(),
        dictionaryId: dictionary(),
        exerciseId: uuid('exercise_id')
            .notNull()
            .references(() => sentenceExercisesTable.id, {
                onDelete: 'cascade',
            }),
        createdAt: date('created_at').notNull().defaultNow(),
    },
    (t) => [
        primaryKey({ columns: [t.learnerId, t.exerciseId] }),
        index('sentence_exposures_exercise_idx').on(t.exerciseId),
        index('sentence_exposures_dictionary_idx').on(t.dictionaryId),
    ],
);
export const sentenceEntryCoverageTable = pgTable(
    'sentence_entry_coverage',
    {
        learnerId: learner(),
        dictionaryId: dictionary(),
        direction: text('direction').$type<SentenceDirection>().notNull(),
        entryId: uuid('entry_id').notNull(),
        learningVersion: integer('learning_version').notNull(),
        exposureCount: integer('exposure_count').notNull().default(0),
    },
    (t) => [
        primaryKey({
            columns: [t.learnerId, t.entryId, t.direction, t.learningVersion],
        }),
        foreignKey({
            columns: [t.entryId, t.dictionaryId],
            foreignColumns: [
                dictionaryCardsTable.id,
                dictionaryCardsTable.dictionaryId,
            ],
        }).onDelete('cascade'),
        index('sentence_entry_coverage_entry_idx').on(
            t.entryId,
            t.dictionaryId,
        ),
        index('sentence_entry_coverage_dictionary_idx').on(
            t.dictionaryId,
            t.learnerId,
        ),
        check(
            'sentence_entry_coverage_counts',
            sql`${t.learningVersion}>0 and ${t.exposureCount}>=0`,
        ),
    ],
);
export type SentenceAuthority =
    { kind: 'owner' } | { kind: 'shared'; shareId: string; keyDigest: string };
export const sentenceAiJobsTable = pgTable(
    'sentence_ai_jobs',
    {
        id: uuid('id').primaryKey(),
        learnerId: learner(),
        dictionaryId: uuid('dictionary_id').references(
            () => dictionariesTable.id,
            { onDelete: 'cascade' },
        ),
        sourceKind: text('source_kind')
            .$type<'dictionary' | 'knowledge-vocabulary'>()
            .notNull()
            .default('dictionary'),
        sourceNoteId: uuid('source_note_id'),
        sourceExerciseId: uuid('source_exercise_id'),
        knowledgeSource:
            jsonb('knowledge_source').$type<KnowledgeLearningSourceBinding>(),
        resultKnowledgeExerciseId: uuid('result_knowledge_exercise_id'),
        resultKnowledgeAttemptId: uuid('result_knowledge_attempt_id'),
        jobKind: text('job_kind')
            .$type<'sentence-generation' | 'sentence-check'>()
            .notNull(),
        format: text('format').notNull(),
        direction: text('direction').$type<SentenceDirection>().notNull(),
        authority: jsonb('authority').$type<SentenceAuthority>().notNull(),
        operationId: uuid('operation_id').notNull(),
        sessionId: uuid('session_id').notNull(),
        requestFingerprint: text('request_fingerprint').notNull(),
        referenceRevealed: boolean('reference_revealed')
            .notNull()
            .default(false),
        inputPayload: jsonb('input_payload').$type<
            SentenceGenerationInput | SentenceCheckInput
        >(),
        executionState: text('execution_state')
            .$type<
                'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
            >()
            .notNull()
            .default('queued'),
        failureCategory: text('failure_category'),
        resultExerciseId: uuid('result_exercise_id').references(
            () => sentenceExercisesTable.id,
            { onDelete: 'cascade' },
        ),
        resultAttemptId: uuid('result_attempt_id').references(
            () => sentenceAttemptsTable.id,
            { onDelete: 'cascade' },
        ),
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
        unique('sentence_ai_jobs_operation_unique').on(
            t.learnerId,
            t.operationId,
        ),
        index('sentence_ai_jobs_dictionary_idx').on(t.dictionaryId),
        index('sentence_ai_jobs_knowledge_note_idx').on(t.sourceNoteId),
        check(
            'sentence_ai_jobs_source_shape',
            sql`(${t.sourceKind}='dictionary' and ${t.dictionaryId} is not null and ${t.sourceNoteId} is null and ${t.knowledgeSource} is null and ${t.sourceExerciseId} is null and ${t.resultKnowledgeExerciseId} is null and ${t.resultKnowledgeAttemptId} is null) or (${t.sourceKind}='knowledge-vocabulary' and ${t.dictionaryId} is null and ${t.sourceNoteId} is not null and ${t.resultExerciseId} is null and ${t.resultAttemptId} is null and (${t.knowledgeSource} is not null or (${t.executionState} in ('completed','failed','cancelled') and ${t.inputPayload} is null)))`,
        ),
        index('sentence_ai_jobs_revision_idx').on(t.executionRevisionId),
        index('sentence_ai_jobs_result_exercise_idx').on(t.resultExerciseId),
        index('sentence_ai_jobs_result_attempt_idx').on(t.resultAttemptId),
        index('sentence_ai_jobs_queue_idx').on(
            t.executionState,
            t.nextAttemptAt,
            t.createdAt,
        ),
        index('sentence_ai_jobs_learner_idx').on(t.learnerId, t.executionState),
        check(
            'sentence_ai_jobs_kind_format',
            sql`((${t.jobKind}='sentence-generation' and ((${t.format} in ('sentence-generation:v1','sentence-preparation:v1') and ${t.inputPayload}->>'generationPolicyVersion'='1') or (${t.format} in ('sentence-generation:v2','sentence-preparation:v2') and ${t.inputPayload}->>'generationPolicyVersion'='2'))) or (${t.jobKind}='sentence-check' and ${t.format}='sentence-check:v1')) is true or (${t.sourceKind}='knowledge-vocabulary' and ${t.executionState} in ('completed','failed','cancelled') and ${t.inputPayload} is null)`,
        ),
        check(
            'sentence_ai_jobs_execution_versions',
            sql`${t.selectedExecutionVersion}=1 and ${t.attemptCount}>=0 and ${t.maxAttempts}>0 and ${t.fencingToken}>=0`,
        ),
        check(
            'sentence_ai_jobs_lease',
            sql`(${t.executionState}='running' and ${t.workerId} is not null and ${t.leaseDeadline} is not null and ${t.heartbeatAt} is not null) or (${t.executionState}<>'running' and ${t.workerId} is null and ${t.leaseDeadline} is null and ${t.heartbeatAt} is null)`,
        ),
        check(
            'sentence_ai_jobs_state',
            sql`${t.executionState} in ('queued','running','completed','failed','cancelled') and ((${t.executionState} in ('completed','failed','cancelled'))=(${t.completedAt} is not null))`,
        ),
    ],
);
export const sentenceJobEntriesTable = pgTable(
    'sentence_job_entries',
    {
        jobId: uuid('job_id')
            .notNull()
            .references(() => sentenceAiJobsTable.id, { onDelete: 'cascade' }),
        dictionaryId: dictionary(),
        entryId: uuid('entry_id').notNull(),
        learningVersion: integer('learning_version').notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.jobId, t.entryId] }),
        foreignKey({
            columns: [t.entryId, t.dictionaryId],
            foreignColumns: [
                dictionaryCardsTable.id,
                dictionaryCardsTable.dictionaryId,
            ],
        }).onDelete('cascade'),
        index('sentence_job_entries_entry_idx').on(t.dictionaryId, t.entryId),
    ],
);
export const sentenceNextReceiptsTable = pgTable(
    'sentence_next_receipts',
    {
        learnerId: learner(),
        operationId: uuid('operation_id').notNull(),
        dictionaryId: dictionary(),
        requestFingerprint: text('request_fingerprint').notNull(),
        configuration: jsonb('configuration').$type<SentencePrepareRequest>(),
        exerciseId: uuid('exercise_id').references(
            () => sentenceExercisesTable.id,
            { onDelete: 'set null' },
        ),
        jobId: uuid('job_id').references(() => sentenceAiJobsTable.id, {
            onDelete: 'set null',
        }),
        invalidatedAt: date('invalidated_at'),
        emptyReason: text('empty_reason').$type<
            'no-eligible-entries' | 'review-exhausted'
        >(),
        createdAt: date('created_at').notNull().defaultNow(),
    },
    (t) => [
        primaryKey({ columns: [t.learnerId, t.operationId] }),
        index('sentence_next_receipts_dictionary_idx').on(t.dictionaryId),
        index('sentence_next_receipts_exercise_idx').on(t.exerciseId),
        index('sentence_next_receipts_job_idx').on(t.jobId),
        check(
            'sentence_next_receipts_outcome',
            sql`(${t.invalidatedAt} is null and ${t.configuration} is not null and num_nonnulls(${t.exerciseId},${t.jobId},${t.emptyReason})=1) or (${t.invalidatedAt} is not null and num_nonnulls(${t.exerciseId},${t.jobId},${t.emptyReason})=0)`,
        ),
    ],
);
