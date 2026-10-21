import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    grantDisposableMigrationPurpose,
    runPostgresMigrations,
} from '@languon/database';
import {
    createTestPostgresClient,
    getMigrationsFolder,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

describe.runIf(isDatabaseIntegrationEnabled())(
    'Texts fresh and existing-schema migration',
    () => {
        let client: ReturnType<typeof createTestPostgresClient>;
        beforeAll(() => {
            client = createTestPostgresClient();
        });
        afterAll(async () => {
            await client?.end();
        });
        it('upgrades the pre-Texts schema with existing user data and retries safely', async () => {
            await resetTestDatabase(client);
            const folder = await mkdtemp(
                join(tmpdir(), 'languon-texts-migration-'),
            );
            try {
                await cp(getMigrationsFolder(), folder, { recursive: true });
                const journalPath = join(folder, 'meta/_journal.json');
                const journal = JSON.parse(
                    await readFile(journalPath, 'utf8'),
                ) as { entries: { idx: number }[] };
                journal.entries = journal.entries.filter(
                    (entry) => entry.idx < 63,
                );
                await writeFile(journalPath, JSON.stringify(journal));
                await runPostgresMigrations({
                    client,
                    migrationsFolder: folder,
                    purpose: grantDisposableMigrationPurpose(),
                });
                const id = randomUUID();
                await client`insert into users(id,status) values(${id},'active')`;
                await migrateTestDatabase(client);
                await migrateTestDatabase(client);
                expect(
                    (await client`select status from users where id=${id}`)[0]
                        ?.status,
                ).toBe('active');
                const tables =
                    await client`select tablename from pg_tables where schemaname='public' and tablename in ('texts','text_folders','texts_ai_jobs','dictionary_text_selection_jobs')`;
                expect(tables).toHaveLength(4);
                const triggers =
                    await client`select tgname from pg_trigger where not tgisinternal and tgname in ('texts_ai_jobs_execution_guard','dictionary_text_selection_jobs_execution_guard','sentence_texts_capacity_guard')`;
                expect(triggers).toHaveLength(3);
            } finally {
                await rm(folder, { recursive: true, force: true });
            }
        }, 60_000);
        it('upgrades existing v1 translation jobs without rewriting their execution identity', async () => {
            await resetTestDatabase(client);
            const folder = await mkdtemp(
                join(tmpdir(), 'languon-texts-format-migration-'),
            );
            try {
                await cp(getMigrationsFolder(), folder, { recursive: true });
                const journalPath = join(folder, 'meta/_journal.json');
                const journal = JSON.parse(
                    await readFile(journalPath, 'utf8'),
                ) as { entries: { idx: number }[] };
                journal.entries = journal.entries.filter(
                    (entry) => entry.idx < 68,
                );
                await writeFile(journalPath, JSON.stringify(journal));
                await runPostgresMigrations({
                    client,
                    migrationsFolder: folder,
                    purpose: grantDisposableMigrationPurpose(),
                });
                const ownerId = randomUUID(),
                    folderId = randomUUID(),
                    revisionId = randomUUID(),
                    jobId = randomUUID();
                await client`insert into users(id,status) values(${ownerId},'active')`;
                await client`insert into text_folders(id,owner_id,name,created_at,updated_at) values(${folderId},${ownerId},'Synthetic',now(),now())`;
                await client`insert into dictionary_ai_configuration_revisions(id,version,created_by_user_id,catalog_snapshot) values(${revisionId},1,${ownerId},'{}'::jsonb)`;
                await client.begin(async (tx) => {
                    await tx`select set_config('languon.texts_execution_revision','1',true),set_config('languon.texts_capacity_revision','1',true),set_config('languon.text_ai_selection_revision','1',true),set_config('languon.ai_credit_settlement_revision','1',true)`;
                    await tx`insert into texts_ai_jobs(id,owner_id,folder_id,operation_id,request_fingerprint,job_kind,format,expires_at,selected_execution_snapshot,execution_revision_id,provider_max_cost_micros_per_attempt,provider_max_input_tokens_per_attempt,provider_max_output_tokens_per_attempt) values(${jobId},${ownerId},${folderId},${randomUUID()},'synthetic','text-translation','text-translation:v1',now()+interval '1 hour','{}'::jsonb,${revisionId},1,8192,8192)`;
                });
                await migrateTestDatabase(client);
                await migrateTestDatabase(client);
                const [row] =
                    await client`select format,request_fingerprint,selected_execution_snapshot,execution_revision_id from texts_ai_jobs where id=${jobId}`;
                expect(row).toEqual({
                    format: 'text-translation:v1',
                    request_fingerprint: 'synthetic',
                    selected_execution_snapshot: {},
                    execution_revision_id: revisionId,
                });
                const [constraint] =
                    await client`select pg_get_constraintdef(oid) as definition from pg_constraint where conname='texts_ai_jobs_kind_format'`;
                expect(constraint?.definition).toContain('text-translation:v2');
            } finally {
                await rm(folder, { recursive: true, force: true });
            }
        }, 60_000);
        it('installs into a fresh disposable schema', async () => {
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            const tables =
                await client`select tablename from pg_tables where schemaname='public' and tablename in ('texts','text_folders','texts_ai_jobs','dictionary_text_selection_jobs')`;
            expect(tables).toHaveLength(4);
        }, 60_000);
    },
);
