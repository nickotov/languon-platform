import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
    createDrizzleDatabase,
    createPostgresClient,
    type PostgresClient,
} from '@languon/database';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import {
    eraseTextsOwnedContent,
    requestTextsCancellation,
    textsDeletionBusy,
} from '../../../../src/modules/texts/infrastructure/persistence/drizzle/texts-deletion-participant';
import { DrizzleAccountPurgeStore } from '../../../../src/modules/users/infrastructure/persistence/drizzle/drizzle-account-purge-store';
import {
    createTestPostgresClient,
    getTestDatabaseUrl,
    migrateTestDatabase,
    isDatabaseIntegrationEnabled,
    resetTestDatabase,
} from '../../support/test-database';

const now = new Date();
let client: PostgresClient;
const database = () => createDrizzleDatabase(client, databaseSchema);
const role = 'languon_texts_purge_test_role';
async function seed() {
    const owner = randomUUID(),
        reader = randomUUID(),
        folder = randomUUID(),
        text = randomUUID(),
        copiedFolder = randomUUID(),
        copiedText = randomUUID(),
        revision = randomUUID(),
        ownJob = randomUUID(),
        foreignJob = randomUUID(),
        ownSelection = randomUUID(),
        dictionary = randomUUID(),
        card = randomUUID();
    await client`insert into users(id,status) values(${owner},'deletion_pending'),(${reader},'active')`;
    await client`insert into dictionary_ai_configuration_revisions(id,version,created_by_user_id,catalog_snapshot) values(${revision},1,${reader},'{}')`;
    await client`insert into text_folders(id,owner_id,name,created_at,updated_at) values(${folder},${owner},'Private folder',${now.toISOString()},${now.toISOString()}),(${copiedFolder},${reader},'Independent copy',${now.toISOString()},${now.toISOString()})`;
    await client`insert into texts(id,owner_id,folder_id,title,source_language,target_language,source_text,status,created_at,updated_at) values(${text},${owner},${folder},'Secret text','en','es','Private article','draft',${now.toISOString()},${now.toISOString()}),(${copiedText},${reader},${copiedFolder},'Independent article','en','es','Copied article','draft',${now.toISOString()},${now.toISOString()})`;
    await client`insert into text_revisions(id,text_id,owner_id,version,snapshot,created_at) values(${randomUUID()},${text},${owner},1,'{"sourceText":"private revision"}',${now.toISOString()})`;
    await client`insert into text_shares(id,owner_id,kind,resource_id,locator,key_digest,version,created_at) values(${randomUUID()},${owner},'text',${text},'synthetic-locator','hmac-sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',1,${now.toISOString()})`;
    await client`insert into text_idempotency(owner_id,key,fingerprint,result,created_at) values(${owner},'operation','hash',${JSON.stringify({ id: text })}::jsonb,${now.toISOString()})`;
    await client`insert into dictionaries(id,owner_id,name,source_language_tag,target_language_tag) values(${dictionary},${reader},'Collected words','en','es')`;
    await client`insert into dictionary_cards(id,dictionary_id,authorship,source,normalized_source,translation,sort_key) values(${card},${dictionary},'ai-generated','article','article','artículo',1)`;
    await client.begin(async (tx) => {
        await tx`select set_config('languon.texts_execution_revision','1',true),set_config('languon.texts_capacity_revision','1',true),set_config('languon.text_ai_selection_revision','1',true),set_config('languon.ai_credit_settlement_revision','1',true)`;
        await tx`insert into texts_ai_jobs(id,owner_id,folder_id,operation_id,request_fingerprint,job_kind,format,execution_state,input_payload,expires_at,selected_execution_snapshot,execution_revision_id,provider_max_cost_micros_per_attempt,provider_max_input_tokens_per_attempt,provider_max_output_tokens_per_attempt,provider_reservation_state) values(${ownJob},${owner},${folder},${randomUUID()},'fingerprint','text-translation','text-translation:v1','queued','{"sourceText":"private payload"}',${new Date(now.getTime() + 86_400_000).toISOString()},'{}',${revision},10,100,100,'active')`;
        for (const [jobId, actorId] of [
            [foreignJob, reader],
            [ownSelection, owner],
        ] as const) {
            await tx`insert into dictionary_text_selection_jobs(id,owner_id,source_owner_id,operation_id,request_hash,execution_state,input_payload,source_authority,target,selected_execution_snapshot,execution_revision_id,expires_at,provider_input_cost_micros_per_million_tokens,provider_output_cost_micros_per_million_tokens,provider_reserved_cost_micros,provider_reserved_input_tokens,provider_reserved_output_tokens,provider_max_cost_micros_per_attempt,provider_max_input_tokens_per_attempt,provider_max_output_tokens_per_attempt) values(${jobId},${actorId},${owner},${randomUUID()},'fingerprint','queued','{"source":"article"}','{"kind":"text"}','{"kind":"existing"}','{}',${revision},${new Date(now.getTime() + 86_400_000).toISOString()},0,0,10,100,100,10,100,100)`;
        }
    });
    return {
        owner,
        reader,
        folder,
        text,
        copiedText,
        ownJob,
        foreignJob,
        ownSelection,
        dictionary,
        card,
    };
}
async function settle(ids: Awaited<ReturnType<typeof seed>>) {
    // Fixtures represent normally worker-settled outcomes; the deletion participant
    // itself is never permitted to synthesize cancellation or billing settlement.
    await client`update texts_ai_jobs set execution_state='cancelled',completed_at=${now.toISOString()},input_payload=null,provider_reservation_state='settled',provider_reservation_settled_at=${now.toISOString()},provider_actual_cost_micros=7,provider_actual_input_tokens=20,provider_actual_output_tokens=30 where id=${ids.ownJob}`;
    await client`update dictionary_text_selection_jobs set execution_state='completed',input_payload=null,source_authority=null,target=null,provider_reservation_state='settled',provider_reservation_settled_at=${now.toISOString()},dictionary_id=${ids.dictionary},card_id=${ids.card} where id in (${ids.foreignJob},${ids.ownSelection})`;
}

describe.runIf(isDatabaseIntegrationEnabled())(
    'Texts account deletion and least-privilege purge',
    () => {
        beforeAll(() => {
            client = createTestPostgresClient();
        });
        beforeEach(async () => {
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
        }, 120000);
        afterAll(async () => {
            await client?.end();
        });
        it('flags own and foreign source-dependent work, blocks purge, and leaves settlement to workers', async () => {
            const ids = await seed();
            await database().transaction((tx) =>
                requestTextsCancellation(tx, ids.owner, now),
            );
            const jobs =
                await client`select execution_state,cancellation_requested_at,provider_reservation_state from texts_ai_jobs union all select execution_state,cancellation_requested_at,provider_reservation_state from dictionary_text_selection_jobs`;
            expect(jobs).toHaveLength(3);
            for (const job of jobs)
                expect(job).toMatchObject({
                    execution_state: 'queued',
                    provider_reservation_state: 'active',
                    cancellation_requested_at: expect.any(String),
                });
            expect(
                await database().transaction((tx) =>
                    textsDeletionBusy(tx, ids.owner),
                ),
            ).toBe(true);
            await expect(
                database().transaction((tx) =>
                    eraseTextsOwnedContent(tx, ids.owner, now),
                ),
            ).rejects.toThrow('not quiescent');
            await client`update users set status='deletion_pending' where id=${ids.owner}`;
            await client`insert into account_deletion_requests(user_id,state,scheduled_at,purge_at,next_attempt_at,lease_deadline,lease_worker_id,fencing_token,updated_at) values(${ids.owner},'running',clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '1 minute',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '5 minutes','texts-busy-purge',1,clock_timestamp())`;
            expect(
                (
                    await new DrizzleAccountPurgeStore(database()).inspectOwner(
                        {
                            userId: ids.owner,
                            fencingToken: 1,
                            workerId: 'texts-busy-purge',
                        },
                    )
                ).activeJobs,
            ).toBeGreaterThan(0);
            await client`update texts_ai_jobs set execution_state='cancelled',completed_at=${now.toISOString()},input_payload=null where id=${ids.ownJob}`;
            await client`update dictionary_text_selection_jobs set execution_state='completed',input_payload=null,source_authority=null,target=null where id in (${ids.foreignJob},${ids.ownSelection})`;
            expect(
                await database().transaction((tx) =>
                    textsDeletionBusy(tx, ids.owner),
                ),
            ).toBe(true);
            // Even terminal jobs keep purge blocked until provider accounting settles.
            await settle(ids);
            expect(
                await database().transaction((tx) =>
                    textsDeletionBusy(tx, ids.owner),
                ),
            ).toBe(false);
        });
        it('archives numerical usage and erases owned content under the purge role while retaining independent copies/cards', async () => {
            const ids = await seed();
            await settle(ids);
            const roleSql = await readFile(
                new URL(
                    '../../../../../../infra/deploy/sql/account-purge-worker-role.sql',
                    import.meta.url,
                ),
                'utf8',
            );
            await client.unsafe(
                `do $$ begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role} nologin; end if; end $$;`,
            );
            for (const statement of roleSql
                .replace(/^\\set.*$/gm, '')
                .replace(/^--.*$/gm, '')
                .replaceAll(':"account_purge_role"', `"${role}"`)
                .split(';')
                .map((part) => part.trim())
                .filter(Boolean))
                await client.unsafe(statement);
            await expect(
                database().transaction(async (tx) => {
                    await tx.execute(sql.raw(`set local role ${role}`));
                    await tx.execute(
                        sql`select input_payload from texts_ai_jobs`,
                    );
                }),
            ).rejects.toThrow();
            await expect(
                database().transaction(async (tx) => {
                    await tx.execute(sql.raw(`set local role ${role}`));
                    await tx.execute(
                        sql`select source_authority from dictionary_text_selection_jobs`,
                    );
                }),
            ).rejects.toThrow();
            await database().transaction(async (tx) => {
                await tx.execute(sql.raw(`set local role ${role}`));
                await eraseTextsOwnedContent(tx, ids.owner, now);
            });
            const archived =
                await client`select actual_cost_micros,actual_input_tokens,actual_output_tokens from dictionary_generation_provider_usage_archive where id=${ids.ownJob}`;
            expect(archived).toEqual([
                {
                    actual_cost_micros: 7,
                    actual_input_tokens: 20,
                    actual_output_tokens: 30,
                },
            ]);
            for (const table of [
                'texts_ai_jobs',
                'dictionary_text_selection_jobs',
                'text_idempotency',
                'text_shares',
                'text_revisions',
                'texts',
                'text_folders',
            ]) {
                expect(
                    await client.unsafe(
                        `select 1 from ${table} where owner_id=$1`,
                        [ids.owner],
                    ),
                ).toHaveLength(0);
            }
            expect(
                await client`select 1 from texts where id=${ids.copiedText}`,
            ).toHaveLength(1);
            expect(
                await client`select 1 from dictionary_cards where id=${ids.card}`,
            ).toHaveLength(1);
            expect(
                await client`select source_owner_id,dictionary_id,card_id from dictionary_text_selection_jobs where id=${ids.foreignJob}`,
            ).toEqual([
                {
                    source_owner_id: null,
                    dictionary_id: ids.dictionary,
                    card_id: ids.card,
                },
            ]);
            await client`insert into account_deletion_requests(user_id,state,scheduled_at,updated_at,purge_at,next_attempt_at,lease_worker_id,lease_deadline,fencing_token) values(${ids.owner},'running',${new Date(now.getTime() - 30 * 86_400_000).toISOString()},${now.toISOString()},${now.toISOString()},${now.toISOString()},'texts-purge-worker',${new Date(now.getTime() + 60_000).toISOString()},1)`;
            const restricted = createPostgresClient({
                databaseUrl: getTestDatabaseUrl(),
                maxConnections: 1,
            });
            try {
                await restricted.unsafe(`set role ${role}`);
                expect(
                    await new DrizzleAccountPurgeStore(
                        createDrizzleDatabase(restricted, databaseSchema),
                    ).finish({
                        fencingToken: 1,
                        userId: ids.owner,
                        workerId: 'texts-purge-worker',
                        now,
                    }),
                ).toBe(true);
            } finally {
                await restricted.unsafe('reset role');
                await restricted.end();
            }
            expect(
                await client`select status from users where id=${ids.owner}`,
            ).toEqual([{ status: 'purged' }]);
        });
    },
);
