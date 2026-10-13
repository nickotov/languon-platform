import { sql } from 'drizzle-orm';
import {
    pgTable,
    uuid,
    text,
    timestamp,
    jsonb,
    integer,
    bigint,
    index,
    uniqueIndex,
    check,
} from 'drizzle-orm/pg-core';
import type {
    AudioObjectReference,
    SpeechProfile,
    StoredSpeechSource,
} from '../application/ports';
import {
    dictionariesTable,
    dictionaryCardsTable,
} from '../../dictionaries/infrastructure/persistence/drizzle/schema';
import {
    sentenceExercisesTable,
    sentenceAttemptsTable,
} from '../../learning/infrastructure/persistence/drizzle/sentence-schema';
import { usersTable } from '../../users/infrastructure/persistence/drizzle/schema';

const date = (name: string) => timestamp(name, { withTimezone: true });

// Retained global content deliberately has no account/content foreign key.
export const speechRecordingsTable = pgTable(
    'speech_recordings',
    {
        id: uuid('id').primaryKey(),
        canonicalKey: text('canonical_key').notNull(),
        text: text('text').notNull(),
        language: text('language').notNull(),
        normalizationRevision: text('normalization_revision').notNull(),
        profile: jsonb('profile').$type<SpeechProfile>().notNull(),
        state: text('state').notNull(),
        storage: jsonb('storage').$type<AudioObjectReference>().notNull(),
        checksum: text('checksum'),
        byteLength: integer('byte_length'),
        durationMs: integer('duration_ms'),
        deletedAt: date('deleted_at'),
        readyAt: date('ready_at'),
        version: integer('version').notNull().default(1),
        createdAt: date('created_at').notNull(),
        lastAccessedAt: date('last_accessed_at').notNull(),
    },
    (table) => [
        index('speech_recordings_canonical_idx').on(
            table.canonicalKey,
            table.state,
        ),
        check(
            'speech_recordings_state_check',
            sql`${table.state} in ('pending','ready','deleting','deleted','failed')`,
        ),
    ],
);

export const speechJobsTable = pgTable(
    'speech_jobs',
    {
        id: uuid('id').primaryKey(),
        recordingId: uuid('recording_id')
            .notNull()
            .references(() => speechRecordingsTable.id),
        canonicalKey: text('canonical_key').notNull(),
        eligibilityRevision: text('eligibility_revision')
            .notNull()
            .default('intl-word-codepoint-v1'),
        payerId: uuid('payer_id'),
        reservationId: uuid('reservation_id'),
        rateRevisionId: uuid('rate_revision_id'),
        credits: bigint('credits', { mode: 'bigint' }).notNull(),
        estimatedCostUnits: integer('estimated_cost_units')
            .notNull()
            .default(0),
        billingState: text('billing_state').notNull(),
        state: text('state').notNull(),
        taskId: text('task_id'),
        leaseToken: uuid('lease_token'),
        leaseExpiresAt: date('lease_expires_at'),
        nextPollAt: date('next_poll_at').notNull(),
        createdAt: date('created_at').notNull(),
        billingDeadline: date('billing_deadline').notNull(),
        queueDeadline: date('queue_deadline')
            .notNull()
            .default(sql`clock_timestamp() + interval '2 minutes'`),
        recoveryDeadline: date('recovery_deadline').notNull(),
        error: text('error'),
    },
    (table) => [
        check(
            'speech_jobs_estimated_cost_nonnegative',
            sql`${table.estimatedCostUnits} >= 0`,
        ),
        index('speech_jobs_claim_idx').on(table.state, table.nextPollAt),
        uniqueIndex('speech_jobs_single_flight_idx')
            .on(table.canonicalKey)
            .where(
                sql`${table.state} in ('queued','submitting','processing','storing','submission_unknown')`,
            ),
        check(
            'speech_jobs_state_check',
            sql`${table.state} in ('queued','submitting','processing','storing','submission_unknown','ready','failed')`,
        ),
        check(
            'speech_jobs_billing_check',
            sql`${table.billingState} in ('free','reserved','charged_success','released_no_charge')`,
        ),
    ],
);

export const speechBindingsTable = pgTable(
    'speech_bindings',
    {
        id: uuid('id').primaryKey(),
        actorId: uuid('actor_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        dictionaryId: uuid('dictionary_id').references(
            () => dictionariesTable.id,
            { onDelete: 'cascade' },
        ),
        cardId: uuid('card_id').references(() => dictionaryCardsTable.id, {
            onDelete: 'cascade',
        }),
        exerciseId: uuid('exercise_id').references(
            () => sentenceExercisesTable.id,
            { onDelete: 'cascade' },
        ),
        attemptId: uuid('attempt_id').references(
            () => sentenceAttemptsTable.id,
            { onDelete: 'cascade' },
        ),
        operationId: uuid('operation_id').notNull(),
        source: jsonb('source').$type<StoredSpeechSource>().notNull(),
        sourceRevision: text('source_revision').notNull(),
        recordingId: uuid('recording_id')
            .notNull()
            .references(() => speechRecordingsTable.id),
        jobId: uuid('job_id').references(() => speechJobsTable.id),
        createdAt: date('created_at').notNull(),
    },
    (table) => [
        uniqueIndex('speech_bindings_actor_operation_idx').on(
            table.actorId,
            table.operationId,
        ),
        index('speech_bindings_recording_idx').on(table.recordingId),
    ],
);

export const speechQuotesTable = pgTable(
    'speech_quotes',
    {
        id: uuid('id').primaryKey(),
        actorId: uuid('actor_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        operationId: uuid('operation_id').notNull(),
        source: jsonb('source').$type<StoredSpeechSource>().notNull(),
        sourceRevision: text('source_revision').notNull(),
        eligibilityRevision: text('eligibility_revision')
            .notNull()
            .default('intl-word-codepoint-v1'),
        canonicalKey: text('canonical_key').notNull(),
        profile: jsonb('profile').$type<SpeechProfile>().notNull(),
        rateRevisionId: uuid('rate_revision_id'),
        credits: bigint('credits', { mode: 'bigint' }).notNull(),
        characterCount: integer('character_count').notNull(),
        wordCount: integer('word_count').notNull(),
        provisional: integer('provisional').notNull(),
        createdAt: date('created_at').notNull(),
        expiresAt: date('expires_at').notNull(),
        bindingId: uuid('binding_id').references(() => speechBindingsTable.id, {
            onDelete: 'set null',
        }),
    },
    (table) => [
        uniqueIndex('speech_quotes_actor_operation_idx').on(
            table.actorId,
            table.operationId,
        ),
    ],
);
