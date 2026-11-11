import type {
    ApplyDictionaryChatSnippetResponse,
    DictionaryCardValues,
    DictionaryChatGenerationContext,
} from '@languon/contracts';
import { sql } from 'drizzle-orm';
import {
    check,
    index,
    jsonb,
    pgTable,
    text,
    timestamp,
    uuid,
} from 'drizzle-orm/pg-core';
import { dictionariesTable } from '../../../../dictionaries/infrastructure/persistence/drizzle/schema';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { conversationsTable, conversationTurnsTable } from './schema';

export const conversationDictionarySnippetsTable = pgTable(
    'conversation_dictionary_snippets',
    {
        id: uuid('id').primaryKey(),
        conversationId: uuid('conversation_id')
            .notNull()
            .references(() => conversationsTable.id, { onDelete: 'cascade' }),
        turnId: uuid('turn_id')
            .notNull()
            .references(() => conversationTurnsTable.id, {
                onDelete: 'cascade',
            }),
        dictionaryId: uuid('dictionary_id')
            .notNull()
            .references(() => dictionariesTable.id, { onDelete: 'cascade' }),
        title: text('title').notNull(),
        cards: jsonb('cards').$type<DictionaryCardValues[]>().notNull(),
        generationContext: jsonb('generation_context')
            .$type<DictionaryChatGenerationContext>()
            .notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    },
    (table) => [
        index('conversation_dictionary_snippets_chat_created_idx').on(
            table.conversationId,
            table.createdAt,
        ),
        check(
            'conversation_dictionary_snippets_title',
            sql`char_length(${table.title}) between 1 and 200`,
        ),
        check(
            'conversation_dictionary_snippets_cards',
            sql`jsonb_typeof(${table.cards}) = 'array' and jsonb_array_length(${table.cards}) between 1 and 100`,
        ),
    ],
);

export const dictionaryChatSnippetApplicationsTable = pgTable(
    'dictionary_chat_snippet_applications',
    {
        operationId: uuid('operation_id').primaryKey(),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        snippetId: uuid('snippet_id')
            .notNull()
            .references(() => conversationDictionarySnippetsTable.id, {
                onDelete: 'cascade',
            }),
        fingerprint: text('fingerprint').notNull(),
        result: jsonb('result')
            .$type<ApplyDictionaryChatSnippetResponse>()
            .notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    },
);
