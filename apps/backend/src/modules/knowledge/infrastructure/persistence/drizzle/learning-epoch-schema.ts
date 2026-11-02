import { sql } from 'drizzle-orm';
import {
    boolean,
    check,
    index,
    integer,
    pgTable,
    primaryKey,
    text,
    uuid,
} from 'drizzle-orm/pg-core';
import { knowledgeNotesTable } from './schema';

/** Published identity history includes tombstones; draft edits never advance it. */
export const knowledgeLearningEpochsTable = pgTable(
    'knowledge_learning_epochs',
    {
        noteId: uuid('note_id')
            .notNull()
            .references(() => knowledgeNotesTable.id, { onDelete: 'cascade' }),
        kind: text('kind').$type<'exercise' | 'vocabulary'>().notNull(),
        blockId: uuid('block_id').notNull(),
        itemId: uuid('item_id').notNull(),
        epoch: integer('epoch').notNull(),
        semanticFingerprint: text('semantic_fingerprint').notNull(),
        active: boolean('active').notNull(),
        lastPublishedVersion: integer('last_published_version').notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.noteId, t.kind, t.blockId, t.itemId] }),
        index('knowledge_learning_epochs_active_note_idx')
            .on(t.noteId)
            .where(sql`${t.active}`),
        check(
            'knowledge_learning_epochs_kind',
            sql`${t.kind} in ('exercise','vocabulary')`,
        ),
        check('knowledge_learning_epochs_epoch_positive', sql`${t.epoch} > 0`),
        check(
            'knowledge_learning_epochs_published_positive',
            sql`${t.lastPublishedVersion} > 0`,
        ),
        check(
            'knowledge_learning_epochs_fingerprint',
            sql`${t.semanticFingerprint} ~ '^[0-9a-f]{64}$'`,
        ),
    ],
);
