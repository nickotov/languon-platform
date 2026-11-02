import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, uuid } from 'drizzle-orm/pg-core';
import type { KnowledgeLearningSourceBinding } from '../../../application/learning-source-binding';
import type {
    SentenceGenerationInput,
    SentenceCheckInput,
} from '../../../../learning/domain/sentence-types';
import { sentenceAiJobsTable } from '../../../../learning/infrastructure/persistence/drizzle/sentence-schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { knowledgeNotesTable } from './schema';

/** App-only authorization/provenance. The execution role receives no table grant. */
export const knowledgeSentenceJobSourcesTable = pgTable(
    'knowledge_sentence_job_sources',
    {
        jobId: uuid('job_id')
            .primaryKey()
            .references(() => sentenceAiJobsTable.id, { onDelete: 'cascade' }),
        actorId: uuid('actor_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        noteId: uuid('note_id')
            .notNull()
            .references(() => knowledgeNotesTable.id, { onDelete: 'cascade' }),
        blockId: uuid('block_id').notNull(),
        sourceExerciseId: uuid('source_exercise_id'),
        binding: jsonb('binding')
            .$type<KnowledgeLearningSourceBinding>()
            .notNull(),
        inputPayload: jsonb('input_payload')
            .$type<SentenceGenerationInput | SentenceCheckInput>()
            .notNull(),
    },
    (t) => [
        index('knowledge_sentence_job_sources_note_idx').on(
            t.noteId,
            t.actorId,
        ),
        check(
            'knowledge_sentence_job_sources_binding',
            sql`${t.binding}->>'kind'='knowledge-block' and ${t.binding}->>'actorId'=${t.actorId}::text and ${t.binding}->>'noteId'=${t.noteId}::text and ${t.binding}->>'blockId'=${t.blockId}::text and ${t.binding}->'sourceSnapshot'->>'type'='vocabulary'`,
        ),
        check(
            'knowledge_sentence_job_sources_input',
            sql`jsonb_typeof(${t.inputPayload})='object' and octet_length(${t.inputPayload}::text)<=524288 and octet_length(${t.binding}::text)<=524288`,
        ),
    ],
);
