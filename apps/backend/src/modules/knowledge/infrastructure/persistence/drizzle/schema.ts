import type {
    KnowledgeBody,
    KnowledgeCategory,
    KnowledgeNoteContent,
    KnowledgeWorkingContent,
} from '@languon/contracts';
import { sql } from 'drizzle-orm';
import {
    check,
    index,
    integer,
    jsonb,
    pgTable,
    primaryKey,
    boolean,
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
        studiedLanguage: text('studied_language'),
        explanationLanguage: text('explanation_language'),
        plainText: text('plain_text').notNull(),
        version: integer('version').notNull().default(1),
        status: text('status')
            .$type<'draft' | 'saved'>()
            .notNull()
            .default('saved'),
        preferredBranchId: uuid('preferred_branch_id'),
        autoTitleEligible: boolean('auto_title_eligible')
            .notNull()
            .default(false),
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
        check('knowledge_notes_version_nonnegative', sql`${t.version} >= 0`),
        check('knowledge_notes_status', sql`${t.status} in ('draft','saved')`),
        check(
            'knowledge_notes_status_version',
            sql`(${t.status} = 'draft' and ${t.version} = 0) or (${t.status} = 'saved' and ${t.version} > 0)`,
        ),
        check(
            'knowledge_notes_title_length',
            sql`(${t.status} = 'draft' and char_length(${t.title}) between 0 and 200) or (${t.status} = 'saved' and char_length(${t.title}) between 1 and 200)`,
        ),
        check(
            'knowledge_notes_summary_length',
            sql`char_length(${t.summary}) between 0 and 1000`,
        ),
        check(
            'knowledge_notes_categories',
            sql`cardinality(${t.categories}) between 0 and 7 and ${t.categories} <@ ARRAY['grammar','vocabulary','usage','pronunciation','etymology','culture','learning-tips']::text[]`,
        ),
        check(
            'knowledge_notes_body_version',
            sql`${t.body}->>'schemaVersion' = '1'`,
        ),
    ],
);
export const knowledgeWorkingBranchesTable = pgTable(
    'knowledge_working_branches',
    {
        id: uuid('id').primaryKey(),
        noteId: uuid('note_id')
            .notNull()
            .references(() => knowledgeNotesTable.id, { onDelete: 'cascade' }),
        version: integer('version').notNull().default(1),
        basePublishedVersion: integer('base_published_version')
            .notNull()
            .default(0),
        content: jsonb('content').$type<KnowledgeWorkingContent>().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    },
    (t) => [
        index('knowledge_working_branches_note_idx').on(t.noteId, t.updatedAt),
        check(
            'knowledge_working_branches_version_positive',
            sql`${t.version} > 0`,
        ),
        check(
            'knowledge_working_branches_base_nonnegative',
            sql`${t.basePublishedVersion} >= 0`,
        ),
    ],
);
export const knowledgeSharesTable = pgTable(
    'knowledge_shares',
    {
        noteId: uuid('note_id')
            .primaryKey()
            .references(() => knowledgeNotesTable.id, { onDelete: 'cascade' }),
        locator: text('locator').notNull().unique(),
        keyDigest: text('key_digest').notNull(),
        version: integer('version').notNull().default(1),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    },
    (t) => [check('knowledge_shares_version_positive', sql`${t.version} > 0`)],
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
