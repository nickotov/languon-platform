import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import {
    lockTextAiCapacity,
    readTextAiCapacity,
    hasConversationCapacityOverlap,
} from '../../../../src/infrastructure/text-ai/text-ai-capacity';
import {
    conversationDeletionBusy,
    eraseConversationContent,
    eraseOwnerConversations,
    requestConversationCancellation,
} from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/conversation-deletion-participant';
import { conversationProviderCallsTable } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/conversation-provider-call-schema';
import { eraseOwnerKnowledge } from '../../../../src/modules/knowledge/infrastructure/persistence/drizzle/knowledge-deletion-participant';
import { DrizzleAccountPurgeStore } from '../../../../src/modules/users/infrastructure/persistence/drizzle/drizzle-account-purge-store';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

const now = new Date();
const budget = {
    inputCostMicrosPerMillionTokens: 100,
    outputCostMicrosPerMillionTokens: 200,
    maxCostMicrosPerAttempt: 1000,
    maxInputTokensPerAttempt: 10000,
    maxOutputTokensPerAttempt: 2000,
};
describe.runIf(isDatabaseIntegrationEnabled())(
    'conversation lifecycle and combined capacity',
    () => {
        let client: PostgresClient;
        let db: PostgresJsDatabase<typeof databaseSchema>;
        let owner: string,
            learner: string,
            dictionary: string,
            foreignDictionary: string;
        beforeAll(async () => {
            client = createTestPostgresClient();
            db = createDrizzleDatabase(client, databaseSchema);
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
        });
        afterAll(async () => {
            await client?.end();
        });
        beforeEach(async () => {
            // TRUNCATE skips source-row triggers; clear their projections too.
            await client`truncate conversation_provider_calls, dictionary_generation_provider_usage_archive, text_ai_capacity_jobs, text_ai_capacity_queue_totals, text_ai_capacity_provider_usage, text_ai_capacity_active_totals, text_ai_capacity_settled_buckets, users cascade`;
            owner = randomUUID();
            learner = randomUUID();
            dictionary = randomUUID();
            foreignDictionary = randomUUID();
            await client`insert into users(id,status) values (${owner},'active'),(${learner},'active')`;
            await client`insert into dictionaries(id,owner_id,name,source_language_tag,target_language_tag) values (${dictionary},${owner},'Source','es','en'),(${foreignDictionary},${learner},'Other','es','en')`;
        });
        async function conversation(
            actor: string,
            source: string,
            status: 'queued' | 'running' | 'succeeded' = 'running',
        ) {
            const chat = randomUUID(),
                turn = randomUUID();
            await client`insert into conversation_chats(id,owner_id,source_kind,source_id,source,preferences,created_at,updated_at) values (${chat},${actor},'dictionary',${source},'{}','{}',${now.toISOString()},${now.toISOString()})`;
            await db.transaction(async (tx) => {
                await lockTextAiCapacity(tx);
                await tx.execute(
                    sql`insert into conversation_turns(id,conversation_id,owner_id,request_id,request_fingerprint,status,preferences,authority,source_snapshot,execution,usage,created_at,updated_at) values (${turn},${chat},${actor},${randomUUID()},'test',${status},'{}','{}','{}','{}','{}',${now.toISOString()},${now.toISOString()})`,
                );
            });
            await client`insert into conversation_messages(id,conversation_id,turn_id,role,content,attachments,status,source_version,source_provenance,created_at) values (${randomUUID()},${chat},${turn},'user','Private question','[]','complete','1','saved',${now.toISOString()})`;
            await client`insert into conversation_memory(conversation_id,key,value,updated_at) values (${chat},'observations','{"private":"memory"}',${now.toISOString()})`;
            await client`insert into conversation_events(conversation_id,type,data,created_at) values (${chat},'turn','{}',${now.toISOString()})`;
            await client`insert into conversation_drafts(id,conversation_id,content,created_at,updated_at) values (${randomUUID()},${chat},'{}',${now.toISOString()},${now.toISOString()})`;
            return { chat, turn };
        }
        async function call(
            turnId: string,
            ownerId: string,
            state: 'reserved' | 'dispatched' | 'settled',
            ordinal = 1,
        ) {
            const id = randomUUID();
            await db.transaction(async (tx) => {
                await lockTextAiCapacity(tx);
                await tx.insert(conversationProviderCallsTable).values({
                    id,
                    turnId,
                    ownerId,
                    ordinal,
                    purpose: ordinal === 1 ? 'actor' : 'observer',
                    reservationId: randomUUID(),
                    state,
                    reservedCostMicros: 1000,
                    reservedInputTokens: 10000,
                    reservedOutputTokens: 2000,
                    actualCostMicros: state === 'settled' ? 100 : 0,
                    actualInputTokens: state === 'settled' ? 200 : 0,
                    actualOutputTokens: state === 'settled' ? 50 : 0,
                    ...budget,
                    createdAt: now,
                    dispatchedAt: state === 'reserved' ? null : now,
                    settledAt: state === 'settled' ? now : null,
                });
            });
            return id;
        }
        async function note(actor: string) {
            const id = randomUUID();
            await client`insert into knowledge_notes(id,owner_id,title,summary,body,categories,studied_language,explanation_language,plain_text,created_at,updated_at) values (${id},${actor},'Independent','Saved explanation','{"schemaVersion":1,"document":{"type":"doc","content":[]}}',array['grammar'],'es','en','Saved explanation',${now.toISOString()},${now.toISOString()})`;
            return id;
        }
        async function capacity(actorId = learner) {
            return db.transaction(async (tx) => {
                await lockTextAiCapacity(tx);
                return readTextAiCapacity(tx, { actorId, now, budget });
            });
        }
        it('counts each actor and memory call plus active turns in the combined capacity', async () => {
            const first = await conversation(learner, dictionary, 'running');
            await call(first.turn, learner, 'reserved');
            await call(first.turn, learner, 'settled', 2);
            await conversation(owner, dictionary, 'queued');
            const value = await capacity();
            expect(value.globalRunning).toBe(1);
            expect(value.globalQueued).toBe(1);
            expect(value.actorRunning).toBe(1);
            expect(value.actorQueued).toBe(0);
            expect(value.providerUsage.ownerActiveCostMicros).toBe(1000);
            expect(value.providerUsage.ownerSettledCostMicros).toBe(100);
            expect(value.providerUsage.ownerSettledInputTokens).toBe(200);
            expect(
                await db.transaction((tx) =>
                    hasConversationCapacityOverlap(tx, now),
                ),
            ).toBe(true);
        });
        it('blocks erasure for active jobs, leases or unsettled accounting and preserves independent notes', async () => {
            const active = await conversation(learner, dictionary, 'running');
            const saved = await note(learner);
            const scope = {
                sourceKind: 'dictionary' as const,
                sourceIds: [dictionary],
            };
            await expect(
                db.transaction(async (tx) => {
                    await lockTextAiCapacity(tx);
                    await eraseConversationContent(tx, scope, now);
                }),
            ).rejects.toThrow('not quiescent');
            const callId = await call(active.turn, learner, 'dispatched');
            await client`update conversation_turns set status='succeeded',lease_until=${new Date(now.getTime() + 10000).toISOString()} where id=${active.turn}`;
            expect(
                await db.transaction((tx) =>
                    conversationDeletionBusy(tx, scope, now),
                ),
            ).toBe(true);
            await client`update conversation_turns set lease_until=null where id=${active.turn}`;
            expect(
                await db.transaction((tx) =>
                    conversationDeletionBusy(tx, scope, now),
                ),
            ).toBe(true);
            await db
                .update(conversationProviderCallsTable)
                .set({
                    state: 'settled',
                    settledAt: now,
                    actualCostMicros: 100,
                    actualInputTokens: 200,
                    actualOutputTokens: 50,
                })
                .where(eq(conversationProviderCallsTable.id, callId));
            await db.transaction(async (tx) => {
                await lockTextAiCapacity(tx);
                await eraseConversationContent(tx, scope, now);
            });
            expect(
                await client`select id from conversation_chats`,
            ).toHaveLength(0);
            for (const table of [
                'conversation_messages',
                'conversation_turns',
                'conversation_drafts',
                'conversation_memory',
                'conversation_events',
                'conversation_provider_calls',
            ])
                expect(
                    await client.unsafe(`select 1 from ${table}`),
                ).toHaveLength(0);
            expect(
                await client`select id from knowledge_notes where id=${saved}`,
            ).toHaveLength(1);
            expect(
                (await capacity()).providerUsage.ownerSettledCostMicros,
            ).toBe(100);
            expect(
                await db.transaction((tx) =>
                    hasConversationCapacityOverlap(tx, now),
                ),
            ).toBe(true);
            expect(
                await db.transaction((tx) =>
                    hasConversationCapacityOverlap(
                        tx,
                        new Date(now.getTime() + 86_400_001),
                    ),
                ),
            ).toBe(false);
        });
        it('account scope includes owned chats on foreign sources and foreign chats on owned sources, without touching copied context elsewhere', async () => {
            const own = await conversation(owner, foreignDictionary, 'queued');
            const shared = await conversation(learner, dictionary, 'running');
            const copied = await conversation(
                learner,
                foreignDictionary,
                'succeeded',
            );
            const ownNote = await note(owner),
                savedOther = await note(learner);
            await client`insert into conversation_settings(owner_id,preferences,updated_at) values (${owner},'{}',${now.toISOString()})`;
            await db.transaction(async (tx) => {
                await lockTextAiCapacity(tx);
                await requestConversationCancellation(
                    tx,
                    { ownerId: owner },
                    now,
                );
            });
            const flags =
                await client`select id,cancel_requested from conversation_turns order by id`;
            expect(flags.find((r) => r.id === own.turn)?.cancel_requested).toBe(
                true,
            );
            expect(
                flags.find((r) => r.id === shared.turn)?.cancel_requested,
            ).toBe(true);
            expect(
                flags.find((r) => r.id === copied.turn)?.cancel_requested,
            ).toBe(false);
            await call(shared.turn, learner, 'settled');
            await client`update conversation_turns set status='cancelled' where cancel_requested`;
            await db.transaction(async (tx) => {
                await lockTextAiCapacity(tx);
                await eraseOwnerConversations(tx, owner, now);
                await eraseOwnerKnowledge(tx, owner);
            });
            expect(
                (await client`select id from conversation_chats`).map(
                    (r) => r.id,
                ),
            ).toEqual([copied.chat]);
            expect(
                await client`select id from knowledge_notes where id=${ownNote}`,
            ).toHaveLength(0);
            expect(
                await client`select id from knowledge_notes where id=${savedOther}`,
            ).toHaveLength(1);
            expect(
                (await capacity()).providerUsage.ownerSettledCostMicros,
            ).toBe(100);
        });
        it('enforces one active turn per conversation and accepts a new turn after terminalization', async () => {
            const active = await conversation(learner, dictionary, 'queued');
            const insert = () =>
                db.transaction(async (tx) => {
                    await lockTextAiCapacity(tx);
                    await tx.execute(
                        sql`insert into conversation_turns(id,conversation_id,owner_id,request_id,request_fingerprint,status,preferences,authority,source_snapshot,execution,usage,created_at,updated_at) values (${randomUUID()},${active.chat},${learner},${randomUUID()},'test','queued','{}','{}','{}','{}','{}',${now.toISOString()},${now.toISOString()})`,
                    );
                });
            await expect(insert()).rejects.toMatchObject({
                cause: expect.objectContaining({ code: '23505' }),
            });
            await client`update conversation_turns set status='cancelled' where id=${active.turn}`;
            await insert();
        });
        it('prevents unmarked admissions, admitted-context changes, provider restart and live erasure at the database boundary', async () => {
            const active = await conversation(learner, dictionary);
            const callId = await call(active.turn, learner, 'reserved');
            await expect(
                client`insert into conversation_turns(id,conversation_id,owner_id,request_id,request_fingerprint,status,preferences,authority,source_snapshot,execution,usage,created_at,updated_at) values (${randomUUID()},${active.chat},${learner},${randomUUID()},'test','queued','{}','{}','{}','{}','{}',${now.toISOString()},${now.toISOString()})`,
            ).rejects.toMatchObject({ code: '55000' });
            await expect(
                client`update conversation_turns set source_snapshot='{"changed":true}' where id=${active.turn}`,
            ).rejects.toMatchObject({ code: '23514' });
            await expect(
                client`delete from conversation_chats where id=${active.chat}`,
            ).rejects.toMatchObject({ code: '23514' });
            await expect(
                client`delete from conversation_provider_calls where id=${callId}`,
            ).rejects.toMatchObject({ code: '23514' });
            await client`update conversation_provider_calls set state='dispatched',dispatched_at=${now.toISOString()} where id=${callId}`;
            await expect(
                client`update conversation_provider_calls set state='reserved' where id=${callId}`,
            ).rejects.toMatchObject({ code: '23514' });
            await client`update conversation_provider_calls set state='settled',settled_at=${now.toISOString()} where id=${callId}`;
            await expect(
                client`update conversation_provider_calls set actual_cost_micros=1 where id=${callId}`,
            ).rejects.toMatchObject({ code: '23514' });
            await client`update conversation_turns set status='cancelled' where id=${active.turn}`;
            await expect(
                db.transaction(async (tx) => {
                    await lockTextAiCapacity(tx);
                    await tx.execute(
                        sql`update conversation_turns set status='running' where id=${active.turn}`,
                    );
                }),
            ).rejects.toMatchObject({
                cause: expect.objectContaining({ code: '23514' }),
            });
        });
        it('fences legacy shared-capacity work through active, settled and erased conversation usage while allowing drain and expiry', async () => {
            const legacy = () =>
                client`insert into dictionary_generation_jobs(id,owner_id,dictionary_id,kind,format,idempotency_key,request_fingerprint,expected_dictionary_version,expected_settings_version,source_language_tag,target_language_tag) values (${randomUUID()},${learner},${foreignDictionary},'dictionary-terms','dictionary-terms:v1',${randomUUID()},${'hmac-sha256:v1:' + 'A'.repeat(43)},1,1,'es','en') returning id`;
            const [old] = await legacy();
            const active = await conversation(learner, dictionary);
            await expect(legacy()).rejects.toMatchObject({ code: '55000' });
            // Legacy workers may finish or cancel old work without advertising new capacity.
            await client`update dictionary_generation_jobs set execution_state='cancelled',completed_at=now() where id=${old!.id}`;
            await call(active.turn, learner, 'settled');
            await client`update conversation_turns set status='succeeded' where id=${active.turn}`;
            await expect(legacy()).rejects.toMatchObject({ code: '55000' });
            await db.transaction(async (tx) => {
                await lockTextAiCapacity(tx);
                await eraseConversationContent(
                    tx,
                    { conversationIds: [active.chat] },
                    now,
                );
            });
            await expect(legacy()).rejects.toMatchObject({ code: '55000' });
            await client`update dictionary_generation_provider_usage_archive set settled_at=now()-interval '24 hours 1 second'`;
            await expect(legacy()).resolves.toHaveLength(1);
            const guarded =
                await client`select c.relname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_proc p on p.oid=t.tgfoid where p.proname='enforce_shared_text_ai_capacity' and not t.tgisinternal order by c.relname`;
            expect(guarded.map((row) => row.relname)).toEqual([
                'dictionary_generation_jobs',
                'dictionary_text_selection_jobs',
                'sentence_ai_jobs',
                'texts_ai_jobs',
            ]);
        });
        it('full account purge removes owned and primary-source chats while retaining independently copied context and other learners usage', async () => {
            const own = await conversation(owner, foreignDictionary);
            const shared = await conversation(learner, dictionary);
            const independent = await conversation(
                learner,
                foreignDictionary,
                'succeeded',
            );
            await call(own.turn, owner, 'settled');
            await call(shared.turn, learner, 'settled');
            const ownNote = await note(owner);
            const independentNote = await note(learner);
            await client`update conversation_turns set status='succeeded' where id in (${own.turn},${shared.turn})`;
            await client`update users set status='deletion_pending' where id=${owner}`;
            await client`insert into account_deletion_requests(user_id,state,scheduled_at,purge_at,next_attempt_at,updated_at) values (${owner},'pending',${new Date(now.getTime() - 31 * 86_400_000).toISOString()},${new Date(now.getTime() - 86_400_000).toISOString()},${now.toISOString()},${now.toISOString()})`;
            const store = new DrizzleAccountPurgeStore(db);
            const claimed = await store.claimDue({
                now,
                workerId: 'feature044-test',
            });
            expect(claimed).not.toBeNull();
            expect(
                (
                    await store.inspectOwner({
                        ...claimed!,
                        workerId: 'feature044-test',
                    })
                ).activeJobs,
            ).toBe(0);
            expect(
                await store.finish({
                    ...claimed!,
                    now,
                    workerId: 'feature044-test',
                }),
            ).toBe(true);
            expect(
                (await client`select id from conversation_chats`).map(
                    (row) => row.id,
                ),
            ).toEqual([independent.chat]);
            expect(
                await client`select id from knowledge_notes where id=${ownNote}`,
            ).toHaveLength(0);
            expect(
                await client`select id from knowledge_notes where id=${independentNote}`,
            ).toHaveLength(1);
            expect(
                await client`select status from users where id=${owner}`,
            ).toEqual([{ status: 'purged' }]);
            expect(
                (await capacity()).providerUsage.ownerSettledCostMicros,
            ).toBe(100);
            expect(
                await client`select owner_id from dictionary_generation_provider_usage_archive where owner_id=${owner}`,
            ).toHaveLength(0);
        });
        it('purge role erases dependent private content without SELECT privileges on it', async () => {
            const active = await conversation(learner, dictionary);
            await call(active.turn, learner, 'settled');
            await client`update conversation_turns set status='succeeded' where id=${active.turn}`;
            await note(owner);
            const role = 'conversation_lifecycle_purge_test';
            await client.unsafe(
                `do $$ begin if not exists(select from pg_roles where rolname='${role}') then create role ${role}; end if; end $$`,
            );
            const grants = (
                await readFile(
                    new URL(
                        '../../../../../../infra/deploy/sql/account-purge-worker-role.sql',
                        import.meta.url,
                    ),
                    'utf8',
                )
            )
                .replace(/^\\set.*$/gm, '')
                .replaceAll(':"account_purge_role"', role);
            await client.unsafe(grants);
            await expect(
                db.transaction(async (tx) => {
                    await tx.execute(sql.raw(`set local role ${role}`));
                    await tx.execute(
                        sql`select content from conversation_messages`,
                    );
                }),
            ).rejects.toMatchObject({
                cause: expect.objectContaining({ code: '42501' }),
            });
            await expect(
                db.transaction(async (tx) => {
                    await tx.execute(sql.raw(`set local role ${role}`));
                    await tx.execute(sql`select body from knowledge_notes`);
                }),
            ).rejects.toMatchObject({
                cause: expect.objectContaining({ code: '42501' }),
            });
            await db.transaction(async (tx) => {
                await tx.execute(sql.raw(`set local role ${role}`));
                await lockTextAiCapacity(tx);
                await eraseOwnerConversations(tx, owner, now);
                await eraseOwnerKnowledge(tx, owner);
            });
            expect(
                await client`select id from conversation_chats`,
            ).toHaveLength(0);
            expect(
                (await capacity()).providerUsage.ownerSettledCostMicros,
            ).toBe(100);
        });
    },
);
