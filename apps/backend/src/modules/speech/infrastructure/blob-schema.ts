import { customType, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';

// Retain the physical name and namespace used by current stored references.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
    dataType: () => 'bytea',
});
export const speechAudioBlobsTable = pgTable(
    'dictionary_audio_blobs',
    {
        key: text('key').notNull(),
        namespace: text('namespace').notNull(),
        bytes: bytea('bytes').notNull(),
        mimeType: text('mime_type').notNull(),
        checksum: text('checksum').notNull(),
    },
    (table) => [primaryKey({ columns: [table.namespace, table.key] })],
);
