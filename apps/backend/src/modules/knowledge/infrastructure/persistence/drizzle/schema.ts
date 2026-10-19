import type {
    KnowledgeBody,
    KnowledgeCategory,
    KnowledgeNoteContent,
} from '@languon/contracts';
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
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';

export const knowledgeNotesTable = pgTable(
    'knowledge_notes',
    {
        id: uuid('id').primaryKey(),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id),
        title: text('title').notNull(),
        summary: text('summary').notNull(),
        body: jsonb('body').$type<KnowledgeBody>().notNull(),
        categories: text('categories')
            .array()
            .$type<KnowledgeCategory[]>()
            .notNull(),
        studiedLanguage: text('studied_language').notNull(),
        explanationLanguage: text('explanation_language').notNull(),
        plainText: text('plain_text').notNull(),
        version: integer('version').notNull().default(1),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    },
    (t) => [
        index('knowledge_notes_owner_updated_idx').on(
            t.ownerId,
            t.updatedAt,
            t.id,
        ),
        index('knowledge_notes_owner_language_idx').on(
            t.ownerId,
            t.studiedLanguage,
        ),
        check('knowledge_notes_version_positive', sql`${t.version} > 0`),
        check(
            'knowledge_notes_title_length',
            sql`char_length(${t.title}) between 1 and 200`,
        ),
        check(
            'knowledge_notes_summary_length',
            sql`char_length(${t.summary}) between 1 and 1000`,
        ),
        check(
            'knowledge_notes_categories',
            sql`cardinality(${t.categories}) between 1 and 7 and ${t.categories} <@ ARRAY['grammar','vocabulary','usage','pronunciation','etymology','culture','learning-tips']::text[]`,
        ),
        check(
            'knowledge_notes_body_version',
            sql`${t.body}->>'schemaVersion' = '1'`,
        ),
    ],
);
export const knowledgeNoteRevisionsTable = pgTable(
    'knowledge_note_revisions',
    {
        noteId: uuid('note_id')
            .notNull()
            .references(() => knowledgeNotesTable.id, { onDelete: 'cascade' }),
        version: integer('version').notNull(),
        content: jsonb('content').$type<KnowledgeNoteContent>().notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.noteId, t.version] }),
        check('knowledge_revisions_version_positive', sql`${t.version} > 0`),
    ],
);
/** Content-free receipts deliberately survive note deletion to prevent replay resurrection. */
export const knowledgeOperationReceiptsTable = pgTable(
    'knowledge_operation_receipts',
    {
        id: uuid('id').primaryKey(),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id),
        operationId: uuid('operation_id').notNull(),
        operation: text('operation')
            .$type<'create' | 'update' | 'restore' | 'delete'>()
            .notNull(),
        fingerprint: text('fingerprint').notNull(),
        noteId: uuid('note_id').notNull(),
        version: integer('version').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    },
    (t) => [
        uniqueIndex('knowledge_receipts_owner_operation_key').on(
            t.ownerId,
            t.operationId,
        ),
        index('knowledge_receipts_owner_idx').on(t.ownerId),
        check(
            'knowledge_receipts_operation_kind',
            sql`${t.operation} in ('create','update','restore','delete')`,
        ),
        check('knowledge_receipts_version_positive', sql`${t.version} > 0`),
    ],
);
