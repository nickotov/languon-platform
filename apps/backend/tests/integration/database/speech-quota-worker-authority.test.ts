import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PostgresClient } from '@languon/database';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../support/test-database';

describe.runIf(isDatabaseIntegrationEnabled())(
    'restricted speech quota maintenance authority',
    () => {
        let client: PostgresClient;
        const role = `speech_quota_${randomUUID().replaceAll('-', '')}`;
        let roleCreated = false;
        beforeAll(async () => {
            client = createTestPostgresClient();
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            await client.unsafe(`CREATE ROLE "${role}" NOLOGIN`);
            roleCreated = true;
            const script = await readFile(
                new URL(
                    '../../../../../infra/deploy/sql/dictionary-worker-role.sql',
                    import.meta.url,
                ),
                'utf8',
            );
            await client.unsafe(
                script
                    .split('\n')
                    .filter((line) => !line.startsWith('\\'))
                    .join('\n')
                    .replaceAll(':"dictionary_worker_role"', `"${role}"`),
            );
        }, 120000);
        afterAll(async () => {
            if (roleCreated) {
                await client.unsafe(`DROP OWNED BY "${role}"`);
                await client.unsafe(`DROP ROLE "${role}"`);
            }
            await client?.end();
        });
        beforeEach(async () => {
            await client`truncate speech_daily_admission_counters`;
            await client`insert into speech_daily_admission_counters(day,scope,free_count,estimated_units) values((clock_timestamp() at time zone 'UTC')::date::text,'global',9,123),(((clock_timestamp() at time zone 'UTC')-interval '7 days')::date::text,'retained',3,5)`;
        });
        const restricted = <T>(work: (tx: PostgresClient) => Promise<T>) =>
            client.begin(async (tx) => {
                await tx.unsafe(`SET LOCAL ROLE "${role}"`);
                return work(tx as unknown as PostgresClient);
            });

        it('denies direct current-day quota insertion, updates and deletion', async () => {
            for (const statement of [
                "insert into speech_daily_admission_counters(day,scope,free_count,estimated_units) values((clock_timestamp() at time zone 'UTC')::date::text,'forged',0,0)",
                "update speech_daily_admission_counters set free_count=0,estimated_units=0 where scope='global'",
                "delete from speech_daily_admission_counters where scope='global'",
            ])
                await expect(
                    restricted((tx) => tx.unsafe(statement)),
                ).rejects.toMatchObject({ code: '42501' });
            const [current] =
                await client`select free_count,estimated_units::text units from speech_daily_admission_counters where scope='global'`;
            expect(current).toMatchObject({ free_count: 9, units: '123' });
        });

        it('cleans only expired counters with the database cutoff and a hard maximum batch', async () => {
            await client`insert into speech_daily_admission_counters(day,scope,free_count,estimated_units) select '2000-01-01','old:'||n::text,1,1 from generate_series(1,1003) n`;
            for (const batch of [-1, 0, 1001, null])
                await expect(
                    restricted(
                        (tx) =>
                            tx`select languon_cleanup_speech_admission_counters(${batch}::integer)`,
                    ),
                ).rejects.toMatchObject({ code: '23514' });
            const first = await restricted(
                (tx) =>
                    tx`select languon_cleanup_speech_admission_counters(1000) removed`,
            );
            expect(first[0]?.removed).toBe(1000);
            const [remaining] =
                await client`select count(*)::integer count from speech_daily_admission_counters where day='2000-01-01'`;
            expect(remaining?.count).toBe(3);
            const second = await restricted(
                (tx) =>
                    tx`select languon_cleanup_speech_admission_counters(2) removed`,
            );
            expect(second[0]?.removed).toBe(2);
            const third = await restricted(
                (tx) =>
                    tx`select languon_cleanup_speech_admission_counters() removed`,
            );
            expect(third[0]?.removed).toBe(1);
            const retained =
                await client`select scope,free_count,estimated_units::text units from speech_daily_admission_counters order by scope`;
            expect(retained).toEqual([
                { scope: 'global', free_count: 9, units: '123' },
                { scope: 'retained', free_count: 3, units: '5' },
            ]);
        });
    },
);
