import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
    createDrizzleDatabase,
    createPostgresClient,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import { eq } from 'drizzle-orm';
import type {
    ProviderNativePricingRules,
    SpeechSource,
} from '@languon/contracts';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import {
    createTestPostgresClient,
    getTestDatabaseUrl,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { DrizzleDictionaryStore } from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-store';
import { aiAccountingSettingsRevisionsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/capability-policy-schema';
import { aiProviderExpenseRecordsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-schema';
import {
    aiOperatorActionBudgetsTable,
    aiOperatorAttemptCostsTable,
} from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/operator-budget-schema';
import { modelPriceRevisionsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/model-price-schema';
import { DrizzleProviderPriceStore } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-provider-prices';
import { DrizzleAiCreditTransactionParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import {
    KIE_GEMINI_MODEL,
    GEMINI_PRONUNCIATION_SETTINGS_VERSION,
    findSpeechModel,
} from '../../../../src/modules/speech/domain/speech-models';
import { createFixtureAudio } from '../../../../src/modules/speech/domain/audio-integrity';
import { createSpeechInfrastructure } from '../../../../src/modules/speech/infrastructure/composition';
import { PostgresAudioObjectStorage } from '../../../../src/modules/speech/infrastructure/audio/audio-object-storages';
import { KieSpeechProvider } from '../../../../src/modules/speech/infrastructure/audio/speech-providers';
import { loadDictionaryAudioEnvironment } from '../../../../src/modules/speech/infrastructure/audio/dictionary-audio-environment';
import { speechJobsTable as jobs } from '../../../../src/modules/speech/infrastructure/schema';

/** Real admission, source, worker, PostgreSQL storage and settlement; only provider HTTP/download is synthetic. */
describe.runIf(isDatabaseIntegrationEnabled())(
    'native speech provider accounting',
    () => {
        let client: PostgresClient;
        let db: PostgresJsDatabase<typeof databaseSchema>;
        let tariffSeeded = false;
        beforeAll(async () => {
            client = createTestPostgresClient();
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            db = createDrizzleDatabase(client, databaseSchema);
            const owner = randomUUID();
            await db.insert(usersTable).values({ id: owner, status: 'active' });
            await db.insert(aiAccountingSettingsRevisionsTable).values({
                id: randomUUID(),
                version: 1,
                defaultMaxCreditsPerAction: '10',
                maxProviderCostUsdPerAction: '1',
                maxProviderCostUsdPerAccountDay: '10',
                maxProviderCostUsdPerDay: '100',
                createdAt: new Date(),
                reason: 'Synthetic native speech operator limits',
            });
            const nativeRules: ProviderNativePricingRules = {
                version: 1,
                validFrom: '2020-01-01T00:00:00Z',
                validUntil: null,
                reportedCreditUsdPerCredit: '0.005',
                variants: [
                    {
                        id: 'native-kie-gemini',
                        applies: {},
                        components: [
                            {
                                meter: 'inputTokens',
                                pricePerUnit: '0.35',
                                unitQuantity: 1_000_000,
                                chargeWhen: 'positive-usage',
                            },
                            {
                                meter: 'audioOutputTokens',
                                pricePerUnit: '4.2',
                                unitQuantity: 1_000_000,
                                chargeWhen: 'positive-usage',
                            },
                        ],
                    },
                ],
            };
            await new DrizzleProviderPriceStore(db).publish(
                {
                    providerId: 'kie',
                    modelId: KIE_GEMINI_MODEL,
                    meter: 'speech-tokens',
                    expectedVersion: 0,
                    inputUsdPerMillionTokens: null,
                    outputUsdPerMillionTokens: null,
                    cacheReadUsdPerMillionTokens: null,
                    cacheWriteUsdPerMillionTokens: null,
                    usdPer1000Characters: null,
                    minimumUsdPerRequest: null,
                    nativeRules,
                    effectiveAt: '2020-01-01T00:00:00Z',
                    sourceReference: 'synthetic-native-kie-price',
                    sourceUrl: null,
                    reason: 'Synthetic native token pricing and provider credit conversion',
                },
                owner,
                new Date(),
            );
        }, 120_000);
        afterAll(async () => {
            await client?.end();
        });

        async function fixture(
            input: {
                paid?: boolean;
                credits?: number | null;
                failed?: boolean;
                verifiedBound?: boolean;
            } = {},
        ) {
            const actorId = randomUUID();
            await db
                .insert(usersTable)
                .values({ id: actorId, status: 'active' });
            const text = input.paid
                ? `Bonjour aux amis qui souhaitent apprendre une nouvelle langue avec une belle prononciation et une pratique quotidienne. ${actorId}`
                : `bonjour ${actorId}`;
            const dictionaries = new DrizzleDictionaryStore(db, {
                generate: randomUUID,
            });
            const context = {
                now: new Date(),
                signal: new AbortController().signal,
            };
            const dictionary = await dictionaries.createDictionary({
                context,
                ownerId: actorId,
                fingerprint: `hmac-sha256:v1:${'A'.repeat(43)}`,
                idempotencyKey: randomUUID(),
                request: {
                    name: 'Synthetic native speech',
                    description: null,
                    sourceLanguage: 'fr',
                    targetLanguage: 'en',
                },
            });
            const card = await dictionaries.createCard({
                context,
                ownerId: actorId,
                dictionaryId: dictionary.id,
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
                        source: text,
                        translation: 'hello',
                        definition: null,
                        example: null,
                        exampleTranslation: null,
                        transcription: null,
                    },
                },
            });
            const source: SpeechSource = {
                kind: 'dictionary-field',
                access: { kind: 'owner', dictionaryId: dictionary.id },
                cardId: card.card.id,
                field: 'source',
            };
            const nativeBilling = findSpeechModel(
                'kie',
                KIE_GEMINI_MODEL,
            )!.nativeBilling!;
            const profile = {
                configurationId: 'native-kie-fixture',
                provider: 'kie',
                model: KIE_GEMINI_MODEL,
                voice: 'Bodi',
                language: 'fr',
                settingsVersion: GEMINI_PRONUNCIATION_SETTINGS_VERSION,
                estimatedCostUnitsPerCharacter: 1,
                // This synthetic provider contract guarantees one generation within these bounds.
                nativeBilling: {
                    ...nativeBilling,
                    providerTaskBoundVerified: input.verifiedBound !== false,
                    sourceUrl:
                        'https://example.test/reviewed-synthetic-task-bound',
                },
            };
            const taskId = `task-${actorId}`;
            const http = vi
                .fn<typeof fetch>()
                .mockImplementation(async (url, request) => {
                    const parsed = new URL(String(url));
                    expect(parsed.origin).toBe('https://api.kie.ai');
                    if (parsed.pathname.endsWith('/createTask')) {
                        const body = JSON.parse(String(request?.body));
                        expect(body.model).toBe(KIE_GEMINI_MODEL);
                        expect(body.input.dialogue_turns).toHaveLength(1);
                        expect(body.input.dialogue_turns[0].text).toBe(text);
                        return Response.json({ code: 200, data: { taskId } });
                    }
                    expect(parsed.pathname).toBe('/api/v1/jobs/recordInfo');
                    expect(parsed.searchParams.get('taskId')).toBe(taskId);
                    return Response.json({
                        code: 200,
                        data: {
                            taskId,
                            model: KIE_GEMINI_MODEL,
                            state: input.failed ? 'fail' : 'success',
                            ...(input.credits === null
                                ? {}
                                : { creditsConsumed: input.credits ?? 1.23 }),
                            resultJson: JSON.stringify({
                                resultUrls: [
                                    'https://cdn.example.test/native-audio.mp3',
                                ],
                            }),
                        },
                    });
                });
            const download = vi.fn(async () => createFixtureAudio());
            const provider = new KieSpeechProvider({
                configurationId: profile.configurationId,
                apiKey: 'synthetic',
                profiles: { fr: profile },
                allowedDownloadHosts: ['cdn.example.test'],
                fetch: http,
                download,
            });
            const environment = loadDictionaryAudioEnvironment(
                {
                    DICTIONARY_AUDIO_PROVIDER: 'kie',
                    DICTIONARY_AUDIO_STORAGE: 'postgres',
                    SPEECH_GENERATION_ENABLED: 'true',
                    SPEECH_PLAYBACK_ENABLED: 'true',
                    DICTIONARY_AUDIO_CONFIGURATION_ID: profile.configurationId,
                    DICTIONARY_AUDIO_KIE_API_KEY: 'synthetic',
                    DICTIONARY_AUDIO_FINGERPRINT_SECRET:
                        'synthetic-native-speech-fingerprint',
                    DICTIONARY_AUDIO_DOWNLOAD_HOSTS: 'cdn.example.test',
                    DICTIONARY_AUDIO_OWNER_BUDGET_UNITS: '100000',
                    DICTIONARY_AUDIO_GLOBAL_BUDGET_UNITS: '1000000',
                    DICTIONARY_AUDIO_VOICE_MAP: JSON.stringify({
                        fr: {
                            model: profile.model,
                            voice: profile.voice,
                            settingsVersion: profile.settingsVersion,
                            estimatedCostUnitsPerCharacter: 1,
                        },
                    }),
                },
                { deployed: false, role: 'worker' },
            );
            const storage = new PostgresAudioObjectStorage(db);
            const speech = createSpeechInfrastructure({
                database: db,
                dictionaryHmacSecret:
                    'synthetic-native-hmac-secret-at-least-32-bytes',
                environment,
                storage,
                provider,
                providers: new Map([[provider.configurationId, provider]]),
                generationEnabled: true,
                playbackEnabled: true,
                burstLimiter: { consume: async () => ({ allowed: true }) },
            });
            const wallet = () =>
                db.transaction((tx) =>
                    new DrizzleAiCreditTransactionParticipant(
                        tx,
                    ).accountSummary(actorId, new Date()),
                );
            const job = async () =>
                (
                    await db
                        .select()
                        .from(jobs)
                        .where(eq(jobs.payerId, actorId))
                )[0]!;
            async function admit() {
                if (input.paid) {
                    if (!tariffSeeded) {
                        await db.insert(modelPriceRevisionsTable).values({
                            id: randomUUID(),
                            providerId: 'kie',
                            modelId: KIE_GEMINI_MODEL,
                            meter: 'speech-characters',
                            version: 1,
                            createdAt: new Date(),
                            reason: 'Independent synthetic customer tariff',
                            rates: {
                                creditsPer1000Characters: 1,
                                minimumCredits: 0,
                                inputCreditsPerMillionTokens: null,
                                outputCreditsPerMillionTokens: null,
                                cachedInputCreditsPerMillionTokens: null,
                                provisional: false,
                            },
                        });
                        tariffSeeded = true;
                    }
                    await db.transaction((tx) =>
                        new DrizzleAiCreditTransactionParticipant(
                            tx,
                        ).issueGrant({
                            ownerId: actorId,
                            amount: 1_000_000n,
                            createdAt: new Date(),
                            expiresAt: null,
                            source: 'migration',
                            sourceReference: randomUUID(),
                        }),
                    );
                }
                const prepared = await speech.service.prepare(actorId, {
                    source,
                    operationId: randomUUID(),
                });
                if (!input.paid) return prepared;
                expect(prepared.state).toBe('confirmation_required');
                return speech.service.confirm(actorId, {
                    quoteId: prepared.quote!.id,
                    operationId: randomUUID(),
                });
            }
            async function poll() {
                const row = await job();
                await db
                    .update(jobs)
                    .set({ nextPollAt: new Date(Date.now() - 1000) })
                    .where(eq(jobs.id, row.id));
                return speech.worker.runOnce();
            }
            const expense = async () =>
                (
                    await db
                        .select()
                        .from(aiProviderExpenseRecordsTable)
                        .where(
                            eq(
                                aiProviderExpenseRecordsTable.actionId,
                                (await job()).id,
                            ),
                        )
                )[0]!;
            return {
                actorId,
                text,
                http,
                speech,
                storage,
                job,
                wallet,
                admit,
                poll,
                expense,
                download,
            };
        }

        it('settles Free native Kie speech using reported credits with no customer tariff', async () => {
            const f = await fixture();
            const admitted = await f.admit();
            expect(admitted.billingState).toBe('free');
            expect(
                await db.select().from(modelPriceRevisionsTable),
            ).toHaveLength(0);
            expect((await f.job()).providerPriceSnapshot).toMatchObject({
                meter: 'speech-tokens',
                usdPer1000Characters: null,
                nativeRules: { version: 1 },
            });
            await f.speech.worker.runOnce();
            await f.poll();
            expect((await f.job()).state).toBe('ready');
            expect(await f.expense()).toMatchObject({
                amountUsdMicros: 6150n,
                measurement: 'measured',
                costSource: 'calculated',
            });
            expect(await f.wallet()).toMatchObject({
                consumedCredits: 0n,
                reservedCredits: 0n,
            });
            expect(
                await f.speech.service.status(f.actorId, admitted.requestId!),
            ).toMatchObject({ state: 'ready', fixture: false });
        });
        it('settles Paid native speech once while customer charges remain character-based', async () => {
            const f = await fixture({ paid: true });
            const admitted = await f.admit();
            expect(admitted.billingState).toBe('reserved');
            await f.speech.worker.runOnce();
            await f.poll();
            expect((await f.job()).billingState).toBe('charged_success');
            expect(await f.wallet()).toMatchObject({
                consumedCredits: BigInt(Array.from(f.text).length),
                reservedCredits: 0n,
            });
            expect(await f.expense()).toMatchObject({
                amountUsdMicros: 6150n,
                measurement: 'measured',
            });
            expect(
                await db
                    .select()
                    .from(aiProviderExpenseRecordsTable)
                    .where(
                        eq(
                            aiProviderExpenseRecordsTable.actionId,
                            (await f.job()).id,
                        ),
                    ),
            ).toHaveLength(1);
        });
        it('retains unknown native expense when the provider omits its billable usage', async () => {
            const f = await fixture({ credits: null });
            await f.admit();
            await f.speech.worker.runOnce();
            await f.poll();
            expect((await f.job()).state).toBe('ready');
            expect(await f.expense()).toMatchObject({
                amountUsdMicros: null,
                measurement: 'unknown',
                costSource: 'unknown',
            });
            const budget = (
                await db
                    .select()
                    .from(aiOperatorActionBudgetsTable)
                    .where(
                        eq(
                            aiOperatorActionBudgetsTable.actionId,
                            (await f.job()).id,
                        ),
                    )
            )[0]!;
            expect(budget.consumedMicros).toBe(budget.reservedMicros);
        });
        it('retains billed provider metadata across a CDN failure before valid audio arrives', async () => {
            const f = await fixture();
            await f.admit();
            await f.speech.worker.runOnce();
            f.download.mockRejectedValueOnce(
                new Error('Synthetic CDN failure'),
            );
            await f.poll();
            expect((await f.job()).state).toBe('processing');
            expect((await f.job()).providerUsage).toMatchObject({
                providerCreditsConsumed: '1.23',
            });
            await f.poll();
            expect((await f.job()).state).toBe('ready');
            expect(await f.expense()).toMatchObject({ amountUsdMicros: 6150n });
            expect(
                f.http.mock.calls.filter(([url]) =>
                    String(url).endsWith('/createTask'),
                ),
            ).toHaveLength(1);
        });
        it('keeps the first expense and usage through a storage failure without resubmission', async () => {
            const f = await fixture({ paid: true });
            await f.admit();
            await f.speech.worker.runOnce();
            const put = vi.spyOn(f.storage, 'putForReference');
            put.mockRejectedValueOnce(
                new Error('Synthetic storage interruption'),
            );
            await f.poll();
            const stored = await f.job();
            expect(stored.state).toBe('storing');
            expect(stored.providerUsage).toMatchObject({
                providerCreditsConsumed: '1.23',
            });
            await f.poll();
            expect((await f.job()).state).toBe('ready');
            expect((await f.job()).providerUsage).toEqual(stored.providerUsage);
            expect(
                f.http.mock.calls.filter(([url]) =>
                    String(url).endsWith('/createTask'),
                ),
            ).toHaveLength(1);
            expect(await f.expense()).toMatchObject({ amountUsdMicros: 6150n });
            expect(
                await db
                    .select()
                    .from(aiOperatorAttemptCostsTable)
                    .where(eq(aiOperatorAttemptCostsTable.actionId, stored.id)),
            ).toHaveLength(1);
        });
        it('releases Paid customer funds on provider failure while preserving reported provider expense', async () => {
            const f = await fixture({ paid: true, failed: true, credits: 0.5 });
            await f.admit();
            await f.speech.worker.runOnce();
            await f.poll();
            expect((await f.job()).state).toBe('failed');
            expect(await f.wallet()).toMatchObject({
                consumedCredits: 0n,
                reservedCredits: 0n,
            });
            expect(await f.expense()).toMatchObject({
                amountUsdMicros: 2500n,
                measurement: 'measured',
            });
        });
        it('rejects unverified broker task bounds and immutable usage tampering', async () => {
            const blocked = await fixture({ verifiedBound: false });
            await expect(blocked.admit()).rejects.toMatchObject({
                code: 'speech_provider_unavailable',
            });
            expect(blocked.http).not.toHaveBeenCalled();
            const f = await fixture();
            await f.admit();
            await f.speech.worker.runOnce();
            await f.poll();
            await expect(
                db
                    .update(jobs)
                    .set({
                        providerUsage: {
                            requests: 1,
                            providerCreditsConsumed: '0',
                        },
                    })
                    .where(eq(jobs.id, (await f.job()).id)),
            ).rejects.toThrow();
            expect(await f.expense()).toMatchObject({ amountUsdMicros: 6150n });
        });
        it('requires the real worker lease and pinned monetary evidence even with forged session flags', async () => {
            const f = await fixture();
            await f.admit();
            await f.speech.worker.runOnce();
            await db
                .update(jobs)
                .set({ nextPollAt: new Date(0) })
                .where(eq(jobs.id, (await f.job()).id));
            const claim = await f.speech.store.claim(new Date());
            expect(claim).not.toBeNull();
            const role = `native_speech_${randomUUID().replaceAll('-', '')}`;
            await client.unsafe(`create role ${role} nologin`);
            // Reprovision a role that still has the previous column grants.
            await client.unsafe(
                `grant update(provider_usage,provider_execution_facts) on speech_jobs to ${role}`,
            );
            let restricted: PostgresClient | undefined;
            try {
                const script = await readFile(
                    new URL(
                        '../../../../../../infra/deploy/sql/dictionary-worker-role.sql',
                        import.meta.url,
                    ),
                    'utf8',
                );
                await client.unsafe(
                    script
                        .split('\n')
                        .filter((line) => !line.startsWith('\\'))
                        .join('\n')
                        .replaceAll(':"dictionary_worker_role"', role),
                );
                const url = new URL(getTestDatabaseUrl());
                url.searchParams.set('options', `-c role=${role}`);
                restricted = createPostgresClient({
                    databaseUrl: url.toString(),
                    maxConnections: 1,
                });
                await restricted`select set_config('languon.speech_worker_version','1',false)`;
                await expect(
                    restricted`update speech_jobs set provider_usage='{"requests":1,"providerCostUsd":"0"}'::jsonb where id=${claim!.id}::uuid`,
                ).rejects.toThrow('permission denied');
                const usage = JSON.stringify({
                    requests: 1,
                    characters: Array.from(f.text).length,
                    providerCreditsConsumed: '1.23',
                });
                for (const lease of [null, randomUUID()]) {
                    await expect(
                        restricted`select languon_retain_speech_provider_observation(${claim!.id}::uuid,${lease}::uuid,${restricted.json(JSON.parse(usage))}::jsonb,null)`,
                    ).rejects.toThrow('expected live dispatch lease');
                }
                const foreign = JSON.stringify({
                    requests: 1,
                    providerCostUsd: '0',
                });
                await expect(
                    restricted`select languon_retain_speech_provider_observation(${claim!.id}::uuid,${claim!.leaseToken}::uuid,${restricted.json(JSON.parse(foreign))}::jsonb,null)`,
                ).rejects.toThrow('pinned provider contract');
                expect((await f.job()).providerUsage).toBeNull();
                await restricted`select languon_retain_speech_provider_observation(${claim!.id}::uuid,${claim!.leaseToken}::uuid,${restricted.json(JSON.parse(usage))}::jsonb,null)`;
                // Identical replay is accepted, but an expired lease never is.
                await restricted`select languon_retain_speech_provider_observation(${claim!.id}::uuid,${claim!.leaseToken}::uuid,${restricted.json(JSON.parse(usage))}::jsonb,null)`;
                await restricted`update speech_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=${claim!.id}::uuid`;
                await expect(
                    restricted`select languon_retain_speech_provider_observation(${claim!.id}::uuid,${claim!.leaseToken}::uuid,${restricted.json(JSON.parse(usage))}::jsonb,null)`,
                ).rejects.toThrow('expected live dispatch lease');
                await restricted`update speech_jobs set lease_expires_at=clock_timestamp()+interval '1 minute' where id=${claim!.id}::uuid`;
                await f.speech.store.pending(claim!, 0, new Date());
                await f.poll();
                expect(await f.expense()).toMatchObject({
                    amountUsdMicros: 6150n,
                });
            } finally {
                await restricted?.end({ timeout: 1 });
                await client.unsafe(`drop owned by ${role}`);
                await client.unsafe(`drop role ${role}`);
            }
        });
        it('records an unexpected native overrun in full, refunds the learner and denies further daily spend', async () => {
            await db.insert(aiAccountingSettingsRevisionsTable).values({
                id: randomUUID(),
                version: 2,
                defaultMaxCreditsPerAction: '10',
                maxProviderCostUsdPerAction: '0.1',
                maxProviderCostUsdPerAccountDay: '0.1',
                maxProviderCostUsdPerDay: '100',
                createdAt: new Date(),
                reason: 'Synthetic tight daily limit for provider overrun evidence',
            });
            const f = await fixture({ paid: true, failed: true, credits: 100 });
            await f.admit();
            await f.speech.worker.runOnce();
            await f.poll();
            const row = await f.job();
            expect(row.state).toBe('failed');
            expect(row.providerUsage).toMatchObject({
                providerCreditsConsumed: '100',
            });
            expect(await f.expense()).toMatchObject({
                amountUsdMicros: 500000n,
                measurement: 'measured',
            });
            const [attempt] = await db
                .select()
                .from(aiOperatorAttemptCostsTable)
                .where(eq(aiOperatorAttemptCostsTable.actionId, row.id));
            expect(attempt).toMatchObject({
                reservedMicros: 71680n,
                consumedMicros: 500000n,
            });
            expect(await f.wallet()).toMatchObject({
                consumedCredits: 0n,
                reservedCredits: 0n,
            });
            await expect(f.admit()).rejects.toMatchObject({
                code: 'speech_provider_budget',
            });
            expect(
                f.http.mock.calls.filter(([url]) =>
                    String(url).endsWith('/createTask'),
                ),
            ).toHaveLength(1);
        });
    },
);
