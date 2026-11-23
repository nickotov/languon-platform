import type { GenerationFailureDiagnostic } from '../../../application/generation-failure';
import type { GenerationPlan, GenerationTask } from '@languon/contracts';
import { sql } from 'drizzle-orm';
import {
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
import type {
    GenerationUnitAttempt,
    GenerationArtifact,
    GenerationSourceSnapshot,
    GenerationAutomationAuthorization,
} from '../../../application/ports/generation-run';
import type { ConversationSourceSnapshot } from '../../../domain/conversation';
import { conversationsTable, conversationTurnsTable } from './schema';
import { knowledgeNotesTable } from '../../../../knowledge/infrastructure/persistence/drizzle/schema';

export const generationRunsTable = pgTable(
    'conversation_generation_runs',
    {
        id: uuid('id').primaryKey(),
        conversationId: uuid('conversation_id')
            .notNull()
            .references(() => conversationsTable.id, { onDelete: 'cascade' }),
        ownerId: uuid('owner_id').notNull(),
        noteId: uuid('note_id')
            .notNull()
            .references(() => knowledgeNotesTable.id, { onDelete: 'cascade' }),
        revision: integer('revision').notNull(),
        taskManifest: jsonb('task_manifest')
            .$type<Pick<GenerationTask, 'id' | 'kind'>[]>()
            .notNull()
            .default(sql`'[]'::jsonb`),
        state: text('state')
            .$type<'running' | 'paused' | 'completed' | 'discarded'>()
            .notNull(),
        pauseReason: text('pause_reason').$type<
            | 'budget'
            | 'technical-failure'
            | 'interrupted'
            | 'stopped'
            | 'source-changed'
        >(),
        activeTurnId: uuid('active_turn_id').references(
            () => conversationTurnsTable.id,
            { onDelete: 'set null' },
        ),
        proposalId: uuid('proposal_id'),
        automation:
            jsonb('automation').$type<GenerationAutomationAuthorization>(),
        failure: jsonb('failure').$type<GenerationFailureDiagnostic>(),
        sourceSnapshot: jsonb('source_snapshot')
            .$type<ConversationSourceSnapshot>()
            .notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    },
    (t) => [
        index('conversation_generation_runs_conversation_idx').on(
            t.conversationId,
        ),
        index('conversation_generation_runs_automatic_ready_idx')
            .on(t.updatedAt, t.id)
            .where(
                sql`${t.state}='paused' and ${t.pauseReason}='budget' and ${t.automation}->>'ready'='true'`,
            ),
        uniqueIndex('conversation_generation_runs_active_turn_unique').on(
            t.activeTurnId,
        ),
        check(
            'conversation_generation_runs_revision_positive',
            sql`${t.revision} > 0`,
        ),
        check(
            'conversation_generation_runs_state',
            sql`${t.state} in ('running','paused','completed','discarded')`,
        ),
    ],
);

export const generationPlanRevisionsTable = pgTable(
    'conversation_generation_plan_revisions',
    {
        runId: uuid('run_id')
            .notNull()
            .references(() => generationRunsTable.id, { onDelete: 'cascade' }),
        revision: integer('revision').notNull(),
        plan: jsonb('plan').$type<GenerationPlan>().notNull(),
        sources: jsonb('sources').$type<GenerationSourceSnapshot[]>().notNull(),
        unitAttempts: jsonb('unit_attempts')
            .$type<GenerationUnitAttempt[]>()
            .notNull()
            .default(sql`'[]'::jsonb`),
        artifactIds: jsonb('artifact_ids')
            .$type<string[]>()
            .notNull()
            .default(sql`'[]'::jsonb`),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    },
    (t) => [primaryKey({ columns: [t.runId, t.revision] })],
);

export const generationRunArtifactsTable = pgTable(
    'conversation_generation_run_artifacts',
    {
        id: uuid('id').primaryKey(),
        runId: uuid('run_id')
            .notNull()
            .references(() => generationRunsTable.id, { onDelete: 'cascade' }),
        revision: integer('revision').notNull(),
        turnId: uuid('turn_id')
            .notNull()
            .references(() => conversationTurnsTable.id, {
                onDelete: 'cascade',
            }),
        taskId: text('task_id').notNull(),
        batchKey: text('batch_key').notNull(),
        artifact: jsonb('artifact').$type<GenerationArtifact>().notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    },
    (t) => [
        uniqueIndex('conversation_generation_artifact_batch_unique').on(
            t.runId,
            t.revision,
            t.taskId,
            t.batchKey,
        ),
    ],
);

export const generationRunActionsTable = pgTable(
    'conversation_generation_run_actions',
    {
        proposalId: uuid('proposal_id'),
        turnId: uuid('turn_id')
            .primaryKey()
            .references(() => conversationTurnsTable.id, {
                onDelete: 'cascade',
            }),
        runId: uuid('run_id')
            .notNull()
            .references(() => generationRunsTable.id, { onDelete: 'cascade' }),
        revision: integer('revision').notNull(),
        kind: text('kind').$type<'generation' | 'revision'>().notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    },
    (t) => [index('conversation_generation_actions_run_idx').on(t.runId)],
);

export const generationPlanCandidatesTable = pgTable(
    'conversation_generation_plan_candidates',
    {
        id: uuid('id').primaryKey(),
        runId: uuid('run_id')
            .notNull()
            .references(() => generationRunsTable.id, { onDelete: 'cascade' }),
        baseRevision: integer('base_revision').notNull(),
        plan: jsonb('plan').$type<GenerationPlan>().notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    },
);

export const generationRunMutationsTable = pgTable(
    'conversation_generation_run_mutations',
    {
        runId: uuid('run_id')
            .notNull()
            .references(() => generationRunsTable.id, { onDelete: 'cascade' }),
        requestId: uuid('request_id').notNull(),
        fingerprint: text('fingerprint').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    },
    (t) => [primaryKey({ columns: [t.runId, t.requestId] })],
);
