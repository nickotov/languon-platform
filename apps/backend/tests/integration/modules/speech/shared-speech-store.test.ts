import { randomUUID, createHmac, randomBytes } from 'node:crypto';
import { DrizzleDictionaryStore } from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-store';
import { HmacDictionaryCryptography } from '../../../../src/modules/dictionaries/infrastructure/crypto/dictionary-cryptography';
import { DrizzleSpeechSourceResolver } from '../../../../src/modules/speech/infrastructure/source-resolver';
import { SpeechService } from '../../../../src/modules/speech/application/speech-service';
import type { StoredSpeechSource } from '../../../../src/modules/speech/application/ports';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { and, eq, sql } from 'drizzle-orm';
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import type { SpeechSource, SpeechResponse } from '@languon/contracts';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import {
    dictionariesTable,
    dictionaryGenerationJobsTable,
} from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { adminMembershipsTable } from '../../../../src/modules/administration/infrastructure/persistence/drizzle/schema';
import { DrizzleAiCreditTransactionParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import {
    DrizzleSpeechStore,
    purgeSpeechActor,
} from '../../../../src/modules/speech/infrastructure/drizzle-speech-store';
import {
    speechBindingsTable,
    speechJobsTable,
    speechRecordingsTable,
    speechQuotesTable,
} from '../../../../src/modules/speech/infrastructure/schema';
import { FixtureSpeechProvider } from '../../../../src/modules/speech/infrastructure/audio/speech-providers';
import { PostgresAudioObjectStorage } from '../../../../src/modules/speech/infrastructure/audio/audio-object-storages';
import { SpeechWorker } from '../../../../src/modules/speech/application/speech-worker';
import { SpeechTaskFailedError } from '../../../../src/modules/speech/application/ports/speech-synthesis-provider';
import { createFixtureAudio } from '../../../../src/modules/speech/domain/audio-integrity';
import {
    SpeechError,
    speechTextIdentity,
} from '../../../../src/modules/speech/domain/speech-policy';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

describe.runIf(isDatabaseIntegrationEnabled())(
    'shared speech atomic admission and success-only billing',
    () => {
        let client: PostgresClient,
            db: PostgresJsDatabase<typeof databaseSchema>,
            store: DrizzleSpeechStore,
            storage: PostgresAudioObjectStorage;
        let actors: string[], text: string, revoked: boolean, voice: string;
        let configurationId: string;
        let providerKind: 'fixture' | 'kie', supported: boolean;
        const now = new Date('2026-10-13T12:00:00Z');
        const provider = new FixtureSpeechProvider();
        const source: SpeechSource = {
            kind: 'dictionary-field',
            access: { kind: 'owner', dictionaryId: randomUUID() },
            cardId: randomUUID(),
            field: 'source',
        };
        beforeAll(() => {
            client = createTestPostgresClient();
        });
        beforeEach(async () => {
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            db = createDrizzleDatabase(client, databaseSchema);
            actors = [randomUUID(), randomUUID()];
            text = 'bonjour';
            revoked = false;
            voice = 'fixture';
            configurationId = 'fixture-v1';
            providerKind = 'fixture';
            supported = true;
            await db.insert(usersTable).values(
                actors.map((id) => ({
                    id,
                    status: 'active' as const,
                    createdAt: now,
                    updatedAt: now,
                })),
            );
            await db.insert(adminMembershipsTable).values({
                id: randomUUID(),
                userId: actors[0]!,
                role: 'owner',
                grantedByUserId: actors[0]!,
                grantReason: 'Disposable speech test administrator',
            });
            for (const actor of actors)
                await db.transaction((tx) =>
                    new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                        amount: 1000n,
                        createdAt: now,
                        expiresAt: null,
                        ownerId: actor,
                        source: 'migration',
                        sourceReference: randomUUID(),
                    }),
                );
            storage = new PostgresAudioObjectStorage(db);
            store = new DrizzleSpeechStore({
                database: db,
                fingerprintSecret: 'synthetic-shared-speech-secret',
                profileResolver: {
                    supports: (language) =>
                        supported
                            ? {
                                  ...provider.supports(language),
                                  configurationId,
                                  provider: providerKind,
                                  voice,
                              }
                            : null,
                },
                storageIdentity: storage.identity,
                generationEnabled: true,
                playbackEnabled: true,
                revalidateSource: async (actor, _source, tx) => {
                    const [user] = await tx
                        .select()
                        .from(usersTable)
                        .where(
                            and(
                                eq(usersTable.id, actor),
                                eq(usersTable.status, 'active'),
                            ),
                        )
                        .for('share');
                    if (!user || revoked)
                        throw new SpeechError('speech_source_unavailable', 404);
                    const authority =
                        _source.access.kind === 'shared' &&
                        'shareKey' in _source.access
                            ? ({
                                  ..._source,
                                  access: {
                                      kind: 'shared' as const,
                                      shareId: _source.access.shareId,
                                      keyDigest:
                                          'hmac-sha256:v1:' +
                                          createHmac(
                                              'sha256',
                                              'synthetic-share-digest',
                                          )
                                              .update(_source.access.shareKey)
                                              .digest('base64url'),
                                  },
                              } as StoredSpeechSource)
                            : (_source as StoredSpeechSource);
                    return { text, language: 'fr', revision: 'v1', authority };
                },
            });
        }, 45000);
        afterAll(async () => {
            if (client) await client.end();
        });
        const prepare = (actor: string, operationId = randomUUID()) =>
            store.prepare({
                actorId: actor,
                source,
                resolved: { text, language: 'fr', revision: 'v1' },
                operationId,
                now,
            });
        const confirm = (
            actor: string,
            prepared: SpeechResponse,
            operationId = randomUUID(),
        ) =>
            store.confirm({
                actorId: actor,
                quoteId: prepared.quote!.id,
                operationId,
                now,
            });
        const wallet = (actor: string) =>
            db.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).accountSummary(
                    actor,
                    now,
                ),
            );

        const failProviderTaskAndCleanUp = async (
            reason:
                | 'generation_failed'
                | 'provider_unavailable' = 'generation_failed',
        ) => {
            const failingProvider = {
                configurationId: provider.configurationId,
                supports: provider.supports.bind(provider),
                submit: vi.fn().mockResolvedValue({
                    state: 'pending',
                    taskId: 'synthetic-failed-provider-task',
                    retryAfterMs: 2500,
                }),
                poll: vi
                    .fn()
                    .mockRejectedValue(new SpeechTaskFailedError(reason)),
            };
            const worker = new SpeechWorker({
                store,
                storage,
                providers: new Map([['fixture-v1', failingProvider]]),
                now: () => now,
            });
            expect(await worker.runOnce()).toBe(true);
            await db.update(speechJobsTable).set({
                nextPollAt: sql`clock_timestamp() - interval '1 millisecond'`,
            });
            expect(await worker.runOnce()).toBe(true);
            expect(failingProvider.submit).toHaveBeenCalledOnce();
            expect(failingProvider.poll).toHaveBeenCalledOnce();
            expect((await db.select().from(speechJobsTable))[0]).toMatchObject({
                state: 'failed',
                error:
                    reason === 'provider_unavailable'
                        ? 'speech_provider_unavailable'
                        : 'speech_generation_failed',
            });
            expect(
                (await db.select().from(speechRecordingsTable))[0],
            ).toMatchObject({
                state: 'deleting',
                text: '',
            });
            await worker.runOnce();
            expect(
                (await db.select().from(speechRecordingsTable))[0]?.state,
            ).toBe('deleted');
        };

        it('preserves a free provider failure after deleting its recording inventory', async () => {
            const prepared = await prepare(actors[0]!);
            await failProviderTaskAndCleanUp();
            const { response } = await store.request(
                actors[0]!,
                prepared.requestId!,
                now,
            );
            expect(response).toMatchObject({
                state: 'failed',
                requestId: prepared.requestId,
                playbackId: null,
                error: 'speech_generation_failed',
                billingState: 'free',
                retryAfterMs: null,
            });
            expect((await wallet(actors[0]!)).consumedCredits).toBe(0n);
            await expect(
                store.adminPlayback(
                    (await db.select().from(speechRecordingsTable))[0]!.id,
                ),
            ).rejects.toThrow('speech_recording_unavailable');
        });

        it.each(['generation_failed', 'provider_unavailable'] as const)(
            'preserves refunded %s for its payer without exposing that billing state to a joiner',
            async (reason) => {
                text =
                    'This longer sentence has more than ten distinct words and requires paid pronunciation.';
                const quote = await prepare(actors[0]!);
                const payer = await confirm(actors[0]!, quote);
                const joiner = await prepare(actors[1]!);
                expect(joiner.state).toBe('queued');
                await failProviderTaskAndCleanUp(reason);
                for (const [actor, requestId, billingState] of [
                    [actors[0]!, payer.requestId!, 'released_no_charge'],
                    [actors[1]!, joiner.requestId!, 'free'],
                ] as const) {
                    expect(
                        (await store.request(actor, requestId, now)).response,
                    ).toMatchObject({
                        state: 'failed',
                        playbackId: null,
                        error:
                            reason === 'provider_unavailable'
                                ? 'speech_provider_unavailable'
                                : 'speech_generation_failed',
                        billingState,
                    });
                    expect((await wallet(actor)).consumedCredits).toBe(0n);
                    expect((await wallet(actor)).reservedCredits).toBe(0n);
                }
            },
        );

        it('reports administrative deletion of successful audio as recording unavailable', async () => {
            const prepared = await prepare(actors[0]!);
            await new SpeechWorker({
                store,
                storage,
                providers: new Map([['fixture-v1', provider]]),
                now: () => now,
            }).runOnce();
            const snapshot = (
                await store.listRecordings({ page: 1, pageSize: 25 })
            ).recordings[0]!;
            const selected = await store.markDeleting({
                recordings: [
                    {
                        id: snapshot.id,
                        expectedVersion: snapshot.version,
                        expectedBindingCount: snapshot.bindingCount,
                    },
                ],
                audit: {
                    actorId: actors[0]!,
                    correlationId: randomUUID(),
                    reason: 'Delete synthetic pronunciation',
                    occurredAt: now,
                },
            });
            for (const cleanup of [false, true]) {
                if (cleanup) {
                    await storage.delete(selected[0]!.storage);
                    await store.deleted(snapshot.id, now);
                }
                expect(
                    (await store.request(actors[0]!, prepared.requestId!, now))
                        .response,
                ).toMatchObject({
                    state: 'failed',
                    playbackId: null,
                    error: 'speech_recording_unavailable',
                    billingState: null,
                });
            }
        });

        it('joins concurrent free requests globally and preserves audio after association purge', async () => {
            const results = await Promise.all(
                actors.map((actor) => prepare(actor)),
            );
            expect(await db.select().from(speechJobsTable)).toHaveLength(1);
            const worker = new SpeechWorker({
                store,
                storage,
                providers: new Map([['fixture-v1', provider]]),
                now: () => now,
            });
            expect(await worker.runOnce()).toBe(true);
            expect(
                (await store.listRecordings({ page: 1, pageSize: 25 }))
                    .recordings[0]?.durationMs,
            ).toBe(1000);
            for (let index = 0; index < actors.length; index++)
                expect(
                    (
                        await store.request(
                            actors[index]!,
                            results[index]!.requestId!,
                            now,
                        )
                    ).response,
                ).toMatchObject({ state: 'ready', billingState: 'free' });
            await store.purgeActor(actors[0]!, now);
            expect(
                (await db.select().from(speechRecordingsTable))[0]?.state,
            ).toBe('ready');
            expect(await db.select().from(speechBindingsTable)).toHaveLength(1);
            text = '  bonjour\t  ';
            expect((await prepare(actors[1]!)).state).toBe('ready');
            expect(await db.select().from(speechJobsTable)).toHaveLength(1);
            await Promise.all(
                Array.from({ length: 5 }, () => prepare(actors[1]!)),
            );
            expect(await db.select().from(speechBindingsTable)).toHaveLength(1);
        });
        it('purges payer associations and releases paid holds while admitted audio completes without a debit', async () => {
            await prepare(actors[0]!);
            await new SpeechWorker({
                store,
                storage,
                providers: new Map([['fixture-v1', provider]]),
            }).runOnce();
            const [successful] = await db.select().from(speechRecordingsTable);
            const originalBytes = await storage.read(successful!.storage);
            const originalText = successful!.text;
            text =
                'A private sentence contains considerably more than ten words and requires confirmed pronunciation credits.';
            const prepared = await prepare(actors[0]!);
            await confirm(actors[0]!, prepared);
            const job = await store.claim(now);
            expect(job).not.toBeNull();
            const audio = createFixtureAudio();
            await store.storing(job!, audio, now);
            const reference = await storage.putForReference(
                job!.storage,
                audio,
            );
            expect((await wallet(actors[0]!)).reservedCredits).toBeGreaterThan(
                0n,
            );
            const availableBeforePurge = (await wallet(actors[0]!))
                .availableCredits;
            let completion!: Promise<void>;
            await db.transaction(async (tx) => {
                await purgeSpeechActor(tx, actors[0]!, new Date());
                // Completion must wait for the deletion transaction's held job lock.
                completion = store.complete(job!, reference, audio, now);
                await tx.execute(sql`select pg_sleep(0.05)`);
            });
            await completion;
            expect(await db.select().from(speechBindingsTable)).toHaveLength(0);
            expect(await db.select().from(speechQuotesTable)).toHaveLength(0);
            const [finished] = await db
                .select()
                .from(speechJobsTable)
                .where(eq(speechJobsTable.id, job!.id));
            expect(finished).toMatchObject({
                state: 'ready',
                payerId: null,
                reservationId: null,
                billingState: 'released_no_charge',
            });
            const after = await wallet(actors[0]!);
            expect(after.reservedCredits).toBe(0n);
            expect(after.consumedCredits).toBe(0n);
            expect(after.availableCredits).toBe(
                availableBeforePurge + BigInt(prepared.quote!.credits),
            );
            const retained = await db.select().from(speechRecordingsTable);
            expect(retained).toHaveLength(2);
            expect(
                retained.every((recording) => recording.state === 'ready'),
            ).toBe(true);
            expect(
                retained.find((recording) => recording.id === successful!.id)!
                    .text,
            ).toBe(originalText);
            expect((await storage.read(successful!.storage))!.bytes).toEqual(
                originalBytes!.bytes,
            );
            expect(
                retained.find((recording) => recording.id === job!.recordingId)!
                    .text,
            ).toBe(text);
            expect((await storage.read(reference))!.bytes).toEqual(audio.bytes);
        });
        it('admits one payer across concurrent confirmed quotes and bills once after publication', async () => {
            text =
                'This is a sentence with more than ten words that needs pronunciation generation.';
            const prepared = await Promise.all(
                actors.map((actor) => prepare(actor)),
            );
            expect(
                prepared.every(
                    (result) => result.state === 'confirmation_required',
                ),
            ).toBe(true);
            const results = await Promise.all(
                actors.map((actor, index) => confirm(actor, prepared[index]!)),
            );
            const [job] = await db.select().from(speechJobsTable);
            expect(await db.select().from(speechJobsTable)).toHaveLength(1);
            expect((await wallet(job!.payerId!)).reservedCredits).toBe(
                BigInt(prepared[0]!.quote!.credits),
            );
            const joiner = actors.find((actor) => actor !== job!.payerId)!;
            expect((await wallet(joiner)).reservedCredits).toBe(0n);
            const worker = new SpeechWorker({
                store,
                storage,
                providers: new Map([['fixture-v1', provider]]),
                now: () => now,
            });
            await worker.runOnce();
            expect((await wallet(job!.payerId!)).consumedCredits).toBe(
                job!.credits,
            );
            expect((await wallet(joiner)).consumedCredits).toBe(0n);
            await confirm(
                job!.payerId!,
                prepared[actors.indexOf(job!.payerId!)]!,
            );
            expect((await wallet(job!.payerId!)).consumedCredits).toBe(
                job!.credits,
            );
            expect(
                (
                    await store.request(
                        joiner,
                        results[actors.indexOf(joiner)]!.requestId!,
                        now,
                    )
                ).response.billingState,
            ).toBe('free');
        });
        it('releases paid credit holds on definitive failure and allows a separately confirmed retry', async () => {
            text =
                'This longer sentence has more than ten distinct words and requires paid pronunciation.';
            const prepared = await prepare(actors[0]!);
            await confirm(actors[0]!, prepared);
            const job = await store.claim(now);
            await store.fail(job!, 'failure', now);
            expect((await wallet(actors[0]!)).reservedCredits).toBe(0n);
            expect((await wallet(actors[0]!)).consumedCredits).toBe(0n);
            expect(
                (await db.select().from(speechJobsTable))[0]?.billingState,
            ).toBe('released_no_charge');
            const retry = await prepare(actors[0]!);
            expect(retry.state).toBe('confirmation_required');
            await confirm(actors[0]!, retry);
            expect(await db.select().from(speechJobsTable)).toHaveLength(2);
            expect((await wallet(actors[0]!)).reservedCredits).toBe(
                BigInt(retry.quote!.credits),
            );
        });
        it('uses a cache filled after quoting without charging the original quote requester', async () => {
            text =
                'This sentence is long enough to need payment when there is no cached audio.';
            const first = await prepare(actors[0]!),
                second = await prepare(actors[1]!);
            await confirm(actors[1]!, second);
            await new SpeechWorker({
                store,
                storage,
                providers: new Map([['fixture-v1', provider]]),
                now: () => now,
            }).runOnce();
            expect((await confirm(actors[0]!, first)).state).toBe('ready');
            expect((await wallet(actors[0]!)).reservedCredits).toBe(0n);
            expect((await wallet(actors[0]!)).consumedCredits).toBe(0n);
            expect(await db.select().from(speechJobsTable)).toHaveLength(1);
        });
        it('deduplicates simultaneous confirmations with the same operation and quote', async () => {
            text =
                'A long sentence is charged only once even if confirmation requests are duplicated.';
            const quote = await prepare(actors[0]!),
                operationId = randomUUID();
            const results = await Promise.all([
                confirm(actors[0]!, quote, operationId),
                confirm(actors[0]!, quote, operationId),
            ]);
            expect(results[0]?.requestId).toBe(results[1]?.requestId);
            expect(await db.select().from(speechJobsTable)).toHaveLength(1);
            expect((await wallet(actors[0]!)).reservedCredits).toBe(
                BigInt(quote.quote!.credits),
            );
        });
        it('serializes text and speech reservations against one wallet without overspending', async () => {
            text =
                'A long sentence is charged only once when competing with another AI request.';
            const prepared = await prepare(actors[0]!),
                dictionaryId = randomUUID(),
                jobId = randomUUID();
            await db.insert(dictionariesTable).values({
                id: dictionaryId,
                ownerId: actors[0]!,
                name: 'Disposable text and speech credit competition',
                sourceLanguageTag: 'en',
                targetLanguageTag: 'fr',
                createdAt: now,
                updatedAt: now,
            });
            await db.insert(dictionaryGenerationJobsTable).values({
                id: jobId,
                ownerId: actors[0]!,
                dictionaryId,
                aiCreditAccounted: true,
                aiCreditInputCreditsPerMillionTokens: 1_000_000,
                aiCreditOutputCreditsPerMillionTokens: 3_000_000,
                aiCreditMaxCreditsPerAttempt: 1000,
                aiCreditPricingRevision: 1,
                aiCreditPolicyMode: 'limited',
                attemptCount: 1,
                expectedDictionaryVersion: 1,
                expectedSettingsVersion: 1,
                format: 'card-authoring:v1',
                idempotencyKey: randomUUID(),
                kind: 'card-authoring',
                requestFingerprint: `hmac-sha256:v1:${'b'.repeat(43)}`,
                sourceLanguageTag: 'en',
                targetLanguageTag: 'fr',
                createdAt: now,
                updatedAt: now,
                nextAttemptAt: now,
            });
            const outcomes = await Promise.allSettled([
                confirm(actors[0]!, prepared),
                db.transaction((tx) =>
                    new DrizzleAiCreditTransactionParticipant(
                        tx,
                    ).reserveAttempt({
                        ownerId: actors[0]!,
                        reservationId: randomUUID(),
                        jobId,
                        jobKind: 'dictionary-generation',
                        attempt: 1,
                        maximumCredits: 1000n,
                        at: now,
                    }),
                ),
            ]);
            expect(
                outcomes.filter((outcome) => outcome.status === 'fulfilled'),
            ).toHaveLength(1);
            const summary = await wallet(actors[0]!);
            expect(summary.reservedCredits).toBeLessThanOrEqual(1000n);
            expect(summary.availableCredits).toBeGreaterThanOrEqual(0n);
        });
        it('invalidates a quote when voice settings change even if the tariff is unchanged', async () => {
            text =
                'This sentence has enough words to require confirmation before its pronunciation is generated.';
            const prepared = await prepare(actors[0]!);
            voice = 'changed-default-voice';
            await expect(confirm(actors[0]!, prepared)).rejects.toThrow(
                'speech_quote_stale',
            );
            expect(await db.select().from(speechJobsTable)).toHaveLength(0);
            expect((await wallet(actors[0]!)).reservedCredits).toBe(0n);
        });
        it('preserves approved cached recordings when configured voices change', async () => {
            await prepare(actors[0]!);
            await new SpeechWorker({
                store,
                storage,
                providers: new Map([['fixture-v1', provider]]),
                now: () => now,
            }).runOnce();
            voice = 'changed-default-voice';
            expect((await prepare(actors[1]!)).state).toBe('ready');
            expect(await db.select().from(speechJobsTable)).toHaveLength(1);
            expect(
                (await db.select().from(speechRecordingsTable))[0]?.profile
                    .voice,
            ).toBe('fixture');
        });
        it('reuses ready live pronunciation after the configured default model changes', async () => {
            providerKind = 'kie';
            configurationId = 'kie-turbo-bella-v1';
            voice = 'bella';
            await prepare(actors[0]!);
            await new SpeechWorker({
                store,
                storage,
                providers: new Map([[configurationId, provider]]),
                now: () => now,
            }).runOnce();

            configurationId = 'kie-gemini-zephyr-v1';
            voice = 'Zephyr';
            expect((await prepare(actors[1]!)).state).toBe('ready');
            expect(await db.select().from(speechJobsTable)).toHaveLength(1);
            expect(
                (await db.select().from(speechRecordingsTable))[0]?.profile,
            ).toMatchObject({
                configurationId: 'kie-turbo-bella-v1',
                provider: 'kie',
                voice: 'bella',
            });
        });
        it('uses the pinned profile configuration for work queued before a default switch', async () => {
            providerKind = 'kie';
            configurationId = 'kie-turbo-bella-v1';
            voice = 'bella';
            await prepare(actors[0]!);
            configurationId = 'kie-gemini-zephyr-v1';
            voice = 'Zephyr';
            const retainedProvider = {
                configurationId: 'kie-turbo-bella-v1',
                supports: provider.supports.bind(provider),
                submit: vi.fn(provider.submit.bind(provider)),
                poll: vi.fn(provider.poll.bind(provider)),
            };
            expect(
                await new SpeechWorker({
                    store,
                    storage,
                    providers: new Map([
                        ['kie-turbo-bella-v1', retainedProvider],
                    ]),
                    now: () => now,
                }).runOnce(),
            ).toBe(true);
            expect(retainedProvider.submit).toHaveBeenCalledWith(
                expect.objectContaining({
                    profile: expect.objectContaining({
                        configurationId: 'kie-turbo-bella-v1',
                        voice: 'bella',
                    }),
                }),
            );
            expect(
                (await db.select().from(speechRecordingsTable))[0]?.profile,
            ).toMatchObject({ configurationId: 'kie-turbo-bella-v1' });
        });
        const finishRecording = async () => {
            expect(
                await new SpeechWorker({
                    store,
                    storage,
                    // Deterministic audio only; the synthetic profile's provider class
                    // exercises cache policy without contacting any paid provider.
                    providers: new Map([['fixture-v1', provider]]),
                    now: () => now,
                }).runOnce(),
            ).toBe(true);
        };
        const seedRecording = async (ready: boolean) => {
            // Seed scoped rows directly at INSERT, preserving the
            // real immutable-recording and worker-transition guards.
            const id = randomUUID();
            const canonicalKey = speechTextIdentity(
                'synthetic-shared-speech-secret',
                'fr',
                text,
                providerKind === 'fixture' ? 'fixture' : 'pronunciation',
            );
            const audio = createFixtureAudio();
            const reference = await storage.put(`speech/scoped/${id}`, audio);
            await db.insert(speechRecordingsTable).values({
                id,
                canonicalKey,
                text,
                language: 'fr',
                normalizationRevision: 'nfc-horizontal-whitespace-v1',
                profile: {
                    ...provider.supports('fr'),
                    configurationId,
                    provider: providerKind,
                },
                state: ready ? 'ready' : 'pending',
                storage: reference,
                checksum: ready ? audio.checksum : null,
                byteLength: ready ? audio.bytes.length : null,
                durationMs: ready ? 1000 : null,
                readyAt: ready ? now : null,
                createdAt: now,
                lastAccessedAt: now,
            });
            if (!ready)
                await db.insert(speechJobsTable).values({
                    id: randomUUID(),
                    recordingId: id,
                    canonicalKey,
                    payerId: actors[0]!,
                    credits: 0n,
                    billingState: 'free',
                    state: 'queued',
                    nextPollAt: now,
                    createdAt: now,
                    billingDeadline: new Date(now.getTime() + 600_000),
                    recoveryDeadline: new Date(now.getTime() + 86_400_000),
                });
        };
        {
            for (const firstProvider of ['fixture', 'kie'] as const) {
                it(`isolates scoped ${firstProvider} cached audio from the other recording class`, async () => {
                    providerKind = firstProvider;
                    {
                        await prepare(actors[0]!);
                        await finishRecording();
                    }
                    providerKind =
                        firstProvider === 'fixture' ? 'kie' : 'fixture';
                    expect((await prepare(actors[1]!)).state).toBe('queued');
                    expect(
                        await db.select().from(speechJobsTable),
                    ).toHaveLength(2);
                    await finishRecording();
                    expect((await prepare(actors[1]!)).state).toBe('ready');
                    const recordings = await db
                        .select()
                        .from(speechRecordingsTable);
                    expect(
                        recordings.map((row) => row.profile.provider).sort(),
                    ).toEqual(['fixture', 'kie']);
                    expect(
                        new Set(recordings.map((row) => row.canonicalKey)).size,
                    ).toBe(2);
                    expect((await wallet(actors[1]!)).consumedCredits).toBe(0n);
                });
            }
            it(`does not join scoped pending fixture jobs when live pronunciation is requested`, async () => {
                await prepare(actors[0]!);
                providerKind = 'kie';
                const prepared = await prepare(actors[1]!);
                expect(prepared.state).toBe('queued');
                const jobs = await db.select().from(speechJobsTable);
                expect(jobs).toHaveLength(2);
                expect(new Set(jobs.map((row) => row.canonicalKey)).size).toBe(
                    2,
                );
                const bindings = await db.select().from(speechBindingsTable);
                expect(new Set(bindings.map((row) => row.jobId)).size).toBe(2);
                expect(
                    bindings.find((row) => row.actorId === actors[1]!)!.jobId,
                ).not.toBe(jobs.find((row) => row.payerId === actors[0]!)!.id);
            });
        }
        it('reuses scoped pronunciation audio even when the current model no longer supports its language', async () => {
            providerKind = 'kie';
            await seedRecording(true);
            supported = false;
            expect(
                await store.availability(actors[1]!, source, {
                    text,
                    language: 'fr',
                    revision: 'v1',
                }),
            ).toEqual({ playable: true, generationAvailable: false });
            expect((await prepare(actors[1]!)).state).toBe('ready');
            expect(await db.select().from(speechJobsTable)).toHaveLength(0);
        });
        it('does not advertise scoped fixture audio as pronunciation for unsupported languages', async () => {
            await seedRecording(true);
            providerKind = 'kie';
            supported = false;
            expect(
                await store.availability(actors[1]!, source, {
                    text,
                    language: 'fr',
                    revision: 'v1',
                }),
            ).toEqual({ playable: false, generationAvailable: false });
            expect((await prepare(actors[1]!)).state).toBe('unavailable');
            expect(await db.select().from(speechJobsTable)).toHaveLength(0);
        });
        it('publishes paid-length audio for an unlimited wallet without consuming grants', async () => {
            const before = await wallet(actors[0]!);
            await db.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).updatePolicy({
                    ownerId: actors[0]!,
                    at: now,
                    expectedManagementVersion: before.managementVersion,
                    mode: 'unlimited',
                    unlimitedUntil: null,
                    reason: 'Disposable unlimited speech test policy',
                }),
            );
            text =
                'This sentence has more than ten words but its owner has an unlimited credit policy.';
            const prepared = await prepare(actors[0]!);
            expect(prepared.quote?.unlimited).toBe(true);
            await confirm(actors[0]!, prepared);
            await new SpeechWorker({
                store,
                storage,
                providers: new Map([['fixture-v1', provider]]),
                now: () => now,
            }).runOnce();
            const after = await wallet(actors[0]!);
            expect(after.consumedCredits).toBe(0n);
            expect(after.reservedCredits).toBe(0n);
            expect(after.consumedCredits).toBe(0n);
            expect(after.availableCredits).toBe(before.availableCredits);
            expect(
                (await db.select().from(speechRecordingsTable))[0]?.state,
            ).toBe('ready');
        });
        it('persists only share digests for both free bindings and paid quotes', async () => {
            const shared: SpeechSource = {
                ...source,
                access: {
                    kind: 'shared',
                    shareId: 'AAAAAAAAAAAAAAAAAAAAAA',
                    shareKey: 'synthetic-private-share-key-never-store',
                },
            };
            const request = () =>
                store.prepare({
                    actorId: actors[1]!,
                    source: shared,
                    resolved: { text, language: 'fr', revision: 'v1' },
                    operationId: randomUUID(),
                    now,
                });
            await request();
            text =
                'A long sentence has more than ten words and requires a confirmed paid audio generation.';
            const paid = await request();
            await store.confirm({
                actorId: actors[1]!,
                quoteId: paid.quote!.id,
                operationId: randomUUID(),
                now,
            });
            const [bindingRows, quoteRows] = await Promise.all([
                db.select().from(speechBindingsTable),
                db.select().from(speechQuotesTable),
            ]);
            expect(
                JSON.stringify(
                    [...bindingRows, ...quoteRows],
                    (_key, value: unknown) =>
                        typeof value === 'bigint' ? value.toString() : value,
                ),
            ).not.toContain('synthetic-private-share-key-never-store');
            for (const row of [...bindingRows, ...quoteRows])
                expect(row.source.access).toMatchObject({
                    kind: 'shared',
                    keyDigest: expect.stringMatching(/^hmac-sha256:v1:/),
                });
            expect(bindingRows.map((row) => row.source.access)).not.toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ shareKey: expect.any(String) }),
                ]),
            );
        });
        it('retains consumed quote idempotency when an administrator removes its audio', async () => {
            text =
                'A paid pronunciation is charged only once even after an administrator removes its recording.';
            const prepared = await prepare(actors[0]!),
                operationId = randomUUID();
            await confirm(actors[0]!, prepared, operationId);
            await new SpeechWorker({
                store,
                storage,
                providers: new Map([['fixture-v1', provider]]),
                now: () => now,
            }).runOnce();
            const snapshot = (
                await store.listRecordings({ page: 1, pageSize: 25 })
            ).recordings[0]!;
            const selected = await store.markDeleting({
                recordings: [
                    {
                        id: snapshot.id,
                        expectedVersion: snapshot.version,
                        expectedBindingCount: snapshot.bindingCount,
                    },
                ],
                audit: {
                    actorId: actors[0]!,
                    correlationId: randomUUID(),
                    reason: 'Remove disposable charged pronunciation fixture',
                    occurredAt: now,
                },
            });
            await storage.delete(selected[0]!.storage);
            await store.deleted(snapshot.id, now);
            expect(
                (await confirm(actors[0]!, prepared, operationId)).state,
            ).toBe('failed');
            expect(await db.select().from(speechJobsTable)).toHaveLength(1);
            expect((await wallet(actors[0]!)).consumedCredits).toBe(
                BigInt(prepared.quote!.credits),
            );
            expect((await wallet(actors[0]!)).reservedCredits).toBe(0n);
            expect((await prepare(actors[0]!)).state).toBe(
                'confirmation_required',
            );
        });
        it('revalidates shared-source digests through the real resolver for status and private byte delivery', async () => {
            const dictionaries = new DrizzleDictionaryStore(db, {
                generate: randomUUID,
            });
            const cryptography = new HmacDictionaryCryptography({
                entropy: { randomBytes },
                secret: 'synthetic-dictionary-hmac-secret-at-least-32-bytes',
            });
            const context = { now, signal: new AbortController().signal };
            const dictionary = await dictionaries.createDictionary({
                ownerId: actors[0]!,
                context,
                idempotencyKey: randomUUID(),
                fingerprint: `hmac-sha256:v1:${'A'.repeat(43)}`,
                request: {
                    name: 'Disposable real shared speech',
                    description: null,
                    sourceLanguage: 'fr',
                    targetLanguage: 'en',
                },
            });
            const created = await dictionaries.createCard({
                ownerId: actors[0]!,
                dictionaryId: dictionary.id,
                context,
                request: {
                    expectedDictionaryVersion: dictionary.version,
                    expectedSettingsVersion: dictionary.settings.version,
                    translationContext: null,
                    values: {
                        source: 'bonjour',
                        translation: 'hello',
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
            const card = created.card;
            const share = cryptography.issueShare(1);
            await dictionaries.rotateShare({
                ownerId: actors[0]!,
                dictionaryId: dictionary.id,
                context,
                expectedDictionaryVersion: created.dictionaryVersion,
                digest: share.digest,
                keyVersion: 1,
                locator: share.locator,
            });
            const resolver = new DrizzleSpeechSourceResolver(db, cryptography);
            const realStore = new DrizzleSpeechStore({
                database: db,
                fingerprintSecret: 'synthetic-shared-speech-secret',
                profileResolver: provider,
                storageIdentity: storage.identity,
                generationEnabled: true,
                playbackEnabled: true,
                revalidateSource: (actor, reference, tx) =>
                    resolver.resolveInTransaction(actor, reference, tx),
            });
            const service = new SpeechService({
                store: realStore,
                resolver,
                storage,
                now: () => now,
            });
            const reference: SpeechSource = {
                kind: 'dictionary-field',
                access: {
                    kind: 'shared',
                    shareId: share.locator,
                    shareKey: share.key,
                },
                cardId: card.id,
                field: 'source',
            };
            const prepared = await service.prepare(actors[1]!, {
                source: reference,
                operationId: randomUUID(),
            });
            expect(
                (await service.status(actors[1]!, prepared.requestId!)).state,
            ).toBe('queued');
            await new SpeechWorker({
                store: realStore,
                storage,
                providers: new Map([['fixture-v1', provider]]),
                now: () => now,
            }).runOnce();
            const ready = await service.status(actors[1]!, prepared.requestId!);
            expect(ready.state).toBe('ready');
            expect(
                (await service.content(actors[1]!, ready.playbackId!)).audio
                    .bytes.length,
            ).toBeGreaterThan(0);
            expect(
                JSON.stringify(await db.select().from(speechBindingsTable)),
            ).not.toContain(share.key);
            await db
                .update(dictionariesTable)
                .set({
                    visibility: 'private',
                    shareLocator: null,
                    shareKeyDigest: null,
                    shareKeyVersion: null,
                    shareKeyRotatedAt: null,
                    version: sql`${dictionariesTable.version}+1`,
                })
                .where(eq(dictionariesTable.id, dictionary.id));
            await expect(
                service.status(actors[1]!, prepared.requestId!),
            ).rejects.toThrow();
            await expect(
                service.content(actors[1]!, ready.playbackId!),
            ).rejects.toThrow();
            const owned: SpeechSource = {
                kind: 'dictionary-field',
                access: { kind: 'owner', dictionaryId: dictionary.id },
                cardId: card.id,
                field: 'source',
            };
            expect(
                (
                    await service.prepare(actors[0]!, {
                        source: owned,
                        operationId: randomUUID(),
                    })
                ).state,
            ).toBe('ready');
            expect(await db.select().from(speechJobsTable)).toHaveLength(1);
        });
        it('scrubs definitive failure text while preserving a retryable private object inventory', async () => {
            text =
                'This private sentence should disappear from failed derived recordings rather than live forever.';
            const quote = await prepare(actors[0]!);
            await confirm(actors[0]!, quote);
            const job = await store.claim(now);
            await store.fail(job!, 'failure', now);
            const [failed] = await db.select().from(speechRecordingsTable);
            expect(failed?.text).toBe('');
            expect(failed?.state).toBe('deleting');
            expect((await wallet(actors[0]!)).reservedCredits).toBe(0n);
            expect(await store.deletionInventory(now)).toEqual([
                { id: failed!.id, storage: failed!.storage },
            ]);
            await new SpeechWorker({
                store,
                storage,
                providers: new Map([['fixture-v1', provider]]),
                now: () => now,
            }).runOnce();
            expect(
                (await db.select().from(speechRecordingsTable))[0]?.state,
            ).toBe('deleted');
        });
        it('scrubs admin-removed text before storage deletion has succeeded', async () => {
            text = 'private pronunciation';
            await prepare(actors[0]!);
            await new SpeechWorker({
                store,
                storage,
                providers: new Map([['fixture-v1', provider]]),
                now: () => now,
            }).runOnce();
            const snapshot = (
                await store.listRecordings({ page: 1, pageSize: 25 })
            ).recordings[0]!;
            const selected = await store.markDeleting({
                recordings: [
                    {
                        id: snapshot.id,
                        expectedVersion: snapshot.version,
                        expectedBindingCount: snapshot.bindingCount,
                    },
                ],
                audit: {
                    actorId: actors[0]!,
                    correlationId: randomUUID(),
                    reason: 'Remove disposable private pronunciation',
                    occurredAt: now,
                },
            });
            const [retained] = await db.select().from(speechRecordingsTable);
            expect(retained?.text).toBe('');
            expect(retained?.state).toBe('deleting');
            expect(await storage.read(selected[0]!.storage)).not.toBeNull();
            expect(await store.deletionInventory(now)).toEqual(selected);
            await expect(store.adminPlayback(snapshot.id)).rejects.toThrow(
                'speech_recording_unavailable',
            );
        });
        it('preserves provider budget expenditure after a known failed task text is scrubbed', async () => {
            text =
                'This sufficiently long sentence uses a provider budget even when the generated audio fails.';
            const pricedStore = new DrizzleSpeechStore({
                database: db,
                fingerprintSecret: 'synthetic-shared-speech-secret',
                profileResolver: {
                    supports: (language) => ({
                        ...provider.supports(language),
                        estimatedCostUnitsPerCharacter: 1,
                    }),
                },
                storageIdentity: storage.identity,
                generationEnabled: true,
                playbackEnabled: true,
                ownerBudgetUnits: [...text].length + 1,
                revalidateSource: async () => ({
                    text,
                    language: 'fr',
                    revision: 'v1',
                }),
            });
            const quote = await pricedStore.prepare({
                actorId: actors[0]!,
                source,
                resolved: { text, language: 'fr', revision: 'v1' },
                operationId: randomUUID(),
                now,
            });
            await pricedStore.confirm({
                actorId: actors[0]!,
                quoteId: quote.quote!.id,
                operationId: randomUUID(),
                now,
            });
            const first = await pricedStore.claim(now);
            await pricedStore.submitted(
                first!,
                'known-failed-provider-task',
                2500,
                now,
            );
            await db
                .update(speechJobsTable)
                .set({
                    nextPollAt: sql`clock_timestamp() - interval '1 millisecond'`,
                })
                .where(eq(speechJobsTable.id, first!.id));
            const later = new Date(now.getTime() + 2500),
                known = await pricedStore.claim(later);
            await pricedStore.fail(known!, 'failure', later);
            expect(
                (await db.select().from(speechRecordingsTable))[0]?.text,
            ).toBe('');
            const retry = await pricedStore.prepare({
                actorId: actors[0]!,
                source,
                resolved: { text, language: 'fr', revision: 'v1' },
                operationId: randomUUID(),
                now: later,
            });
            await expect(
                pricedStore.confirm({
                    actorId: actors[0]!,
                    quoteId: retry.quote!.id,
                    operationId: randomUUID(),
                    now: later,
                }),
            ).rejects.toThrow('speech_provider_budget');
            expect(await db.select().from(speechJobsTable)).toHaveLength(1);
        });
        it('deduplicates concurrent fingerprint rotations when both configurations retain the other key', async () => {
            const oldSecret =
                    'synthetic-old-fingerprint-secret-at-least-32-bytes',
                newSecret =
                    'synthetic-new-fingerprint-secret-at-least-32-bytes';
            const configured = (current: string, retained: string) =>
                new DrizzleSpeechStore({
                    database: db,
                    fingerprintSecret: current,
                    retainedFingerprintSecrets: [retained],
                    profileResolver: provider,
                    storageIdentity: storage.identity,
                    generationEnabled: true,
                    playbackEnabled: true,
                    revalidateSource: async (actor, _reference, tx) => {
                        await tx
                            .select()
                            .from(usersTable)
                            .where(eq(usersTable.id, actor))
                            .for('share');
                        return { text, language: 'fr', revision: 'v1' };
                    },
                });
            const older = configured(oldSecret, newSecret),
                newer = configured(newSecret, oldSecret);
            const request = (target: DrizzleSpeechStore, actor: string) =>
                target.prepare({
                    actorId: actor,
                    source,
                    resolved: { text, language: 'fr', revision: 'v1' },
                    operationId: randomUUID(),
                    now,
                });
            const requests = await Promise.all([
                request(older, actors[0]!),
                request(newer, actors[1]!),
            ]);
            expect(requests.every((result) => result.state === 'queued')).toBe(
                true,
            );
            expect(await db.select().from(speechJobsTable)).toHaveLength(1);
            expect(await db.select().from(speechRecordingsTable)).toHaveLength(
                1,
            );
            const submitted = vi.spyOn(provider, 'submit');
            await new SpeechWorker({
                store: older,
                storage,
                providers: new Map([['fixture-v1', provider]]),
                now: () => now,
            }).runOnce();
            expect(submitted).toHaveBeenCalledOnce();
            submitted.mockRestore();
            expect((await request(newer, actors[0]!)).state).toBe('ready');
            expect((await request(older, actors[1]!)).state).toBe('ready');
            expect(await db.select().from(speechJobsTable)).toHaveLength(1);
            expect(await db.select().from(speechRecordingsTable)).toHaveLength(
                1,
            );
        });
        it('serializes retained-key binding with audited deletion impact', async () => {
            await prepare(actors[0]!);
            await new SpeechWorker({
                store,
                storage,
                providers: new Map([['fixture-v1', provider]]),
            }).runOnce();
            const snapshot = (
                await store.listRecordings({ page: 1, pageSize: 25 })
            ).recordings[0]!;
            const rotated = new DrizzleSpeechStore({
                database: db,
                fingerprintSecret:
                    'synthetic-rotated-fingerprint-secret-at-least-32-bytes',
                retainedFingerprintSecrets: ['synthetic-shared-speech-secret'],
                profileResolver: provider,
                storageIdentity: storage.identity,
                generationEnabled: true,
                playbackEnabled: true,
                revalidateSource: async () => ({
                    text,
                    language: 'fr',
                    revision: 'v1',
                }),
            });
            let competing!: Promise<PromiseSettledResult<unknown>[]>;
            await db.transaction(async (tx) => {
                await tx
                    .select()
                    .from(speechRecordingsTable)
                    .where(eq(speechRecordingsTable.id, snapshot.id))
                    .for('update');
                competing = Promise.allSettled([
                    store.markDeleting({
                        audit: {
                            actorId: actors[0]!,
                            correlationId: randomUUID(),
                            reason: 'Concurrent deletion fixture',
                            occurredAt: now,
                        },
                        recordings: [
                            {
                                id: snapshot.id,
                                expectedVersion: snapshot.version,
                                expectedBindingCount: snapshot.bindingCount,
                            },
                        ],
                    }),
                    rotated.prepare({
                        actorId: actors[1]!,
                        source,
                        resolved: { text, language: 'fr', revision: 'v1' },
                        operationId: randomUUID(),
                        now,
                    }),
                ]);
                // Both independent canonical locks reach the held recording row.
                await tx.execute(sql`select pg_sleep(0.1)`);
            });
            const [deletion, binding] = await competing;
            const [recording] = await db
                .select()
                .from(speechRecordingsTable)
                .where(eq(speechRecordingsTable.id, snapshot.id));
            const links = await db
                .select()
                .from(speechBindingsTable)
                .where(eq(speechBindingsTable.recordingId, snapshot.id));
            if (deletion!.status === 'fulfilled') {
                expect(recording!.state).toBe('deleting');
                expect(links).toHaveLength(snapshot.bindingCount);
                expect(binding!.status).toBe('rejected');
            } else {
                expect(String(deletion!.reason)).toContain(
                    'speech_delete_impact_changed',
                );
                expect(binding!.status).toBe('fulfilled');
                expect(recording!.state).toBe('ready');
                expect(links).toHaveLength(snapshot.bindingCount + 1);
            }
        });
        it('rechecks authorization inside the transaction and rolls back admission', async () => {
            revoked = true;
            await expect(prepare(actors[0]!)).rejects.toThrow(
                'speech_source_unavailable',
            );
            expect(await db.select().from(speechJobsTable)).toHaveLength(0);
        });
        it('refunds at the exact billing deadline and publishes late audio without a charge', async () => {
            text =
                'A sufficiently long sentence has more than ten words to require a paid generation.';
            const prepared = await prepare(actors[0]!);
            await confirm(actors[0]!, prepared);
            const job = await store.claim(now);
            expect(job).not.toBeNull();
            const audio = createFixtureAudio();
            await store.storing(job!, audio, now);
            const ref = await storage.putForReference(job!.storage, audio);
            await db
                .update(speechJobsTable)
                .set({
                    billingDeadline: sql`clock_timestamp() - interval '1 millisecond'`,
                })
                .where(eq(speechJobsTable.id, job!.id));
            // A backdated worker-supplied clock must never revive billing permission.
            await store.complete(
                job!,
                ref,
                audio,
                new Date('1900-01-01T00:00:00Z'),
            );
            const summary = await wallet(actors[0]!);
            expect(summary.consumedCredits).toBe(0n);
            expect(summary.reservedCredits).toBe(0n);
            expect(
                (await db.select().from(speechJobsTable))[0]?.billingState,
            ).toBe('released_no_charge');
            expect(
                (await db.select().from(speechRecordingsTable))[0]?.state,
            ).toBe('ready');
        });
        it('retains unknown-submission tombstones after refund and joins without another task', async () => {
            text =
                'Another sufficiently long sentence has more than ten words to require paid audio.';
            const prepared = await prepare(actors[0]!);
            await confirm(actors[0]!, prepared);
            const job = await store.claim(now);
            await store.fail(job!, 'unknown', now);
            await db
                .update(speechJobsTable)
                .set({
                    billingDeadline: sql`clock_timestamp() - interval '1 millisecond'`,
                })
                .where(eq(speechJobsTable.id, job!.id));
            await store.releaseDeadlines(new Date('1900-01-01T00:00:00Z'));
            expect((await wallet(actors[0]!)).reservedCredits).toBe(0n);
            expect((await prepare(actors[1]!)).state).toBe(
                'submission_unknown',
            );
            expect(await db.select().from(speechJobsTable)).toHaveLength(1);
            expect(
                await store.claim(new Date(now.getTime() + 86_400_001)),
            ).toBeNull();
            await db
                .update(speechJobsTable)
                .set({
                    recoveryDeadline: sql`clock_timestamp() - interval '1 millisecond'`,
                })
                .where(eq(speechJobsTable.id, job!.id));
            await store.releaseDeadlines(new Date('1900-01-01'));
            expect(
                (await db.select().from(speechRecordingsTable))[0]?.text,
            ).toBe('');
            expect((await prepare(actors[1]!)).state).toBe(
                'submission_unknown',
            );
        });
        it('fences stale completions and rejects stale admin deletion impact', async () => {
            await prepare(actors[0]!);
            const job = await store.claim(now);
            const audio = createFixtureAudio();
            await store.storing(job!, audio, now);
            const reference = await storage.putForReference(
                job!.storage,
                audio,
            );
            await store.complete(
                { ...job!, leaseToken: randomUUID() },
                reference,
                audio,
                now,
            );
            expect(
                (await db.select().from(speechRecordingsTable))[0]?.state,
            ).toBe('pending');
            await store.complete(job!, reference, audio, now);
            const snapshot = (
                await store.listRecordings({ page: 1, pageSize: 25 })
            ).recordings[0]!;
            await prepare(actors[1]!);
            const audit = {
                actorId: actors[0]!,
                correlationId: randomUUID(),
                reason: 'Remove disposable pronunciation fixture',
                occurredAt: now,
            };
            await expect(
                store.markDeleting({
                    recordings: [
                        {
                            id: snapshot.id,
                            expectedVersion: snapshot.version,
                            expectedBindingCount: snapshot.bindingCount,
                        },
                    ],
                    audit,
                }),
            ).rejects.toThrow('speech_delete_impact_changed');
            const latest = (
                await store.listRecordings({ page: 1, pageSize: 25 })
            ).recordings[0]!;
            expect(latest.state).toBe('ready');
            expect(latest.bindingCount).toBe(2);
            const selected = await store.markDeleting({
                recordings: [
                    {
                        id: latest.id,
                        expectedVersion: latest.version,
                        expectedBindingCount: latest.bindingCount,
                    },
                ],
                audit,
            });
            expect(
                (await store.listRecordings({ page: 1, pageSize: 25 }))
                    .recordings[0]?.state,
            ).toBe('deleting');
            await storage.delete(selected[0]!.storage);
            await store.deleted(latest.id, now);
            expect(
                (await store.listRecordings({ page: 1, pageSize: 25 })).total,
            ).toBe(0);
            expect(
                (await db.select().from(speechRecordingsTable))[0]?.text,
            ).toBe('');
        });
    },
);
