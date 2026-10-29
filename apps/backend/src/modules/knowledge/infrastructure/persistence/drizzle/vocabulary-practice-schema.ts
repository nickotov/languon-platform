import { sql } from 'drizzle-orm';
import {
    pgTable,
    uuid,
    integer,
    boolean,
    jsonb,
    text,
    timestamp,
    bigint,
    primaryKey,
    index,
    unique,
    check,
} from 'drizzle-orm/pg-core';
import type { FlashcardConfiguration } from '@languon/contracts';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { knowledgeNotesTable } from './schema';
const source = () => ({
    actorId: uuid('actor_id')
        .notNull()
        .references(() => usersTable.id, { onDelete: 'cascade' }),
    noteId: uuid('note_id')
        .notNull()
        .references(() => knowledgeNotesTable.id, { onDelete: 'cascade' }),
    blockId: uuid('block_id').notNull(),
});

export const knowledgeVocabularyPreferencesTable = pgTable(
    'knowledge_vocabulary_preferences',
    {
        ...source(),
        configuration: jsonb('configuration')
            .$type<FlashcardConfiguration>()
            .notNull(),
        shuffle: boolean('shuffle').notNull(),
        version: integer('version').notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.actorId, t.noteId, t.blockId] }),
        index('knowledge_vocabulary_preferences_note_idx').on(t.noteId),
        check('knowledge_vocabulary_preferences_version', sql`${t.version}>0`),
    ],
);
export const knowledgeVocabularyAttemptsTable = pgTable(
    'knowledge_vocabulary_attempts',
    {
        ...source(),
        id: uuid('id').primaryKey(),
        sequence: bigint('sequence', { mode: 'bigint' })
            .generatedAlwaysAsIdentity()
            .notNull(),
        entryId: uuid('entry_id').notNull(),
        operationId: uuid('operation_id').notNull(),
        sessionId: uuid('session_id').notNull(),
        round: integer('round').notNull(),
        learningVersion: integer('learning_version').notNull(),
        rating: text('rating').$type<'known' | 'again'>().notNull(),
        configuration: jsonb('configuration')
            .$type<FlashcardConfiguration>()
            .notNull(),
        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
        voidedAt: timestamp('voided_at', { withTimezone: true }),
        undoOperationId: uuid('undo_operation_id'),
        undoRating: text('undo_rating').$type<'known' | 'again'>(),
    },
    (t) => [
        unique('knowledge_vocabulary_attempt_operation').on(
            t.actorId,
            t.operationId,
        ),
        unique('knowledge_vocabulary_undo_operation').on(
            t.actorId,
            t.undoOperationId,
        ),
        index('knowledge_vocabulary_attempt_source_idx').on(
            t.noteId,
            t.blockId,
            t.entryId,
            t.actorId,
        ),
        index('knowledge_vocabulary_attempt_session_idx').on(
            t.actorId,
            t.sessionId,
            t.sequence,
        ),
        check(
            'knowledge_vocabulary_attempt_version',
            sql`${t.learningVersion}>0 and ${t.round}>0`,
        ),
        check(
            'knowledge_vocabulary_attempt_rating',
            sql`${t.rating} in ('known','again') and (${t.undoRating} is null or ${t.undoRating} in ('known','again'))`,
        ),
    ],
);
export const knowledgeVocabularyProgressTable = pgTable(
    'knowledge_vocabulary_progress',
    {
        ...source(),
        entryId: uuid('entry_id').notNull(),
        learningVersion: integer('learning_version').notNull(),
        rating: text('rating').$type<'known' | 'again'>().notNull(),
        latestAttemptId: uuid('latest_attempt_id')
            .notNull()
            .references(() => knowledgeVocabularyAttemptsTable.id, {
                onDelete: 'cascade',
            }),
    },
    (t) => [
        primaryKey({ columns: [t.actorId, t.noteId, t.blockId, t.entryId] }),
        index('knowledge_vocabulary_progress_note_idx').on(t.noteId),
        check(
            'knowledge_vocabulary_progress_version',
            sql`${t.learningVersion}>0`,
        ),
        check(
            'knowledge_vocabulary_progress_rating',
            sql`${t.rating} in ('known','again')`,
        ),
    ],
);
