import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
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
        const client = createTestPostgresClient();
        afterAll(async () => {
            await client.end();
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
        it('installs into a fresh disposable schema', async () => {
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            const tables =
                await client`select tablename from pg_tables where schemaname='public' and tablename in ('texts','text_folders','texts_ai_jobs','dictionary_text_selection_jobs')`;
            expect(tables).toHaveLength(4);
        }, 60_000);
    },
);
