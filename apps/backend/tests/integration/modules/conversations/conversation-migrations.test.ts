import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    grantDisposableMigrationPurpose,
    runPostgresMigrations,
} from '@languon/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    createTestPostgresClient,
    getMigrationsFolder,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

describe.runIf(isDatabaseIntegrationEnabled())(
    'conversation existing-schema migration',
    () => {
        let client: ReturnType<typeof createTestPostgresClient>;
        beforeAll(() => {
            client = createTestPostgresClient();
        });
        afterAll(async () => client?.end());
        it('upgrades pre-conversation data and queued legacy work without rewriting it, and reruns safely', async () => {
            await resetTestDatabase(client);
            const folder = await mkdtemp(
                join(tmpdir(), 'languon-conversation-migration-'),
            );
            try {
                await cp(getMigrationsFolder(), folder, { recursive: true });
                const journalPath = join(folder, 'meta/_journal.json');
                const journal = JSON.parse(
                    await readFile(journalPath, 'utf8'),
                ) as { entries: { idx: number }[] };
                journal.entries = journal.entries.filter(
                    (entry) => entry.idx < 69,
                );
                await writeFile(journalPath, JSON.stringify(journal));
                await runPostgresMigrations({
                    client,
                    migrationsFolder: folder,
                    purpose: grantDisposableMigrationPurpose(),
                });
                const owner = randomUUID(),
                    dictionary = randomUUID(),
                    job = randomUUID();
                await client`insert into users(id,status) values (${owner},'active')`;
                await client`insert into dictionaries(id,owner_id,name,source_language_tag,target_language_tag) values (${dictionary},${owner},'Synthetic retained source','es','en')`;
                await client`insert into dictionary_generation_jobs(id,owner_id,dictionary_id,kind,format,idempotency_key,request_fingerprint,expected_dictionary_version,expected_settings_version,source_language_tag,target_language_tag) values (${job},${owner},${dictionary},'dictionary-terms','dictionary-terms:v1',${randomUUID()},${'hmac-sha256:v1:' + 'A'.repeat(43)},1,1,'es','en')`;
                const before =
                    await client`select id,owner_id,dictionary_id,execution_state,format,request_fingerprint from dictionary_generation_jobs where id=${job}`;
                await migrateTestDatabase(client);
                await migrateTestDatabase(client);
                expect(
                    await client`select id,owner_id,dictionary_id,execution_state,format,request_fingerprint from dictionary_generation_jobs where id=${job}`,
                ).toEqual(before);
                expect(
                    await client`select name from dictionaries where id=${dictionary}`,
                ).toEqual([{ name: 'Synthetic retained source' }]);
                expect(
                    await client`select status from users where id=${owner}`,
                ).toEqual([{ status: 'active' }]);
                expect(
                    await client`select tablename from pg_tables where schemaname='public' and tablename in ('conversation_chats','conversation_turns','conversation_memory','conversation_provider_calls','knowledge_notes')`,
                ).toHaveLength(5);
                expect(
                    await client`select column_name from information_schema.columns where table_name='conversation_messages' and column_name='tool_calls'`,
                ).toHaveLength(1);
                const [constraint] =
                    await client`select pg_get_constraintdef(oid) as definition from pg_constraint where conname='text_ai_usage_archive_kind'`;
                expect(constraint?.definition).toContain('conversation-turn');
            } finally {
                await rm(folder, { recursive: true, force: true });
            }
        }, 60_000);
    },
);
