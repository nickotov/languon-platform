import {
    pgTable,
    uuid,
    integer,
    timestamp,
    text,
    jsonb,
    primaryKey,
    index,
    check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { dictionariesTable } from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import { sentenceExercisesTable } from './sentence-schema';
const date = (name: string) =>
    timestamp(name, { withTimezone: true, mode: 'date' });
export const sentencePersonalVisibilityTable = pgTable(
    'sentence_personal_visibility',
    {
        learnerId: uuid('learner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        exerciseId: uuid('exercise_id')
            .notNull()
            .references(() => sentenceExercisesTable.id, {
                onDelete: 'cascade',
            }),
        archivedAt: date('archived_at'),
        actorId: uuid('actor_id').references(() => usersTable.id, {
            onDelete: 'set null',
        }),
        version: integer('version').notNull().default(1),
        updatedAt: date('updated_at').notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.learnerId, t.exerciseId] }),
        index('sentence_personal_visibility_exercise_idx').on(t.exerciseId),
        check('sentence_personal_visibility_version', sql`${t.version}>0`),
    ],
);
export const sentenceGlobalVisibilityTable = pgTable(
    'sentence_global_visibility',
    {
        exerciseId: uuid('exercise_id')
            .primaryKey()
            .references(() => sentenceExercisesTable.id, {
                onDelete: 'cascade',
            }),
        archivedAt: date('archived_at'),
        actorId: uuid('actor_id').references(() => usersTable.id, {
            onDelete: 'set null',
        }),
        version: integer('version').notNull().default(1),
        updatedAt: date('updated_at').notNull(),
    },
    (t) => [check('sentence_global_visibility_version', sql`${t.version}>0`)],
);
export interface SentenceLibrarySnapshotItem {
    exerciseId: string;
    version: number;
    creatorVersion: number;
}
export const sentenceLibrarySnapshotsTable = pgTable(
    'sentence_library_snapshots',
    {
        id: uuid('id').primaryKey(),
        actorId: uuid('actor_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        learnerId: uuid('learner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        dictionaryId: uuid('dictionary_id')
            .notNull()
            .references(() => dictionariesTable.id, { onDelete: 'cascade' }),
        operation: text('operation').notNull(),
        scope: text('scope').notNull(),
        items: jsonb('items').$type<SentenceLibrarySnapshotItem[]>().notNull(),
        expiresAt: date('expires_at').notNull(),
    },
    (t) => [
        index('sentence_library_snapshots_expiry_idx').on(t.expiresAt),
        index('sentence_library_snapshots_actor_dictionary_expiry_idx').on(
            t.actorId,
            t.dictionaryId,
            t.expiresAt,
        ),
    ],
);
export const sentenceLibraryReceiptsTable = pgTable(
    'sentence_library_receipts',
    {
        actorId: uuid('actor_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        operationId: uuid('operation_id').notNull(),
        learnerId: uuid('learner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        dictionaryId: uuid('dictionary_id')
            .notNull()
            .references(() => dictionariesTable.id, { onDelete: 'cascade' }),
        fingerprint: text('fingerprint').notNull(),
        affectedCount: integer('affected_count').notNull(),
        createdAt: date('created_at').notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.actorId, t.operationId] }),
        check('sentence_library_receipts_count', sql`${t.affectedCount}>=0`),
    ],
);
