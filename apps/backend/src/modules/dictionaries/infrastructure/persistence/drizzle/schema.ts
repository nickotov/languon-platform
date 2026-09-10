import { sql } from 'drizzle-orm';
import {
    type AnyPgColumn,
    bigint,
    boolean,
    check,
    foreignKey,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    text,
    timestamp,
    unique,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';

import type {
    DictionaryImportPairsGenerationAcceptedOutcome,
    DictionaryImportPairsGenerationProposal,
    DictionaryPastedTermsGenerationAcceptedOutcome,
    DictionaryPastedTermsGenerationProposal,
    ImportDictionaryResponse,
} from '@languon/contracts';

import type { DictionaryImportPairsGenerationProposalPayload } from '../../../domain/batch-generation';
import type { DictionaryCardAuthoringProposalPayload } from '../../../domain/card-authoring';
import type { DictionaryCardRevisionSnapshot } from '../../../domain/revision';
import { dictionaryGenerationMinimumSupportedInputTokens } from '../../../application/ports/dictionary-generation-provider-policy';
import type {
    DictionaryGenerationInputPayload,
    DictionaryGenerationProposalPayload,
} from '../../../domain/generation';
import { usersTable } from '../../../../users/infrastructure/persistence/drizzle/schema';

const versionedDigestCheck = (column: AnyPgColumn) =>
    sql`char_length(${column}) between 58 and 64 and ${column} ~ '^hmac-sha256:v[1-9][0-9]*:[A-Za-z0-9_-]{43}$'`;

export const dictionaryVisibilityEnum = pgEnum('dictionary_visibility', [
    'private',
    'unlisted',
]);

export const dictionaryLifecycleEnum = pgEnum('dictionary_lifecycle', [
    'active',
    'archived',
]);

export const dictionaryEnablementEnum = pgEnum('dictionary_enablement', [
    'enabled',
    'disabled',
]);

export const dictionaryLanguageRoleEnum = pgEnum('dictionary_language_role', [
    'source',
    'target',
]);

export const dictionaryTranscriptionNotationEnum = pgEnum(
    'dictionary_transcription_notation',
    ['ipa', 'romanization', 'custom'],
);

export const dictionaryCardAuthorshipEnum = pgEnum(
    'dictionary_card_authorship',
    ['human', 'ai-generated', 'mixed'],
);

export const dictionaryCardMutationKindEnum = pgEnum(
    'dictionary_card_mutation_kind',
    [
        'manual_create',
        'manual_edit',
        'deterministic_import',
        'ai_create',
        'ai_proposal_accept',
        'fork',
    ],
);

export const dictionaryIdempotencyOperationEnum = pgEnum(
    'dictionary_idempotency_operation',
    ['create', 'fork', 'bulk_commit'],
);

export const dictionaryIdempotencyStateEnum = pgEnum(
    'dictionary_idempotency_state',
    ['in_progress', 'completed'],
);

export const dictionaryGenerationExecutionStateEnum = pgEnum(
    'dictionary_generation_execution_state',
    ['queued', 'running', 'completed', 'failed', 'cancelled', 'expired'],
);

export const dictionaryGenerationReviewStateEnum = pgEnum(
    'dictionary_generation_review_state',
    ['reviewable', 'accepted', 'discarded', 'expired'],
);

export const dictionariesTable = pgTable(
    'dictionaries',
    {
        archivedAt: timestamp('archived_at', {
            mode: 'date',
            withTimezone: true,
        }),
        createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        description: text('description'),
        id: uuid('id').primaryKey(),
        lifecycle: dictionaryLifecycleEnum('lifecycle')
            .default('active')
            .notNull(),
        name: text('name').notNull(),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        shareKeyDigest: text('share_key_digest'),
        shareKeyRotatedAt: timestamp('share_key_rotated_at', {
            mode: 'date',
            withTimezone: true,
        }),
        shareKeyVersion: integer('share_key_version'),
        shareLocator: text('share_locator'),
        sourceDictionaryId: uuid('source_dictionary_id').references(
            (): AnyPgColumn => dictionariesTable.id,
            { onDelete: 'set null' },
        ),
        sourceLanguageTag: text('source_language_tag').notNull(),
        targetLanguageTag: text('target_language_tag').notNull(),
        updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        version: integer('version').default(1).notNull(),
        visibility: dictionaryVisibilityEnum('visibility')
            .default('private')
            .notNull(),
    },
    (table) => [
        check(
            'dictionaries_name_length',
            sql`${table.name} = btrim(${table.name}) and char_length(${table.name}) between 1 and 120`,
        ),
        check(
            'dictionaries_description_length',
            sql`${table.description} is null or (${table.description} = btrim(${table.description}) and char_length(${table.description}) between 1 and 2000)`,
        ),
        check(
            'dictionaries_language_tags_bounded',
            sql`char_length(${table.sourceLanguageTag}) between 2 and 35 and char_length(${table.targetLanguageTag}) between 2 and 35 and ${table.sourceLanguageTag} !~ '\\s' and ${table.targetLanguageTag} !~ '\\s'`,
        ),
        check(
            'dictionaries_language_pair_distinct',
            sql`${table.sourceLanguageTag} <> ${table.targetLanguageTag}`,
        ),
        check('dictionaries_version_positive', sql`${table.version} > 0`),
        check(
            'dictionaries_archive_state',
            sql`(${table.lifecycle} = 'archived') = (${table.archivedAt} is not null) and (${table.archivedAt} is null or ${table.archivedAt} >= ${table.createdAt}) and (${table.lifecycle} = 'active' or ${table.visibility} = 'private')`,
        ),
        check(
            'dictionaries_share_state',
            sql`(${table.visibility} = 'private' and ${table.shareLocator} is null and ${table.shareKeyDigest} is null and ${table.shareKeyVersion} is null and ${table.shareKeyRotatedAt} is null) or (${table.visibility} = 'unlisted' and ${table.lifecycle} = 'active' and ${table.shareLocator} is not null and ${table.shareKeyDigest} is not null and ${table.shareKeyVersion} > 0 and ${table.shareKeyRotatedAt} is not null)`,
        ),
        check(
            'dictionaries_share_locator_format',
            sql`${table.shareLocator} is null or (char_length(${table.shareLocator}) between 22 and 64 and ${table.shareLocator} ~ '^[A-Za-z0-9_-]+$')`,
        ),
        check(
            'dictionaries_share_digest_format',
            sql`${table.shareKeyDigest} is null or (${versionedDigestCheck(table.shareKeyDigest)})`,
        ),
        check(
            'dictionaries_source_not_self',
            sql`${table.sourceDictionaryId} is null or ${table.sourceDictionaryId} <> ${table.id}`,
        ),
        check(
            'dictionaries_timestamps_ordered',
            sql`${table.updatedAt} >= ${table.createdAt} and (${table.shareKeyRotatedAt} is null or ${table.shareKeyRotatedAt} >= ${table.createdAt})`,
        ),
        unique('dictionaries_id_owner_unique').on(table.id, table.ownerId),
        uniqueIndex('dictionaries_share_locator_unique')
            .on(table.shareLocator)
            .where(sql`${table.shareLocator} is not null`),
        index('dictionaries_share_digest_idx')
            .on(table.shareKeyDigest)
            .where(sql`${table.shareKeyDigest} is not null`),
        index('dictionaries_owner_lifecycle_updated_idx').on(
            table.ownerId,
            table.lifecycle,
            table.updatedAt,
            table.id,
        ),
        index('dictionaries_source_dictionary_idx')
            .on(table.sourceDictionaryId)
            .where(sql`${table.sourceDictionaryId} is not null`),
    ],
);

export const dictionarySettingsTable = pgTable(
    'dictionary_settings',
    {
        createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        customNotationLabel: text('custom_notation_label'),
        definitionEnabled: boolean('definition_enabled')
            .default(false)
            .notNull(),
        definitionLanguageRole: dictionaryLanguageRoleEnum(
            'definition_language_role',
        )
            .default('source')
            .notNull(),
        dictionaryId: uuid('dictionary_id')
            .primaryKey()
            .references(() => dictionariesTable.id, { onDelete: 'cascade' }),
        exampleEnabled: boolean('example_enabled').default(true).notNull(),
        exampleLanguageRole: dictionaryLanguageRoleEnum('example_language_role')
            .default('source')
            .notNull(),
        exampleTranslationEnabled: boolean('example_translation_enabled')
            .default(true)
            .notNull(),
        transcriptionEnabled: boolean('transcription_enabled')
            .default(false)
            .notNull(),
        transcriptionNotation: dictionaryTranscriptionNotationEnum(
            'transcription_notation',
        )
            .default('ipa')
            .notNull(),
        updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        version: integer('version').default(1).notNull(),
    },
    (table) => [
        check(
            'dictionary_settings_custom_label_length',
            sql`${table.customNotationLabel} is null or (${table.customNotationLabel} = btrim(${table.customNotationLabel}) and char_length(${table.customNotationLabel}) between 1 and 40)`,
        ),
        check(
            'dictionary_settings_custom_label_required',
            sql`not (${table.transcriptionEnabled} = true and ${table.transcriptionNotation} = 'custom' and ${table.customNotationLabel} is null)`,
        ),
        check(
            'dictionary_settings_version_positive',
            sql`${table.version} > 0`,
        ),
        check(
            'dictionary_settings_timestamps_ordered',
            sql`${table.updatedAt} >= ${table.createdAt}`,
        ),
    ],
);

export const dictionaryCardsTable = pgTable(
    'dictionary_cards',
    {
        archivedAt: timestamp('archived_at', {
            mode: 'date',
            withTimezone: true,
        }),
        authorship: dictionaryCardAuthorshipEnum('authorship').notNull(),
        createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        customNotationLabelOverride: text('custom_notation_label_override'),
        definition: text('definition'),
        definitionEnabledOverride: dictionaryEnablementEnum(
            'definition_enabled_override',
        ),
        definitionLanguageRoleOverride: dictionaryLanguageRoleEnum(
            'definition_language_role_override',
        ),
        dictionaryId: uuid('dictionary_id')
            .notNull()
            .references(() => dictionariesTable.id, { onDelete: 'cascade' }),
        example: text('example'),
        exampleEnabledOverride: dictionaryEnablementEnum(
            'example_enabled_override',
        ),
        exampleLanguageRoleOverride: dictionaryLanguageRoleEnum(
            'example_language_role_override',
        ),
        exampleTranslation: text('example_translation'),
        exampleTranslationEnabledOverride: dictionaryEnablementEnum(
            'example_translation_enabled_override',
        ),
        id: uuid('id').primaryKey(),
        lifecycle: dictionaryLifecycleEnum('lifecycle')
            .default('active')
            .notNull(),
        normalizedSource: text('normalized_source').notNull(),
        sortKey: bigint('sort_key', { mode: 'bigint' }).notNull(),
        source: text('source').notNull(),
        transcription: text('transcription'),
        transcriptionEnabledOverride: dictionaryEnablementEnum(
            'transcription_enabled_override',
        ),
        transcriptionNotationOverride: dictionaryTranscriptionNotationEnum(
            'transcription_notation_override',
        ),
        translation: text('translation').notNull(),
        updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        version: integer('version').default(1).notNull(),
    },
    (table) => [
        check(
            'dictionary_cards_required_values_length',
            sql`${table.source} = btrim(${table.source}) and char_length(${table.source}) between 1 and 200 and ${table.translation} = btrim(${table.translation}) and char_length(${table.translation}) between 1 and 200`,
        ),
        check(
            'dictionary_cards_normalized_source_length',
            sql`${table.normalizedSource} = btrim(${table.normalizedSource}) and char_length(${table.normalizedSource}) between 1 and 200`,
        ),
        check(
            'dictionary_cards_short_optional_values_length',
            sql`(${table.transcription} is null or char_length(${table.transcription}) between 1 and 200) and (${table.customNotationLabelOverride} is null or (${table.customNotationLabelOverride} = btrim(${table.customNotationLabelOverride}) and char_length(${table.customNotationLabelOverride}) between 1 and 40))`,
        ),
        check(
            'dictionary_cards_long_optional_values_length',
            sql`(${table.definition} is null or char_length(${table.definition}) between 1 and 2000) and (${table.example} is null or char_length(${table.example}) between 1 and 2000) and (${table.exampleTranslation} is null or char_length(${table.exampleTranslation}) between 1 and 2000)`,
        ),
        check('dictionary_cards_sort_key_positive', sql`${table.sortKey} > 0`),
        check('dictionary_cards_version_positive', sql`${table.version} > 0`),
        check(
            'dictionary_cards_archive_state',
            sql`(${table.lifecycle} = 'archived') = (${table.archivedAt} is not null) and (${table.archivedAt} is null or ${table.archivedAt} >= ${table.createdAt})`,
        ),
        check(
            'dictionary_cards_timestamps_ordered',
            sql`${table.updatedAt} >= ${table.createdAt}`,
        ),
        unique('dictionary_cards_id_dictionary_unique').on(
            table.id,
            table.dictionaryId,
        ),
        index('dictionary_cards_active_order_idx')
            .on(table.dictionaryId, table.sortKey, table.id)
            .where(sql`${table.lifecycle} = 'active'`),
        index('dictionary_cards_lifecycle_order_idx').on(
            table.dictionaryId,
            table.lifecycle,
            table.sortKey,
            table.id,
        ),
        index('dictionary_cards_normalized_source_idx').on(
            table.dictionaryId,
            table.normalizedSource,
            table.id,
        ),
        index('dictionary_cards_search_idx').using(
            'gin',
            sql`to_tsvector('simple', coalesce(${table.source}, '') || ' ' || coalesce(${table.translation}, '') || ' ' || coalesce(${table.definition}, '') || ' ' || coalesce(${table.example}, ''))`,
        ),
    ],
);

export const dictionaryGenerationJobsTable = pgTable(
    'dictionary_generation_jobs',
    {
        attemptCount: integer('attempt_count').default(0).notNull(),
        awaitingUploadAt: timestamp('awaiting_upload_at', {
            mode: 'date',
            withTimezone: true,
        }),
        cancellationRequestedAt: timestamp('cancellation_requested_at', {
            mode: 'date',
            withTimezone: true,
        }),
        cardId: uuid('card_id'),
        completedAt: timestamp('completed_at', {
            mode: 'date',
            withTimezone: true,
        }),
        createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        dictionaryId: uuid('dictionary_id').notNull(),
        executionState: dictionaryGenerationExecutionStateEnum(
            'execution_state',
        )
            .default('queued')
            .notNull(),
        expectedCardVersion: integer('expected_card_version'),
        expectedDictionaryVersion: integer(
            'expected_dictionary_version',
        ).notNull(),
        expectedSettingsVersion: integer('expected_settings_version').notNull(),
        failureCategory: text('failure_category'),
        fencingToken: bigint('fencing_token', { mode: 'bigint' })
            .default(sql`0`)
            .notNull(),
        format: text('format').notNull(),
        heartbeatAt: timestamp('heartbeat_at', {
            mode: 'date',
            withTimezone: true,
        }),
        id: uuid('id').primaryKey(),
        idempotencyKey: text('idempotency_key').notNull(),
        inputPayload:
            jsonb('input_payload').$type<DictionaryGenerationInputPayload>(),
        jobSchemaVersion: integer('job_schema_version').default(1).notNull(),
        kind: text('kind').notNull(),
        leaseDeadline: timestamp('lease_deadline', {
            mode: 'date',
            withTimezone: true,
        }),
        nextAttemptAt: timestamp('next_attempt_at', {
            mode: 'date',
            withTimezone: true,
        })
            .defaultNow()
            .notNull(),
        maxAttempts: integer('max_attempts').default(3).notNull(),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        progressPercent: integer('progress_percent').default(0).notNull(),
        progressStage: text('progress_stage').default('queued').notNull(),
        providerActualCostMicros: integer('provider_actual_cost_micros'),
        providerActualInputTokens: integer('provider_actual_input_tokens'),
        providerActualOutputTokens: integer('provider_actual_output_tokens'),
        providerInputCostMicrosPerMillionTokens: integer(
            'provider_input_cost_micros_per_million_tokens',
        )
            .default(0)
            .notNull(),
        providerMaxCostMicrosPerAttempt: integer(
            'provider_max_cost_micros_per_attempt',
        )
            .default(50_000)
            .notNull(),
        providerMaxInputTokensPerAttempt: integer(
            'provider_max_input_tokens_per_attempt',
        )
            .default(65_536)
            .notNull(),
        providerMaxOutputTokensPerAttempt: integer(
            'provider_max_output_tokens_per_attempt',
        )
            .default(1_024)
            .notNull(),
        providerOutputCostMicrosPerMillionTokens: integer(
            'provider_output_cost_micros_per_million_tokens',
        )
            .default(0)
            .notNull(),
        providerReservationSettledAt: timestamp(
            'provider_reservation_settled_at',
            { mode: 'date', withTimezone: true },
        ),
        providerReservationState: text('provider_reservation_state')
            .default('released')
            .notNull(),
        providerReservedAttempts: integer('provider_reserved_attempts')
            .default(0)
            .notNull(),
        providerReservedCostMicros: integer('provider_reserved_cost_micros')
            .default(0)
            .notNull(),
        providerReservedInputTokens: integer('provider_reserved_input_tokens')
            .default(0)
            .notNull(),
        providerReservedOutputTokens: integer('provider_reserved_output_tokens')
            .default(0)
            .notNull(),
        proposalSchemaVersion: integer('proposal_schema_version')
            .default(1)
            .notNull(),
        requestFingerprint: text('request_fingerprint').notNull(),
        sourceLanguageTag: text('source_language_tag').notNull(),
        targetLanguageTag: text('target_language_tag').notNull(),
        updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        workerId: text('worker_id'),
    },
    (table) => [
        check(
            'dictionary_generation_jobs_format',
            sql`char_length(${table.format}) between 3 and 64 and ${table.format} ~ '^[a-z][a-z0-9-]*:v[1-9][0-9]*$'`,
        ),
        check(
            'dictionary_generation_jobs_kind',
            sql`char_length(${table.kind}) between 3 and 32 and ${table.kind} ~ '^[a-z][a-z0-9-]*$'`,
        ),
        check(
            'dictionary_generation_jobs_schema_versions',
            sql`${table.jobSchemaVersion} > 0 and ${table.proposalSchemaVersion} > 0`,
        ),
        check(
            'dictionary_generation_jobs_positive_versions',
            sql`${table.expectedDictionaryVersion} > 0 and ${table.expectedSettingsVersion} > 0 and (${table.expectedCardVersion} is null or ${table.expectedCardVersion} > 0)`,
        ),
        check(
            'dictionary_generation_jobs_kind_card',
            sql`(${table.kind} = 'single-card' and ${table.cardId} is not null and ${table.expectedCardVersion} is not null) or (${table.kind} <> 'single-card' and ${table.cardId} is null and ${table.expectedCardVersion} is null)`,
        ),
        check(
            'dictionary_generation_jobs_attempt_fence',
            sql`${table.attemptCount} >= 0 and ${table.maxAttempts} between 1 and 10 and ${table.attemptCount} <= ${table.maxAttempts} and ${table.fencingToken} >= 0`,
        ),
        check(
            'dictionary_generation_jobs_progress',
            sql`${table.progressPercent} between 0 and 100 and ${table.progressStage} in ('awaiting_upload', 'queued', 'scanning', 'extracting', 'ocr', 'generating', 'validating', 'cleaning', 'review_ready', 'terminal')`,
        ),
        check(
            'dictionary_generation_jobs_upload_wait',
            sql`${table.awaitingUploadAt} is null or (${table.kind} = 'document-terms' and ${table.format} = 'document-terms:v1' and ${table.executionState} = 'queued' and ${table.progressStage} = 'awaiting_upload' and ${table.progressPercent} = 0 and ${table.providerReservationState} = 'released' and ${table.providerReservedInputTokens} = 0 and ${table.providerReservedOutputTokens} = 0 and ${table.providerReservedCostMicros} = 0 and ${table.providerReservationSettledAt} is null)`,
        ),
        check(
            'dictionary_generation_jobs_provider_reservation',
            sql`${table.providerReservationState} in ('active', 'settled', 'released') and ${table.providerReservedInputTokens} >= 0 and ${table.providerReservedOutputTokens} >= 0 and ${table.providerReservedCostMicros} >= 0 and (${table.providerActualInputTokens} is null or ${table.providerActualInputTokens} >= 0) and (${table.providerActualOutputTokens} is null or ${table.providerActualOutputTokens} >= 0) and (${table.providerActualCostMicros} is null or ${table.providerActualCostMicros} >= 0) and ((${table.providerReservationState} = 'active' and ${table.providerReservedInputTokens} > 0 and ${table.providerReservedOutputTokens} > 0 and ${table.providerReservedCostMicros} > 0 and ${table.providerReservationSettledAt} is null and ${table.providerActualInputTokens} is null and ${table.providerActualOutputTokens} is null and ${table.providerActualCostMicros} is null) or (${table.providerReservationState} in ('settled', 'released') and ${table.providerReservationSettledAt} is not null and ${table.providerActualInputTokens} is not null and ${table.providerActualOutputTokens} is not null and ${table.providerActualCostMicros} is not null) or (${table.providerReservationState} = 'released' and ${table.providerReservationSettledAt} is null and ${table.providerReservedInputTokens} = 0 and ${table.providerReservedOutputTokens} = 0 and ${table.providerReservedCostMicros} = 0))`,
        ),
        check(
            'dictionary_generation_jobs_provider_reserved_attempts',
            sql`${table.providerReservedAttempts} between 0 and ${table.maxAttempts}`,
        ),
        check(
            'dictionary_generation_jobs_provider_policy',
            sql`${table.providerMaxInputTokensPerAttempt} between ${sql.raw(String(dictionaryGenerationMinimumSupportedInputTokens))} and 262144 and ${table.providerMaxOutputTokensPerAttempt} between 128 and 40960 and ${table.providerInputCostMicrosPerMillionTokens} between 0 and 1000000000 and ${table.providerOutputCostMicrosPerMillionTokens} between 0 and 1000000000 and ${table.providerMaxCostMicrosPerAttempt} between 1 and 10000000 and ${table.providerMaxCostMicrosPerAttempt} >= ((((${table.providerMaxInputTokensPerAttempt})::bigint * ${table.providerInputCostMicrosPerMillionTokens}) + 999999) / 1000000) + ((((${table.providerMaxOutputTokensPerAttempt})::bigint * ${table.providerOutputCostMicrosPerMillionTokens}) + 999999) / 1000000)`,
        ),
        check(
            'dictionary_generation_jobs_language_pair',
            sql`char_length(${table.sourceLanguageTag}) between 2 and 35 and char_length(${table.targetLanguageTag}) between 2 and 35 and ${table.sourceLanguageTag} <> ${table.targetLanguageTag}`,
        ),
        check(
            'dictionary_generation_jobs_key_length',
            sql`char_length(${table.idempotencyKey}) between 16 and 128`,
        ),
        check(
            'dictionary_generation_jobs_fingerprint_format',
            versionedDigestCheck(table.requestFingerprint),
        ),
        check(
            'dictionary_generation_jobs_worker_length',
            sql`${table.workerId} is null or char_length(${table.workerId}) between 1 and 128`,
        ),
        check(
            'dictionary_generation_jobs_failure_category',
            sql`${table.failureCategory} is null or (${table.failureCategory} ~ '^[a-z][a-z0-9_]{0,63}$')`,
        ),
        check(
            'dictionary_generation_jobs_execution_lease',
            sql`(${table.executionState} = 'running' and ${table.workerId} is not null and ${table.leaseDeadline} is not null and ${table.heartbeatAt} is not null) or (${table.executionState} <> 'running' and ${table.workerId} is null and ${table.leaseDeadline} is null and ${table.heartbeatAt} is null)`,
        ),
        check(
            'dictionary_generation_jobs_completion',
            sql`(${table.executionState} in ('completed', 'failed', 'cancelled', 'expired') and ${table.completedAt} is not null) or (${table.executionState} in ('queued', 'running') and ${table.completedAt} is null)`,
        ),
        check(
            'dictionary_generation_jobs_timestamps',
            sql`${table.updatedAt} >= ${table.createdAt} and ${table.nextAttemptAt} >= ${table.createdAt} and (${table.awaitingUploadAt} is null or ${table.awaitingUploadAt} >= ${table.createdAt}) and (${table.completedAt} is null or ${table.completedAt} >= ${table.createdAt}) and (${table.cancellationRequestedAt} is null or ${table.cancellationRequestedAt} >= ${table.createdAt}) and (${table.heartbeatAt} is null or ${table.heartbeatAt} >= ${table.createdAt}) and (${table.leaseDeadline} is null or (${table.heartbeatAt} is not null and ${table.leaseDeadline} > ${table.heartbeatAt}))`,
        ),
        foreignKey({
            columns: [table.dictionaryId, table.ownerId],
            foreignColumns: [dictionariesTable.id, dictionariesTable.ownerId],
            name: 'dictionary_generation_jobs_dictionary_owner_fk',
        }).onDelete('cascade'),
        foreignKey({
            columns: [table.cardId, table.dictionaryId],
            foreignColumns: [
                dictionaryCardsTable.id,
                dictionaryCardsTable.dictionaryId,
            ],
            name: 'dictionary_generation_jobs_card_dictionary_fk',
        }).onDelete('cascade'),
        uniqueIndex('dictionary_generation_jobs_owner_kind_key_unique').on(
            table.ownerId,
            table.kind,
            table.idempotencyKey,
        ),
        index('dictionary_generation_jobs_claim_idx')
            .on(
                table.executionState,
                table.nextAttemptAt,
                table.createdAt,
                table.id,
            )
            .where(sql`${table.awaitingUploadAt} is null`),
        index('dictionary_generation_jobs_owner_state_idx').on(
            table.ownerId,
            table.executionState,
            table.createdAt,
        ),
        index('dictionary_generation_jobs_card_created_idx').on(
            table.cardId,
            table.createdAt,
        ),
        index('dictionary_generation_jobs_lease_idx')
            .on(table.leaseDeadline)
            .where(sql`${table.executionState} = 'running'`),
        index('dictionary_generation_jobs_provider_budget_idx').on(
            table.providerReservationState,
            table.providerReservationSettledAt,
            table.ownerId,
        ),
        index('dictionary_generation_jobs_completed_idx')
            .on(table.completedAt)
            .where(sql`${table.completedAt} is not null`),
        index('dictionary_generation_jobs_current_observation_idx')
            .on(table.executionState, table.createdAt)
            .where(sql`${table.executionState} in ('queued', 'running')`),
    ],
);

export const dictionaryGenerationProviderCircuitTable = pgTable(
    'dictionary_generation_provider_circuit',
    {
        consecutiveFailures: integer('consecutive_failures')
            .default(0)
            .notNull(),
        id: text('id').primaryKey(),
        openUntil: timestamp('open_until', {
            mode: 'date',
            withTimezone: true,
        }),
        updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
    },
    (table) => [
        check(
            'dictionary_generation_provider_circuit_format',
            sql`char_length(${table.id}) between 3 and 64 and ${table.id} ~ '^[a-z][a-z0-9-]*:v[1-9][0-9]*$'`,
        ),
        check(
            'dictionary_generation_provider_circuit_failures',
            sql`${table.consecutiveFailures} >= 0`,
        ),
    ],
);

export const dictionaryCardRevisionsTable = pgTable(
    'dictionary_card_revisions',
    {
        acceptedGenerationJobId: uuid('accepted_generation_job_id').references(
            () => dictionaryGenerationJobsTable.id,
            { onDelete: 'restrict' },
        ),
        actorUserId: uuid('actor_user_id').references(() => usersTable.id, {
            onDelete: 'set null',
        }),
        authorship: dictionaryCardAuthorshipEnum('authorship').notNull(),
        cardId: uuid('card_id').notNull(),
        cardVersion: integer('card_version').notNull(),
        createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        dictionaryId: uuid('dictionary_id').notNull(),
        id: uuid('id').primaryKey(),
        mutationKind: dictionaryCardMutationKindEnum('mutation_kind').notNull(),
        revisionNumber: integer('revision_number').notNull(),
        schemaVersion: integer('schema_version').default(1).notNull(),
        settingsVersion: integer('settings_version').notNull(),
        snapshot: jsonb('snapshot')
            .$type<DictionaryCardRevisionSnapshot>()
            .notNull(),
    },
    (table) => [
        check(
            'dictionary_card_revisions_positive_versions',
            sql`${table.revisionNumber} > 0 and ${table.cardVersion} > 0 and ${table.settingsVersion} > 0 and ${table.schemaVersion} = 1`,
        ),
        foreignKey({
            columns: [table.cardId, table.dictionaryId],
            foreignColumns: [
                dictionaryCardsTable.id,
                dictionaryCardsTable.dictionaryId,
            ],
            name: 'dictionary_card_revisions_card_dictionary_fk',
        }).onDelete('cascade'),
        unique('dictionary_card_revisions_card_revision_unique').on(
            table.cardId,
            table.revisionNumber,
        ),
        unique('dictionary_card_revisions_card_version_unique').on(
            table.cardId,
            table.cardVersion,
        ),
        index('dictionary_card_revisions_dictionary_created_idx').on(
            table.dictionaryId,
            table.createdAt,
            table.id,
        ),
        index('dictionary_card_revisions_generation_job_idx')
            .on(table.acceptedGenerationJobId)
            .where(sql`${table.acceptedGenerationJobId} is not null`),
    ],
);

export const dictionaryGenerationProposalsTable = pgTable(
    'dictionary_generation_proposals',
    {
        acceptedBatchOutcome: jsonb('accepted_batch_outcome').$type<
            | DictionaryImportPairsGenerationAcceptedOutcome
            | DictionaryPastedTermsGenerationAcceptedOutcome
        >(),
        acceptedCandidateFingerprint: text('accepted_candidate_fingerprint'),
        acceptedCardId: uuid('accepted_card_id').references(
            () => dictionaryCardsTable.id,
            { onDelete: 'restrict' },
        ),
        acceptedCardVersion: integer('accepted_card_version'),
        acceptedDictionaryVersion: integer('accepted_dictionary_version'),
        acceptedDuplicateSource: boolean('accepted_duplicate_source'),
        acceptedRevisionId: uuid('accepted_revision_id').references(
            () => dictionaryCardRevisionsTable.id,
            { onDelete: 'restrict' },
        ),
        createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        documentPublishedAt: timestamp('document_published_at', {
            mode: 'date',
            withTimezone: true,
        }),
        documentStagedAt: timestamp('document_staged_at', {
            mode: 'date',
            withTimezone: true,
        }),
        expiresAt: timestamp('expires_at', {
            mode: 'date',
            withTimezone: true,
        }).notNull(),
        jobId: uuid('job_id')
            .primaryKey()
            .references(() => dictionaryGenerationJobsTable.id, {
                onDelete: 'cascade',
            }),
        payload: jsonb('payload').$type<
            | DictionaryCardAuthoringProposalPayload
            | DictionaryGenerationProposalPayload
            | DictionaryImportPairsGenerationProposal
            | DictionaryImportPairsGenerationProposalPayload
            | DictionaryPastedTermsGenerationProposal
        >(),
        reviewState: dictionaryGenerationReviewStateEnum('review_state')
            .default('reviewable')
            .notNull(),
        schemaVersion: integer('schema_version').default(1).notNull(),
        stagedProviderCostMicros: integer('staged_provider_cost_micros'),
        stagedProviderInputTokens: integer('staged_provider_input_tokens'),
        stagedProviderOutputTokens: integer('staged_provider_output_tokens'),
        terminalAt: timestamp('terminal_at', {
            mode: 'date',
            withTimezone: true,
        }),
        updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
    },
    (table) => [
        check(
            'dictionary_generation_proposals_schema',
            sql`${table.schemaVersion} = 1`,
        ),
        check(
            'dictionary_generation_proposals_payload_state',
            sql`(${table.reviewState} = 'reviewable' and ${table.payload} is not null and ${table.terminalAt} is null and ${table.acceptedCandidateFingerprint} is null and ${table.acceptedCardId} is null and ${table.acceptedCardVersion} is null and ${table.acceptedDictionaryVersion} is null and ${table.acceptedDuplicateSource} is null and ${table.acceptedRevisionId} is null and ${table.acceptedBatchOutcome} is null) or (${table.reviewState} = 'accepted' and ${table.payload} is null and ${table.terminalAt} is not null and ((
                ${table.acceptedCandidateFingerprint} is not null and
                ${table.acceptedCardId} is null and
                ${table.acceptedCardVersion} is not null and
                ${table.acceptedDictionaryVersion} is not null and
                ${table.acceptedDuplicateSource} is null and
                ${table.acceptedRevisionId} is not null and
                ${table.acceptedBatchOutcome} is null
            ) or (
                ${table.acceptedCandidateFingerprint} is not null and
                ${table.acceptedCardId} is not null and
                ${table.acceptedCardVersion} is not null and
                ${table.acceptedDictionaryVersion} is not null and
                ${table.acceptedDuplicateSource} is not null and
                ${table.acceptedRevisionId} is not null and
                ${table.acceptedBatchOutcome} is null
            ) or (
                ${table.acceptedCandidateFingerprint} is not null and
                ${table.acceptedCardId} is null and
                ${table.acceptedCardVersion} is null and
                ${table.acceptedDictionaryVersion} is null and
                ${table.acceptedDuplicateSource} is null and
                ${table.acceptedRevisionId} is null and
                ${table.acceptedBatchOutcome} is not null
            ))) or (${table.reviewState} in ('discarded', 'expired') and ${table.payload} is null and ${table.terminalAt} is not null and ${table.acceptedCandidateFingerprint} is null and ${table.acceptedCardId} is null and ${table.acceptedCardVersion} is null and ${table.acceptedDictionaryVersion} is null and ${table.acceptedDuplicateSource} is null and ${table.acceptedRevisionId} is null and ${table.acceptedBatchOutcome} is null)`,
        ),
        check(
            'dictionary_generation_proposals_fingerprint_format',
            sql`${table.acceptedCandidateFingerprint} is null or (${versionedDigestCheck(table.acceptedCandidateFingerprint)})`,
        ),
        check(
            'dictionary_generation_proposals_document_publication',
            sql`(${table.documentStagedAt} is null and ${table.documentPublishedAt} is null and ${table.stagedProviderInputTokens} is null and ${table.stagedProviderOutputTokens} is null and ${table.stagedProviderCostMicros} is null) or (${table.documentStagedAt} is not null and ${table.stagedProviderInputTokens} is not null and ${table.stagedProviderInputTokens} between 0 and 2621440 and ${table.stagedProviderOutputTokens} is not null and ${table.stagedProviderOutputTokens} between 0 and 409600 and ${table.stagedProviderCostMicros} is not null and ${table.stagedProviderCostMicros} between 0 and 100000000 and (${table.documentPublishedAt} is null or ${table.documentPublishedAt} >= ${table.documentStagedAt}) and (${table.documentPublishedAt} is not null or ${table.reviewState} <> 'accepted'))`,
        ),
        check(
            'dictionary_generation_proposals_timestamps',
            sql`${table.expiresAt} > ${table.createdAt} and ${table.updatedAt} >= ${table.createdAt} and (${table.documentStagedAt} is null or ${table.documentStagedAt} >= ${table.createdAt}) and (${table.documentPublishedAt} is null or ${table.documentPublishedAt} >= ${table.createdAt}) and (${table.terminalAt} is null or ${table.terminalAt} >= ${table.createdAt})`,
        ),
        index('dictionary_generation_proposals_expiry_idx').on(
            table.reviewState,
            table.expiresAt,
        ),
        index('dictionary_generation_proposals_terminal_idx')
            .on(table.terminalAt)
            .where(sql`${table.terminalAt} is not null`),
    ],
);

export const dictionaryDocumentUploadsTable = pgTable(
    'dictionary_document_uploads',
    {
        accountedPhysicalBytes: bigint('accounted_physical_bytes', {
            mode: 'number',
        }).notNull(),
        capabilityExpiresAt: timestamp('capability_expires_at', {
            mode: 'date',
            withTimezone: true,
        }).notNull(),
        cleanupAttemptCount: integer('cleanup_attempt_count')
            .default(0)
            .notNull(),
        cleanupCompletedAt: timestamp('cleanup_completed_at', {
            mode: 'date',
            withTimezone: true,
        }),
        cleanupFailureCategory: text('cleanup_failure_category'),
        cleanupFencingToken: bigint('cleanup_fencing_token', { mode: 'bigint' })
            .default(sql`0`)
            .notNull(),
        cleanupHeartbeatAt: timestamp('cleanup_heartbeat_at', {
            mode: 'date',
            withTimezone: true,
        }),
        cleanupLeaseDeadline: timestamp('cleanup_lease_deadline', {
            mode: 'date',
            withTimezone: true,
        }),
        cleanupNextAttemptAt: timestamp('cleanup_next_attempt_at', {
            mode: 'date',
            withTimezone: true,
        }).notNull(),
        cleanupState: text('cleanup_state').default('inactive').notNull(),
        cleanupWorkerId: text('cleanup_worker_id'),
        createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        dataVersionsDeletedAt: timestamp('data_versions_deleted_at', {
            mode: 'date',
            withTimezone: true,
        }),
        detectedFormat: text('detected_format'),
        dictionaryId: uuid('dictionary_id').notNull(),
        expectedChecksumSha256: text('expected_checksum_sha256').notNull(),
        expectedContentType: text('expected_content_type').notNull(),
        expectedFormat: text('expected_format').notNull(),
        expectedSizeBytes: bigint('expected_size_bytes', {
            mode: 'number',
        }).notNull(),
        id: uuid('id').primaryKey(),
        jobId: uuid('job_id')
            .notNull()
            .references(() => dictionaryGenerationJobsTable.id, {
                onDelete: 'restrict',
            }),
        objectKey: text('object_key').notNull(),
        observedPhysicalBytes: bigint('observed_physical_bytes', {
            mode: 'number',
        })
            .default(0)
            .notNull(),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'restrict' }),
        processingState: text('processing_state')
            .default('authorized')
            .notNull(),
        quotaReleasedAt: timestamp('quota_released_at', {
            mode: 'date',
            withTimezone: true,
        }),
        scanCompletedAt: timestamp('scan_completed_at', {
            mode: 'date',
            withTimezone: true,
        }),
        scannerEngineVersion: text('scanner_engine_version'),
        scannerOutcome: text('scanner_outcome'),
        scannerSignatureUpdatedAt: timestamp('scanner_signature_updated_at', {
            mode: 'date',
            withTimezone: true,
        }),
        scannerSignatureVersion: text('scanner_signature_version'),
        schemaVersion: integer('schema_version').default(1).notNull(),
        terminalAt: timestamp('terminal_at', {
            mode: 'date',
            withTimezone: true,
        }),
        tombstoneCreatedAt: timestamp('tombstone_created_at', {
            mode: 'date',
            withTimezone: true,
        }),
        tombstoneStorageVersionId: text('tombstone_storage_version_id'),
        updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        uploadCompletedAt: timestamp('upload_completed_at', {
            mode: 'date',
            withTimezone: true,
        }),
        verifiedChecksumSha256: text('verified_checksum_sha256'),
        verifiedSizeBytes: bigint('verified_size_bytes', { mode: 'number' }),
        verifiedStorageVersionId: text('verified_storage_version_id'),
    },
    (table) => [
        check(
            'dictionary_document_uploads_schema',
            sql`${table.schemaVersion} = 1`,
        ),
        check(
            'dictionary_document_uploads_object_key',
            sql`char_length(${table.objectKey}) between 16 and 512 and ${table.objectKey} ~ '^[A-Za-z0-9/_-]+$'`,
        ),
        check(
            'dictionary_document_uploads_expected_file',
            sql`${table.expectedFormat} in ('txt', 'markdown', 'docx', 'pdf', 'png', 'jpeg', 'webp') and char_length(${table.expectedContentType}) between 1 and 255 and ${table.expectedContentType} !~ '[[:cntrl:]]' and ${table.expectedSizeBytes} between 1 and 20971520 and ${table.expectedChecksumSha256} ~ '^[a-f0-9]{64}$'`,
        ),
        check(
            'dictionary_document_uploads_verified_file',
            sql`(${table.uploadCompletedAt} is null and ${table.verifiedStorageVersionId} is null and ${table.verifiedSizeBytes} is null and ${table.verifiedChecksumSha256} is null and ${table.detectedFormat} is null) or (${table.uploadCompletedAt} is not null and ${table.verifiedStorageVersionId} is not null and char_length(${table.verifiedStorageVersionId}) between 1 and 1024 and ${table.verifiedStorageVersionId} !~ '[[:cntrl:]]' and ${table.verifiedSizeBytes} = ${table.expectedSizeBytes} and ${table.verifiedChecksumSha256} = ${table.expectedChecksumSha256} and ${table.detectedFormat} in ('txt', 'markdown', 'docx', 'pdf', 'png', 'jpeg', 'webp'))`,
        ),
        check(
            'dictionary_document_uploads_processing_state',
            sql`${table.processingState} in ('authorized', 'quarantined', 'scanning', 'clean', 'extracting', 'cleaning', 'proposed', 'rejected', 'failed', 'cancelled', 'expired') and ((${table.processingState} = 'authorized' and ${table.uploadCompletedAt} is null) or (${table.processingState} in ('failed', 'cancelled', 'expired')) or (${table.processingState} not in ('authorized', 'failed', 'cancelled', 'expired') and ${table.uploadCompletedAt} is not null)) and ((${table.processingState} in ('proposed', 'rejected', 'failed', 'cancelled', 'expired')) = (${table.terminalAt} is not null))`,
        ),
        check(
            'dictionary_document_uploads_scan',
            sql`((${table.scannerOutcome} is null and ${table.scanCompletedAt} is null and ${table.scannerEngineVersion} is null and ${table.scannerSignatureVersion} is null and ${table.scannerSignatureUpdatedAt} is null) or (${table.scannerOutcome} in ('clean', 'infected', 'unavailable', 'timeout', 'limit_exceeded', 'invalid_response', 'stale_signatures') and ${table.scanCompletedAt} is not null and ((${table.scannerEngineVersion} is null and ${table.scannerSignatureVersion} is null and ${table.scannerSignatureUpdatedAt} is null and ${table.scannerOutcome} in ('unavailable', 'timeout', 'invalid_response')) or (${table.scannerEngineVersion} is not null and char_length(${table.scannerEngineVersion}) between 1 and 128 and ${table.scannerSignatureVersion} is not null and char_length(${table.scannerSignatureVersion}) between 1 and 128 and ${table.scannerSignatureUpdatedAt} is not null and ${table.scannerSignatureUpdatedAt} <= ${table.scanCompletedAt})))) and (${table.processingState} not in ('clean', 'extracting', 'cleaning', 'proposed') or ${table.scannerOutcome} = 'clean')`,
        ),
        check(
            'dictionary_document_uploads_quota',
            sql`${table.observedPhysicalBytes} >= 0 and ${table.accountedPhysicalBytes} >= ${table.expectedSizeBytes} and ${table.accountedPhysicalBytes} >= ${table.observedPhysicalBytes} and (${table.cleanupState} not in ('waiting_capability_expiry', 'complete') or ${table.quotaReleasedAt} is not null) and (${table.quotaReleasedAt} is null or (${table.cleanupState} in ('running', 'waiting_capability_expiry', 'complete') and ${table.dataVersionsDeletedAt} is not null and ${table.quotaReleasedAt} >= ${table.dataVersionsDeletedAt}))`,
        ),
        check(
            'dictionary_document_uploads_cleanup_state',
            sql`${table.cleanupState} in ('inactive', 'pending', 'running', 'waiting_capability_expiry', 'complete') and ${table.cleanupAttemptCount} between 0 and 100 and ${table.cleanupFencingToken} >= 0 and (${table.cleanupFailureCategory} is null or ${table.cleanupFailureCategory} ~ '^[a-z][a-z0-9_]{0,63}$') and ((${table.cleanupState} = 'running' and ${table.cleanupWorkerId} is not null and char_length(${table.cleanupWorkerId}) between 1 and 128 and ${table.cleanupLeaseDeadline} is not null and ${table.cleanupHeartbeatAt} is not null) or (${table.cleanupState} <> 'running' and ${table.cleanupWorkerId} is null and ${table.cleanupLeaseDeadline} is null and ${table.cleanupHeartbeatAt} is null))`,
        ),
        check(
            'dictionary_document_uploads_cleanup_outcome',
            sql`(${table.tombstoneStorageVersionId} is null) = (${table.tombstoneCreatedAt} is null) and (${table.tombstoneStorageVersionId} is null or (char_length(${table.tombstoneStorageVersionId}) between 1 and 1024 and ${table.tombstoneStorageVersionId} !~ '[[:cntrl:]]')) and (${table.dataVersionsDeletedAt} is null or ${table.tombstoneCreatedAt} is not null) and ((${table.cleanupState} = 'waiting_capability_expiry' and ${table.tombstoneCreatedAt} is not null and ${table.dataVersionsDeletedAt} is not null and ${table.cleanupCompletedAt} is null) or (${table.cleanupState} = 'complete' and ${table.tombstoneCreatedAt} is not null and ${table.dataVersionsDeletedAt} is not null and ${table.cleanupCompletedAt} is not null and ${table.cleanupCompletedAt} >= ${table.capabilityExpiresAt}) or ${table.cleanupState} in ('inactive', 'pending', 'running'))`,
        ),
        check(
            'dictionary_document_uploads_timestamps',
            sql`${table.capabilityExpiresAt} > ${table.createdAt} and ${table.capabilityExpiresAt} <= ${table.createdAt} + interval '1 hour' and ${table.cleanupNextAttemptAt} >= ${table.createdAt} and ${table.updatedAt} >= ${table.createdAt} and (${table.uploadCompletedAt} is null or ${table.uploadCompletedAt} >= ${table.createdAt}) and (${table.scanCompletedAt} is null or ${table.scanCompletedAt} >= ${table.createdAt}) and (${table.terminalAt} is null or ${table.terminalAt} >= ${table.createdAt}) and (${table.cleanupHeartbeatAt} is null or ${table.cleanupHeartbeatAt} >= ${table.createdAt}) and (${table.cleanupLeaseDeadline} is null or (${table.cleanupHeartbeatAt} is not null and ${table.cleanupLeaseDeadline} > ${table.cleanupHeartbeatAt})) and (${table.tombstoneCreatedAt} is null or ${table.tombstoneCreatedAt} >= ${table.createdAt}) and (${table.dataVersionsDeletedAt} is null or ${table.dataVersionsDeletedAt} >= ${table.tombstoneCreatedAt}) and (${table.cleanupCompletedAt} is null or ${table.cleanupCompletedAt} >= ${table.createdAt}) and (${table.quotaReleasedAt} is null or ${table.quotaReleasedAt} >= ${table.createdAt})`,
        ),
        foreignKey({
            columns: [table.dictionaryId, table.ownerId],
            foreignColumns: [dictionariesTable.id, dictionariesTable.ownerId],
            name: 'dictionary_document_uploads_dictionary_owner_fk',
        }).onDelete('restrict'),
        unique('dictionary_document_uploads_job_unique').on(table.jobId),
        unique('dictionary_document_uploads_job_id_unique').on(
            table.jobId,
            table.id,
        ),
        unique('dictionary_document_uploads_object_key_unique').on(
            table.objectKey,
        ),
        index('dictionary_document_uploads_owner_quota_idx')
            .on(table.ownerId, table.createdAt, table.id)
            .where(sql`${table.quotaReleasedAt} is null`),
        index('dictionary_document_uploads_created_idx').on(table.createdAt),
        index('dictionary_document_uploads_upload_completed_idx')
            .on(table.uploadCompletedAt)
            .where(sql`${table.uploadCompletedAt} is not null`),
        index('dictionary_document_uploads_scan_completed_idx')
            .on(table.scanCompletedAt)
            .where(sql`${table.scanCompletedAt} is not null`),
        index('dictionary_document_uploads_cleanup_claim_idx')
            .on(
                table.cleanupState,
                table.cleanupNextAttemptAt,
                table.createdAt,
                table.id,
            )
            .where(
                sql`${table.cleanupState} in ('pending', 'waiting_capability_expiry')`,
            ),
        index('dictionary_document_uploads_cleanup_lease_idx')
            .on(table.cleanupLeaseDeadline)
            .where(sql`${table.cleanupState} = 'running'`),
        index('dictionary_document_uploads_capability_expiry_idx')
            .on(table.capabilityExpiresAt, table.id)
            .where(sql`${table.processingState} = 'authorized'`),
    ],
);

export const dictionaryDocumentObjectVersionsTable = pgTable(
    'dictionary_document_object_versions',
    {
        checksumSha256: text('checksum_sha256').notNull(),
        createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        deletedAt: timestamp('deleted_at', {
            mode: 'date',
            withTimezone: true,
        }),
        id: uuid('id').primaryKey(),
        isCurrent: boolean('is_current').default(false).notNull(),
        kind: text('kind').notNull(),
        sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
        storageVersionId: text('storage_version_id').notNull(),
        uploadId: uuid('upload_id')
            .notNull()
            .references(() => dictionaryDocumentUploadsTable.id, {
                onDelete: 'restrict',
            }),
    },
    (table) => [
        check(
            'dictionary_document_object_versions_identity',
            sql`char_length(${table.storageVersionId}) between 1 and 1024 and ${table.storageVersionId} !~ '[[:cntrl:]]' and ${table.checksumSha256} ~ '^[a-f0-9]{64}$'`,
        ),
        check(
            'dictionary_document_object_versions_kind_size',
            sql`(${table.kind} = 'data' and ${table.sizeBytes} > 0) or (${table.kind} = 'tombstone' and ${table.sizeBytes} = 0)`,
        ),
        check(
            'dictionary_document_object_versions_lifecycle',
            sql`(${table.deletedAt} is null or ${table.deletedAt} >= ${table.createdAt}) and (${table.isCurrent} = false or ${table.deletedAt} is null)`,
        ),
        unique('dictionary_document_object_versions_storage_unique').on(
            table.uploadId,
            table.storageVersionId,
        ),
        uniqueIndex('dictionary_document_object_versions_one_current')
            .on(table.uploadId)
            .where(sql`${table.isCurrent} = true`),
        index('dictionary_document_object_versions_active_bytes_idx')
            .on(table.uploadId, table.kind, table.sizeBytes)
            .where(sql`${table.deletedAt} is null`),
    ],
);

export const dictionaryDocumentExtractionsTable = pgTable(
    'dictionary_document_extractions',
    {
        createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        failureUnitCount: integer('failure_unit_count').default(0).notNull(),
        jobId: uuid('job_id').primaryKey(),
        observedUnitCount: integer('observed_unit_count').notNull(),
        payload: jsonb('payload'),
        payloadFingerprint: text('payload_fingerprint').notNull(),
        proposalJobId: uuid('proposal_job_id').references(
            () => dictionaryGenerationProposalsTable.jobId,
            { onDelete: 'restrict' },
        ),
        redactedAt: timestamp('redacted_at', {
            mode: 'date',
            withTimezone: true,
        }),
        schemaVersion: integer('schema_version').default(1).notNull(),
        state: text('state').notNull(),
        updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        uploadId: uuid('upload_id').notNull(),
        validUnitCount: integer('valid_unit_count').default(0).notNull(),
    },
    (table) => [
        check(
            'dictionary_document_extractions_schema',
            sql`${table.schemaVersion} = 1`,
        ),
        check(
            'dictionary_document_extractions_counts',
            sql`${table.observedUnitCount} between 0 and 101 and ${table.validUnitCount} between 0 and 100 and ${table.failureUnitCount} between 0 and 100 and ((${table.state} in ('ready', 'proposed', 'redacted') and ${table.observedUnitCount} between 1 and 100 and ${table.validUnitCount} + ${table.failureUnitCount} = ${table.observedUnitCount}) or (${table.state} = 'no_terms_found' and ${table.observedUnitCount} = 0 and ${table.validUnitCount} = 0 and ${table.failureUnitCount} = 0) or (${table.state} = 'too_many_terms' and ${table.observedUnitCount} = 101 and ${table.validUnitCount} = 0 and ${table.failureUnitCount} = 0))`,
        ),
        check(
            'dictionary_document_extractions_payload_state',
            sql`(${table.state} = 'ready' and ${table.payload} is not null and jsonb_typeof(${table.payload}) = 'object' and pg_column_size(${table.payload}) <= 2097152 and ${table.proposalJobId} is null and ${table.redactedAt} is null) or (${table.state} = 'proposed' and ${table.payload} is null and ${table.proposalJobId} = ${table.jobId} and ${table.redactedAt} is not null) or (${table.state} in ('redacted', 'no_terms_found', 'too_many_terms') and ${table.payload} is null and ${table.proposalJobId} is null and ${table.redactedAt} is not null)`,
        ),
        check(
            'dictionary_document_extractions_fingerprint',
            versionedDigestCheck(table.payloadFingerprint),
        ),
        check(
            'dictionary_document_extractions_timestamps',
            sql`${table.updatedAt} >= ${table.createdAt} and (${table.redactedAt} is null or ${table.redactedAt} >= ${table.createdAt})`,
        ),
        foreignKey({
            columns: [table.jobId, table.uploadId],
            foreignColumns: [
                dictionaryDocumentUploadsTable.jobId,
                dictionaryDocumentUploadsTable.id,
            ],
            name: 'dictionary_document_extractions_upload_job_fk',
        }).onDelete('cascade'),
        unique('dictionary_document_extractions_upload_unique').on(
            table.uploadId,
        ),
        index('dictionary_document_extractions_payload_expiry_idx')
            .on(table.createdAt, table.jobId)
            .where(sql`${table.payload} is not null`),
    ],
);

export const dictionaryIdempotencyKeysTable = pgTable(
    'dictionary_idempotency_keys',
    {
        completedAt: timestamp('completed_at', {
            mode: 'date',
            withTimezone: true,
        }),
        createdAt: timestamp('created_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
        expiresAt: timestamp('expires_at', {
            mode: 'date',
            withTimezone: true,
        }).notNull(),
        id: uuid('id').primaryKey(),
        idempotencyKey: text('idempotency_key').notNull(),
        operation: dictionaryIdempotencyOperationEnum('operation').notNull(),
        ownerId: uuid('owner_id')
            .notNull()
            .references(() => usersTable.id, { onDelete: 'cascade' }),
        requestFingerprint: text('request_fingerprint').notNull(),
        resultDictionaryId: uuid('result_dictionary_id'),
        resultPayload: jsonb(
            'result_payload',
        ).$type<ImportDictionaryResponse | null>(),
        state: dictionaryIdempotencyStateEnum('state')
            .default('in_progress')
            .notNull(),
        updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true })
            .defaultNow()
            .notNull(),
    },
    (table) => [
        check(
            'dictionary_idempotency_keys_key_length',
            sql`char_length(${table.idempotencyKey}) between 16 and 128`,
        ),
        check(
            'dictionary_idempotency_keys_fingerprint_format',
            versionedDigestCheck(table.requestFingerprint),
        ),
        check(
            'dictionary_idempotency_keys_state_result',
            sql`(${table.state} = 'in_progress' and ${table.completedAt} is null and ${table.resultDictionaryId} is null and ${table.resultPayload} is null) or (${table.state} = 'completed' and ${table.completedAt} is not null and ${table.resultDictionaryId} is not null and ((${table.operation} in ('create', 'fork') and ${table.resultPayload} is null) or (${table.operation} = 'bulk_commit' and ${table.resultPayload} is not null and jsonb_typeof(${table.resultPayload}) = 'object' and jsonb_typeof(${table.resultPayload}->'dictionary') = 'object' and octet_length(${table.resultPayload}::text) <= 4194304 and ((${table.resultPayload}->>'mode' = 'deterministic' and jsonb_typeof(${table.resultPayload}->'cards') = 'array' and jsonb_typeof(${table.resultPayload}->'warnings') = 'array') or (${table.resultPayload}->>'mode' = 'ai' and jsonb_typeof(${table.resultPayload}->'job') = 'object')))))`,
        ),
        check(
            'dictionary_idempotency_keys_timestamps_ordered',
            sql`${table.expiresAt} > ${table.createdAt} and ${table.updatedAt} >= ${table.createdAt} and (${table.completedAt} is null or ${table.completedAt} >= ${table.createdAt})`,
        ),
        foreignKey({
            columns: [table.resultDictionaryId, table.ownerId],
            foreignColumns: [dictionariesTable.id, dictionariesTable.ownerId],
            name: 'dictionary_idempotency_keys_result_owner_fk',
        }).onDelete('restrict'),
        uniqueIndex(
            'dictionary_idempotency_keys_owner_operation_key_unique',
        ).on(table.ownerId, table.operation, table.idempotencyKey),
        index('dictionary_idempotency_keys_expiry_idx').on(table.expiresAt),
        index('dictionary_idempotency_keys_result_dictionary_idx')
            .on(table.resultDictionaryId)
            .where(sql`${table.resultDictionaryId} is not null`),
    ],
);
