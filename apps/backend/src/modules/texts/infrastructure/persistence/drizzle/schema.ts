import { sql } from 'drizzle-orm';
import {
    pgTable,
    uuid,
    text,
    integer,
    timestamp,
    jsonb,
    index,
    unique,
    check,
    foreignKey,
} from 'drizzle-orm/pg-core';
import type { TextAlignment, TextDocument } from '@languon/contracts';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';

export const textFoldersTable = pgTable(
    'text_folders',
    {
        id: uuid('id').primaryKey(),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id),
        name: text('name').notNull(),
        description: text('description'),
        lifecycle: text('lifecycle')
            .$type<'active' | 'archived'>()
            .notNull()
            .default('active'),
        version: integer('version').notNull().default(1),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    },
    (t) => [
        index('text_folders_owner_idx').on(t.ownerId, t.lifecycle, t.id),
        unique('text_folders_id_owner_unique').on(t.id, t.ownerId),
        check('text_folders_version_check', sql`${t.version}>0`),
        check(
            'text_folders_lifecycle_check',
            sql`${t.lifecycle} in ('active','archived')`,
        ),
    ],
);

export const textsTable = pgTable(
    'texts',
    {
        id: uuid('id').primaryKey(),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id),
        folderId: uuid('folder_id').references(() => textFoldersTable.id),
        title: text('title').notNull(),
        sourceLanguage: text('source_language').notNull(),
        targetLanguage: text('target_language').notNull(),
        sourceText: text('source_text').notNull(),
        alignment: jsonb('alignment').$type<TextAlignment>(),
        status: text('status')
            .$type<'draft' | 'translated' | 'edited'>()
            .notNull()
            .default('draft'),
        lifecycle: text('lifecycle')
            .$type<'active' | 'archived'>()
            .notNull()
            .default('active'),
        version: integer('version').notNull().default(1),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    },
    (t) => [
        unique('texts_id_owner_unique').on(t.id, t.ownerId),
        index('texts_owner_folder_idx').on(
            t.ownerId,
            t.folderId,
            t.lifecycle,
            t.id,
        ),
        foreignKey({
            name: 'texts_folder_owner_fk',
            columns: [t.folderId, t.ownerId],
            foreignColumns: [textFoldersTable.id, textFoldersTable.ownerId],
        }),
        check('texts_version_check', sql`${t.version}>0`),
        check(
            'texts_languages_check',
            sql`${t.sourceLanguage} <> ${t.targetLanguage}`,
        ),
        check(
            'texts_lifecycle_check',
            sql`${t.lifecycle} in ('active','archived')`,
        ),
        check(
            'texts_source_length_check',
            sql`char_length(${t.sourceText}) <= 20000`,
        ),
        check(
            'texts_status_check',
            sql`(${t.status} = 'draft' and ${t.alignment} is null) or (${t.status} in ('translated','edited') and ${t.alignment} is not null)`,
        ),
    ],
);

export const textRevisionsTable = pgTable(
    'text_revisions',
    {
        id: uuid('id').primaryKey(),
        textId: uuid('text_id')
            .notNull()
            .references(() => textsTable.id),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id),
        version: integer('version').notNull(),
        snapshot: jsonb('snapshot').$type<TextDocument>().notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    },
    (t) => [unique('text_revisions_version_unique').on(t.textId, t.version)],
);

export const textSharesTable = pgTable(
    'text_shares',
    {
        id: uuid('id').primaryKey(),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id),
        kind: text('kind').$type<'text' | 'folder'>().notNull(),
        resourceId: uuid('resource_id').notNull(),
        locator: text('locator').notNull(),
        keyDigest: text('key_digest').notNull(),
        version: integer('version').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    },
    (t) => [
        unique('text_shares_resource_unique').on(t.kind, t.resourceId),
        unique('text_shares_locator_unique').on(t.locator),
        check('text_shares_kind_check', sql`${t.kind} in ('text','folder')`),
        check('text_shares_version_check', sql`${t.version}>0`),
        check(
            'text_shares_digest_check',
            sql`${t.keyDigest} ~ '^hmac-sha256:v[1-9][0-9]*:[A-Za-z0-9_-]{43}$'`,
        ),
    ],
);

export const textIdempotencyTable = pgTable(
    'text_idempotency',
    {
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id),
        key: text('key').notNull(),
        fingerprint: text('fingerprint').notNull(),
        result: jsonb('result').$type<{ id: string }>().notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    },
    (t) => [unique('text_idempotency_owner_key_unique').on(t.ownerId, t.key)],
);
