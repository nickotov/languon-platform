import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
    dictionaryCardRevisionsTable,
    dictionaryCardsTable,
    dictionaryDocumentExtractionsTable,
    dictionaryDocumentObjectVersionsTable,
    dictionaryDocumentUploadsTable,
    dictionaryGenerationJobsTable,
    dictionaryGenerationProposalsTable,
    dictionaryGenerationProviderCircuitTable,
    dictionaryIdempotencyKeysTable,
    dictionarySettingsTable,
} from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';

describe('dictionary M1 relational schema contract', () => {
    it('keeps current cards typed and relational with no JSON source of truth', () => {
        const config = getTableConfig(dictionaryCardsTable);
        const columns = config.columns;

        expect(columns.map((column) => column.name)).toEqual(
            expect.arrayContaining([
                'source',
                'translation',
                'transcription',
                'definition',
                'example',
                'example_translation',
                'transcription_enabled_override',
                'definition_enabled_override',
                'example_enabled_override',
                'example_translation_enabled_override',
                'definition_language_role_override',
                'example_language_role_override',
                'transcription_notation_override',
                'custom_notation_label_override',
            ]),
        );
        expect(
            columns.filter((column) => column.getSQLType() === 'jsonb'),
        ).toEqual([]);
        expect(
            config.uniqueConstraints.map((constraint) => constraint.name),
        ).not.toContain('dictionary_cards_dictionary_sort_key_unique');
        expect(config.indexes.map((index) => index.config.name)).toEqual(
            expect.arrayContaining([
                'dictionary_cards_active_order_idx',
                'dictionary_cards_lifecycle_order_idx',
            ]),
        );
    });

    it('puts the sole M1 JSON payload on immutable revision history', () => {
        const config = getTableConfig(dictionaryCardRevisionsTable);
        const owningCardForeignKey = config.foreignKeys.find(
            (foreignKey) =>
                foreignKey.getName() ===
                'dictionary_card_revisions_card_dictionary_fk',
        );

        expect(
            config.columns
                .filter((column) => column.getSQLType() === 'jsonb')
                .map((column) => column.name),
        ).toEqual(['snapshot']);
        expect(config.columns.map((column) => column.name)).not.toContain(
            'updated_at',
        );
        expect(
            config.uniqueConstraints.map((constraint) => constraint.name),
        ).toEqual(
            expect.arrayContaining([
                'dictionary_card_revisions_card_revision_unique',
                'dictionary_card_revisions_card_version_unique',
            ]),
        );
        expect(owningCardForeignKey?.onDelete).toBe('cascade');
    });

    it('persists the approved source-role default for definitions', () => {
        expect(dictionarySettingsTable.definitionLanguageRole.default).toBe(
            'source',
        );
    });
});

describe('dictionary M3 generation schema contract', () => {
    it('keeps batch jobs cardless and stores one nullable accepted batch outcome', () => {
        const jobs = getTableConfig(dictionaryGenerationJobsTable);
        const proposals = getTableConfig(dictionaryGenerationProposalsTable);
        const acceptedBatchOutcome = proposals.columns.find(
            (column) => column.name === 'accepted_batch_outcome',
        );
        const proposalState = proposals.checks.find(
            (constraint) =>
                constraint.name ===
                'dictionary_generation_proposals_payload_state',
        );
        const proposalStateSql = proposalState
            ? new PgDialect().sqlToQuery(proposalState.value).sql
            : '';
        const providerPolicy = jobs.checks.find(
            (constraint) =>
                constraint.name ===
                'dictionary_generation_jobs_provider_policy',
        );
        const providerPolicySql = providerPolicy
            ? new PgDialect().sqlToQuery(providerPolicy.value).sql
            : '';
        const documentPublication = proposals.checks.find(
            (constraint) =>
                constraint.name ===
                'dictionary_generation_proposals_document_publication',
        );
        const documentPublicationSql = documentPublication
            ? new PgDialect().sqlToQuery(documentPublication.value).sql
            : '';

        expect(jobs.checks.map((constraint) => constraint.name)).toContain(
            'dictionary_generation_jobs_kind_card',
        );
        expect(acceptedBatchOutcome?.getSQLType()).toBe('jsonb');
        expect(acceptedBatchOutcome?.notNull).toBe(false);
        expect(proposals.checks.map((constraint) => constraint.name)).toContain(
            'dictionary_generation_proposals_payload_state',
        );
        expect(
            proposalStateSql.match(
                /"accepted_candidate_fingerprint" is not null/g,
            ),
        ).toHaveLength(3);
        expect(proposalStateSql).toContain(
            '"accepted_batch_outcome" is not null',
        );
        expect(proposalStateSql).toContain('"accepted_card_id" is not null');
        expect(proposalStateSql).toContain(
            '"accepted_duplicate_source" is not null',
        );
        expect(providerPolicySql).toContain(
            '"provider_max_output_tokens_per_attempt" between 128 and 40960',
        );
        expect(proposals.columns.map((column) => column.name)).toEqual(
            expect.arrayContaining([
                'document_staged_at',
                'document_published_at',
                'staged_provider_input_tokens',
                'staged_provider_output_tokens',
                'staged_provider_cost_micros',
            ]),
        );
        expect(documentPublicationSql).toContain(
            '"document_published_at" is null',
        );
        expect(documentPublicationSql).toContain(
            '"staged_provider_input_tokens" between 0 and 2621440',
        );
    });

    it('keys provider circuits by bounded versioned formats', () => {
        const circuit = getTableConfig(
            dictionaryGenerationProviderCircuitTable,
        );
        const checks = circuit.checks.map((constraint) => constraint.name);

        expect(checks).toContain(
            'dictionary_generation_provider_circuit_format',
        );
        expect(checks).not.toContain(
            'dictionary_generation_provider_circuit_singleton',
        );
    });
});

describe('dictionary M4 document persistence schema contract', () => {
    it('keeps upload-waiting jobs unclaimable through a local marker shape', () => {
        const jobs = getTableConfig(dictionaryGenerationJobsTable);
        const uploadWait = jobs.checks.find(
            (constraint) =>
                constraint.name === 'dictionary_generation_jobs_upload_wait',
        );
        const uploadWaitSql = uploadWait
            ? new PgDialect().sqlToQuery(uploadWait.value).sql
            : '';
        const progress = jobs.checks.find(
            (constraint) =>
                constraint.name === 'dictionary_generation_jobs_progress',
        );
        const progressSql = progress
            ? new PgDialect().sqlToQuery(progress.value).sql
            : '';

        expect(
            jobs.columns.find((column) => column.name === 'awaiting_upload_at')
                ?.notNull,
        ).toBe(false);
        expect(uploadWaitSql).toContain('"kind" = \'document-terms\'');
        expect(uploadWaitSql).toContain('"format" = \'document-terms:v1\'');
        expect(uploadWaitSql).toContain(
            '"provider_reservation_state" = \'released\'',
        );
        expect(progressSql).toContain("'scanning'");
        expect(progressSql).toContain("'extracting'");
        expect(progressSql).toContain("'ocr'");
        expect(progressSql).toContain("'cleaning'");
    });

    it('separates exact physical versions and transient extracted units from upload metadata', () => {
        const uploads = getTableConfig(dictionaryDocumentUploadsTable);
        const versions = getTableConfig(dictionaryDocumentObjectVersionsTable);
        const extractions = getTableConfig(dictionaryDocumentExtractionsTable);
        const extractionCounts = extractions.checks.find(
            (constraint) =>
                constraint.name === 'dictionary_document_extractions_counts',
        );
        const extractionCountsSql = extractionCounts
            ? new PgDialect().sqlToQuery(extractionCounts.value).sql
            : '';
        const quota = uploads.checks.find(
            (constraint) =>
                constraint.name === 'dictionary_document_uploads_quota',
        );
        const quotaSql = quota
            ? new PgDialect().sqlToQuery(quota.value).sql
            : '';
        const versionUploadForeignKey = versions.foreignKeys.find(
            (foreignKey) =>
                foreignKey.getName() ===
                'dictionary_document_object_versions_upload_id_dictionary_document_uploads_id_fk',
        );

        expect(uploads.columns.map((column) => column.name)).toEqual(
            expect.arrayContaining([
                'expected_checksum_sha256',
                'verified_storage_version_id',
                'accounted_physical_bytes',
                'tombstone_storage_version_id',
                'cleanup_fencing_token',
            ]),
        );
        expect(uploads.checks.map((constraint) => constraint.name)).toEqual(
            expect.arrayContaining([
                'dictionary_document_uploads_verified_file',
                'dictionary_document_uploads_quota',
                'dictionary_document_uploads_cleanup_outcome',
            ]),
        );
        expect(versions.indexes.map((index) => index.config.name)).toContain(
            'dictionary_document_object_versions_one_current',
        );
        expect(versionUploadForeignKey?.onDelete).toBe('restrict');
        expect(quotaSql).toContain("'waiting_capability_expiry'");
        expect(quotaSql).toContain('"data_versions_deleted_at" is not null');
        expect(
            extractions.columns
                .find((column) => column.name === 'payload')
                ?.getSQLType(),
        ).toBe('jsonb');
        expect(extractionCountsSql).toContain(
            '"observed_unit_count" between 0 and 101',
        );
        expect(extractionCountsSql).toContain(
            '"dictionary_document_extractions"."valid_unit_count" + "dictionary_document_extractions"."failure_unit_count" = "dictionary_document_extractions"."observed_unit_count"',
        );
    });
});

describe('dictionary M5 interchange persistence schema contract', () => {
    it('stores bounded exact bulk-import replay outcomes only for completed bulk commits', () => {
        const idempotency = getTableConfig(dictionaryIdempotencyKeysTable);
        const resultPayload = idempotency.columns.find(
            (column) => column.name === 'result_payload',
        );
        const stateResult = idempotency.checks.find(
            (constraint) =>
                constraint.name === 'dictionary_idempotency_keys_state_result',
        );
        const stateResultSql = stateResult
            ? new PgDialect().sqlToQuery(stateResult.value).sql
            : '';

        expect(resultPayload?.getSQLType()).toBe('jsonb');
        expect(resultPayload?.notNull).toBe(false);
        expect(stateResultSql).toContain('"operation" = \'bulk_commit\'');
        expect(stateResultSql).toContain(
            'jsonb_typeof("dictionary_idempotency_keys"."result_payload") = \'object\'',
        );
        expect(stateResultSql).toContain(
            'jsonb_typeof("dictionary_idempotency_keys"."result_payload"->\'dictionary\') = \'object\'',
        );
        expect(stateResultSql).toContain(
            'jsonb_typeof("dictionary_idempotency_keys"."result_payload"->\'cards\') = \'array\'',
        );
        expect(stateResultSql).toContain(
            "\"result_payload\"->>'mode' = 'deterministic'",
        );
        expect(stateResultSql).toContain(
            'jsonb_typeof("dictionary_idempotency_keys"."result_payload"->\'warnings\') = \'array\'',
        );
        expect(stateResultSql).toContain("\"result_payload\"->>'mode' = 'ai'");
        expect(stateResultSql).toContain(
            'jsonb_typeof("dictionary_idempotency_keys"."result_payload"->\'job\') = \'object\'',
        );
        expect(stateResultSql).toContain(
            'octet_length("dictionary_idempotency_keys"."result_payload"::text) <= 4194304',
        );
    });
});

describe('dictionary M6 observation schema contract', () => {
    it('indexes bounded job, proposal, and upload observation windows', () => {
        const jobs = getTableConfig(dictionaryGenerationJobsTable);
        const proposals = getTableConfig(dictionaryGenerationProposalsTable);
        const uploads = getTableConfig(dictionaryDocumentUploadsTable);
        const dialect = new PgDialect();
        const partialSql = (
            indexes: typeof jobs.indexes,
            name: string,
        ): string => {
            const where = indexes.find((index) => index.config.name === name)
                ?.config.where;
            return where ? dialect.sqlToQuery(where).sql : '';
        };

        expect(uploads.indexes.map((index) => index.config.name)).toContain(
            'dictionary_document_uploads_created_idx',
        );
        expect(
            partialSql(
                jobs.indexes,
                'dictionary_generation_jobs_completed_idx',
            ),
        ).toContain('"completed_at" is not null');
        expect(
            partialSql(
                jobs.indexes,
                'dictionary_generation_jobs_current_observation_idx',
            ),
        ).toContain("\"execution_state\" in ('queued', 'running')");
        expect(
            partialSql(
                proposals.indexes,
                'dictionary_generation_proposals_terminal_idx',
            ),
        ).toContain('"terminal_at" is not null');
        expect(
            partialSql(
                uploads.indexes,
                'dictionary_document_uploads_upload_completed_idx',
            ),
        ).toContain('"upload_completed_at" is not null');
        expect(
            partialSql(
                uploads.indexes,
                'dictionary_document_uploads_scan_completed_idx',
            ),
        ).toContain('"scan_completed_at" is not null');
    });
});
