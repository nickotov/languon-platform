import { sql } from 'drizzle-orm';
import {
    pgTable,
    uuid,
    text,
    jsonb,
    timestamp,
    boolean,
    primaryKey,
    index,
    unique,
    check,
} from 'drizzle-orm/pg-core';
import type { SentenceExercise, SentenceFeedback } from '@languon/contracts';
import type { SentenceEntry } from '../../../../learning/domain/sentence-types';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { knowledgeNotesTable } from './schema';
const date = () =>
    timestamp('created_at', { withTimezone: true, mode: 'date' })
        .notNull()
        .defaultNow();
const source = () => ({
    actorId: uuid('actor_id')
        .notNull()
        .references(() => usersTable.id, { onDelete: 'cascade' }),
    noteId: uuid('note_id')
        .notNull()
        .references(() => knowledgeNotesTable.id, { onDelete: 'cascade' }),
    blockId: uuid('block_id').notNull(),
});

export const knowledgeSentenceExercisesTable = pgTable(
    'knowledge_sentence_exercises',
    {
        id: uuid('id').primaryKey(),
        ...source(),
        operationId: uuid('operation_id').notNull(),
        publicContent: jsonb('public_content')
            .$type<SentenceExercise>()
            .notNull(),
        referenceTranslation: text('reference_translation').notNull(),
        provenance: jsonb('provenance').$type<SentenceEntry[]>().notNull(),
        createdAt: date(),
    },
    (t) => [
        unique('knowledge_sentence_exercises_operation').on(
            t.actorId,
            t.operationId,
        ),
        index('knowledge_sentence_exercises_note').on(t.noteId),
        index('knowledge_sentence_exercises_source').on(
            t.actorId,
            t.noteId,
            t.blockId,
        ),
        check(
            'knowledge_sentence_exercises_source_shape',
            sql`(${t.publicContent}->>'dictionaryId' is null and ${t.publicContent}->'knowledgeSource'->>'noteId'=${t.noteId}::text and ${t.publicContent}->'knowledgeSource'->>'blockId'=${t.blockId}::text) is true`,
        ),
    ],
);
const exercise = () =>
    uuid('exercise_id')
        .notNull()
        .references(() => knowledgeSentenceExercisesTable.id, {
            onDelete: 'cascade',
        });

export const knowledgeSentenceAttemptsTable = pgTable(
    'knowledge_sentence_attempts',
    {
        id: uuid('id').primaryKey(),
        ...source(),
        exerciseId: exercise(),
        operationId: uuid('operation_id').notNull(),
        sessionId: uuid('session_id').notNull(),
        answer: text('answer').notNull(),
        explanationLanguage: text('explanation_language').notNull(),
        revealedHintIds: jsonb('revealed_hint_ids').$type<string[]>().notNull(),
        referenceRevealed: boolean('reference_revealed').notNull(),
        feedback: jsonb('feedback').$type<SentenceFeedback>().notNull(),
        createdAt: date(),
    },
    (t) => [
        unique('knowledge_sentence_attempts_operation').on(
            t.actorId,
            t.operationId,
        ),
        index('knowledge_sentence_attempts_note').on(t.noteId),
        index('knowledge_sentence_attempts_exercise').on(t.exerciseId),
        index('knowledge_sentence_attempts_history').on(
            t.actorId,
            t.noteId,
            t.blockId,
            t.createdAt,
            t.id,
        ),
    ],
);
export const knowledgeSentenceReviewsTable = pgTable(
    'knowledge_sentence_reviews',
    {
        id: uuid('id').primaryKey(),
        ...source(),
        exerciseId: exercise(),
        operationId: uuid('operation_id').notNull(),
        sessionId: uuid('session_id').notNull(),
        requestFingerprint: text('request_fingerprint').notNull(),
        createdAt: date(),
    },
    (t) => [
        unique('knowledge_sentence_reviews_operation').on(
            t.actorId,
            t.operationId,
        ),
        index('knowledge_sentence_reviews_note').on(t.noteId),
        index('knowledge_sentence_reviews_exercise').on(t.exerciseId),
    ],
);
export const knowledgeSentenceExposuresTable = pgTable(
    'knowledge_sentence_exposures',
    {
        ...source(),
        exerciseId: exercise(),
        createdAt: date(),
    },
    (t) => [
        primaryKey({ columns: [t.actorId, t.exerciseId] }),
        index('knowledge_sentence_exposures_note').on(t.noteId),
        index('knowledge_sentence_exposures_exercise').on(t.exerciseId),
    ],
);
