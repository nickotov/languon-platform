import { sql } from 'drizzle-orm';
import {
    check,
    customType,
    index,
    integer,
    pgTable,
    text,
    timestamp,
    uuid,
} from 'drizzle-orm/pg-core';
import { knowledgeNotesTable } from './schema';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
    dataType: () => 'bytea',
});

export const knowledgeMediaBlobsTable = pgTable(
    'knowledge_media_blobs',
    {
        id: uuid('id').primaryKey(),
        bytes: bytea('bytes').notNull(),
        mimeType: text('mime_type')
            .$type<'audio/wav' | 'audio/mpeg'>()
            .notNull(),
        checksum: text('checksum').notNull(),
        durationMs: integer('duration_ms').notNull(),
    },
    (t) => [
        check(
            'knowledge_media_blob_size',
            sql`octet_length(${t.bytes}) between 1 and 5242880`,
        ),
        check(
            'knowledge_media_blob_duration',
            sql`${t.durationMs} between 1 and 1800000`,
        ),
        check(
            'knowledge_media_blob_type',
            sql`${t.mimeType} in ('audio/wav','audio/mpeg')`,
        ),
    ],
);
/** A fresh destination grant survives removal of every source-note grant. */
export const knowledgeMediaAssetsTable = pgTable(
    'knowledge_media_assets',
    {
        id: uuid('id').primaryKey(),
        noteId: uuid('note_id')
            .notNull()
            .references(() => knowledgeNotesTable.id, { onDelete: 'cascade' }),
        blobId: uuid('blob_id')
            .notNull()
            .references(() => knowledgeMediaBlobsTable.id),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    },
    (t) => [
        index('knowledge_media_assets_note_idx').on(t.noteId),
        index('knowledge_media_assets_blob_idx').on(t.blobId),
    ],
);
