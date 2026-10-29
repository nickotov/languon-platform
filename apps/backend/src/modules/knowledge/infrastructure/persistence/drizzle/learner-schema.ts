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
    uuid,
} from 'drizzle-orm/pg-core';
import type {
    LearningBlock,
    WorkbookLearnerAttempt,
    WorkbookLearningEvent,
    WorkbookNoteCompletion,
    SetWorkbookNoteCompletionRequest,
} from '@languon/contracts';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { knowledgeNotesTable } from './schema';

const identity = () => ({
    actorId: uuid('actor_id')
        .notNull()
        .references(() => usersTable.id, { onDelete: 'cascade' }),
    noteId: uuid('note_id')
        .notNull()
        .references(() => knowledgeNotesTable.id, { onDelete: 'cascade' }),
});

export const knowledgeLearnerAttemptsTable = pgTable(
    'knowledge_learner_attempts',
    {
        ...identity(),
        id: uuid('id').notNull(),
        exerciseId: uuid('exercise_id').notNull(),
        exerciseRevision: text('exercise_revision').notNull(),
        noteVersion: integer('note_version').notNull(),
        result: jsonb('result').$type<WorkbookLearnerAttempt>().notNull(),
        snapshot: jsonb('snapshot').$type<LearningBlock[]>().notNull(),
        fingerprint: text('fingerprint').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.actorId, t.id] }),
        index('knowledge_learner_attempts_note_actor_idx').on(
            t.noteId,
            t.actorId,
            t.createdAt,
        ),
        check('knowledge_learner_attempt_version', sql`${t.noteVersion}>0`),
        check(
            'knowledge_learner_attempt_revision',
            sql`${t.exerciseRevision} ~ '^[a-f0-9]{64}$'`,
        ),
    ],
);
export const knowledgeLearnerEventsTable = pgTable(
    'knowledge_learner_events',
    {
        ...identity(),
        id: uuid('id').notNull(),
        result: jsonb('result').$type<WorkbookLearningEvent>().notNull(),
        fingerprint: text('fingerprint').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.actorId, t.id] }),
        index('knowledge_learner_events_note_actor_idx').on(
            t.noteId,
            t.actorId,
            t.createdAt,
        ),
    ],
);
export const knowledgeLearnerCompletionTable = pgTable(
    'knowledge_learner_completion',
    {
        ...identity(),
        result: jsonb('result').$type<WorkbookNoteCompletion>().notNull(),
    },
    (t) => [primaryKey({ columns: [t.actorId, t.noteId] })],
);
export const knowledgeLearnerCompletionReceiptsTable = pgTable(
    'knowledge_learner_completion_receipts',
    {
        ...identity(),
        id: uuid('id').notNull(),
        request: jsonb('request')
            .$type<SetWorkbookNoteCompletionRequest>()
            .notNull(),
        result: jsonb('result').$type<WorkbookNoteCompletion | null>(),
        fingerprint: text('fingerprint').notNull(),
    },
    (t) => [primaryKey({ columns: [t.actorId, t.id] })],
);
