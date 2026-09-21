import {
    check,
    customType,
    integer,
    index,
    jsonb,
    pgTable,
    primaryKey,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { SpeechProfile } from '../../../application/ports/speech-synthesis-provider';
import type { AudioObjectReference } from '../../../application/ports/audio-object-storage';

// Deliberately no cascading owner/card FK: remote-object inventory must survive
// domain removal until physical deletion has been verified by the purge worker.
export const dictionaryAudioAssetsTable = pgTable(
    'dictionary_audio_assets',
    {
        id: uuid('id').primaryKey(),
        ownerId: uuid('owner_id').notNull(),
        dictionaryId: uuid('dictionary_id').notNull(),
        cardId: uuid('card_id').notNull(),
        field: text('field').notNull(),
        fingerprint: text('fingerprint').notNull(),
        storage: jsonb('storage').$type<AudioObjectReference>().notNull(),
        state: text('state').notNull(),
        checksum: text('checksum'),
        mimeType: text('mime_type'),
        byteLength: integer('byte_length'),
        writerExpiresAt: timestamp('writer_expires_at', { withTimezone: true }),
        lastAccessedAt: timestamp('last_accessed_at', {
            withTimezone: true,
        }).notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    },
    (table) => [
        index('dictionary_audio_assets_owner_idx').on(table.ownerId),
        index('dictionary_audio_assets_retention_idx').on(
            table.state,
            table.lastAccessedAt,
        ),
        check(
            'dictionary_audio_asset_state',
            sql`${table.state} in ('pending','ready','deleting')`,
        ),
    ],
);
export const dictionaryAudioJobsTable = pgTable(
    'dictionary_audio_jobs',
    {
        id: uuid('id').primaryKey(),
        ownerId: uuid('owner_id').notNull(),
        dictionaryId: uuid('dictionary_id').notNull(),
        cardId: uuid('card_id').notNull(),
        field: text('field').notNull(),
        fingerprint: text('fingerprint').notNull(),
        assetId: uuid('asset_id').notNull(),
        text: text('text').notNull(),
        profile: jsonb('profile').$type<SpeechProfile>().notNull(),
        state: text('state').notNull(),
        cardVersion: integer('card_version').notNull(),
        settingsVersion: integer('settings_version').notNull(),
        taskId: text('task_id'),
        leaseToken: uuid('lease_token'),
        leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
        nextPollAt: timestamp('next_poll_at', { withTimezone: true }).notNull(),
        deadlineAt: timestamp('deadline_at', { withTimezone: true }).notNull(),
        reservedCost: integer('reserved_cost').notNull(),
        error: text('error'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    },
    (table) => [
        index('dictionary_audio_jobs_claim_idx').on(
            table.state,
            table.nextPollAt,
        ),
        index('dictionary_audio_jobs_budget_idx').on(
            table.ownerId,
            table.createdAt,
        ),
        index('dictionary_audio_jobs_created_at_idx').on(table.createdAt),
        uniqueIndex('dictionary_audio_jobs_asset_unique').on(table.assetId),
        check(
            'dictionary_audio_job_state',
            sql`${table.state} in ('queued','submitting','waiting_provider','storing','ready','failed','cancelled','submission_unknown')`,
        ),
        check(
            'dictionary_audio_job_field',
            sql`${table.field} in ('source','translation','example','exampleTranslation')`,
        ),
        check(
            'dictionary_audio_job_reserved_cost',
            sql`${table.reservedCost} >= 0`,
        ),
    ],
);
export const dictionaryAudioBindingsTable = pgTable(
    'dictionary_audio_bindings',
    {
        id: uuid('id').primaryKey(),
        ownerId: uuid('owner_id').notNull(),
        cardId: uuid('card_id').notNull(),
        field: text('field').notNull(),
        fingerprint: text('fingerprint').notNull(),
        jobId: uuid('job_id').notNull(),
    },
    (table) => [
        index('dictionary_audio_bindings_job_idx').on(table.jobId),
        uniqueIndex('dictionary_audio_binding_content_unique').on(
            table.ownerId,
            table.cardId,
            table.field,
            table.fingerprint,
        ),
    ],
);
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
    dataType: () => 'bytea',
});
export const dictionaryAudioBlobsTable = pgTable(
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
