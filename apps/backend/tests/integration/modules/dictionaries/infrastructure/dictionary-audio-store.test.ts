import { createHmac, randomUUID } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { databaseSchema } from '../../../../../src/infrastructure/database/schema';
import { DrizzleDictionaryStore } from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-store';
import { DrizzleDictionaryAudioStore } from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-audio-store';
import { usersTable } from '../../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { PostgresAudioObjectStorage } from '../../../../../src/modules/dictionaries/infrastructure/audio/audio-object-storages';
import { createFixtureAudio } from '../../../../../src/modules/dictionaries/infrastructure/audio/audio-integrity';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../../support/test-database';

describe.runIf(isDatabaseIntegrationEnabled())(
    'dictionary audio durable concurrency',
    () => {
        let client: PostgresClient;
        let audio: DrizzleDictionaryAudioStore;
        let input: Parameters<DrizzleDictionaryAudioStore['enqueue']>[0];
        const now = new Date('2026-09-21T12:00:00Z');
        const budget = {
            ownerDailyCost: 100000,
            globalDailyCost: 1000000,
            ownerQueued: 5,
            ownerActive: 2,
            globalActive: 4,
        };
        beforeAll(async () => {
            client = createTestPostgresClient();
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            const database = createDrizzleDatabase(client, databaseSchema);
            audio = new DrizzleDictionaryAudioStore(database);
            const store = new DrizzleDictionaryStore(database, {
                generate: randomUUID,
            });
            const ownerId = randomUUID();
            await database.insert(usersTable).values({
                id: ownerId,
                status: 'active',
                createdAt: now,
                updatedAt: now,
            });
            const context = { now, signal: new AbortController().signal };
            const dictionary = await store.createDictionary({
                ownerId,
                context,
                idempotencyKey: randomUUID(),
                fingerprint: `hmac-sha256:v1:${'A'.repeat(43)}`,
                request: {
                    name: 'Audio',
                    description: null,
                    sourceLanguage: 'en',
                    targetLanguage: 'es',
                },
            });
            const { card } = await store.createCard({
                ownerId,
                dictionaryId: dictionary.id,
                context,
                request: {
                    expectedDictionaryVersion: dictionary.version,
                    expectedSettingsVersion: dictionary.settings.version,
                    translationContext: null,
                    values: {
                        source: 'hello',
                        translation: 'hola',
                        transcription: null,
                        definition: null,
                        example: null,
                        exampleTranslation: null,
                    },
                    overrides: {
                        definitionEnabled: null,
                        definitionLanguage: null,
                        exampleEnabled: null,
                        exampleLanguage: null,
                        exampleTranslationEnabled: null,
                        transcriptionEnabled: null,
                        transcriptionNotation: null,
                        transcriptionCustomLabel: null,
                    },
                },
            });
            input = {
                ownerId,
                dictionaryId: dictionary.id,
                cardId: card.id,
                field: 'source',
                fingerprint: 'same-content',
                text: 'hello',
                profile: {
                    configurationId: 'fixture-v1',
                    provider: 'fixture',
                    model: 'fixture',
                    voice: 'fixture',
                    language: 'en',
                    settingsVersion: '1',
                    estimatedCostUnitsPerCharacter: 1,
                },
                storage: {
                    backend: 'postgres',
                    namespace: 'test',
                    key: 'dictionary-audio/test',
                },
                now,
                budget,
                cardVersion: card.version,
                settingsVersion: dictionary.settings.version,
            };
        }, 30000);
        afterAll(async () => client.end());
        it('deduplicates concurrent admission and fences stale completions', async () => {
            const results = await Promise.all(
                Array.from({ length: 5 }, () => audio.enqueue(input)),
            );
            expect(new Set(results.map((result) => result.job.id)).size).toBe(
                1,
            );
            const job = await audio.claim(now, budget);
            expect(job?.state).toBe('submitting');
            expect(await audio.claim(now, budget)).toBeNull();
            const later = new Date(now.getTime() + 61000);
            expect(await audio.claim(later, budget)).toBeNull();
            expect((await audio.find(input))?.job.state).toBe(
                'submission_unknown',
            );
            expect(
                await audio.complete(
                    job!,
                    {
                        storage: input.storage,
                        checksum: 'test',
                        mimeType: 'audio/wav',
                        byteLength: 10,
                    },
                    later,
                ),
            ).toBe(false);
            expect((await audio.enqueue(input)).job.state).toBe(
                'submission_unknown',
            );
        });
        it('blocks a new reservation above the per-clip budget', async () => {
            await expect(
                audio.enqueue({
                    ...input,
                    fingerprint: 'expensive',
                    budget: { ...budget, maxCostPerClip: 1 },
                }),
            ).rejects.toMatchObject({ name: 'DictionaryRateLimitError' });
        });
        it('admits only one of two concurrent reservations at the global budget ceiling', async () => {
            const results = await Promise.allSettled(
                ['budget-a', 'budget-b'].map((fingerprint) =>
                    audio.enqueue({
                        ...input,
                        fingerprint,
                        budget: { ...budget, globalDailyCost: 10 },
                    }),
                ),
            );
            expect(
                results.filter((result) => result.status === 'fulfilled'),
            ).toHaveLength(1);
            expect(
                results.filter((result) => result.status === 'rejected'),
            ).toHaveLength(1);
        });
        it('pauses new submissions while disabled, publishes with fencing, and expires idle assets', async () => {
            expect(await audio.claim(now, budget, false)).toBeNull();
            const job = await audio.claim(now, budget);
            expect(job).not.toBeNull();
            expect(await audio.beginWrite(job!, now)).not.toBeNull();
            expect(
                await audio.complete(
                    job!,
                    {
                        storage: input.storage,
                        checksum: 'sha',
                        mimeType: 'audio/wav',
                        byteLength: 20,
                    },
                    now,
                ),
            ).toBe(true);
            expect(
                await audio.cleanupCandidate(
                    new Date(now.getTime() + 86400000),
                ),
            ).toBeNull();
            const expired = await audio.cleanupCandidate(
                new Date(now.getTime() + 31 * 86400000),
            );
            expect(expired?.id).toBe(job!.assetId);
            await audio.finishCleanup(expired!.id);
            expect(
                await audio.find({ ...input, fingerprint: job!.fingerprint }),
            ).toBeNull();
        });
        it('removes superseded content within the orphan window while preserving unknown submissions', async () => {
            const fingerprint = createHmac('sha256', 'test-secret')
                .update(
                    JSON.stringify([
                        input.ownerId,
                        input.cardId,
                        'source',
                        'hello',
                        'en',
                    ]),
                )
                .digest('hex');
            await audio.enqueue({ ...input, fingerprint });
            const job = await audio.claim(now, budget);
            expect(job).not.toBeNull();
            await audio.beginWrite(job!, now);
            await audio.complete(
                job!,
                {
                    storage: input.storage,
                    checksum: 'sha',
                    mimeType: 'audio/wav',
                    byteLength: 20,
                },
                now,
            );
            await client`update dictionary_cards set source='goodbye', normalized_source='goodbye',version=version+1 where id=${input.cardId}`;
            const pruningStore = new DrizzleDictionaryAudioStore(
                createDrizzleDatabase(client, databaseSchema),
                'test-secret',
            );
            const asset = await pruningStore.cleanupCandidate(
                new Date(now.getTime() + 25 * 3600000),
            );
            expect(asset?.id).toBe(job!.assetId);
            expect(
                await pruningStore.find({ ...input, fingerprint }),
            ).toBeNull();
            expect((await pruningStore.find(input))?.job.state).toBe(
                'submission_unknown',
            );
            await pruningStore.finishCleanup(asset!.id);
        });
        it('removes uploaded bytes and stale intent after publication fencing and writer expiry', async () => {
            const storage = new PostgresAudioObjectStorage(
                createDrizzleDatabase(client, databaseSchema),
            );
            const request = {
                ...input,
                cardVersion: 2,
                text: 'goodbye',
                fingerprint: 'fenced-upload',
                storage: {
                    ...storage.identity,
                    key: `dictionary-audio/test/${randomUUID()}`,
                },
            };
            const reserved = await audio.enqueue(request);
            const job = await audio.claim(now, budget);
            expect(job?.id).toBe(reserved.job.id);
            const intent = await audio.beginWrite(job!, now);
            const bytes = createFixtureAudio();
            const reference = await storage.put(intent!.storage.key, bytes);
            expect(
                await audio.complete(
                    job!,
                    {
                        storage: reference,
                        checksum: bytes.checksum,
                        mimeType: bytes.mimeType,
                        byteLength: bytes.bytes.byteLength,
                    },
                    new Date(now.getTime() + 61000),
                ),
            ).toBe(false);
            expect(
                await audio.cleanupCandidate(new Date(now.getTime() + 89000)),
            ).toBeNull();
            const orphan = await audio.cleanupCandidate(
                new Date(now.getTime() + 25 * 3600000),
            );
            expect(orphan?.id).toBe(job!.assetId);
            await storage.delete(orphan!.storage);
            await audio.finishCleanup(orphan!.id);
            expect(await storage.read(reference)).toBeNull();
            expect(await audio.find(request)).toBeNull();
            expect(
                await client`select id from dictionary_audio_assets where id=${orphan!.id}`,
            ).toHaveLength(0);
            expect(
                await client`select id from dictionary_audio_bindings where job_id=${job!.id}`,
            ).toHaveLength(0);
            const ledger =
                await client`select state,text,reserved_cost from dictionary_audio_jobs where id=${job!.id}`;
            expect(ledger[0]).toMatchObject({
                state: 'cancelled',
                text: '',
                reserved_cost: 7,
            });
        });
        it('bounds reconciliation and releases upstream capacity while preserving no-resubmit tombstones', async () => {
            const bounded = {
                ...budget,
                ownerQueued: 1,
                ownerActive: 1,
                globalActive: 1,
            };
            const tomorrow = new Date(now.getTime() + 25 * 3600000);
            const first = {
                ...input,
                now: tomorrow,
                cardVersion: 2,
                text: 'goodbye',
                fingerprint: 'pending-horizon',
                budget: bounded,
            };
            const pending = await audio.enqueue(first);
            const job = await audio.claim(tomorrow, bounded);
            expect(job?.id).toBe(pending.job.id);
            await audio.transition(
                job!,
                { state: 'waiting_provider', taskId: 'known-upstream' },
                tomorrow,
            );
            const afterHorizon = new Date(tomorrow.getTime() + 25 * 3600000);
            await audio.cleanupCandidate(afterHorizon);
            const tombstone = await audio.find(first);
            expect(tombstone?.job).toMatchObject({
                state: 'submission_unknown',
                taskId: 'known-upstream',
                text: '',
            });
            expect(
                (await audio.enqueue({ ...first, now: afterHorizon })).job.id,
            ).toBe(job!.id);
            const next = await audio.enqueue({
                ...first,
                fingerprint: 'new-after-horizon',
                now: afterHorizon,
            });
            expect((await audio.claim(afterHorizon, bounded))?.id).toBe(
                next.job.id,
            );
            const unprocessed = {
                ...first,
                fingerprint: 'generation-disabled-queued',
                now: afterHorizon,
                budget,
            };
            await audio.enqueue(unprocessed);
            await audio.cleanupCandidate(
                new Date(afterHorizon.getTime() + 25 * 3600000),
            );
            expect((await audio.find(unprocessed))?.job).toMatchObject({
                state: 'failed',
                text: '',
            });
        });
        it('prunes settled old ledgers but preserves current-day charges and bound unknown tombstones', async () => {
            const sweepNow = new Date('2026-11-01T12:00:00Z');
            const currentId = randomUUID(),
                oldId = randomUUID(),
                unknownId = randomUUID();
            for (const [id, state, created] of [
                [currentId, 'failed', sweepNow],
                [oldId, 'cancelled', new Date('2026-10-31T23:59:00Z')],
                [
                    unknownId,
                    'submission_unknown',
                    new Date('2026-09-01T00:00:00Z'),
                ],
            ] as const) {
                await client`insert into dictionary_audio_jobs (id,owner_id,dictionary_id,card_id,field,fingerprint,asset_id,text,profile,state,next_poll_at,deadline_at,reserved_cost,created_at,card_version,settings_version)
                    select ${id},owner_id,dictionary_id,card_id,field,${id},${randomUUID()},'',profile,${state},${created.toISOString()}::timestamptz,${created.toISOString()}::timestamptz,9,${created.toISOString()}::timestamptz,card_version,settings_version from dictionary_audio_jobs limit 1`;
            }
            await audio.cleanupCandidate(sweepNow);
            expect(
                await client`select id from dictionary_audio_jobs where id=${oldId}`,
            ).toHaveLength(0);
            expect(
                await client`select id from dictionary_audio_jobs where id=${unknownId}`,
            ).toHaveLength(0);
            expect(
                await client`select reserved_cost from dictionary_audio_jobs where id=${currentId}`,
            ).toEqual([{ reserved_cost: 9 }]);
            expect((await audio.find(input))?.job.state).toBe(
                'submission_unknown',
            );
            await expect(
                audio.enqueue({
                    ...input,
                    cardVersion: 2,
                    text: 'goodbye',
                    fingerprint: 'current-day-ledger-budget',
                    now: sweepNow,
                    budget: { ...budget, globalDailyCost: 9 },
                }),
            ).rejects.toMatchObject({ name: 'DictionaryRateLimitError' });
        });
        it('restoring an owner cannot resubmit known, unknown, or uploading upstream work', async () => {
            const current = new Date('2026-12-01T12:00:00Z');
            const base = {
                ...input,
                cardVersion: 2,
                text: 'goodbye',
                now: current,
            };
            const identities = [];
            for (const state of [
                'waiting_provider',
                'submission_unknown',
                'storing',
            ] as const) {
                const request = {
                    ...base,
                    fingerprint: `owner-interruption-${state}`,
                };
                const reserved = await audio.enqueue(request);
                const job = await audio.claim(current, {
                    ...budget,
                    ownerActive: 4,
                });
                expect(job?.id).toBe(reserved.job.id);
                if (state === 'storing') await audio.beginWrite(job!, current);
                else
                    await audio.transition(
                        job!,
                        {
                            state,
                            taskId:
                                state === 'waiting_provider'
                                    ? 'known-before-disable'
                                    : null,
                            nextPollAt: new Date(current.getTime() + 2000),
                        },
                        current,
                    );
                identities.push({ request, id: job!.id });
            }
            await client`update users set status='disabled' where id=${input.ownerId}`;
            const afterLease = new Date(current.getTime() + 91000);
            await audio.cleanupCandidate(afterLease);
            await audio.claim(afterLease, budget);
            await client`update users set status='active' where id=${input.ownerId}`;
            for (const { request, id } of identities) {
                const existing = await audio.find(request);
                expect(existing?.job).toMatchObject({
                    id,
                    state: 'submission_unknown',
                    text: '',
                });
                expect(
                    (await audio.enqueue({ ...request, now: afterLease })).job
                        .id,
                ).toBe(id);
            }
            const known = await audio.find(identities[0]!.request);
            expect(known?.job.taskId).toBe('known-before-disable');
        });
        it('recovers an expired known-task upload by polling its original task and retains the no-resubmit binding', async () => {
            const current = new Date('2026-12-03T12:00:00Z');
            const request = {
                ...input,
                cardVersion: 2,
                text: 'goodbye',
                fingerprint: 'known-expired-upload',
                now: current,
            };
            const original = await audio.enqueue(request);
            const submitted = await audio.claim(current, budget);
            expect(submitted?.id).toBe(original.job.id);
            await audio.transition(
                submitted!,
                {
                    state: 'waiting_provider',
                    taskId: 'recover-original-task',
                    nextPollAt: current,
                },
                current,
            );
            const polling = await audio.claim(current, budget);
            await audio.beginWrite(polling!, current);
            const afterWriter = new Date(current.getTime() + 91000);
            await audio.cleanupCandidate(afterWriter);
            expect((await audio.find(request))?.job).toMatchObject({
                state: 'waiting_provider',
                taskId: 'recover-original-task',
                text: '',
            });
            expect(
                (await audio.enqueue({ ...request, now: afterWriter })).job.id,
            ).toBe(original.job.id);
            const recovery = await audio.claim(afterWriter, budget);
            expect(recovery).toMatchObject({
                id: original.job.id,
                state: 'waiting_provider',
                taskId: 'recover-original-task',
            });
            await audio.beginWrite(recovery!, afterWriter);
            const afterHorizon = new Date(current.getTime() + 25 * 3600000);
            await audio.cleanupCandidate(afterHorizon);
            expect((await audio.find(request))?.job).toMatchObject({
                state: 'submission_unknown',
                taskId: 'recover-original-task',
            });
            expect(
                (await audio.enqueue({ ...request, now: afterHorizon })).job.id,
            ).toBe(original.job.id);
        });
    },
);
