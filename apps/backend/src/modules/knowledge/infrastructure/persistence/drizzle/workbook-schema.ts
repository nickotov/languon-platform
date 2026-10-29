import { sql } from 'drizzle-orm';
import {
    check,
    index,
    integer,
    pgTable,
    text,
    timestamp,
    uuid,
} from 'drizzle-orm/pg-core';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { knowledgeNotesTable } from './schema';

export const knowledgeWorkbooksTable = pgTable(
    'knowledge_workbooks',
    {
        id: uuid('id').primaryKey(),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id),
        title: text('title').notNull(),
        version: integer('version').notNull().default(1),
        deletedAt: timestamp('deleted_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    },
    (t) => [
        index('knowledge_workbooks_owner_idx').on(t.ownerId, t.updatedAt),
        check('knowledge_workbooks_version', sql`${t.version}>0`),
        check(
            'knowledge_workbooks_title',
            sql`(${t.deletedAt} is not null and ${t.title}='') or (${t.deletedAt} is null and char_length(${t.title}) between 1 and 200)`,
        ),
    ],
);
export const knowledgeWorkbookNotesTable = pgTable(
    'knowledge_workbook_notes',
    {
        noteId: uuid('note_id')
            .primaryKey()
            .references(() => knowledgeNotesTable.id, { onDelete: 'cascade' }),
        workbookId: uuid('workbook_id')
            .notNull()
            .references(() => knowledgeWorkbooksTable.id, {
                onDelete: 'cascade',
            }),
        position: integer('position').notNull(),
    },
    (t) => [
        index('knowledge_workbook_notes_order_idx').on(
            t.workbookId,
            t.position,
        ),
        check(
            'knowledge_workbook_notes_position',
            sql`${t.position} between 0 and 499`,
        ),
    ],
);
export const knowledgeWorkbookSharesTable = pgTable(
    'knowledge_workbook_shares',
    {
        workbookId: uuid('workbook_id')
            .primaryKey()
            .references(() => knowledgeWorkbooksTable.id, {
                onDelete: 'cascade',
            }),
        locator: text('locator').notNull().unique(),
        keyDigest: text('key_digest').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    },
);
