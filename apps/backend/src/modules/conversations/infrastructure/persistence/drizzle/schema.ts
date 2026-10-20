import { sql } from 'drizzle-orm';
import {
    pgTable,
    uuid,
    text,
    integer,
    timestamp,
    jsonb,
    boolean,
    index,
    uniqueIndex,
    check,
    bigserial,
} from 'drizzle-orm/pg-core';
import type {
    ChatPreferences,
    ConversationSource,
    CopiedAttachment,
    KnowledgeNoteContent,
    ConversationToolCall,
    ConversationEditorTarget,
} from '@languon/contracts';
import type {
    ConversationSourceSnapshot,
    SourceAuthority,
} from '../../../domain/conversation';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import type { TutorMemoryMessage } from '../../../application/ports/tutor-runner';

const time = (name: string) =>
    timestamp(name, { withTimezone: true }).notNull();
export const conversationsTable = pgTable(
    'conversation_chats',
    {
        id: uuid('id').primaryKey(),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        sourceKind: text('source_kind')
            .notNull()
            .$type<ConversationSource['kind']>(),
        sourceId: uuid('source_id').notNull(),
        source: jsonb('source').notNull().$type<ConversationSource>(),
        title: text('title'),
        preferences: jsonb('preferences').notNull().$type<ChatPreferences>(),
        version: integer('version').notNull().default(1),
        createdAt: time('created_at'),
        updatedAt: time('updated_at'),
    },
    (t) => [
        index('conversation_source_idx').on(t.sourceKind, t.sourceId),
        index('conversation_owner_source_idx').on(
            t.ownerId,
            t.sourceKind,
            t.sourceId,
            t.updatedAt,
        ),
        check(
            'conversation_source_kind_check',
            sql`${t.sourceKind} in ('dictionary','text','knowledge')`,
        ),
    ],
);

export const conversationTurnsTable = pgTable(
    'conversation_turns',
    {
        id: uuid('id').primaryKey(),
        conversationId: uuid('conversation_id')
            .notNull()
            .references(() => conversationsTable.id, { onDelete: 'cascade' }),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        requestId: uuid('request_id').notNull(),
        requestFingerprint: text('request_fingerprint').notNull(),
        status: text('status')
            .notNull()
            .$type<
                'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
            >(),
        authority: jsonb('authority').notNull().$type<SourceAuthority>(),
        sourceSnapshot: jsonb('source_snapshot')
            .notNull()
            .$type<ConversationSourceSnapshot>(),
        preferences: jsonb('preferences').notNull().$type<ChatPreferences>(),
        execution: jsonb('execution')
            .notNull()
            .$type<Record<string, unknown>>(),
        failureCode: text('failure_code'),
        leaseToken: uuid('lease_token'),
        leaseUntil: timestamp('lease_until', { withTimezone: true }),
        cancelRequested: boolean('cancel_requested').notNull().default(false),
        providerDispatched: boolean('provider_dispatched')
            .notNull()
            .default(false),
        usage: jsonb('usage').notNull().$type<{
            inputTokens: number;
            outputTokens: number;
            chargedCredits: string;
            estimated: boolean;
        }>(),
        createdAt: time('created_at'),
        updatedAt: time('updated_at'),
    },
    (t) => [
        uniqueIndex('conversation_request_unique').on(
            t.conversationId,
            t.requestId,
        ),
        uniqueIndex('conversation_one_active_turn')
            .on(t.conversationId)
            .where(sql`${t.status} in ('queued','running')`),
        index('conversation_queue_idx').on(t.status, t.createdAt),
        check(
            'conversation_turn_status_check',
            sql`${t.status} in ('queued','running','succeeded','failed','cancelled')`,
        ),
    ],
);

export const conversationMessagesTable = pgTable(
    'conversation_messages',
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
        role: text('role').notNull().$type<'user' | 'assistant'>(),
        content: text('content').notNull(),
        attachments: jsonb('attachments').notNull().$type<CopiedAttachment[]>(),
        toolCalls: jsonb('tool_calls')
            .notNull()
            .default([])
            .$type<ConversationToolCall[]>(),
        modelContent: jsonb('model_content').$type<TutorMemoryMessage[]>(),
        editorTarget: jsonb('editor_target').$type<ConversationEditorTarget>(),
        status: text('status')
            .notNull()
            .$type<'complete' | 'streaming' | 'incomplete'>(),
        sourceVersion: text('source_version').notNull(),
        sourceProvenance: text('source_provenance')
            .notNull()
            .$type<'saved' | 'draft'>(),
        createdAt: time('created_at'),
    },
    (t) => [
        index('conversation_history_idx').on(t.conversationId, t.createdAt),
        uniqueIndex('conversation_turn_role_unique').on(t.turnId, t.role),
        check(
            'conversation_message_role_check',
            sql`${t.role} in ('user','assistant')`,
        ),
    ],
);

export const conversationEventsTable = pgTable(
    'conversation_events',
    {
        id: bigserial('id', { mode: 'number' }).primaryKey(),
        conversationId: uuid('conversation_id')
            .notNull()
            .references(() => conversationsTable.id, { onDelete: 'cascade' }),
        type: text('type')
            .notNull()
            .$type<
                'message' | 'turn' | 'draft' | 'snapshot' | 'draft-deleted'
            >(),
        data: jsonb('data').notNull().$type<Record<string, unknown>>(),
        createdAt: time('created_at'),
    },
    (t) => [
        index('conversation_event_replay_idx').on(t.conversationId, t.id),
        index('conversation_event_expiry_idx').on(t.createdAt),
    ],
);

export const conversationDraftsTable = pgTable(
    'conversation_drafts',
    {
        id: uuid('id').primaryKey(),
        conversationId: uuid('conversation_id')
            .notNull()
            .references(() => conversationsTable.id, { onDelete: 'cascade' }),
        version: integer('version').notNull().default(1),
        targetNoteId: uuid('target_note_id'),
        expectedNoteVersion: integer('expected_note_version'),
        content: jsonb('content').notNull().$type<KnowledgeNoteContent>(),
        publishedAt: timestamp('published_at', { withTimezone: true }),
        publicationOperationId: uuid('publication_operation_id'),
        createdAt: time('created_at'),
        updatedAt: time('updated_at'),
    },
    (t) => [index('conversation_draft_idx').on(t.conversationId)],
);

export const conversationMemoryTable = pgTable(
    'conversation_memory',
    {
        conversationId: uuid('conversation_id')
            .notNull()
            .references(() => conversationsTable.id, { onDelete: 'cascade' }),
        key: text('key').notNull(),
        value: jsonb('value').notNull().$type<unknown>(),
        updatedAt: time('updated_at'),
    },
    (t) => [
        uniqueIndex('conversation_memory_key_unique').on(
            t.conversationId,
            t.key,
        ),
    ],
);

export const conversationSettingsTable = pgTable('conversation_settings', {
    ownerId: uuid('owner_id')
        .primaryKey()
        .references(() => usersTable.id, { onDelete: 'cascade' }),
    preferences: jsonb('preferences').notNull().$type<ChatPreferences>(),
    updatedAt: time('updated_at'),
});
