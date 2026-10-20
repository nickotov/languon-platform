import {
    appendFileSync,
    cpSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readMigrationFiles } from 'drizzle-orm/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
    createDrizzleDatabase,
    grantDisposableMigrationPurpose,
    MigrationHistoryMismatchError,
    runPostgresMigrations,
    type PostgresClient,
} from '@languon/database';

import { databaseSchema } from '../../../src/infrastructure/database/schema';
import { DrizzleAiCreditTransactionParticipant } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';

import {
    createTestPostgresClient,
    getMigrationsFolder,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../support/test-database';

let client: PostgresClient;

async function withPendingMigrationFixture(
    baselineSql: string,
    upgradeSql: string,
    verify: (input: {
        upgradePath: string;
        migrate: () => Promise<void>;
    }) => Promise<void>,
): Promise<void> {
    const migrationsFolder = mkdtempSync(
        join(tmpdir(), 'languon-enum-integrity-'),
    );
    try {
        mkdirSync(join(migrationsFolder, 'meta'));
        const entries = [
            {
                idx: 0,
                version: '7',
                when: 1,
                tag: '0000_baseline',
                breakpoints: true,
            },
            {
                idx: 1,
                version: '7',
                when: 2,
                tag: '0001_upgrade',
                breakpoints: true,
            },
        ];
        const journalPath = join(migrationsFolder, 'meta', '_journal.json');
        const writeJournal = (count: number) =>
            writeFileSync(
                journalPath,
                JSON.stringify({
                    version: '7',
                    dialect: 'postgresql',
                    entries: entries.slice(0, count),
                }),
            );
        const migrate = () =>
            runPostgresMigrations({
                client,
                migrationsFolder,
                purpose: grantDisposableMigrationPurpose(),
            });
        writeJournal(1);
        writeFileSync(join(migrationsFolder, '0000_baseline.sql'), baselineSql);
        await migrate();
        writeJournal(2);
        const upgradePath = join(migrationsFolder, '0001_upgrade.sql');
        writeFileSync(upgradePath, upgradeSql);
        await verify({ upgradePath, migrate });
    } finally {
        rmSync(migrationsFolder, { force: true, recursive: true });
    }
}

describe.runIf(isDatabaseIntegrationEnabled())('database migrations', () => {
    const audioRetirementBaseline = `
        create table dictionary_audio_assets (id integer primary key);
        create table dictionary_audio_bindings (id integer primary key);
        create table dictionary_audio_jobs (id integer primary key);
        create table dictionary_audio_blobs (namespace text, key text, bytes bytea);
        insert into dictionary_audio_blobs values ('current-speech', 'retained', decode('010203', 'hex'));
        create table speech_recordings (id integer primary key);
        insert into speech_recordings values (1);
    `;

    it.each([
        'dictionary_audio_assets',
        'dictionary_audio_bindings',
        'dictionary_audio_jobs',
    ])(
        'refuses audio retirement with outstanding inventory in %s',
        async (table) => {
            const upgradeSql = readFileSync(
                join(getMigrationsFolder(), '0074_retire_dictionary_audio.sql'),
                'utf8',
            );
            await withPendingMigrationFixture(
                audioRetirementBaseline,
                upgradeSql,
                async ({ migrate }) => {
                    await client.unsafe(`insert into ${table} values (1)`);
                    await expect(migrate()).rejects.toThrow(
                        'Obsolete dictionary audio inventory must be reconciled',
                    );
                    expect(
                        await client.unsafe(`select id from ${table}`),
                    ).toEqual([{ id: 1 }]);
                    expect(
                        (
                            await client.unsafe(
                                'select * from dictionary_audio_blobs',
                            )
                        )[0]?.bytes,
                    ).toEqual(Buffer.from([1, 2, 3]));
                    await client.unsafe(`delete from ${table}`);
                    await migrate();
                    expect(
                        await client.unsafe(
                            "select to_regclass('dictionary_audio_assets') as assets, to_regclass('dictionary_audio_bindings') as bindings, to_regclass('dictionary_audio_jobs') as jobs",
                        ),
                    ).toEqual([{ assets: null, bindings: null, jobs: null }]);
                    expect(
                        (
                            await client.unsafe(
                                'select * from dictionary_audio_blobs',
                            )
                        )[0]?.bytes,
                    ).toEqual(Buffer.from([1, 2, 3]));
                    expect(
                        await client.unsafe('select id from speech_recordings'),
                    ).toEqual([{ id: 1 }]);
                },
            );
        },
    );

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
            'account_deletion_requests',
            'admin_audit_events',
            'admin_memberships',
            'ai_credit_accounts',
            'ai_credit_admin_removal_allocations',
            'ai_credit_admin_removals',
            'ai_credit_grants',
            'ai_credit_history',
            'ai_credit_reservation_allocations',
            'ai_credit_reservations',
            'auth_passkeys',
            'auth_security_events',
            'auth_sessions',
            'auth_verification_challenges',
            'conversation_chats',
            'conversation_drafts',
            'conversation_events',
            'conversation_memory',
            'conversation_messages',
            'conversation_provider_calls',
            'conversation_settings',
            'conversation_turns',
            'dictionaries',
            'dictionary_ai_configuration',
            'dictionary_ai_configuration_revisions',
            'dictionary_ai_worker_observations',
            'dictionary_audio_blobs',
            'dictionary_card_revisions',
            'dictionary_cards',
            'dictionary_deletion_receipts',
            'dictionary_document_extractions',
            'dictionary_document_object_versions',
            'dictionary_document_uploads',
            'dictionary_generation_jobs',
            'dictionary_generation_proposals',
            'dictionary_generation_provider_circuit',
            'dictionary_generation_provider_usage_archive',
            'dictionary_idempotency_keys',
            'dictionary_settings',
            'dictionary_text_selection_jobs',
            'flashcard_attempts',
            'flashcard_entry_progress',
            'flashcard_preferences',
            'knowledge_note_revisions',
            'knowledge_notes',
            'knowledge_operation_receipts',
            'knowledge_shares',
            'knowledge_working_branches',
            'model_price_revisions',
            'password_credentials',
            'sentence_ai_jobs',
            'sentence_attempts',
            'sentence_entry_coverage',
            'sentence_exercise_entries',
            'sentence_exercises',
            'sentence_exposures',
            'sentence_global_visibility',
            'sentence_job_entries',
            'sentence_library_receipts',
            'sentence_library_snapshots',
            'sentence_manual_reviews',
            'sentence_next_receipts',
            'sentence_personal_visibility',
            'sentence_preparation_batches',
            'sentence_preparation_children',
            'sentence_preparation_commands',
            'sentence_preparations',
            'speech_bindings',
            'speech_jobs',
            'speech_quotes',
            'speech_recordings',
            'text_folders',
            'text_idempotency',
            'text_revisions',
            'text_shares',
            'texts',
            'texts_ai_jobs',
            'user_emails',
            'user_text_ai_preferences',
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
        const contextColumns = await client<
            {
                column_name: string;
                is_nullable: 'YES' | 'NO';
                table_name: string;
            }[]
        >`
      select table_name, column_name, is_nullable
      from information_schema.columns
      where table_schema = 'public'
        and table_name in ('dictionaries', 'dictionary_cards')
        and column_name = 'translation_context'
      order by table_name
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
        expect(contextColumns).toEqual([
            {
                column_name: 'translation_context',
                is_nullable: 'YES',
                table_name: 'dictionaries',
            },
            {
                column_name: 'translation_context',
                is_nullable: 'YES',
                table_name: 'dictionary_cards',
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

        expect(history[0]?.count).toBe(
            String(
                readMigrationFiles({ migrationsFolder: getMigrationsFolder() })
                    .length,
            ),
        );
    });

    it('upgrades pre-learning vocabulary additively with initial learning versions', async () => {
        const temporaryDirectory = mkdtempSync(
            join(tmpdir(), 'languon-learning-upgrade-'),
        );
        const copiedMigrations = join(temporaryDirectory, 'drizzle');
        try {
            cpSync(getMigrationsFolder(), copiedMigrations, {
                recursive: true,
            });
            const journalPath = join(copiedMigrations, 'meta', '_journal.json');
            const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
                entries: { idx: number }[];
            };
            journal.entries = journal.entries.filter((entry) => entry.idx < 37);
            // Only the temporary fixture journal is reduced; checked-in generated
            // migrations remain immutable and are then applied unchanged.
            writeFileSync(journalPath, JSON.stringify(journal));
            await runPostgresMigrations({
                client,
                migrationsFolder: copiedMigrations,
                purpose: grantDisposableMigrationPurpose(),
            });
            const ownerId = '11111111-1111-4111-8111-111111111111';
            const dictionaryId = '22222222-2222-4222-8222-222222222222';
            const entryId = '33333333-3333-4333-8333-333333333333';
            await client`insert into users (id,status) values (${ownerId},'active')`;
            await client`insert into dictionaries (id,owner_id,name,source_language_tag,target_language_tag) values (${dictionaryId},${ownerId},'Upgrade fixture','en','es')`;
            await client`insert into dictionary_settings (dictionary_id) values (${dictionaryId})`;
            await client`insert into dictionary_cards (id,dictionary_id,source,normalized_source,translation,sort_key,authorship) values (${entryId},${dictionaryId},'hello','hello','hola',1024,'human')`;
            await migrateTestDatabase(client);
            const [entry] = await client<
                {
                    source: string;
                    translation: string;
                    learning_version: number;
                    version: number;
                }[]
            >`
                select source,translation,learning_version,version from dictionary_cards where id=${entryId}`;
            expect(entry).toEqual({
                source: 'hello',
                translation: 'hola',
                learning_version: 1,
                version: 1,
            });
            const [state] = await client<{ count: number }[]>`
                select ((select count(*) from flashcard_attempts)+(select count(*) from flashcard_entry_progress)+(select count(*) from flashcard_preferences))::int as count`;
            expect(state?.count).toBe(0);
            await expect(
                client`update dictionary_cards set learning_version=0 where id=${entryId}`,
            ).rejects.toMatchObject({ code: '23514' });
        } finally {
            rmSync(temporaryDirectory, { force: true, recursive: true });
        }
    });

    it('upgrades the existing 0056 schema with committed speech enum labels and preserves data', async () => {
        const temporaryDirectory = mkdtempSync(
            join(tmpdir(), 'languon-speech-upgrade-'),
        );
        const copiedMigrations = join(temporaryDirectory, 'drizzle');
        try {
            cpSync(getMigrationsFolder(), copiedMigrations, {
                recursive: true,
            });
            const journalPath = join(copiedMigrations, 'meta', '_journal.json');
            const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
                entries: { idx: number }[];
            };
            journal.entries = journal.entries.filter(
                (entry) => entry.idx <= 56,
            );
            writeFileSync(journalPath, JSON.stringify(journal));
            await runPostgresMigrations({
                client,
                migrationsFolder: copiedMigrations,
                purpose: grantDisposableMigrationPurpose(),
            });
            const ownerId = '11111111-1111-4111-8111-111111111111';
            const dictionaryId = '22222222-2222-4222-8222-222222222222';
            await client`insert into users (id,status) values (${ownerId},'active')`;
            await client`insert into dictionaries (id,owner_id,name,source_language_tag,target_language_tag) values (${dictionaryId},${ownerId},'Speech upgrade fixture','en','es')`;
            const database = createDrizzleDatabase(client, databaseSchema);
            await database.transaction(async (transaction) => {
                const credits = new DrizzleAiCreditTransactionParticipant(
                    transaction,
                );
                await credits.issueGrant({
                    amount: 250n,
                    createdAt: new Date('2026-10-01T00:00:00Z'),
                    expiresAt: null,
                    ownerId,
                    source: 'admin',
                    sourceReference: 'speech-upgrade-fixture',
                });
            });
            const snapshot = async () => {
                const [row] = await client<{ state: unknown }[]>`
                    select jsonb_build_object(
                        'users', (select jsonb_agg(to_jsonb(u)) from users u),
                        'dictionaries', (select jsonb_agg(to_jsonb(d)) from dictionaries d),
                        'accounts', (select jsonb_agg(to_jsonb(a)) from ai_credit_accounts a),
                        'grants', (select jsonb_agg(to_jsonb(g)) from ai_credit_grants g),
                        'history', (select jsonb_agg(to_jsonb(h)) from ai_credit_history h)
                    ) as state
                `;
                return row?.state;
            };
            const before = await snapshot();
            await migrateTestDatabase(client);
            expect(await snapshot()).toEqual(before);
            const labels = await client<{ enumlabel: string }[]>`
                select e.enumlabel from pg_enum e
                join pg_type t on t.oid=e.enumtypid
                where t.typname='ai_credit_measurement'
                order by e.enumsortorder
            `;
            expect(labels.map(({ enumlabel }) => enumlabel)).toEqual(
                expect.arrayContaining(['speech_success', 'speech_no_charge']),
            );
            const tables = await client<{ name: string | null }[]>`
                select to_regclass('public.speech_recordings')::text as name
                union all select to_regclass('public.speech_jobs')::text
            `;
            expect(tables.map(({ name }) => name)).toEqual([
                'speech_recordings',
                'speech_jobs',
            ]);
            const history = await client<
                { hash: string; created_at: string }[]
            >`
                select hash, created_at::text from languon_migrations.history order by created_at
            `;
            expect(history).toEqual(
                readMigrationFiles({
                    migrationsFolder: getMigrationsFolder(),
                }).map((migration) => ({
                    hash: migration.hash,
                    created_at: String(migration.folderMillis),
                })),
            );
            await migrateTestDatabase(client);
            expect(await snapshot()).toEqual(before);
            expect(
                await client`select hash, created_at::text from languon_migrations.history order by created_at`,
            ).toEqual(history);
        } finally {
            rmSync(temporaryDirectory, { force: true, recursive: true });
        }
    });

    it('keeps enum preparation retryable while rolling back failed schema and history changes', async () => {
        const temporaryDirectory = mkdtempSync(
            join(tmpdir(), 'languon-enum-retry-'),
        );
        try {
            mkdirSync(join(temporaryDirectory, 'meta'));
            const entries = [
                {
                    idx: 0,
                    version: '7',
                    when: 1,
                    tag: '0000_baseline',
                    breakpoints: true,
                },
                {
                    idx: 1,
                    version: '7',
                    when: 2,
                    tag: '0001_upgrade',
                    breakpoints: true,
                },
            ];
            const journalPath = join(
                temporaryDirectory,
                'meta',
                '_journal.json',
            );
            writeFileSync(
                journalPath,
                JSON.stringify({
                    version: '7',
                    dialect: 'postgresql',
                    entries: entries.slice(0, 1),
                }),
            );
            writeFileSync(
                join(temporaryDirectory, '0000_baseline.sql'),
                `CREATE TYPE "public"."enum_retry_operation" AS ENUM ('existing');`,
            );
            const migrate = () =>
                runPostgresMigrations({
                    client,
                    migrationsFolder: temporaryDirectory,
                    purpose: grantDisposableMigrationPurpose(),
                });
            await migrate();
            writeFileSync(
                journalPath,
                JSON.stringify({
                    version: '7',
                    dialect: 'postgresql',
                    entries,
                }),
            );
            const upgradeSql = `ALTER TYPE "public"."enum_retry_operation" ADD VALUE 'success' BEFORE 'existing';
--> statement-breakpoint
ALTER TYPE "public"."enum_retry_operation" ADD VALUE 'reused' AFTER 'success';
--> statement-breakpoint
CREATE TABLE "enum_retry_results" ("operation" "public"."enum_retry_operation" NOT NULL, CONSTRAINT "enum_retry_success" CHECK ("operation" IN ('success', 'reused')));`;
            const upgradePath = join(temporaryDirectory, '0001_upgrade.sql');
            writeFileSync(
                upgradePath,
                `${upgradeSql}\n--> statement-breakpoint\nSELECT 1 / 0;`,
            );
            await expect(migrate()).rejects.toMatchObject({
                cause: { code: '22012' },
            });
            const labels = await client<{ enumlabel: string }[]>`
                select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid
                where t.typname='enum_retry_operation' order by e.enumsortorder
            `;
            expect(labels.map(({ enumlabel }) => enumlabel)).toEqual([
                'success',
                'reused',
                'existing',
            ]);
            const [table] = await client<
                { name: string | null }[]
            >`select to_regclass('public.enum_retry_results')::text as name`;
            expect(table?.name).toBeNull();
            expect(
                await client`select hash from languon_migrations.history`,
            ).toEqual([
                {
                    hash: readMigrationFiles({
                        migrationsFolder: temporaryDirectory,
                    })[0]?.hash,
                },
            ]);
            writeFileSync(upgradePath, upgradeSql);
            await migrate();
            await client`insert into enum_retry_results (operation) values ('success'), ('reused')`;
            const history =
                await client`select hash from languon_migrations.history order by created_at`;
            expect(history).toEqual(
                readMigrationFiles({
                    migrationsFolder: temporaryDirectory,
                }).map(({ hash }) => ({ hash })),
            );
            await migrate();
            expect(
                await client`select hash from languon_migrations.history order by created_at`,
            ).toEqual(history);
        } finally {
            rmSync(temporaryDirectory, { force: true, recursive: true });
        }
    });

    it('rejects an unapplied retry that changes a committed enum label ordering', async () => {
        const ddl = `CREATE TABLE "enum_integrity_result" (id integer);`;
        await withPendingMigrationFixture(
            `CREATE TYPE "public"."enum_integrity_operation" AS ENUM ('anchor');`,
            `ALTER TYPE "public"."enum_integrity_operation" ADD VALUE 'x' BEFORE 'anchor';
--> statement-breakpoint
${ddl}
--> statement-breakpoint
SELECT 1 / 0;`,
            async ({ upgradePath, migrate }) => {
                const baselineHistory =
                    await client`select hash from languon_migrations.history`;
                await expect(migrate()).rejects.toMatchObject({
                    cause: { code: '22012' },
                });
                writeFileSync(
                    upgradePath,
                    `ALTER TYPE "public"."enum_integrity_operation" ADD VALUE 'x' AFTER 'anchor';
--> statement-breakpoint
${ddl}`,
                );
                await expect(migrate()).rejects.toThrow(
                    /enum.*order|order.*enum/i,
                );
                expect(
                    await client`select hash from languon_migrations.history`,
                ).toEqual(baselineHistory);
                const [table] = await client<
                    { name: string | null }[]
                >`select to_regclass('public.enum_integrity_result')::text as name`;
                expect(table?.name).toBeNull();
                const labels = await client<{ enumlabel: string }[]>`
                    select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid
                    where t.typname='enum_integrity_operation' order by e.enumsortorder
                `;
                expect(labels.map(({ enumlabel }) => enumlabel)).toEqual([
                    'x',
                    'anchor',
                ]);
            },
        );
    });

    it('keeps duplicate labels in a freshly created enum invalid and rolls back the type', async () => {
        await withPendingMigrationFixture(
            `CREATE TABLE "enum_integrity_baseline" (id integer);`,
            `CREATE TYPE "public"."enum_integrity_operation" AS ENUM ('x');
--> statement-breakpoint
ALTER TYPE "public"."enum_integrity_operation" ADD VALUE 'x';`,
            async ({ migrate }) => {
                const baselineHistory =
                    await client`select hash from languon_migrations.history`;
                await expect(migrate()).rejects.toMatchObject({
                    cause: { code: '42710' },
                });
                const [type] = await client<
                    { name: string | null }[]
                >`select to_regtype('public.enum_integrity_operation')::text as name`;
                expect(type?.name).toBeNull();
                expect(
                    await client`select hash from languon_migrations.history`,
                ).toEqual(baselineHistory);
            },
        );
    });

    it('rejects an existing label that conflicts with a pending enum append', async () => {
        await withPendingMigrationFixture(
            `CREATE TYPE "public"."enum_integrity_operation" AS ENUM ('anchor');`,
            `ALTER TYPE "public"."enum_integrity_operation" ADD VALUE 'x';
--> statement-breakpoint
CREATE TABLE "enum_integrity_result" (id integer);`,
            async ({ migrate }) => {
                const baselineHistory =
                    await client`select hash from languon_migrations.history`;
                await client`ALTER TYPE "public"."enum_integrity_operation" ADD VALUE 'x' BEFORE 'anchor'`;
                await expect(migrate()).rejects.toThrow(
                    /enum.*order|order.*enum/i,
                );
                expect(
                    await client`select hash from languon_migrations.history`,
                ).toEqual(baselineHistory);
                const [table] = await client<
                    { name: string | null }[]
                >`select to_regclass('public.enum_integrity_result')::text as name`;
                expect(table?.name).toBeNull();
            },
        );
    });

    it('retries multiple bare enum appends after a later schema failure', async () => {
        const upgradeSql = `ALTER TYPE "public"."enum_integrity_operation" ADD VALUE 'x';
--> statement-breakpoint
ALTER TYPE "public"."enum_integrity_operation" ADD VALUE 'y';
--> statement-breakpoint
CREATE TABLE "enum_integrity_result" ("operation" "public"."enum_integrity_operation" CHECK ("operation" IN ('x', 'y')));`;
        await withPendingMigrationFixture(
            `CREATE TYPE "public"."enum_integrity_operation" AS ENUM ('anchor');`,
            `${upgradeSql}\n--> statement-breakpoint\nSELECT 1 / 0;`,
            async ({ upgradePath, migrate }) => {
                const baselineHistory =
                    await client`select hash from languon_migrations.history`;
                await expect(migrate()).rejects.toMatchObject({
                    cause: { code: '22012' },
                });
                expect(
                    await client`select hash from languon_migrations.history`,
                ).toEqual(baselineHistory);
                const [table] = await client<
                    { name: string | null }[]
                >`select to_regclass('public.enum_integrity_result')::text as name`;
                expect(table?.name).toBeNull();
                writeFileSync(upgradePath, upgradeSql);
                await migrate();
                await client`insert into enum_integrity_result (operation) values ('x'), ('y')`;
                const labels = await client<{ enumlabel: string }[]>`
                    select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid
                    where t.typname='enum_integrity_operation' order by e.enumsortorder
                `;
                expect(labels.map(({ enumlabel }) => enumlabel)).toEqual([
                    'anchor',
                    'x',
                    'y',
                ]);
                const history =
                    await client`select hash from languon_migrations.history order by created_at`;
                expect(history).toHaveLength(2);
                await migrate();
                expect(
                    await client`select hash from languon_migrations.history order by created_at`,
                ).toEqual(history);
            },
        );
    });

    it('rejects duplicate bare additions to an existing enum before committing any label', async () => {
        await withPendingMigrationFixture(
            `CREATE TYPE "public"."enum_integrity_operation" AS ENUM ('anchor');`,
            `ALTER TYPE "public"."enum_integrity_operation" ADD VALUE 'x';
--> statement-breakpoint
ALTER TYPE "public"."enum_integrity_operation" ADD VALUE 'x';
--> statement-breakpoint
CREATE TABLE "enum_integrity_result" (id integer);`,
            async ({ migrate }) => {
                const baselineHistory =
                    await client`select hash from languon_migrations.history`;
                await expect(migrate()).rejects.toThrow(
                    /duplicate enum label addition/i,
                );
                expect(
                    await client`select hash from languon_migrations.history`,
                ).toEqual(baselineHistory);
                const [table] = await client<
                    { name: string | null }[]
                >`select to_regclass('public.enum_integrity_result')::text as name`;
                expect(table?.name).toBeNull();
                const labels = await client<{ enumlabel: string }[]>`
                    select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid
                    where t.typname='enum_integrity_operation' order by e.enumsortorder
                `;
                expect(labels.map(({ enumlabel }) => enumlabel)).toEqual([
                    'anchor',
                ]);
            },
        );
    });

    it.each(['BEFORE', 'AFTER'] as const)(
        'preserves pending statement order for multiple enum additions %s the same anchor',
        async (direction) => {
            const additions = (labels: string[]) =>
                labels
                    .map(
                        (label) =>
                            `ALTER TYPE "public"."enum_integrity_operation" ADD VALUE '${label}' ${direction} 'anchor';`,
                    )
                    .join('\n--> statement-breakpoint\n');
            const ordinaryDdl = `CREATE TABLE "enum_integrity_result" ("operation" "public"."enum_integrity_operation" CHECK ("operation" IN ('x', 'y')));`;
            const originalSql = `${additions(['x', 'y'])}\n--> statement-breakpoint\n${ordinaryDdl}`;
            await withPendingMigrationFixture(
                `CREATE TYPE "public"."enum_integrity_operation" AS ENUM ('anchor');`,
                `${originalSql}\n--> statement-breakpoint\nSELECT 1 / 0;`,
                async ({ upgradePath, migrate }) => {
                    const baselineHistory =
                        await client`select hash from languon_migrations.history`;
                    await expect(migrate()).rejects.toMatchObject({
                        cause: { code: '22012' },
                    });
                    writeFileSync(
                        upgradePath,
                        `${additions(['y', 'x'])}\n--> statement-breakpoint\n${ordinaryDdl}`,
                    );
                    await expect(migrate()).rejects.toThrow(
                        /enum.*order|order.*enum/i,
                    );
                    expect(
                        await client`select hash from languon_migrations.history`,
                    ).toEqual(baselineHistory);
                    const [table] = await client<
                        { name: string | null }[]
                    >`select to_regclass('public.enum_integrity_result')::text as name`;
                    expect(table?.name).toBeNull();
                    writeFileSync(upgradePath, originalSql);
                    await migrate();
                    await client`insert into enum_integrity_result (operation) values ('x'), ('y')`;
                    const labels = await client<{ enumlabel: string }[]>`
                        select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid
                        where t.typname='enum_integrity_operation' order by e.enumsortorder
                    `;
                    expect(labels.map(({ enumlabel }) => enumlabel)).toEqual(
                        direction === 'BEFORE'
                            ? ['x', 'y', 'anchor']
                            : ['anchor', 'y', 'x'],
                    );
                    const history =
                        await client`select hash from languon_migrations.history order by created_at`;
                    expect(history).toHaveLength(2);
                    await migrate();
                    expect(
                        await client`select hash from languon_migrations.history order by created_at`,
                    ).toEqual(history);
                },
            );
        },
    );

    it('rejects ordering drift after preparing the remaining labels from a partial enum commit', async () => {
        await withPendingMigrationFixture(
            `CREATE TYPE "public"."enum_integrity_operation" AS ENUM ('anchor');`,
            `ALTER TYPE "public"."enum_integrity_operation" ADD VALUE 'y' BEFORE 'anchor';
--> statement-breakpoint
ALTER TYPE "public"."enum_integrity_operation" ADD VALUE 'x' BEFORE 'anchor';
--> statement-breakpoint
CREATE TABLE "enum_integrity_result" (id integer);`,
            async ({ migrate }) => {
                const baselineHistory =
                    await client`select hash from languon_migrations.history`;
                await client`ALTER TYPE "public"."enum_integrity_operation" ADD VALUE 'x' BEFORE 'anchor'`;
                await expect(migrate()).rejects.toThrow(
                    /enum.*order|order.*enum/i,
                );
                expect(
                    await client`select hash from languon_migrations.history`,
                ).toEqual(baselineHistory);
                const [table] = await client<
                    { name: string | null }[]
                >`select to_regclass('public.enum_integrity_result')::text as name`;
                expect(table?.name).toBeNull();
                const labels = await client<{ enumlabel: string }[]>`
                    select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid
                    where t.typname='enum_integrity_operation' order by e.enumsortorder
                `;
                expect(labels.map(({ enumlabel }) => enumlabel)).toEqual([
                    'x',
                    'y',
                    'anchor',
                ]);
            },
        );
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

            expect(history[0]?.count).toBe(
                String(
                    readMigrationFiles({
                        migrationsFolder: getMigrationsFolder(),
                    }).length,
                ),
            );
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
