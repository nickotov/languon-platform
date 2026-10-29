import { sql } from 'drizzle-orm';
import {
    bigint,
    boolean,
    check,
    index,
    integer,
    jsonb,
    pgTable,
    text,
    timestamp,
    unique,
    uuid,
} from 'drizzle-orm/pg-core';
import type {
    ProviderPrice,
    KnowledgeTranscriptionResult,
} from '@languon/contracts';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';
import { aiProviderPriceRevisionsTable } from '../../../../ai-credits/infrastructure/persistence/drizzle/provider-price-schema';
import { knowledgeNotesTable } from './schema';

/** Immutable customer tariff and reviewed execution configuration; no default price or activation. */
export const knowledgeTranscriptionConfigRevisionsTable = pgTable(
    'knowledge_transcription_config_revisions',
    {
        id: uuid('id').primaryKey(),
        version: integer('version').notNull().unique(),
        enabled: boolean('enabled').notNull().default(false),
        processingControlsRevision: text('processing_controls_revision'),
        processingCredentialFingerprint: text(
            'processing_credential_fingerprint',
        ),
        providerPriceRevisionId: uuid('provider_price_revision_id').references(
            () => aiProviderPriceRevisionsTable.id,
        ),
        creditsPerMinute: text('credits_per_minute'),
        maximumDurationMs: integer('maximum_duration_ms').notNull(),
        maximumBytes: integer('maximum_bytes').notNull(),
        maximumProviderCostMicros: integer(
            'maximum_provider_cost_micros',
        ).notNull(),
        billingRulesVerified: boolean('billing_rules_verified')
            .notNull()
            .default(false),
        billingEvidence: text('billing_evidence'),
        dataSharingDisabled: boolean('data_sharing_disabled')
            .notNull()
            .default(false),
        dataSharingEvidence: text('data_sharing_evidence'),
        dataSharingAttestedAt: timestamp('data_sharing_attested_at', {
            withTimezone: true,
        }),
        createdBy: uuid('created_by').references(() => usersTable.id, {
            onDelete: 'set null',
        }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
        reason: text('reason').notNull(),
    },
    (t) => [
        check(
            'knowledge_transcription_config_limits',
            sql`${t.version}>0 and ${t.maximumDurationMs} between 1 and 1800000 and ${t.maximumBytes} between 1 and 5242880 and ${t.maximumProviderCostMicros}>0`,
        ),
        check(
            'knowledge_transcription_config_credit_rate',
            sql`${t.creditsPerMinute} is null or ${t.creditsPerMinute} ~ '^(0|[1-9][0-9]{0,12})(\\.[0-9]{1,3})?$'`,
        ),
        check(
            'knowledge_transcription_config_enable',
            sql`not ${t.enabled} or (${t.providerPriceRevisionId} is not null and ${t.creditsPerMinute} is not null and ${t.billingRulesVerified} and ${t.billingEvidence} is not null and char_length(${t.billingEvidence}) between 5 and 2000)`,
        ),
        check(
            'knowledge_transcription_config_reason',
            sql`char_length(${t.reason}) between 5 and 500`,
        ),
    ],
);
export const knowledgeTranscriptionStateTable = pgTable(
    'knowledge_transcription_state',
    {
        id: text('id').primaryKey(),
        activeRevisionId: uuid('active_revision_id')
            .notNull()
            .references(() => knowledgeTranscriptionConfigRevisionsTable.id),
    },
    (t) => [
        check('knowledge_transcription_state_singleton', sql`${t.id}='global'`),
    ],
);

export const knowledgeTranscriptionJobsTable = pgTable(
    'knowledge_transcription_jobs',
    {
        id: uuid('id').primaryKey(),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        noteId: uuid('note_id')
            .notNull()
            .references(() => knowledgeNotesTable.id, { onDelete: 'cascade' }),
        assetId: uuid('asset_id').notNull(),
        fingerprint: text('fingerprint').notNull(),
        checksum: text('checksum').notNull(),
        languages: jsonb('languages').$type<string[]>().notNull(),
        processingControlsRevision: text('processing_controls_revision'),
        processingCredentialFingerprint: text(
            'processing_credential_fingerprint',
        ),
        configurationRevisionId: uuid('configuration_revision_id')
            .notNull()
            .references(() => knowledgeTranscriptionConfigRevisionsTable.id),
        providerPriceSnapshot: jsonb('provider_price_snapshot')
            .$type<ProviderPrice>()
            .notNull(),
        sourceDurationMs: integer('source_duration_ms').notNull(),
        byteLength: integer('byte_length').notNull(),
        maximumCreditsMilli: bigint('maximum_credits_milli', {
            mode: 'bigint',
        }).notNull(),
        state: text('state')
            .$type<
                | 'confirmation-required'
                | 'queued'
                | 'running'
                | 'completed'
                | 'failed'
                | 'cancelled'
            >()
            .notNull(),
        workerId: text('worker_id'),
        fencingToken: integer('fencing_token').notNull().default(0),
        leaseDeadline: timestamp('lease_deadline', { withTimezone: true }),
        deadlineAt: timestamp('deadline_at', { withTimezone: true }).notNull(),
        cancellationRequestedAt: timestamp('cancellation_requested_at', {
            withTimezone: true,
        }),
        receiptId: uuid('receipt_id'),
        attemptId: uuid('attempt_id'),
        dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
        observedAudioInputMs: bigint('observed_audio_input_ms', {
            mode: 'number',
        }),
        result: jsonb('result').$type<KnowledgeTranscriptionResult>(),
        failureCode: text('failure_code'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    },
    (t) => [
        index('knowledge_transcription_queue_idx').on(t.state, t.createdAt),
        index('knowledge_transcription_note_idx').on(t.noteId, t.ownerId),
        check(
            'knowledge_transcription_job_state',
            sql`${t.state} in ('confirmation-required','queued','running','completed','failed','cancelled')`,
        ),
        check(
            'knowledge_transcription_job_source_bounds',
            sql`${t.sourceDurationMs} between 1 and 1800000 and ${t.byteLength} between 1 and 5242880 and ${t.maximumCreditsMilli} between 0 and 9007199254740991 and ${t.fencingToken}>=0`,
        ),
        check(
            'knowledge_transcription_job_result',
            sql`(${t.state}='completed' and ${t.result} is not null) or (${t.state}<>'completed' and ${t.result} is null)`,
        ),
    ],
);
/** Content-free terminal identity prevents deleted operations being recreated under a new source. */
export const knowledgeTranscriptionReceiptsTable = pgTable(
    'knowledge_transcription_operation_receipts',
    {
        id: uuid('id').primaryKey(),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        fingerprint: text('fingerprint').notNull(),
        noteId: uuid('note_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    },
    (t) => [
        unique('knowledge_transcription_owner_receipt').on(t.ownerId, t.id),
    ],
);
