import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { DictionaryRateLimitError } from '../../../../src/modules/dictionaries/application/dictionary-errors';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    createDrizzleDatabase,
    createPostgresClient,
    type PostgresClient,
} from '@languon/database';
import {
    SubmitConversationTurnRequestSchema,
    type ApplyDictionaryChatSnippetRequest,
} from '@languon/contracts';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { DrizzleConversationStore } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/drizzle-conversation-store';
import { ConversationSourceResolver } from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/conversation-source';
import {
    getTestDatabaseUrl,
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

const candidate = (source: string) => ({
    source,
    translation: `translation ${source}`,
    definition: 'Complete definition',
    example: 'Complete example',
    exampleTranslation: 'Translated example',
    transcription: null,
});

describe.runIf(isDatabaseIntegrationEnabled())(
    'dictionary chat snippet persistence and explicit application',
    { timeout: 30_000 },
    () => {
        let client: PostgresClient;
        let store: DrizzleConversationStore;
        let ownerId: string;
        let dictionaryId: string;
        const access = () => ({ ownerId });

        beforeAll(async () => {
            client = createTestPostgresClient();
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            const database = createDrizzleDatabase(client, databaseSchema);
            const sources = new ConversationSourceResolver({
                verifyDictionaryShare: () => false,
                verifyTextShare: () => false,
                verifyKnowledgeShare: () => false,
                readNote: async () => {
                    throw new Error('Knowledge is outside this fixture.');
                },
            });

            store = new DrizzleConversationStore({
                database,
                sources,
                admitTurn: async () => ({ snapshot: { modelId: 'synthetic' } }),
                publishNote: async () => {
                    throw new Error('Publication is outside this fixture.');
                },
            });
        }, 120_000);

        afterAll(async () => {
            await client?.end();
        });

        beforeEach(async () => {
            await client`truncate users cascade`;
            ownerId = randomUUID();
            dictionaryId = randomUUID();
            await client`insert into users(id,status) values (${ownerId},'active')`;
            await client`insert into dictionaries(id,owner_id,name,source_language_tag,target_language_tag) values (${dictionaryId},${ownerId},'Snippet fixture','es','en')`;
            await client`insert into dictionary_settings(dictionary_id,definition_enabled) values (${dictionaryId},true)`;
        });

        async function generated() {
            const chat = await store.create(access(), {
                source: { kind: 'dictionary', id: dictionaryId },
            });

            await store.submit(
                access(),
                chat.id,
                SubmitConversationTurnRequestSchema.parse({
                    requestId: randomUUID(),
                    content: 'Create three complete cards.',
                }),
            );

            const turn = (await store.claim())!;
            const snippet = await store.proposeDictionarySnippet(turn, {
                title: 'Three words',
                cards: ['uno', 'dos', 'tres'].map(candidate),
            });

            expect(
                (await store.readDictionarySnippet(turn, snippet.id)).cards.map(
                    (card) => card.source,
                ),
            ).toEqual(['uno', 'dos', 'tres']);

            await store.finish(turn, 'succeeded');

            return { chat, turn, snippet };
        }

        const request = (
            mode: ApplyDictionaryChatSnippetRequest['mode'],
            dictionaryVersion = 1,
            settingsVersion = 1,
        ): ApplyDictionaryChatSnippetRequest => ({
            operationId: randomUUID(),
            mode,
            selectedIndices: [2, 0],
            expectedDictionaryVersion: dictionaryVersion,
            expectedSettingsVersion: settingsVersion,
        });

        it('accepts frozen generation under changed current settings, preserves source order, appends/prepends, duplicates and idempotent replay', async () => {
            const { chat, snippet } = await generated();
            await client`update dictionary_settings set definition_enabled=false,version=2 where dictionary_id=${dictionaryId}`;
            await client`update dictionaries set version=2 where id=${dictionaryId}`;
            const firstRequest = request('append', 2, 2);
            const first = await store.applyDictionarySnippet(
                access(),
                chat.id,
                snippet.id,
                firstRequest,
            );

            expect(first.addedCount).toBe(2);
            expect(first.settingsVersion).toBe(2);
            expect(
                await store.applyDictionarySnippet(
                    access(),
                    chat.id,
                    snippet.id,
                    firstRequest,
                ),
            ).toEqual(first);

            await expect(
                store.applyDictionarySnippet(access(), chat.id, snippet.id, {
                    ...firstRequest,
                    mode: 'replace',
                }),
            ).rejects.toMatchObject({ code: 'version_conflict' });

            const second = await store.applyDictionarySnippet(
                access(),
                chat.id,
                snippet.id,
                {
                    ...request('prepend', first.dictionaryVersion, 2),
                    selectedIndices: [1],
                },
            );
            const repeated = await store.applyDictionarySnippet(
                access(),
                chat.id,
                snippet.id,
                {
                    ...request('append', second.dictionaryVersion, 2),
                    selectedIndices: [0],
                },
            );

            expect(repeated.duplicateCount).toBe(1);
            const rows =
                await client`select source,authorship,learning_version from dictionary_cards where dictionary_id=${dictionaryId} and lifecycle='active' order by sort_key,id`;

            expect(rows.map((row) => row.source)).toEqual([
                'dos',
                'uno',
                'tres',
                'uno',
            ]);

            expect(
                rows.every(
                    (row) =>
                        row.authorship === 'ai-generated' &&
                        row.learning_version === 1,
                ),
            ).toBe(true);

            const [revisions] =
                await client`select count(*)::integer as value from dictionary_card_revisions where dictionary_id=${dictionaryId} and mutation_kind='ai_create' and schema_version=2`;

            expect(revisions?.value).toBe(4);
            expect(
                (await store.listDictionarySnippets(access(), chat.id))
                    .snippets[0]?.generationContext.settingsVersion,
            ).toBe(1);
        });

        it('replaces by archiving active identities, retaining progress/old archives and inserting fresh identities without changing title/settings', async () => {
            const { chat, snippet } = await generated();
            const oldCard = randomUUID();
            const archivedCard = randomUUID();
            await client`insert into dictionary_cards(id,dictionary_id,authorship,source,normalized_source,translation,sort_key,learning_version) values (${oldCard},${dictionaryId},'human','old','old','old',1024,9)`;
            await client`insert into dictionary_cards(id,dictionary_id,authorship,source,normalized_source,translation,sort_key,lifecycle,archived_at) values (${archivedCard},${dictionaryId},'human','archived','archived','archived',2048,'archived',now())`;
            const attempt = randomUUID();
            await client`insert into flashcard_attempts(id,learner_id,dictionary_id,entry_id,operation_id,session_id,round,learning_version,rating,configuration) values (${attempt},${ownerId},${dictionaryId},${oldCard},${randomUUID()},${randomUUID()},1,9,'known','{"front":["source"],"back":["translation"]}'::jsonb)`;
            await client`insert into flashcard_entry_progress(learner_id,dictionary_id,entry_id,learning_version,rating,latest_attempt_id) values (${ownerId},${dictionaryId},${oldCard},9,'known',${attempt})`;
            const result = await store.applyDictionarySnippet(
                access(),
                chat.id,
                snippet.id,
                request('replace'),
            );

            expect(result.archivedCount).toBe(1);
            expect(result.cardIds).not.toContain(oldCard);
            const old =
                await client`select id,lifecycle,learning_version from dictionary_cards where id in (${oldCard},${archivedCard}) order by id`;

            expect(old).toHaveLength(2);
            expect(old.find((row) => row.id === oldCard)).toMatchObject({
                lifecycle: 'archived',
                learning_version: 9,
            });

            const [progress] =
                await client`select learning_version,rating,latest_attempt_id from flashcard_entry_progress where entry_id=${oldCard}`;

            expect(progress).toMatchObject({
                learning_version: 9,
                rating: 'known',
                latest_attempt_id: attempt,
            });

            const [freshProgress] =
                await client`select count(*)::integer as value from flashcard_entry_progress where entry_id=any(${result.cardIds}::uuid[])`;

            expect(freshProgress?.value).toBe(0);
            const [dictionary] =
                await client`select name,version from dictionaries where id=${dictionaryId}`;

            expect(dictionary).toMatchObject({
                name: 'Snippet fixture',
                version: 2,
            });
        });

        it('rolls back capacity/version failures and rejects foreign chat/snippet/forged indices and interrupted leases', async () => {
            const { chat, turn, snippet } = await generated();
            await client`insert into dictionary_cards(id,dictionary_id,authorship,source,normalized_source,translation,sort_key) select gen_random_uuid(),${dictionaryId},'human','full','full','full',n*1024 from generate_series(1,10000) n`;
            await expect(
                store.applyDictionarySnippet(
                    access(),
                    chat.id,
                    snippet.id,
                    request('append'),
                ),
            ).rejects.toThrow('10');

            const [unchanged] =
                await client`select version,(select count(*)::integer from dictionary_cards where dictionary_id=${dictionaryId} and lifecycle='active') as cards from dictionaries where id=${dictionaryId}`;

            expect(unchanged).toMatchObject({ version: 1, cards: 10000 });
            const [receipts] =
                await client`select count(*)::integer as value from dictionary_chat_snippet_applications`;

            expect(receipts?.value).toBe(0);
            await expect(
                store.applyDictionarySnippet(access(), chat.id, snippet.id, {
                    ...request('replace'),
                    selectedIndices: [99],
                }),
            ).rejects.toMatchObject({ code: 'version_conflict' });

            await expect(
                store.applyDictionarySnippet(
                    { ownerId: randomUUID() },
                    chat.id,
                    snippet.id,
                    request('replace'),
                ),
            ).rejects.toBeDefined();

            const other = await store.create(access(), {
                source: { kind: 'dictionary', id: dictionaryId },
            });

            await expect(
                store.applyDictionarySnippet(
                    access(),
                    other.id,
                    snippet.id,
                    request('replace'),
                ),
            ).rejects.toBeDefined();

            await expect(
                store.readDictionarySnippet(turn, snippet.id),
            ).rejects.toMatchObject({ code: 'operation_interrupted' });

            const replaced = await store.applyDictionarySnippet(
                access(),
                chat.id,
                snippet.id,
                request('replace'),
            );

            expect(replaced.archivedCount).toBe(10000);
        });

        it('fails fast on saturated canonical mutation permits before waiting for owner or dictionary locks', async () => {
            const { chat, snippet } = await generated();
            const applyRequest = request('replace');
            const holderDatabase = createDrizzleDatabase(
                client,
                databaseSchema,
            );
            let release!: () => void;
            let locked!: () => void;
            const released = new Promise<void>((resolve) => {
                release = resolve;
            });
            const ready = new Promise<void>((resolve) => {
                locked = resolve;
            });
            const holder = holderDatabase.transaction(async (tx) => {
                await tx.execute(
                    sql`select pg_advisory_xact_lock(1281979471, 4000 + slot) from generate_series(0, 31) slot`,
                );

                // Saturation must reject before either ordinary mutation fence:
                // an implementation taking these locks first would wait here.
                await tx.execute(
                    sql`select id from users where id=${ownerId}::uuid for update`,
                );

                await tx.execute(
                    sql`select id from dictionaries where id=${dictionaryId}::uuid for update`,
                );

                locked();
                await released;
            });

            await ready;
            const attempt = store
                .applyDictionarySnippet(
                    access(),
                    chat.id,
                    snippet.id,
                    applyRequest,
                )
                .then(
                    (result) => ({ status: 'resolved' as const, result }),
                    (error: unknown) => ({
                        status: 'rejected' as const,
                        error,
                    }),
                );
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
                const outcome = await Promise.race([
                    attempt,
                    new Promise<{ status: 'timeout' }>((resolve) => {
                        timer = setTimeout(
                            () => resolve({ status: 'timeout' }),
                            1500,
                        );
                    }),
                ]);

                expect(outcome.status).toBe('rejected');
                if (outcome.status === 'rejected') {
                    expect(outcome.error).toBeInstanceOf(
                        DictionaryRateLimitError,
                    );

                    expect(outcome.error).toMatchObject({
                        retryAfterSeconds: 5,
                    });
                }
            } finally {
                if (timer) {
                    clearTimeout(timer);
                }

                release();
                await holder;
                await attempt;
            }

            const [state] =
                await client`select version,(select count(*)::integer from dictionary_chat_snippet_applications) as receipts from dictionaries where id=${dictionaryId}`;

            expect(state).toMatchObject({ version: 1, receipts: 0 });
            const applied = await store.applyDictionarySnippet(
                access(),
                chat.id,
                snippet.id,
                applyRequest,
            );

            expect(applied.addedCount).toBe(2);
            expect(
                await store.applyDictionarySnippet(
                    access(),
                    chat.id,
                    snippet.id,
                    applyRequest,
                ),
            ).toEqual(applied);
        });

        it('uses the deployed restricted worker role with exact lease/source checks and no direct private snippet access', async () => {
            const chat = await store.create(access(), {
                source: { kind: 'dictionary', id: dictionaryId },
            });

            await store.submit(
                access(),
                chat.id,
                SubmitConversationTurnRequestSchema.parse({
                    requestId: randomUUID(),
                    content: 'Create complete words.',
                }),
            );

            const turn = (await store.claim())!;
            const role = `snippet_worker_${randomUUID().replaceAll('-', '')}`;
            await client.unsafe(`create role ${role} nologin`);
            const roleSql = await readFile(
                new URL(
                    '../../../../../../infra/deploy/sql/dictionary-worker-role.sql',
                    import.meta.url,
                ),
                'utf8',
            );

            await client.unsafe(
                roleSql
                    .split('\n')
                    .filter((line) => !line.startsWith('\\'))
                    .join('\n')
                    .replaceAll(':"dictionary_worker_role"', role),
            );

            const workerUrl = new URL(getTestDatabaseUrl());
            workerUrl.searchParams.set('options', `-c role=${role}`);
            const worker = createPostgresClient({
                databaseUrl: workerUrl.toString(),
                maxConnections: 2,
            });
            const payload = JSON.stringify({
                title: 'Private words',
                cards: [candidate('uno')],
            });

            try {
                expect(
                    (await worker`select current_user as role`)[0]?.role,
                ).toBe(role);

                await expect(
                    worker`select * from conversation_dictionary_snippets`,
                ).rejects.toMatchObject({ code: '42501' });

                await expect(
                    worker`select * from dictionary_chat_snippet_applications`,
                ).rejects.toMatchObject({ code: '42501' });

                await expect(
                    worker`select public.languon_propose_dictionary_chat_snippet(${turn.id}::uuid,${randomUUID()}::uuid,${payload}::text::jsonb)`,
                ).rejects.toMatchObject({ code: '23514' });

                const [saved] =
                    await worker`select public.languon_propose_dictionary_chat_snippet(${turn.id}::uuid,${turn.leaseToken}::uuid,${payload}::text::jsonb) as id`;

                expect(saved?.id).toEqual(expect.any(String));
                const [read] =
                    await worker`select public.languon_read_dictionary_chat_snippet(${turn.id}::uuid,${turn.leaseToken}::uuid,${saved!.id}::uuid) as snippet`;

                expect(read?.snippet.cards[0].source).toBe('uno');
                await store.finish(turn, 'succeeded');
                const other = await store.create(access(), {
                    source: { kind: 'dictionary', id: dictionaryId },
                });

                await store.submit(
                    access(),
                    other.id,
                    SubmitConversationTurnRequestSchema.parse({
                        requestId: randomUUID(),
                        content: 'Other private conversation.',
                    }),
                );

                const otherTurn = (await store.claim())!;
                await expect(
                    worker`select public.languon_read_dictionary_chat_snippet(${otherTurn.id}::uuid,${otherTurn.leaseToken}::uuid,${saved!.id}::uuid)`,
                ).rejects.toMatchObject({ code: '23514' });

                const [otherSaved] =
                    await worker`select public.languon_propose_dictionary_chat_snippet(${otherTurn.id}::uuid,${otherTurn.leaseToken}::uuid,${payload}::text::jsonb) as id`;

                await client`update dictionaries set lifecycle='archived',archived_at=now() where id=${dictionaryId}`;
                await expect(
                    worker`select public.languon_read_dictionary_chat_snippet(${otherTurn.id}::uuid,${otherTurn.leaseToken}::uuid,${otherSaved!.id}::uuid)`,
                ).rejects.toMatchObject({ code: '23514' });
            } finally {
                await worker.end();
                await client.unsafe(`drop owned by ${role}`);
                await client.unsafe(`drop role ${role}`);
            }
        });
    },
);
