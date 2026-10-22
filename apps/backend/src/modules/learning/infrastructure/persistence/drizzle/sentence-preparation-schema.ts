import { sql } from 'drizzle-orm';
import type { LegacyActionSnapshot } from '../../../../ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting';
import { aiCreditActionsTable } from '../../../../ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import { dictionaryAiConfigurationRevisionsTable } from '../../../../text-ai/infrastructure/persistence/drizzle/configuration-schema';
import {
    pgTable,
    uuid,
    text,
    jsonb,
    timestamp,
    boolean,
    bigint,
    integer,
    index,
    unique,
    primaryKey,
    check,
} from 'drizzle-orm/pg-core';
import type {
    SentenceDirection,
    SentenceMode,
    SentencePreparationState,
    SentencePreparationPauseReason,
} from '@languon/contracts';
import type { SentenceEntry } from '../../../domain/sentence-types';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { dictionariesTable } from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import { sentenceAiJobsTable, type SentenceAuthority } from './sentence-schema';
const date = (name: string) =>
    timestamp(name, { withTimezone: true, mode: 'date' });
export const sentencePreparationsTable = pgTable(
    'sentence_preparations',
    {
        id: uuid('id').primaryKey(),
        learnerId: uuid('learner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        dictionaryId: uuid('dictionary_id')
            .notNull()
            .references(() => dictionariesTable.id, { onDelete: 'cascade' }),
        operationId: uuid('operation_id').notNull(),
        fingerprint: text('fingerprint').notNull(),
        authority: jsonb('authority').$type<SentenceAuthority>().notNull(),
        direction: text('direction').$type<SentenceDirection>().notNull(),
        mode: text('mode').$type<SentenceMode>().notNull(),
        sourceLanguage: text('source_language').notNull(),
        targetLanguage: text('target_language').notNull(),
        state: text('state').$type<SentencePreparationState>().notNull(),
        pauseReason:
            text('pause_reason').$type<SentencePreparationPauseReason>(),
        currentActionId: uuid('current_action_id').references(
            () => aiCreditActionsTable.id,
            { onDelete: 'set null' },
        ),
        coordinatorFence: bigint('coordinator_fence', { mode: 'bigint' })
            .notNull()
            .default(sql`0`),
        activeJobId: uuid('active_job_id').references(
            () => sentenceAiJobsTable.id,
            { onDelete: 'set null' },
        ),
        createdAt: date('created_at').notNull(),
        updatedAt: date('updated_at').notNull(),
    },
    (t) => [
        unique('sentence_preparations_operation_unique').on(
            t.learnerId,
            t.operationId,
        ),
        index('sentence_preparations_queue_idx').on(t.state, t.updatedAt),
        index('sentence_preparations_dictionary_idx').on(t.dictionaryId),
        check(
            'sentence_preparations_state',
            sql`${t.state} in ('queued','running','stopping','paused','completed','failed')`,
        ),
    ],
);
export interface PreparedSentenceManifestItem {
    exerciseId: string;
    entryIds: string[];
    origin: 'saved' | 'generated';
}
export const sentencePreparationBatchesTable = pgTable(
    'sentence_preparation_batches',
    {
        id: uuid('id').primaryKey(),
        preparationId: uuid('preparation_id')
            .notNull()
            .references(() => sentencePreparationsTable.id, {
                onDelete: 'cascade',
            }),
        ordinal: integer('ordinal').notNull(),
        reviewed: boolean('reviewed').notNull().default(false),
        scanCursor: jsonb('scan_cursor').$type<{
            createdAt: string;
            id: string;
        } | null>(),
        entries: jsonb('entries').$type<SentenceEntry[]>().notNull(),
        manifest: jsonb('manifest')
            .$type<PreparedSentenceManifestItem[]>()
            .notNull()
            .default([]),
    },
    (t) => [
        unique('sentence_preparation_batches_order_unique').on(
            t.preparationId,
            t.ordinal,
        ),
        check(
            'sentence_preparation_batches_bound',
            sql`jsonb_array_length(${t.entries}) between 1 and 100 and jsonb_array_length(${t.manifest})<=100`,
        ),
    ],
);
export const sentencePreparationChildrenTable = pgTable(
    'sentence_preparation_children',
    {
        jobId: uuid('job_id')
            .primaryKey()
            .references(() => sentenceAiJobsTable.id, { onDelete: 'cascade' }),
        preparationId: uuid('preparation_id')
            .notNull()
            .references(() => sentencePreparationsTable.id, {
                onDelete: 'cascade',
            }),
        batchId: uuid('batch_id')
            .notNull()
            .references(() => sentencePreparationBatchesTable.id, {
                onDelete: 'cascade',
            }),
    },
    (t) => [
        index('sentence_preparation_children_preparation_idx').on(
            t.preparationId,
        ),
        index('sentence_preparation_children_batch_idx').on(t.batchId),
    ],
);
export const sentencePreparationCommandsTable = pgTable(
    'sentence_preparation_commands',
    {
        learnerId: uuid('learner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        operationId: uuid('operation_id').notNull(),
        preparationId: uuid('preparation_id')
            .notNull()
            .references(() => sentencePreparationsTable.id, {
                onDelete: 'cascade',
            }),
        action: text('action').notNull(),
        authorizationActionId: uuid('authorization_action_id').references(
            () => aiCreditActionsTable.id,
            { onDelete: 'set null' },
        ),
        createdAt: date('created_at').notNull(),
    },
    (t) => [primaryKey({ columns: [t.learnerId, t.operationId] })],
);

/** Every explicit learner authorization remains addressable after Continue. */
export const sentencePreparationActionsTable = pgTable(
    'sentence_preparation_actions',
    {
        actionId: uuid('action_id')
            .primaryKey()
            .references(() => aiCreditActionsTable.id, { onDelete: 'cascade' }),
        preparationId: uuid('preparation_id')
            .notNull()
            .references(() => sentencePreparationsTable.id, {
                onDelete: 'cascade',
            }),
        selectedExecutionSnapshot: jsonb('selected_execution_snapshot')
            .$type<LegacyActionSnapshot>()
            .notNull(),
        executionRevisionId: uuid('execution_revision_id')
            .notNull()
            .references(() => dictionaryAiConfigurationRevisionsTable.id, {
                onDelete: 'restrict',
            }),
        terminalOutcome: text('terminal_outcome').$type<
            'success' | 'stopped' | 'failure'
        >(),
        createdAt: date('created_at').notNull(),
    },
    (t) => [
        index('sentence_preparation_actions_parent_idx').on(t.preparationId),
        check(
            'sentence_preparation_actions_outcome',
            sql`${t.terminalOutcome} is null or ${t.terminalOutcome} in ('success','stopped','failure')`,
        ),
    ],
);
