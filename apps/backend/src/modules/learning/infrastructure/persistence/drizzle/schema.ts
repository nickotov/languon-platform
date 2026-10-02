import { sql } from 'drizzle-orm';
import {
    bigint,
    boolean,
    check,
    foreignKey,
    index,
    integer,
    jsonb,
    pgTable,
    primaryKey,
    text,
    timestamp,
    unique,
    uuid,
} from 'drizzle-orm/pg-core';
import type { FlashcardConfiguration } from '@languon/contracts';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import {
    dictionariesTable,
    dictionaryCardsTable,
} from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';

export const flashcardPreferencesTable = pgTable(
    'flashcard_preferences',
    {
        learnerId: uuid('learner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        dictionaryId: uuid('dictionary_id')
            .notNull()
            .references(() => dictionariesTable.id, { onDelete: 'cascade' }),
        configuration: jsonb('configuration')
            .$type<FlashcardConfiguration>()
            .notNull(),
        shuffle: boolean('shuffle').notNull(),
        version: integer('version').notNull().default(1),
    },
    (table) => [
        primaryKey({ columns: [table.learnerId, table.dictionaryId] }),
        index('flashcard_preferences_dictionary_idx').on(table.dictionaryId),
        check(
            'flashcard_preferences_version_positive',
            sql`${table.version} > 0`,
        ),
    ],
);

export const flashcardAttemptsTable = pgTable(
    'flashcard_attempts',
    {
        id: uuid('id').primaryKey(),
        sequence: bigint('sequence', { mode: 'bigint' })
            .generatedAlwaysAsIdentity()
            .notNull(),
        learnerId: uuid('learner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        dictionaryId: uuid('dictionary_id')
            .notNull()
            .references(() => dictionariesTable.id, { onDelete: 'cascade' }),
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
            .defaultNow()
            .notNull(),
        voidedAt: timestamp('voided_at', { withTimezone: true }),
        undoOperationId: uuid('undo_operation_id'),
        undoRating: text('undo_rating').$type<'known' | 'again'>(),
    },
    (table) => [
        foreignKey({
            columns: [table.entryId, table.dictionaryId],
            foreignColumns: [
                dictionaryCardsTable.id,
                dictionaryCardsTable.dictionaryId,
            ],
            name: 'flashcard_attempts_entry_dictionary_fk',
        }).onDelete('cascade'),
        unique('flashcard_attempts_learner_operation_unique').on(
            table.learnerId,
            table.operationId,
        ),
        unique('flashcard_attempts_learner_undo_operation_unique').on(
            table.learnerId,
            table.undoOperationId,
        ),
        index('flashcard_attempts_entry_sequence_idx').on(
            table.learnerId,
            table.entryId,
            table.sequence,
        ),
        index('flashcard_attempts_dictionary_entry_idx').on(
            table.dictionaryId,
            table.entryId,
        ),
        index('flashcard_attempts_session_sequence_idx').on(
            table.learnerId,
            table.sessionId,
            table.sequence,
        ),
        check(
            'flashcard_attempts_positive_versions',
            sql`${table.learningVersion} > 0 and ${table.round} > 0`,
        ),
        check(
            'flashcard_attempts_rating_valid',
            sql`${table.rating} in ('known', 'again') and (${table.undoRating} is null or ${table.undoRating} in ('known', 'again'))`,
        ),
        check(
            'flashcard_attempts_undo_state',
            sql`(${table.voidedAt} is null) = (${table.undoOperationId} is null)`,
        ),
    ],
);

export const flashcardEntryProgressTable = pgTable(
    'flashcard_entry_progress',
    {
        learnerId: uuid('learner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        dictionaryId: uuid('dictionary_id')
            .notNull()
            .references(() => dictionariesTable.id, { onDelete: 'cascade' }),
        entryId: uuid('entry_id').notNull(),
        learningVersion: integer('learning_version').notNull(),
        rating: text('rating').$type<'known' | 'again'>().notNull(),
        latestAttemptId: uuid('latest_attempt_id')
            .notNull()
            .references(() => flashcardAttemptsTable.id, {
                onDelete: 'cascade',
            }),
    },
    (table) => [
        primaryKey({ columns: [table.learnerId, table.entryId] }),
        foreignKey({
            columns: [table.entryId, table.dictionaryId],
            foreignColumns: [
                dictionaryCardsTable.id,
                dictionaryCardsTable.dictionaryId,
            ],
            name: 'flashcard_progress_entry_dictionary_fk',
        }).onDelete('cascade'),
        index('flashcard_progress_dictionary_learner_idx').on(
            table.dictionaryId,
            table.learnerId,
        ),
        index('flashcard_progress_dictionary_entry_idx').on(
            table.dictionaryId,
            table.entryId,
        ),
        index('flashcard_progress_latest_attempt_idx').on(
            table.latestAttemptId,
        ),
        check(
            'flashcard_progress_version_positive',
            sql`${table.learningVersion} > 0`,
        ),
        check(
            'flashcard_progress_rating_valid',
            sql`${table.rating} in ('known', 'again')`,
        ),
    ],
);
