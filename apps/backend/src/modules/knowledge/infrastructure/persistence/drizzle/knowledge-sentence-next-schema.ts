import {
    pgTable,
    uuid,
    text,
    jsonb,
    timestamp,
    primaryKey,
    index,
} from 'drizzle-orm/pg-core';
import type { SentenceNextResponse } from '@languon/contracts';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { knowledgeNotesTable } from './schema';
export const knowledgeSentenceNextReceiptsTable = pgTable(
    'knowledge_sentence_next_receipts',
    {
        actorId: uuid('actor_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        operationId: uuid('operation_id').notNull(),
        noteId: uuid('note_id')
            .notNull()
            .references(() => knowledgeNotesTable.id, { onDelete: 'cascade' }),
        blockId: uuid('block_id').notNull(),
        requestFingerprint: text('request_fingerprint').notNull(),
        result: jsonb('result').$type<SentenceNextResponse | null>(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.actorId, t.operationId] }),
        index('knowledge_sentence_next_note').on(t.noteId),
    ],
);
