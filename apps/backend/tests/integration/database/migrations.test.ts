import { appendFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
    grantDisposableMigrationPurpose,
    MigrationHistoryMismatchError,
    runPostgresMigrations,
    type PostgresClient,
} from '@languon/database';

import {
    createTestPostgresClient,
    getMigrationsFolder,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../support/test-database';

let client: PostgresClient;

describe.runIf(isDatabaseIntegrationEnabled())('database migrations', () => {
    beforeAll(() => {
        client = createTestPostgresClient();
    });
    beforeEach(async () => {
        await resetTestDatabase(client);
    });

    afterAll(async () => {
        await client.end();
    });

    it('applies the clean application schema without seed data', async () => {
        await migrateTestDatabase(client);

        const tables = await client<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
      order by table_name
    `;
        const rowCounts = await client<{ count: string }[]>`
      select sum(row_count)::text as count
      from (
        select count(*) as row_count from users
        union all select count(*) from user_emails
        union all select count(*) from password_credentials
        union all select count(*) from auth_verification_challenges
        union all select count(*) from auth_sessions
        union all select count(*) from auth_passkeys
        union all select count(*) from auth_security_events
        union all select count(*) from admin_memberships
        union all select count(*) from admin_audit_events
        union all select count(*) from dictionaries
        union all select count(*) from dictionary_settings
        union all select count(*) from dictionary_cards
        union all select count(*) from dictionary_card_revisions
        union all select count(*) from dictionary_document_uploads
        union all select count(*) from dictionary_document_object_versions
        union all select count(*) from dictionary_document_extractions
        union all select count(*) from dictionary_generation_jobs
        union all select count(*) from dictionary_generation_proposals
        union all select count(*) from dictionary_idempotency_keys
      ) counts
    `;

        expect(tables.map(({ table_name }) => table_name)).toEqual([
            'admin_audit_events',
            'admin_memberships',
            'auth_passkeys',
            'auth_security_events',
            'auth_sessions',
            'auth_verification_challenges',
            'dictionaries',
            'dictionary_card_revisions',
            'dictionary_cards',
            'dictionary_document_extractions',
            'dictionary_document_object_versions',
            'dictionary_document_uploads',
            'dictionary_generation_jobs',
            'dictionary_generation_proposals',
            'dictionary_generation_provider_circuit',
            'dictionary_idempotency_keys',
            'dictionary_settings',
            'password_credentials',
            'user_emails',
            'users',
        ]);
        expect(rowCounts[0]?.count).toBe('0');
    });

    it('creates the required constraints and lookup indexes', async () => {
        await migrateTestDatabase(client);

        const proposalColumns = await client<
            {
                column_name: string;
                data_type: string;
                is_nullable: 'YES' | 'NO';
            }[]
        >`
      select column_name, data_type, is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'dictionary_generation_proposals'
        and column_name = 'accepted_batch_outcome'
    `;
        const jobColumns = await client<
            {
                column_name: string;
                data_type: string;
                is_nullable: 'YES' | 'NO';
            }[]
        >`
      select column_name, data_type, is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'dictionary_generation_jobs'
        and column_name = 'awaiting_upload_at'
    `;
        const documentProposalColumns = await client<
            {
                column_name: string;
                data_type: string;
                is_nullable: 'YES' | 'NO';
            }[]
        >`
      select column_name, data_type, is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'dictionary_generation_proposals'
        and column_name in (
          'document_published_at',
          'document_staged_at',
          'staged_provider_cost_micros',
          'staged_provider_input_tokens',
          'staged_provider_output_tokens'
        )
      order by column_name
    `;
        const idempotencyResultColumns = await client<
            {
                column_name: string;
                data_type: string;
                is_nullable: 'YES' | 'NO';
            }[]
        >`
      select column_name, data_type, is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'dictionary_idempotency_keys'
        and column_name = 'result_payload'
    `;
        const constraints = await client<{ constraint_name: string }[]>`
      select constraint_name
      from information_schema.table_constraints
      where table_schema = 'public'
        and table_name in (
          'users',
          'user_emails',
          'password_credentials',
          'auth_verification_challenges',
          'auth_sessions',
          'auth_passkeys',
          'auth_security_events'
          ,'admin_memberships'
          ,'admin_audit_events'
          ,'dictionaries'
          ,'dictionary_settings'
          ,'dictionary_cards'
          ,'dictionary_card_revisions'
          ,'dictionary_document_uploads'
          ,'dictionary_document_object_versions'
          ,'dictionary_document_extractions'
          ,'dictionary_generation_jobs'
          ,'dictionary_generation_proposals'
          ,'dictionary_generation_provider_circuit'
          ,'dictionary_idempotency_keys'
        )
      order by constraint_name
    `;
        const providerPolicy = await client<{ definition: string }[]>`
      select pg_get_constraintdef(oid) as definition
      from pg_constraint
      where conname = 'dictionary_generation_jobs_provider_policy'
    `;
        const idempotencyStateResult = await client<{ definition: string }[]>`
      select pg_get_constraintdef(oid) as definition
      from pg_constraint
      where conname = 'dictionary_idempotency_keys_state_result'
    `;
        const indexes = await client<{ indexname: string }[]>`
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and tablename in (
          'users',
          'user_emails',
          'password_credentials',
          'auth_verification_challenges',
          'auth_sessions',
          'auth_passkeys',
          'auth_security_events'
          ,'admin_memberships'
          ,'admin_audit_events'
          ,'dictionaries'
          ,'dictionary_settings'
          ,'dictionary_cards'
          ,'dictionary_card_revisions'
          ,'dictionary_document_uploads'
          ,'dictionary_document_object_versions'
          ,'dictionary_document_extractions'
          ,'dictionary_generation_jobs'
          ,'dictionary_generation_proposals'
          ,'dictionary_idempotency_keys'
        )
      order by indexname
    `;

        expect(proposalColumns).toEqual([
            {
                column_name: 'accepted_batch_outcome',
                data_type: 'jsonb',
                is_nullable: 'YES',
            },
        ]);
        expect(jobColumns).toEqual([
            {
                column_name: 'awaiting_upload_at',
                data_type: 'timestamp with time zone',
                is_nullable: 'YES',
            },
        ]);
        expect(documentProposalColumns).toEqual([
            {
                column_name: 'document_published_at',
                data_type: 'timestamp with time zone',
                is_nullable: 'YES',
            },
            {
                column_name: 'document_staged_at',
                data_type: 'timestamp with time zone',
                is_nullable: 'YES',
            },
            {
                column_name: 'staged_provider_cost_micros',
                data_type: 'integer',
                is_nullable: 'YES',
            },
            {
                column_name: 'staged_provider_input_tokens',
                data_type: 'integer',
                is_nullable: 'YES',
            },
            {
                column_name: 'staged_provider_output_tokens',
                data_type: 'integer',
                is_nullable: 'YES',
            },
        ]);
        expect(idempotencyResultColumns).toEqual([
            {
                column_name: 'result_payload',
                data_type: 'jsonb',
                is_nullable: 'YES',
            },
        ]);
        expect(
            constraints.map(({ constraint_name }) => constraint_name),
        ).toEqual(
            expect.arrayContaining([
                'user_emails_canonical_email_length',
                'user_emails_canonical_matches_email',
                'user_emails_email_length',
                'user_emails_pkey',
                'user_emails_user_id_users_id_fk',
                'user_emails_id_user_id_unique',
                'auth_verification_challenges_email_user_fk',
                'users_pkey',
                'users_version_positive',
                'password_credentials_argon2id_only',
                'password_credentials_parameters_safe',
                'auth_verification_challenges_attempts_bounded',
                'auth_sessions_digest_format',
                'auth_sessions_rotation_state',
                'auth_passkeys_counter_nonnegative',
                'auth_security_events_metadata_bounded',
                'admin_memberships_reason_length',
                'admin_memberships_revocation_pair',
                'admin_audit_events_metadata_bounded',
                'admin_audit_events_expiry_after_occurrence',
                'dictionaries_language_pair_distinct',
                'dictionaries_share_state',
                'dictionary_cards_id_dictionary_unique',
                'dictionary_card_revisions_card_dictionary_fk',
                'dictionary_document_extractions_counts',
                'dictionary_document_extractions_upload_job_fk',
                'dictionary_document_object_versions_kind_size',
                'dictionary_document_uploads_cleanup_outcome',
                'dictionary_document_uploads_dictionary_owner_fk',
                'dictionary_document_uploads_verified_file',
                'dictionary_generation_jobs_execution_lease',
                'dictionary_generation_jobs_kind_card',
                'dictionary_generation_jobs_provider_policy',
                'dictionary_generation_jobs_upload_wait',
                'dictionary_generation_proposals_payload_state',
                'dictionary_generation_proposals_document_publication',
                'dictionary_generation_provider_circuit_format',
                'dictionary_idempotency_keys_result_owner_fk',
                'dictionary_idempotency_keys_state_result',
                'dictionary_settings_custom_label_required',
            ]),
        );
        expect(
            constraints.map(({ constraint_name }) => constraint_name),
        ).not.toContain('dictionary_generation_provider_circuit_singleton');
        expect(providerPolicy).toHaveLength(1);
        expect(providerPolicy[0]?.definition).toContain(
            'provider_max_output_tokens_per_attempt >= 128',
        );
        expect(providerPolicy[0]?.definition).toContain(
            'provider_max_output_tokens_per_attempt <= 40960',
        );
        expect(providerPolicy[0]?.definition).not.toContain(
            'provider_max_output_tokens_per_attempt <= 1024',
        );
        expect(idempotencyStateResult).toHaveLength(1);
        expect(idempotencyStateResult[0]?.definition).toContain(
            "operation = 'bulk_commit'::dictionary_idempotency_operation",
        );
        expect(idempotencyStateResult[0]?.definition).toContain(
            "jsonb_typeof(result_payload) = 'object'::text",
        );
        expect(idempotencyStateResult[0]?.definition).toContain(
            'octet_length((result_payload)::text) <= 4194304',
        );
        expect(indexes.map(({ indexname }) => indexname)).toEqual(
            expect.arrayContaining([
                'user_emails_canonical_email_unique',
                'user_emails_one_primary_per_user',
                'user_emails_user_id_idx',
                'user_emails_id_user_id_unique',
                'users_status_idx',
                'auth_verification_challenges_one_active_user_purpose',
                'auth_sessions_refresh_digest_unique',
                'auth_passkeys_credential_id_unique',
                'auth_security_events_expiry_idx',
                'admin_memberships_one_active_per_user',
                'admin_audit_events_correlation_idx',
                'admin_audit_events_expiry_idx',
                'dictionaries_owner_lifecycle_updated_idx',
                'dictionaries_share_locator_unique',
                'dictionary_cards_active_order_idx',
                'dictionary_cards_search_idx',
                'dictionary_card_revisions_dictionary_created_idx',
                'dictionary_document_extractions_payload_expiry_idx',
                'dictionary_document_object_versions_one_current',
                'dictionary_document_uploads_cleanup_claim_idx',
                'dictionary_document_uploads_created_idx',
                'dictionary_document_uploads_owner_quota_idx',
                'dictionary_document_uploads_scan_completed_idx',
                'dictionary_document_uploads_upload_completed_idx',
                'dictionary_generation_jobs_claim_idx',
                'dictionary_generation_jobs_completed_idx',
                'dictionary_generation_jobs_current_observation_idx',
                'dictionary_generation_jobs_owner_kind_key_unique',
                'dictionary_generation_proposals_expiry_idx',
                'dictionary_generation_proposals_terminal_idx',
                'dictionary_idempotency_keys_owner_operation_key_unique',
            ]),
        );
    });

    it('is idempotent when the checked-in migration set is already applied', async () => {
        await migrateTestDatabase(client);
        await migrateTestDatabase(client);

        const history = await client<{ count: string }[]>`
      select count(*)
      from languon_migrations.history
    `;

        expect(history[0]?.count).toBe('18');
    });

    it('serializes simultaneous migration runners with the advisory lock', async () => {
        const secondClient = createTestPostgresClient();

        try {
            await Promise.all([
                migrateTestDatabase(client),
                runPostgresMigrations({
                    client: secondClient,
                    migrationsFolder: getMigrationsFolder(),
                    purpose: grantDisposableMigrationPurpose(),
                }),
            ]);

            const history = await client<{ count: string }[]>`
        select count(*)
        from languon_migrations.history
      `;

            expect(history[0]?.count).toBe('18');
        } finally {
            await secondClient.end();
        }
    });

    it('rejects edits to a migration that is already recorded in history', async () => {
        await migrateTestDatabase(client);
        const temporaryDirectory = mkdtempSync(
            join(tmpdir(), 'languon-migrations-'),
        );
        const copiedMigrations = join(temporaryDirectory, 'drizzle');

        try {
            cpSync(getMigrationsFolder(), copiedMigrations, {
                recursive: true,
            });
            appendFileSync(
                join(copiedMigrations, '0000_foamy_angel.sql'),
                '\n-- tampered after application\n',
            );

            await expect(
                runPostgresMigrations({
                    client,
                    migrationsFolder: copiedMigrations,
                    purpose: grantDisposableMigrationPurpose(),
                }),
            ).rejects.toBeInstanceOf(MigrationHistoryMismatchError);
        } finally {
            rmSync(temporaryDirectory, { force: true, recursive: true });
        }
    });
});
