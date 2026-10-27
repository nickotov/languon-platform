import { randomUUID } from 'node:crypto';

import type { SpeechSource } from '@languon/contracts';
import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { eq, sql } from 'drizzle-orm';
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';

import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { DrizzleAiCreditTransactionParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { DrizzleProviderPriceStore } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-provider-prices';
import { aiAccountingSettingsRevisionsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
import { aiProviderExpenseRecordsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-schema';
import { modelPriceRevisionsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/model-price-schema';
import { aiOperatorActionBudgetsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/operator-budget-schema';
import { dictionaryCardsTable } from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import { DrizzleDictionaryStore } from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-store';
import { audioChecksum } from '../../../../src/modules/speech/domain/audio-integrity';
import { createSpeechInfrastructure } from '../../../../src/modules/speech/infrastructure/composition';
import { createDictionaryAudioAdapters } from '../../../../src/modules/speech/infrastructure/audio/dictionary-audio-adapters';
import { loadDictionaryAudioEnvironment } from '../../../../src/modules/speech/infrastructure/audio/dictionary-audio-environment';
import {
    speechJobsTable,
    speechRecordingsTable,
} from '../../../../src/modules/speech/infrastructure/schema';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

const model = 'elevenlabs/eleven-v4-turbo';
const configurationId = 'openrouter-speech-execution-v1';
const paidText =
    'Bonjour à tous les amis qui souhaitent apprendre une nouvelle langue avec une belle prononciation.';

/** Only external HTTP is synthetic; admission, source authority, worker and settlement are real. */
describe.runIf(isDatabaseIntegrationEnabled())(
    'OpenRouter speech production execution',
    () => {
        let client: PostgresClient;
        let db: PostgresJsDatabase<typeof databaseSchema>;
        let actorId: string;
        let strangerId: string;
        let dictionaryId: string;
        let cardId: string;
        let adapters: ReturnType<typeof createDictionaryAudioAdapters>;
        let speech: ReturnType<typeof createSpeechInfrastructure>;
        let source: SpeechSource;
        const http = vi.fn<typeof fetch>();
        const mp3 = Buffer.alloc(417);
        mp3.set([255, 251, 144, 0]);

        const wallet = () =>
            db.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).accountSummary(
                    actorId,
                    new Date(),
                ),
            );
        const prepare = () =>
            speech.service.prepare(actorId, {
                source,
                operationId: randomUUID(),
            });
        const job = async () => (await db.select().from(speechJobsTable))[0]!;
        const setPaidText = async () => {
            await db
                .update(dictionaryCardsTable)
                .set({
                    source: paidText,
                    normalizedSource: paidText.toLowerCase(),
                })
                .where(eq(dictionaryCardsTable.id, cardId));
            // An explicit synthetic tariff proves exact customer settlement independently of USD pricing.
            await db.insert(modelPriceRevisionsTable).values({
                id: randomUUID(),
                providerId: 'openrouter',
                modelId: model,
                meter: 'speech-characters',
                version: 1,
                rates: {
                    creditsPer1000Characters: 1,
                    minimumCredits: 0,
                    inputCreditsPerMillionTokens: null,
                    outputCreditsPerMillionTokens: null,
                    cachedInputCreditsPerMillionTokens: null,
                    provisional: false,
                },
                createdAt: new Date(),
                reason: 'Synthetic disposable customer speech tariff',
            });
            await db.transaction((tx) =>
                new DrizzleAiCreditTransactionParticipant(tx).issueGrant({
                    ownerId: actorId,
                    amount: 1000000n,
                    createdAt: new Date(),
                    expiresAt: null,
                    source: 'migration',
                    sourceReference: randomUUID(),
                }),
            );
            const prepared = await prepare();
            expect(prepared.state).toBe('confirmation_required');
            const expectedCredits = BigInt([...paidText].length);
            const confirmed = await speech.service.confirm(actorId, {
                quoteId: prepared.quote!.id,
                operationId: randomUUID(),
            });
            expect(confirmed.billingState).toBe('reserved');
            expect((await job()).credits).toBe(expectedCredits);
            expect(await wallet()).toMatchObject({
                reservedCredits: expectedCredits,
                consumedCredits: 0n,
            });
            return { confirmed, expectedCredits };
        };
        const expectExpense = async (
            amountUsdMicros: bigint | null,
            measurement: 'estimated' | 'measured' | 'unknown',
        ) => {
            const admitted = await job();
            const facts = await db.select().from(aiProviderExpenseRecordsTable);
            expect(facts).toHaveLength(1);
            expect(facts[0]).toMatchObject({
                actionId: admitted.id,
                providerId: 'openrouter',
                modelId: model,
                amountUsdMicros,
                measurement,
                costSource:
                    measurement === 'unknown' ? 'unknown' : 'calculated',
                attemptReference: `speech:${admitted.id}`,
            });
            expect(
                (await db.select().from(aiOperatorActionBudgetsTable))[0],
            ).toMatchObject({ state: 'settled' });
        };
        const expectPrivatePlayback = async (requestId: string) => {
            const ready = await speech.service.status(actorId, requestId);
            expect(ready).toMatchObject({ state: 'ready', fixture: false });
            expect(ready.playbackId).toBeTruthy();
            const result = await speech.service.content(
                actorId,
                ready.playbackId!,
            );
            expect(result.fixture).toBe(false);
            expect(Buffer.from(result.audio.bytes)).toEqual(mp3);
            expect(result.audio.mimeType).toBe('audio/mpeg');
            await expect(
                speech.service.content(strangerId, ready.playbackId!),
            ).rejects.toThrow();
            // Playback also rechecks the saved source, even after successful publication.
            await db
                .update(dictionaryCardsTable)
                .set({ lifecycle: 'archived', archivedAt: new Date() })
                .where(eq(dictionaryCardsTable.id, cardId));
            await expect(
                speech.service.content(actorId, ready.playbackId!),
            ).rejects.toThrow('speech_source_unavailable');
            await db
                .update(dictionaryCardsTable)
                .set({ lifecycle: 'active', archivedAt: null })
                .where(eq(dictionaryCardsTable.id, cardId));
            return ready;
        };

        beforeAll(() => {
            client = createTestPostgresClient();
        });
        beforeEach(async () => {
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            db = createDrizzleDatabase(client, databaseSchema);
            actorId = randomUUID();
            strangerId = randomUUID();
            dictionaryId = randomUUID();
            cardId = randomUUID();
            const now = new Date();
            await db.insert(usersTable).values(
                [actorId, strangerId].map((id) => ({
                    id,
                    status: 'active' as const,
                    createdAt: now,
                    updatedAt: now,
                })),
            );
            const dictionaryStore = new DrizzleDictionaryStore(db, {
                generate: randomUUID,
            });
            const context = { now, signal: new AbortController().signal };
            const dictionary = await dictionaryStore.createDictionary({
                context,
                ownerId: actorId,
                fingerprint: `hmac-sha256:v1:${'A'.repeat(43)}`,
                idempotencyKey: randomUUID(),
                request: {
                    name: 'Disposable French pronunciation',
                    description: null,
                    sourceLanguage: 'fr',
                    targetLanguage: 'en',
                },
            });
            dictionaryId = dictionary.id;
            const card = await dictionaryStore.createCard({
                context,
                dictionaryId,
                ownerId: actorId,
                request: {
                    expectedDictionaryVersion: dictionary.version,
                    expectedSettingsVersion: dictionary.settings.version,
                    translationContext: null,
                    overrides: {
                        definitionEnabled: null,
                        definitionLanguage: null,
                        exampleEnabled: null,
                        exampleLanguage: null,
                        exampleTranslationEnabled: null,
                        transcriptionCustomLabel: null,
                        transcriptionEnabled: null,
                        transcriptionNotation: null,
                    },
                    values: {
                        source: 'bonjour',
                        translation: 'hello',
                        definition: null,
                        example: null,
                        exampleTranslation: null,
                        transcription: null,
                    },
                },
            });
            cardId = card.card.id;
            source = {
                kind: 'dictionary-field',
                access: { kind: 'owner', dictionaryId },
                cardId,
                field: 'source',
            };
            await db.insert(aiAccountingSettingsRevisionsTable).values({
                id: randomUUID(),
                version: 1,
                defaultMaxCreditsPerAction: '10',
                maxProviderCostUsdPerAction: '1',
                maxProviderCostUsdPerAccountDay: '10',
                maxProviderCostUsdPerDay: '100',
                createdAt: now,
                reason: 'Synthetic disposable OpenRouter speech limits',
            });
            await new DrizzleProviderPriceStore(db).publish(
                {
                    expectedVersion: 0,
                    providerId: 'openrouter',
                    modelId: model,
                    meter: 'speech-characters',
                    inputUsdPerMillionTokens: null,
                    outputUsdPerMillionTokens: null,
                    cacheReadUsdPerMillionTokens: null,
                    cacheWriteUsdPerMillionTokens: null,
                    usdPer1000Characters: '0.04',
                    effectiveAt: '2020-01-01T00:00:00.000Z',
                    sourceReference: 'Synthetic OpenRouter speech fixture',
                    sourceUrl: null,
                    reason: 'Synthetic disposable operator speech price',
                },
                actorId,
                now,
            );
            http.mockReset();
            http.mockImplementation(
                async () =>
                    new Response(mp3, {
                        status: 200,
                        headers: { 'content-type': 'audio/mpeg' },
                    }),
            );
            vi.stubGlobal('fetch', http);
            const environment = loadDictionaryAudioEnvironment(
                {
                    SPEECH_GENERATION_ENABLED: 'true',
                    SPEECH_PLAYBACK_ENABLED: 'true',
                    DICTIONARY_AUDIO_PROVIDER: 'openrouter',
                    DICTIONARY_AUDIO_STORAGE: 'postgres',
                    DICTIONARY_AUDIO_CONFIGURATION_ID: configurationId,
                    OPENROUTER_API_KEY: 'synthetic-openrouter-speech-key',
                    DICTIONARY_AUDIO_OWNER_BUDGET_UNITS: '100000',
                    DICTIONARY_AUDIO_GLOBAL_BUDGET_UNITS: '1000000',
                    DICTIONARY_AUDIO_FINGERPRINT_SECRET:
                        'synthetic-openrouter-speech-fingerprint-secret',
                    DICTIONARY_AUDIO_VOICE_MAP: JSON.stringify({
                        fr: {
                            model,
                            voice: 'george',
                            settingsVersion: 'eleven-v4-turbo-pronunciation-1',
                            estimatedCostUnitsPerCharacter: 1,
                        },
                    }),
                },
                { deployed: false, role: 'worker' },
            );
            adapters = createDictionaryAudioAdapters({
                database: db,
                environment,
                role: 'worker',
            });
            speech = createSpeechInfrastructure({
                database: db,
                dictionaryHmacSecret:
                    'synthetic-openrouter-dictionary-hmac-secret',
                environment,
                storage: adapters.storage,
                provider: adapters.provider,
                providers: adapters.providers,
                playbackEnabled: true,
                generationEnabled: true,
                burstLimiter: { consume: async () => ({ allowed: true }) },
            });
        }, 120000);
        afterEach(() => {
            adapters?.close();
            vi.unstubAllGlobals();
        });
        afterAll(async () => {
            await client?.end();
        });

        it('completes Free operator-funded French speech through production composition without a customer tariff', async () => {
            const admitted = await prepare();
            expect(admitted).toMatchObject({
                state: 'queued',
                billingState: 'free',
                fixture: false,
            });
            expect(
                await db.select().from(modelPriceRevisionsTable),
            ).toHaveLength(0);
            expect(
                (await db.select().from(speechRecordingsTable))[0]!.profile,
            ).toMatchObject({
                provider: 'openrouter',
                model,
                voice: 'george',
                configurationId,
            });
            expect((await job()).credits).toBe(0n);
            expect(await speech.worker.runOnce()).toBe(true);
            await expectPrivatePlayback(admitted.requestId!);
            expect(
                (await db.select().from(speechRecordingsTable))[0],
            ).toMatchObject({
                state: 'ready',
                profile: { provider: 'openrouter', model },
            });
            expect(await wallet()).toMatchObject({
                consumedCredits: 0n,
                reservedCredits: 0n,
            });
            await expectExpense(280n, 'estimated');
            expect(http).toHaveBeenCalledTimes(1);
            const [url, request] = http.mock.calls[0]!;
            expect(String(url)).toBe(
                'https://openrouter.ai/api/v1/audio/speech',
            );
            expect(JSON.parse(String(request?.body))).toMatchObject({
                model,
                input: 'bonjour',
                voice: 'george',
            });
            expect((await prepare()).state).toBe('ready');
            expect(await speech.worker.runOnce()).toBe(false);
            expect(http).toHaveBeenCalledTimes(1);
            expect(await db.select().from(speechJobsTable)).toHaveLength(1);
            expect(
                await db.select().from(modelPriceRevisionsTable),
            ).toHaveLength(0);
        });

        it('completes Paid customer-funded French speech and settles the exact held tariff once', async () => {
            const { confirmed, expectedCredits } = await setPaidText();
            expect(await speech.worker.runOnce()).toBe(true);
            expect((await job()).billingState).toBe('charged_success');
            await expectPrivatePlayback(confirmed.requestId!);
            expect(await wallet()).toMatchObject({
                reservedCredits: 0n,
                consumedCredits: expectedCredits,
            });
            await expectExpense(
                BigInt([...paidText].length) * 40n,
                'estimated',
            );
            expect((await prepare()).state).toBe('ready');
            expect(await speech.worker.runOnce()).toBe(false);
            expect(http).toHaveBeenCalledTimes(1);
            expect(await wallet()).toMatchObject({
                reservedCredits: 0n,
                consumedCredits: expectedCredits,
            });
        });

        it('persists ambiguous transport failure with unknown provider expense and releases the Paid learner hold', async () => {
            http.mockRejectedValue(
                new TypeError('Synthetic connection lost after dispatch'),
            );
            const { confirmed, expectedCredits } = await setPaidText();
            expect(await speech.worker.runOnce()).toBe(true);
            expect(
                await speech.service.status(actorId, confirmed.requestId!),
            ).toMatchObject({
                state: 'submission_unknown',
                billingState: 'reserved',
                playbackId: null,
            });
            expect(await wallet()).toMatchObject({
                consumedCredits: 0n,
                reservedCredits: expectedCredits,
            });
            await expectExpense(null, 'unknown');
            // Ambiguous submission keeps its hold until the established billing deadline.
            await db
                .update(speechJobsTable)
                .set({
                    billingDeadline: sql`clock_timestamp()-interval '1 second'`,
                })
                .where(eq(speechJobsTable.id, (await job()).id));
            await speech.store.releaseDeadlines(new Date());
            expect(
                await speech.service.status(actorId, confirmed.requestId!),
            ).toMatchObject({
                state: 'submission_unknown',
                billingState: 'released_no_charge',
                playbackId: null,
            });
            expect(await wallet()).toMatchObject({
                consumedCredits: 0n,
                reservedCredits: 0n,
            });
            await expectExpense(null, 'unknown');
            expect(
                (await db.select().from(speechRecordingsTable))[0]?.state,
            ).not.toBe('ready');
            expect(await speech.worker.runOnce()).toBe(false);
            expect(http).toHaveBeenCalledTimes(1);
        });

        it('renews the fenced storage lease after slow OpenRouter synthesis and publishes once across the original expiry', async () => {
            const { confirmed } = await setPaidText();
            const storageLock = await client.reserve();
            let originalExpiry: Date | undefined;
            let originalToken: string | null = null;
            let execution: Promise<boolean> | undefined;
            await storageLock`select pg_advisory_lock(550055)`;
            await client.unsafe(
                `create function speech_test_block_storage() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock(550055); return NEW; end $$`,
            );
            await client.unsafe(
                `create trigger speech_test_block_storage before insert on dictionary_audio_blobs for each row execute function speech_test_block_storage()`,
            );
            http.mockImplementation(async () => {
                const [nearExpiry] = await db.transaction(async (tx) => {
                    await tx.execute(
                        sql`select set_config('languon.speech_worker_version','1',true)`,
                    );
                    return tx
                        .update(speechJobsTable)
                        .set({
                            leaseExpiresAt: sql`clock_timestamp()+interval '2 seconds'`,
                        })
                        .where(eq(speechJobsTable.id, (await job()).id))
                        .returning();
                });
                originalExpiry = nearExpiry!.leaseExpiresAt!;
                originalToken = nearExpiry!.leaseToken;
                return new Response(mp3, {
                    status: 200,
                    headers: { 'content-type': 'audio/mpeg' },
                });
            });
            try {
                execution = speech.worker.runOnce();
                await vi.waitFor(
                    async () => expect((await job()).state).toBe('storing'),
                    { timeout: 10000, interval: 20 },
                );
                const storing = await job();
                expect(storing.leaseToken).toBe(originalToken);
                expect(storing.leaseExpiresAt!.getTime()).toBeGreaterThan(
                    originalExpiry!.getTime() + 50000,
                );
                // The real object-storage insert is blocked while the original synthesis lease expires.
                await db.execute(
                    sql`select pg_sleep(greatest(0,extract(epoch from (${originalExpiry!.toISOString()}::timestamptz-clock_timestamp())))+0.05)`,
                );
                expect(await speech.store.claim(new Date())).toBeNull();
                expect((await job()).state).toBe('storing');
                expect(
                    (await db.select().from(speechRecordingsTable))[0]!.state,
                ).toBe('pending');
            } finally {
                await storageLock`select pg_advisory_unlock(550055)`;
                storageLock.release();
                if (execution) await execution;
                await client.unsafe(
                    'drop trigger speech_test_block_storage on dictionary_audio_blobs',
                );
                await client.unsafe(
                    'drop function speech_test_block_storage()',
                );
            }
            await expectPrivatePlayback(confirmed.requestId!);
            expect((await job()).billingState).toBe('charged_success');
            expect(await speech.worker.runOnce()).toBe(false);
            expect(http).toHaveBeenCalledTimes(1);
            await expectExpense(
                BigInt([...paidText].length) * 40n,
                'estimated',
            );
        }, 30000);

        it.each(['expired', 'replaced'] as const)(
            'rejects a %s storage owner before renewing or publishing',
            async (ownership) => {
                await prepare();
                const claimed = await speech.store.claim(new Date());
                expect(claimed).not.toBeNull();
                const audio = {
                    bytes: mp3,
                    mimeType: 'audio/mpeg' as const,
                    checksum: audioChecksum(mp3),
                };
                await db.transaction(async (tx) => {
                    await tx.execute(
                        sql`select set_config('languon.speech_worker_version','1',true)`,
                    );
                    await tx
                        .update(speechJobsTable)
                        .set(
                            ownership === 'expired'
                                ? {
                                      leaseExpiresAt: sql`clock_timestamp()-interval '1 second'`,
                                  }
                                : { leaseToken: randomUUID() },
                        )
                        .where(eq(speechJobsTable.id, claimed!.id));
                });
                const fenced = await job();
                expect(
                    await speech.store.storing(claimed!, audio, new Date()),
                ).toBe(false);
                const reference = await adapters.storage.putForReference(
                    claimed!.storage,
                    audio,
                );
                await speech.store.complete(
                    claimed!,
                    reference,
                    audio,
                    new Date(),
                );
                expect(await job()).toMatchObject({
                    state: 'submitting',
                    leaseToken: fenced.leaseToken,
                    leaseExpiresAt: fenced.leaseExpiresAt,
                });
                expect(
                    (await db.select().from(speechRecordingsTable))[0],
                ).toMatchObject({ state: 'pending', checksum: null });
                expect(
                    await db.select().from(aiProviderExpenseRecordsTable),
                ).toHaveLength(0);
                expect(await wallet()).toMatchObject({
                    consumedCredits: 0n,
                    reservedCredits: 0n,
                });
            },
        );

        it('persists Free operator-funded speech failure without a customer hold or charge', async () => {
            http.mockRejectedValue(
                new TypeError('Synthetic Free connection lost after dispatch'),
            );
            const admitted = await prepare();
            expect(admitted).toMatchObject({
                state: 'queued',
                billingState: 'free',
                fixture: false,
            });
            expect(
                await db.select().from(modelPriceRevisionsTable),
            ).toHaveLength(0);
            expect(await speech.worker.runOnce()).toBe(true);
            expect(
                await speech.service.status(actorId, admitted.requestId!),
            ).toMatchObject({
                state: 'submission_unknown',
                billingState: 'free',
                playbackId: null,
                error: 'speech_submission_unknown',
            });
            expect(await job()).toMatchObject({
                state: 'submission_unknown',
                credits: 0n,
                reservationId: null,
                rateRevisionId: null,
            });
            expect(await wallet()).toMatchObject({
                consumedCredits: 0n,
                reservedCredits: 0n,
            });
            await expectExpense(null, 'unknown');
            expect(
                (await db.select().from(speechRecordingsTable))[0]?.state,
            ).not.toBe('ready');
            expect(await speech.worker.runOnce()).toBe(false);
            expect(http).toHaveBeenCalledTimes(1);
            expect(
                await db.select().from(modelPriceRevisionsTable),
            ).toHaveLength(0);
        });

        it('persists definitive HTTP rejection without charging the Paid learner or inventing provider spend', async () => {
            http.mockImplementation(
                async () =>
                    new Response('{}', {
                        status: 400,
                        headers: { 'content-type': 'application/json' },
                    }),
            );
            const { confirmed } = await setPaidText();
            expect(await speech.worker.runOnce()).toBe(true);
            expect(
                await speech.service.status(actorId, confirmed.requestId!),
            ).toMatchObject({
                state: 'failed',
                billingState: 'released_no_charge',
                playbackId: null,
            });
            expect(await wallet()).toMatchObject({
                consumedCredits: 0n,
                reservedCredits: 0n,
            });
            await expectExpense(0n, 'measured');
            expect(http).toHaveBeenCalledTimes(1);
        });
    },
);
