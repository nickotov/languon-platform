import {
    check,
    index,
    jsonb,
    pgTable,
    timestamp,
    uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { WorkbookLearnerAttempt } from '@languon/contracts';
import type { KnowledgeExerciseEvaluationInput } from '../../../application/ports/exercise-evaluation-store';
import { textsAiJobsTable } from '../../../../texts/infrastructure/persistence/drizzle/texts-job-schema';
import { knowledgeNotesTable } from './schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';

/** Durable source authority survives provider-input clearing; never stores raw share keys. */
export const knowledgeExerciseEvaluationJobSourcesTable = pgTable(
    'knowledge_exercise_evaluation_job_sources',
    {
        jobId: uuid('job_id')
            .primaryKey()
            .references(() => textsAiJobsTable.id, { onDelete: 'cascade' }),
        actorId: uuid('actor_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        noteId: uuid('note_id')
            .notNull()
            .references(() => knowledgeNotesTable.id, { onDelete: 'cascade' }),
        attemptId: uuid('attempt_id').notNull(),
        input: jsonb('input')
            .$type<KnowledgeExerciseEvaluationInput>()
            .notNull(),
        attemptResult: jsonb('attempt_result').$type<WorkbookLearnerAttempt>(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    },
    (table) => [
        index('knowledge_exercise_evaluation_source_note_idx').on(
            table.noteId,
            table.actorId,
        ),
        check(
            'knowledge_exercise_evaluation_source_identity',
            sql`${table.input}->>'noteId'=${table.noteId}::text and ${table.input}->>'attemptId'=${table.attemptId}::text`,
        ),
    ],
);
