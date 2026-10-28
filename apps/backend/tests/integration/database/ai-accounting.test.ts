import { formatFixed } from '../../../src/modules/ai-credits/domain/accounting';
import { createFixtureAudio } from '../../../src/modules/speech/domain/audio-integrity';
import {
    DrizzleSpeechStore,
    purgeSpeechActor,
} from '../../../src/modules/speech/infrastructure/drizzle-speech-store';
import { FixtureSpeechProvider } from '../../../src/modules/speech/infrastructure/audio/speech-providers';
import { PostgresAudioObjectStorage } from '../../../src/modules/speech/infrastructure/audio/audio-object-storages';
import {
    speechJobsTable,
    speechRecordingsTable,
    speechDailyAdmissionCountersTable,
} from '../../../src/modules/speech/infrastructure/schema';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
    createDrizzleDatabase,
    createPostgresClient,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import {
    AccountingRecordRequestSchema,
    AccountingReportSchema,
    ProviderPricePublishRequestSchema,
} from '@languon/contracts';
import { databaseSchema } from '../../../src/infrastructure/database/schema';
import {
    DrizzleAccountingStore,
    anonymizeAccountingOwner,
} from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-accounting-store';
import { DrizzleAiCreditTransactionParticipant } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { DrizzleActionAccountingParticipant } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant';
import {
    reserveConversationActionFixture,
    settleConversationActionFixture,
} from '../support/accounting-action-fixture';
import {
    DrizzleProviderPriceStore,
    pinProviderPrice,
} from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-provider-prices';
import {
    dictionariesTable,
    dictionaryGenerationJobsTable,
} from '../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import { usersTable } from '../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { accountDeletionRequestsTable } from '../../../src/modules/users/infrastructure/persistence/drizzle/account-deletion-schema';
import { eq, sql } from 'drizzle-orm';
import { aiProviderExpenseRecordsTable } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-schema';
import {
    createTestPostgresClient,
    getTestDatabaseUrl,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../support/test-database';

const at = new Date('2026-10-22T12:00:00.000Z');
const run = describe.runIf(isDatabaseIntegrationEnabled());
run('manual AI accounting persisted facts', () => {
    let client: PostgresClient;
    let database: PostgresJsDatabase<typeof databaseSchema>;
    let store: DrizzleAccountingStore;
    let ownerId: string;
    const base = () => ({
        idempotencyKey: randomUUID(),
        source: 'manual',
        occurredAt: at.toISOString(),
        reference: randomUUID(),
        reason: 'Synthetic manual evidence',
    });
    beforeAll(() => {
        client = createTestPostgresClient();
        database = createDrizzleDatabase(client, databaseSchema);
        store = new DrizzleAccountingStore(
            database,
            (tx) => new DrizzleAiCreditTransactionParticipant(tx),
        );
    });
    beforeEach(async () => {
        await resetTestDatabase(client);
        await migrateTestDatabase(client);
        ownerId = randomUUID();
        await database.insert(usersTable).values({
            id: ownerId,
            status: 'active',
            createdAt: at,
            updatedAt: at,
        });
    });
    afterAll(async () => {
        await client.end();
    });
    async function actualTextExpense(
        amount: bigint | null,
        providerId = 'test-provider',
        modelId = 'fake',
    ) {
        const prices = new DrizzleProviderPriceStore(database),
            previous = (await prices.list()).find(
                (p) =>
                    p.providerId === providerId &&
                    p.modelId === modelId &&
                    p.meter === 'text-tokens',
            );
        const inputRate = formatFixed((amount ?? 1n) * 1000n, 6);
        await prices.publish(
            {
                expectedVersion: previous?.version ?? 0,
                providerId,
                modelId,
                meter: 'text-tokens',
                inputUsdPerMillionTokens: inputRate,
                outputUsdPerMillionTokens: '0',
                cacheReadUsdPerMillionTokens: '0',
                cacheWriteUsdPerMillionTokens: '0',
                usdPer1000Characters: null,
                effectiveAt: '2020-01-01T00:00:00.000Z',
                sourceReference: 'Synthetic fixture',
                sourceUrl: null,
                reason: 'Explicit synthetic financial meter',
            },
            ownerId,
            new Date(),
        );
        const budget = {
            maxInputTokensPerAttempt: 10000,
            maxOutputTokensPerAttempt: 10000,
            maxCostMicrosPerAttempt: 1000000,
            inputCostMicrosPerMillionTokens: Number((amount ?? 1n) * 1000n),
            outputCostMicrosPerMillionTokens: 0,
        };
        const action = await database.transaction((tx) =>
            reserveConversationActionFixture(tx, {
                ownerId,
                maximumMilli: 0n,
                funding: 'operator',
                operatorMaximumMicros: 1000000n,
                providerId,
                modelId,
            }),
        );
        await database.transaction(async (tx) => {
            const participant = new DrizzleActionAccountingParticipant(tx);
            const attempt = await participant.admitAttempt({
                actionId: action.id,
                ownerId,
                callId: randomUUID(),
                purpose: 'answer',
                executionWitness: { jobId: action.id, leaseToken: action.id },
                inputTokens: 1000,
                maxOutputTokens: 1,
                budget,
                at: new Date(),
            });
            await participant.recordAttempt({
                actionId: action.id,
                ownerId,
                callId: attempt.id,
                successful: false,
                ...(amount === null
                    ? {}
                    : { usage: { inputTokens: 1000, outputTokens: 0 } }),
                at: new Date(),
            });
            await settleConversationActionFixture(tx, {
                ownerId,
                actionId: action.id,
                outcome: 'failure',
            });
        });
        return (
            await database
                .select()
                .from(aiProviderExpenseRecordsTable)
                .where(eq(aiProviderExpenseRecordsTable.actionId, action.id))
        )[0]!;
    }
    async function actualEstimatedSpeechExpense() {
        const provider = new FixtureSpeechProvider();
        await new DrizzleProviderPriceStore(database).publish(
            {
                expectedVersion: 0,
                providerId: 'test-provider',
                modelId: 'fake',
                meter: 'speech-characters',
                inputUsdPerMillionTokens: null,
                outputUsdPerMillionTokens: null,
                cacheReadUsdPerMillionTokens: null,
                cacheWriteUsdPerMillionTokens: null,
                usdPer1000Characters: '14.285715',
                effectiveAt: '2020-01-01T00:00:00.000Z',
                sourceReference: 'Synthetic fixture',
                sourceUrl: null,
                reason: 'Explicit synthetic speech meter',
            },
            ownerId,
            new Date(),
        );
        const storage = new PostgresAudioObjectStorage(database),
            speech = new DrizzleSpeechStore({
                database,
                fingerprintSecret: 'synthetic-financial-report-speech',
                profileResolver: {
                    supports: (language) => ({
                        ...provider.supports(language),
                        provider: 'test-provider',
                        model: 'fake',
                    }),
                },
                storageIdentity: storage.identity,
                generationEnabled: true,
                playbackEnabled: true,
                revalidateSource: async () => ({
                    text: 'bonjour',
                    language: 'fr',
                    revision: '1',
                }),
            });
        await speech.prepare({
            actorId: ownerId,
            source: {
                kind: 'dictionary-field',
                access: { kind: 'owner', dictionaryId: randomUUID() },
                cardId: randomUUID(),
                field: 'source',
            },
            resolved: { text: 'bonjour', language: 'fr', revision: '1' },
            operationId: randomUUID(),
            now: new Date(),
        });
        const job = await speech.claim(new Date()),
            audio = createFixtureAudio();
        await speech.storing(job!, audio, new Date());
        await speech.complete(
            job!,
            await storage.putForReference(job!.storage, audio),
            audio,
            new Date(),
        );
    }
    async function payment() {
        const request = AccountingRecordRequestSchema.parse({
            ...base(),
            kind: 'payment',
            ownerId,
            credits: '10.001',
            amountUsd: '2.123456',
            feeUsd: '0.123456',
        });
        const first = await store.record(request, ownerId, at);
        expect(await store.record(request, ownerId, at)).toEqual(first);
        await expect(
            store.record({ ...request, reference: 'different' }, ownerId, at),
        ).rejects.toThrow('Idempotency');
        return first;
    }
    async function creditJob(maximumCredits: bigint) {
        const dictionaryId = randomUUID();
        await database.insert(dictionariesTable).values({
            id: dictionaryId,
            ownerId,
            name: 'Accounting synthetic dictionary',
            sourceLanguageTag: 'en',
            targetLanguageTag: 'fr',
            createdAt: at,
            updatedAt: at,
        });
        const id = randomUUID();
        await database.insert(dictionaryGenerationJobsTable).values({
            id,
            ownerId,
            dictionaryId,
            aiCreditAccounted: true,
            aiCreditInputCreditsPerMillionTokens: 1000000,
            aiCreditOutputCreditsPerMillionTokens: 3000000,
            aiCreditMaxCreditsPerAttempt: Number(maximumCredits),
            aiCreditPolicyMode: 'limited',
            aiCreditPricingRevision: 1,
            attemptCount: 1,
            createdAt: at,
            updatedAt: at,
            expectedDictionaryVersion: 1,
            expectedSettingsVersion: 1,
            format: 'card-authoring:v1',
            idempotencyKey: `accounting-${randomUUID()}`,
            kind: 'card-authoring',
            nextAttemptAt: at,
            requestFingerprint: `hmac-sha256:v1:${'b'.repeat(43)}`,
            sourceLanguageTag: 'en',
            targetLanguageTag: 'fr',
        });
        return id;
    }
    it('payment atomically issues one purchase lot; refunds revoke only explicit available credits', async () => {
        const paid = await payment();
        expect(await store.refundContext(paid.id)).toMatchObject({
            availableCredits: '10.001',
            reservedCredits: '0.000',
            consumedCredits: '0.000',
        });
        const refund = AccountingRecordRequestSchema.parse({
            ...base(),
            kind: 'refund',
            paymentId: paid.id,
            amountUsd: '0.500001',
            revokeAvailableCredits: '2.001',
        });
        const first = await store.record(refund, ownerId, at);
        expect(await store.record(refund, ownerId, at)).toEqual(first);
        expect(await store.refundContext(paid.id)).toMatchObject({
            refundedUsd: '0.500001',
            availableCredits: '8.000',
            revokedCredits: '2.001',
        });
        await expect(
            store.record(
                AccountingRecordRequestSchema.parse({
                    ...base(),
                    kind: 'refund',
                    paymentId: paid.id,
                    amountUsd: '2',
                    revokeAvailableCredits: '0',
                }),
                ownerId,
                at,
            ),
        ).rejects.toThrow('Refund exceeds');
        await expect(
            store.record(
                AccountingRecordRequestSchema.parse({
                    ...base(),
                    kind: 'refund',
                    paymentId: paid.id,
                    amountUsd: '0.1',
                    revokeAvailableCredits: '9',
                }),
                ownerId,
                at,
            ),
        ).rejects.toThrow();
        expect((await store.refundContext(paid.id)).refundedUsd).toBe(
            '0.500001',
        );
    });
    it('refunds cannot claw back reserved or previously consumed credits', async () => {
        const paid = await payment();
        const firstReservation = randomUUID();
        const firstJob = await creditJob(3000n);
        const secondJob = await creditJob(4000n);
        await database.transaction(async (tx) => {
            const credits = new DrizzleAiCreditTransactionParticipant(tx);
            await credits.reserveAttempt({
                ownerId,
                at,
                attempt: 1,
                jobId: firstJob,
                reservationId: firstReservation,
                maximumCredits: 3000n,
            });
            await credits.markProviderDispatched({
                ownerId,
                reservationId: firstReservation,
                dispatchedAt: at,
            });
            await credits.settleAttempt({
                ownerId,
                reservationId: firstReservation,
                settledAt: at,
                measurement: 'provider_reported',
                measuredCredits: 2000n,
            });
            await credits.reserveAttempt({
                ownerId,
                at,
                attempt: 1,
                jobId: secondJob,
                reservationId: randomUUID(),
                maximumCredits: 4000n,
            });
        });
        await database.transaction((tx) =>
            reserveConversationActionFixture(tx, {
                ownerId,
                maximumMilli: 1000n,
            }),
        );
        expect(await store.refundContext(paid.id)).toMatchObject({
            availableCredits: '3.001',
            reservedCredits: '5.000',
            consumedCredits: '2.000',
        });
        await expect(
            store.record(
                AccountingRecordRequestSchema.parse({
                    ...base(),
                    kind: 'refund',
                    paymentId: paid.id,
                    amountUsd: '0.1',
                    revokeAvailableCredits: '4.002',
                }),
                ownerId,
                at,
            ),
        ).rejects.toThrow();
        await store.record(
            AccountingRecordRequestSchema.parse({
                ...base(),
                kind: 'refund',
                paymentId: paid.id,
                amountUsd: '0.1',
                revokeAvailableCredits: '3',
            }),
            ownerId,
            at,
        );
        expect(await store.refundContext(paid.id)).toMatchObject({
            availableCredits: '0.001',
            reservedCredits: '5.000',
            consumedCredits: '2.000',
            revokedCredits: '3.000',
        });
    });
    it('reports measured, estimated and unknown costs independently of manual deposits and bill adjustment', async () => {
        await payment();
        await actualTextExpense(200001n);
        await actualEstimatedSpeechExpense();
        await actualTextExpense(null);
        await store.record(
            AccountingRecordRequestSchema.parse({
                ...base(),
                kind: 'provider_deposit',
                providerId: 'test-provider',
                amountUsd: '10',
            }),
            ownerId,
            at,
        );
        await store.record(
            AccountingRecordRequestSchema.parse({
                ...base(),
                kind: 'provider_balance',
                providerId: 'test-provider',
                amountUsd: '9.1',
            }),
            ownerId,
            at,
        );
        await store.record(
            AccountingRecordRequestSchema.parse({
                ...base(),
                kind: 'provider_bill',
                providerId: 'test-provider',
                amountUsd: '0.4',
                periodStart: '2026-10-01T00:00:00Z',
                periodEnd: '2026-11-01T00:00:00Z',
            }),
            ownerId,
            at,
        );
        await expect(
            store.report(
                new Date('2026-10-01T00:00:00Z'),
                new Date('2026-11-01T00:00:00Z'),
            ),
        ).rejects.toThrow('prepared');
        expect(await store.refreshNextReport()).toBe(true);
        const report = await store.report(
            new Date('2026-10-01T00:00:00Z'),
            new Date('2026-11-01T00:00:00Z'),
        );
        expect(report.cash).toEqual({
            paymentsUsd: '2.123456',
            refundsUsd: '0.000000',
            feesUsd: '0.123456',
            netReceiptsUsd: '2.000000',
        });
        expect(report.usage).toMatchObject({
            calculatedExpenseUsd: '0.300002',
            measuredCount: 1,
            estimatedCount: 1,
            unknownCount: 1,
            complete: false,
            manualUnallocatedAdjustmentUsd: '0.099998',
        });
        // HTTP-facing reads use the saved snapshot; adding a fact does not trigger a history aggregate.
        await actualTextExpense(999999n);
        expect(
            await store.report(
                new Date('2026-10-01T00:00:00Z'),
                new Date('2026-11-01T00:00:00Z'),
            ),
        ).toEqual(report);
        expect(report.providers[0]).toMatchObject({
            depositsUsd: '10.000000',
            latestBalanceUsd: '9.100000',
            estimatedRemainingUsd: '9.600000',
        });
    });
    it('materializes a cold report with native null flat rates and exact expense beyond the old integer meter', async () => {
        const prices = new DrizzleProviderPriceStore(database);
        const nativePrice = {
            expectedVersion: 0,
            providerId: 'openrouter',
            modelId: 'native-report-fixture',
            meter: 'text-tokens' as const,
            inputUsdPerMillionTokens: null,
            outputUsdPerMillionTokens: null,
            cacheReadUsdPerMillionTokens: null,
            cacheWriteUsdPerMillionTokens: null,
            usdPer1000Characters: null,
            minimumUsdPerRequest: null,
            effectiveAt: '2020-01-01T00:00:00.000Z',
            sourceReference: 'Synthetic native report regression',
            sourceUrl: null,
            reason: 'Exact native reporting evidence',
            nativeRules: {
                version: 1 as const,
                validFrom: '2020-01-01T00:00:00.000Z',
                validUntil: null,
                variants: [
                    {
                        id: 'base',
                        applies: {},
                        components: [
                            {
                                meter: 'inputTokens' as const,
                                pricePerUnit: '1',
                                unitQuantity: 1_000_000,
                                chargeWhen: 'positive-usage' as const,
                            },
                            {
                                meter: 'outputTokens' as const,
                                pricePerUnit: '0',
                                unitQuantity: 1_000_000,
                                chargeWhen: 'positive-usage' as const,
                            },
                        ],
                    },
                ],
            },
        };
        expect(
            ProviderPricePublishRequestSchema.safeParse(nativePrice).success,
        ).toBe(true);
        await prices.publish(nativePrice, ownerId, new Date());
        const nativeSpeechPrice = ProviderPricePublishRequestSchema.parse({
            ...nativePrice,
            providerId: 'native-report-speech',
            modelId: 'audio-token-fixture',
            meter: 'speech-tokens',
            nativeRules: {
                ...nativePrice.nativeRules,
                variants: [
                    {
                        id: 'audio',
                        applies: {},
                        components: [
                            {
                                meter: 'inputTokens',
                                pricePerUnit: '0',
                                unitQuantity: 1_000_000,
                                chargeWhen: 'positive-usage',
                            },
                            {
                                meter: 'audioOutputTokens',
                                pricePerUnit: '0.000000000000000000000001',
                                unitQuantity: 1_000_000,
                                chargeWhen: 'positive-usage',
                            },
                        ],
                    },
                ],
            },
        });
        expect(
            ProviderPricePublishRequestSchema.safeParse(nativeSpeechPrice)
                .success,
        ).toBe(true);
        await prices.publish(nativeSpeechPrice, ownerId, new Date());
        const action = await database.transaction((tx) =>
            reserveConversationActionFixture(tx, {
                ownerId,
                maximumMilli: 0n,
                funding: 'operator',
                operatorMaximumMicros: 1000000n,
                providerId: nativePrice.providerId,
                modelId: nativePrice.modelId,
            }),
        );
        await database.transaction(async (tx) => {
            const participant = new DrizzleActionAccountingParticipant(tx);
            const attempt = await participant.admitAttempt({
                actionId: action.id,
                ownerId,
                callId: randomUUID(),
                purpose: 'answer',
                executionWitness: { jobId: action.id, leaseToken: action.id },
                inputTokens: 100,
                maxOutputTokens: 1,
                budget: {
                    maxInputTokensPerAttempt: 100,
                    maxOutputTokensPerAttempt: 1,
                    maxCostMicrosPerAttempt: 1000000,
                    inputCostMicrosPerMillionTokens: 0,
                    outputCostMicrosPerMillionTokens: 0,
                },
                at: new Date(),
            });
            const receipt = await tx.execute(
                sql`select languon_authorize_native_text_call(${attempt.id}::uuid,100,1) as value`,
            );
            const call = receipt[0]!.value as { callId: string };
            await tx.execute(
                sql`select languon_observe_native_text_call(${call.callId}::uuid,${JSON.stringify({ usage: { requests: 1, providerCostUsd: '5000' } })}::jsonb)`,
            );
            await participant.recordAttempt({
                actionId: action.id,
                ownerId,
                callId: attempt.id,
                successful: false,
                at: new Date(),
            });
            await settleConversationActionFixture(tx, {
                ownerId,
                actionId: action.id,
                outcome: 'failure',
            });
        });
        const from = new Date('2026-01-01T00:00:00Z');
        const to = new Date('2027-01-01T00:00:00Z');
        // A cold snapshot is explicitly pending, independent of native price representation.
        await expect(store.report(from, to)).rejects.toThrow('prepared');
        expect(await store.refreshNextReport()).toBe(true);
        const report = AccountingReportSchema.parse(
            await store.report(from, to),
        );
        expect(report.usage).toMatchObject({
            calculatedExpenseUsd: '5000.000000',
            measuredCount: 1,
            unknownCount: 0,
            complete: true,
        });
        expect(report.providers).toEqual([
            expect.objectContaining({
                providerId: 'openrouter',
                calculatedExpenseUsd: '5000.000000',
                estimatedRemainingUsd: '-5000.000000',
            }),
        ]);
    });
    it('renews an unchanged report without history aggregation and recomputes after a committed change', async () => {
        await payment();
        const from = new Date('2026-10-01T00:00:00Z');
        const to = new Date('2026-11-01T00:00:00Z');
        await expect(store.report(from, to)).rejects.toThrow('prepared');
        await store.refreshNextReport();
        const spy = vi.spyOn(database, 'transaction');
        try {
            expect(
                await store.refreshNextReport(new Date(Date.now() + 31000)),
            ).toBe(true);
            expect(spy).not.toHaveBeenCalled();
            const request = AccountingRecordRequestSchema.parse({
                ...base(),
                kind: 'provider_deposit',
                providerId: 'dirty-test',
                amountUsd: '1',
            });
            await store.record(request, ownerId, at);
            spy.mockClear();
            expect(
                await store.refreshNextReport(new Date(Date.now() + 62000)),
            ).toBe(true);
            expect(spy).toHaveBeenCalledOnce();
            const report = await store.report(from, to);
            expect(
                report.providers.find(
                    (provider) => provider.providerId === 'dirty-test',
                )?.depositsUsd,
            ).toBe('1.000000');
        } finally {
            spy.mockRestore();
        }
    });
    it('preserves anonymous historical paid consumption while purging private credit attribution and allowing later cash-only refunds', async () => {
        const paid = await payment();
        const jobId = await creditJob(3000n);
        await database.transaction(async (tx) => {
            const credits = new DrizzleAiCreditTransactionParticipant(tx);
            const reservationId = randomUUID();
            await credits.reserveAttempt({
                at,
                attempt: 1,
                jobId,
                ownerId,
                reservationId,
                maximumCredits: 3000n,
            });
            await credits.markProviderDispatched({
                ownerId,
                reservationId,
                dispatchedAt: at,
            });
            await credits.settleAttempt({
                ownerId,
                reservationId,
                settledAt: at,
                measurement: 'provider_reported',
                measuredCredits: 2000n,
            });
        });
        const from = new Date('2026-10-01T00:00:00Z');
        const to = new Date(at.getTime() + 1000);
        await expect(store.report(from, to)).rejects.toThrow('prepared');
        await store.refreshNextReport();
        const before = await store.report(from, to);
        expect(before.usage.allocatedPurchaseValueUsd).not.toBe('0.000000');
        // Financial erasure has no authority outside a due, actively leased deletion.
        await expect(
            database.transaction((tx) => anonymizeAccountingOwner(tx, ownerId)),
        ).rejects.toMatchObject({
            cause: {
                code: '23514',
                message: expect.stringContaining('checked deletion claim'),
            },
        });
        const now = new Date();
        await database
            .update(usersTable)
            .set({ status: 'deletion_pending' })
            .where(eq(usersTable.id, ownerId));
        await database.insert(accountDeletionRequestsTable).values({
            userId: ownerId,
            state: 'running',
            scheduledAt: new Date(now.getTime() - 120000),
            purgeAt: new Date(now.getTime() - 60000),
            nextAttemptAt: new Date(now.getTime() - 60000),
            leaseDeadline: new Date(now.getTime() + 120000),
            leaseWorkerId: 'accounting-test',
            fencingToken: 1,
            updatedAt: now,
        });
        await database.transaction(async (tx) => {
            await new DrizzleAiCreditTransactionParticipant(tx).purgeOwner(
                ownerId,
                { workerId: 'accounting-test', fencingToken: 1 },
            );
        });
        const [retained] = (await store.list({ limit: 10 })).filter(
            (entry) => entry.id === paid.id,
        );
        expect(retained?.createdBy).toBeNull();
        expect(retained?.grantId).toBeNull();
        expect(retained?.data).toMatchObject({
            kind: 'payment',
            ownerId: '00000000-0000-0000-0000-000000000000',
            reference: 'redacted',
            reason: 'Account removed',
            amountUsd: '2.123456',
        });
        expect(JSON.stringify(retained)).not.toContain(ownerId);
        await store.refreshNextReport(new Date(Date.now() + 31000));
        const after = await store.report(from, to);
        expect(after.usage.allocatedPurchaseValueUsd).toBe(
            before.usage.allocatedPurchaseValueUsd,
        );
        expect(after.usage.unusedPurchaseValueUsd).toBe(
            before.usage.unusedPurchaseValueUsd,
        );
        expect(after.usage.operationalMarginUsd).toBe(
            before.usage.operationalMarginUsd,
        );
        expect(await store.refundContext(paid.id)).toMatchObject({
            paidUsd: '2.123456',
            refundedUsd: '0.000000',
            ownerId: null,
            grantId: null,
            availableCredits: null,
            reservedCredits: null,
            consumedCredits: null,
            revokedCredits: null,
        });
        const actor = randomUUID();
        await database.insert(usersTable).values({
            id: actor,
            status: 'active',
            createdAt: at,
            updatedAt: at,
        });
        const refund = AccountingRecordRequestSchema.parse({
            ...base(),
            kind: 'refund',
            paymentId: paid.id,
            amountUsd: '0.1',
            revokeAvailableCredits: '0',
        });
        await expect(
            store.record(
                { ...refund, revokeAvailableCredits: '0.001' } as typeof refund,
                actor,
                at,
            ),
        ).rejects.toThrow('cash-only');
        expect((await store.record(refund, actor, at)).grantId).toBeNull();
        expect((await store.refundContext(paid.id)).refundedUsd).toBe(
            '0.100000',
        );
    });
    it('retains immutable anonymous provider expense facts and denies public accounting-purge authority', async () => {
        const recorded = await actualTextExpense(null);
        const fact = { attemptReference: recorded.attemptReference };
        await expect(
            database
                .update(aiProviderExpenseRecordsTable)
                .set({ amountUsdMicros: 1n, costSource: 'calculated' })
                .where(
                    eq(
                        aiProviderExpenseRecordsTable.attemptReference,
                        fact.attemptReference,
                    ),
                ),
        ).rejects.toMatchObject({
            cause: {
                code: '23514',
                message: expect.stringContaining('immutable'),
            },
        });
        await expect(
            database
                .delete(aiProviderExpenseRecordsTable)
                .where(
                    eq(
                        aiProviderExpenseRecordsTable.attemptReference,
                        fact.attemptReference,
                    ),
                ),
        ).rejects.toMatchObject({
            cause: {
                code: '23514',
                message: expect.stringContaining('immutable'),
            },
        });
        const permissions = await database.execute(
            sql`select exists(select 1 from pg_proc p,aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid in ('languon_anonymize_accounting_owner(uuid)'::regprocedure,'languon_finalize_speech_accounting_for_purge(uuid)'::regprocedure) and a.grantee=0 and a.privilege_type='EXECUTE') allowed`,
        );
        expect(permissions[0]?.allowed).toBe(false);
    });
    it('lets the restricted purge role retain anonymous cash/expense facts without reading payment JSON or resetting global operator cost', async () => {
        const paid = await payment();
        const action = await database.transaction((tx) =>
            reserveConversationActionFixture(tx, {
                ownerId,
                maximumMilli: 1000n,
            }),
        );
        await database.transaction(async (tx) => {
            const participant = new DrizzleActionAccountingParticipant(tx);
            const attempt = await participant.admitAttempt({
                actionId: action.id,
                ownerId,
                callId: randomUUID(),
                purpose: 'answer',
                executionWitness: { jobId: action.id, leaseToken: action.id },
                inputTokens: 100,
                maxOutputTokens: 100,
                budget: {
                    maxInputTokensPerAttempt: 10000,
                    maxOutputTokensPerAttempt: 10000,
                    maxCostMicrosPerAttempt: 10000,
                    inputCostMicrosPerMillionTokens: 1000000,
                    outputCostMicrosPerMillionTokens: 1000000,
                },
                at: new Date(),
            });
            await participant.recordAttempt({
                actionId: action.id,
                ownerId,
                callId: attempt.id,
                successful: true,
                usage: { inputTokens: 100, outputTokens: 100 },
                operatorCostMicros: 100n,
                at: new Date(),
            });
            await settleConversationActionFixture(tx, {
                ownerId,
                actionId: action.id,
                outcome: 'success',
            });
        });
        const speechProvider = new FixtureSpeechProvider();
        await new DrizzleProviderPriceStore(database).publish(
            {
                expectedVersion: 0,
                providerId: 'fixture',
                modelId: 'tone-v1',
                meter: 'speech-characters',
                inputUsdPerMillionTokens: null,
                outputUsdPerMillionTokens: null,
                cacheReadUsdPerMillionTokens: null,
                cacheWriteUsdPerMillionTokens: null,
                usdPer1000Characters: '0.01',
                effectiveAt: '2020-01-01T00:00:00.000Z',
                sourceReference: 'Synthetic fixture',
                sourceUrl: null,
                reason: 'Synthetic disposable provider tariff',
            },
            ownerId,
            new Date(),
        );
        let speechText = 'bonjour';
        const speech = new DrizzleSpeechStore({
            database,
            fingerprintSecret: 'synthetic-financial-purge-speech-secret',
            profileResolver: speechProvider,
            storageIdentity: new PostgresAudioObjectStorage(database).identity,
            generationEnabled: true,
            playbackEnabled: true,
            revalidateSource: async () => ({
                text: speechText,
                language: 'fr',
                revision: '1',
            }),
        });
        await speech.prepare({
            actorId: ownerId,
            source: {
                kind: 'dictionary-field',
                access: { kind: 'owner', dictionaryId: randomUUID() },
                cardId: randomUUID(),
                field: 'source',
            },
            resolved: { text: 'bonjour', language: 'fr', revision: '1' },
            operationId: randomUUID(),
            now: new Date(),
        });
        const speechJob = await speech.claim(new Date());
        expect(speechJob).not.toBeNull();
        speechText = 'salut';
        await speech.prepare({
            actorId: ownerId,
            source: {
                kind: 'dictionary-field',
                access: { kind: 'owner', dictionaryId: randomUUID() },
                cardId: randomUUID(),
                field: 'source',
            },
            resolved: { text: speechText, language: 'fr', revision: '1' },
            operationId: randomUUID(),
            now: new Date(),
        });
        const [queuedSpeech] = await database
            .select()
            .from(speechJobsTable)
            .where(eq(speechJobsTable.state, 'queued'));
        expect(queuedSpeech).toBeDefined();
        const globalBefore = await database.execute(
            sql`select sum(consumed_micros)::text amount from ai_operator_daily_budgets where scope='global'`,
        );
        expect(BigInt(String(globalBefore[0]?.amount ?? '0'))).toBeGreaterThan(
            0n,
        );
        const now = new Date();
        await database
            .update(usersTable)
            .set({ status: 'deletion_pending' })
            .where(eq(usersTable.id, ownerId));
        await database.insert(accountDeletionRequestsTable).values({
            userId: ownerId,
            state: 'running',
            scheduledAt: new Date(now.getTime() - 120000),
            purgeAt: new Date(now.getTime() - 60000),
            nextAttemptAt: new Date(now.getTime() - 60000),
            leaseDeadline: new Date(now.getTime() + 120000),
            leaseWorkerId: 'accounting-role-test',
            fencingToken: 1,
            updatedAt: now,
        });
        const role = `accounting_purge_test_${randomUUID().replaceAll('-', '')}`;
        const script = await readFile(
            new URL(
                '../../../../../infra/deploy/sql/account-purge-worker-role.sql',
                import.meta.url,
            ),
            'utf8',
        );
        await client.unsafe(`create role ${role}`);
        const connection = createPostgresClient({
            databaseUrl: getTestDatabaseUrl(),
            maxConnections: 1,
        });
        try {
            await client.unsafe(
                script
                    .split('\n')
                    .filter((line) => !line.startsWith('\\'))
                    .join('\n')
                    .replaceAll(':"account_purge_role"', role),
            );
            await connection.unsafe(`set role ${role}`);
            await expect(
                connection.unsafe('select data from ai_accounting_records'),
            ).rejects.toThrow('permission denied');
            await expect(
                connection.unsafe(
                    'select report from ai_accounting_report_snapshots',
                ),
            ).rejects.toThrow('permission denied');
            const restricted = createDrizzleDatabase(
                connection,
                databaseSchema,
            );
            for (const query of [
                connection`select languon_cancel_speech_for_scheduled_deletion(${ownerId}::uuid)`,
                connection`select languon_settle_credit_action(${action.id}::uuid,'failure',clock_timestamp())`,
                connection`select languon_settle_text_provider_attempt(${randomUUID()}::uuid,false,NULL,NULL,NULL,NULL,clock_timestamp())`,
                connection`select languon_record_text_provider_expense(${randomUUID()}::uuid,NULL)`,
                connection`select languon_settle_speech_customer(${randomUUID()}::uuid,'failure')`,
                connection`select languon_mark_accounting_reports_dirty()`,
            ])
                await expect(query).rejects.toThrow('permission denied');
            await expect(
                connection`select languon_recover_purge_interview_action(${ownerId}::uuid,'wrong-worker',1,${action.id}::uuid)`,
            ).rejects.toThrow('worker and fence');
            await expect(
                connection`select languon_recover_purge_interview_action(${ownerId}::uuid,'accounting-role-test',1,${action.id}::uuid)`,
            ).rejects.toThrow('owned admitted interview');
            for (const [worker, fence] of [
                ['wrong-worker', 1],
                ['accounting-role-test', 0],
                ['accounting-role-test', 2],
            ] as const) {
                await expect(
                    connection`select languon_purge_ai_credit_owner(${ownerId}::uuid, ${worker}::text, ${fence}::integer)`,
                ).rejects.toThrow('worker and fence');
            }
            await expect(
                connection`select languon_purge_ai_credit_owner(${randomUUID()}::uuid, 'accounting-role-test', 1)`,
            ).rejects.toThrow('worker and fence');
            // Even all three guessed custom settings cannot confer raw ledger authority.
            await connection.begin(async (tx) => {
                await tx`select set_config('languon.ai_credit_purge_owner',${ownerId},true), set_config('languon.ai_credit_purge_worker','accounting-role-test',true), set_config('languon.ai_credit_purge_fence','1',true)`;
                await expect(
                    tx.savepoint(
                        (sp) =>
                            sp`delete from ai_credit_grants where owner_id=${ownerId}::uuid`,
                    ),
                ).rejects.toThrow('permission denied');
                await expect(
                    tx.savepoint(
                        (sp) =>
                            sp`delete from ai_credit_actions where owner_id=${ownerId}::uuid`,
                    ),
                ).rejects.toThrow('permission denied');
                await expect(
                    tx.savepoint(
                        (sp) =>
                            sp`update users set status='active' where id=${ownerId}::uuid`,
                    ),
                ).rejects.toThrow('permission denied');
                await expect(
                    tx.savepoint(
                        (sp) =>
                            sp`update account_deletion_requests set purge_at=clock_timestamp()-interval '1 day' where user_id=${ownerId}::uuid`,
                    ),
                ).rejects.toThrow('permission denied');
            });

            const canceledOwner = randomUUID();
            await database
                .insert(usersTable)
                .values({ id: canceledOwner, status: 'active' });
            await database.insert(accountDeletionRequestsTable).values({
                userId: canceledOwner,
                state: 'cancelled',
                scheduledAt: new Date(now.getTime() - 120000),
                purgeAt: new Date(now.getTime() - 60000),
                nextAttemptAt: new Date(now.getTime() - 60000),
                fencingToken: 1,
                updatedAt: now,
            });
            await expect(
                connection`select languon_purge_ai_credit_owner(${canceledOwner}::uuid,'accounting-role-test',1)`,
            ).rejects.toThrow('worker and fence');
            await expect(
                connection`update account_deletion_requests set state='running',lease_worker_id='forged',lease_deadline=clock_timestamp()+interval '1 minute',fencing_token=2,attempt_count=attempt_count+1 where user_id=${canceledOwner}::uuid`,
            ).rejects.toThrow('due work');
            // An expired claim may be reclaimed only at the next fence; the prior worker is then stale.
            await database
                .update(accountDeletionRequestsTable)
                .set({ leaseDeadline: new Date(Date.now() - 1000) })
                .where(eq(accountDeletionRequestsTable.userId, ownerId));
            await connection`update account_deletion_requests set lease_deadline=clock_timestamp()+interval '2 minutes',fencing_token=2,attempt_count=attempt_count+1 where user_id=${ownerId}::uuid`;
            await expect(
                connection`select languon_purge_ai_credit_owner(${ownerId}::uuid,'accounting-role-test',1)`,
            ).rejects.toThrow('worker and fence');
            await restricted.transaction(async (tx) => {
                await purgeSpeechActor(tx, ownerId, new Date(), {
                    workerId: 'accounting-role-test',
                    fencingToken: 2,
                });
                await new DrizzleAiCreditTransactionParticipant(tx).purgeOwner(
                    ownerId,
                    { workerId: 'accounting-role-test', fencingToken: 2 },
                );
            });
            const globalAfter = await database.execute(
                sql`select sum(consumed_micros)::text amount from ai_operator_daily_budgets where scope='global'`,
            );
            expect(BigInt(String(globalAfter[0]?.amount))).toBe(
                BigInt(String(globalBefore[0]?.amount)) + 70n,
            );
            expect(
                (
                    await database
                        .select()
                        .from(speechJobsTable)
                        .where(eq(speechJobsTable.id, speechJob!.id))
                )[0]?.payerId,
            ).toBeNull();
            expect(
                await database
                    .select()
                    .from(speechDailyAdmissionCountersTable)
                    .where(
                        eq(
                            speechDailyAdmissionCountersTable.scope,
                            `owner:${ownerId}`,
                        ),
                    ),
            ).toHaveLength(0);
            expect(
                (
                    await database.execute(
                        sql`select count(*)::int total from ai_operator_daily_budgets where scope=${`owner:${ownerId}`}`,
                    )
                )[0]?.total,
            ).toBe(0);
            expect(
                (
                    await database.execute(
                        sql`select owner_id from ai_operator_action_budgets where action_id=${action.id}::uuid`,
                    )
                )[0]?.owner_id,
            ).toBeNull();
            const expenses = await database
                .select()
                .from(aiProviderExpenseRecordsTable);
            expect(
                (
                    await database
                        .select()
                        .from(speechRecordingsTable)
                        .where(
                            eq(
                                speechRecordingsTable.id,
                                queuedSpeech!.recordingId,
                            ),
                        )
                )[0],
            ).toMatchObject({ state: 'deleting', text: '' });
            expect(expenses).toHaveLength(2);
            expect(
                expenses.find((entry) => entry.actionId === action.id),
            ).toMatchObject({ amountUsdMicros: 1n, attemptId: null });
            expect(
                expenses.find((entry) => entry.actionId === speechJob!.id),
            ).toMatchObject({
                amountUsdMicros: null,
                measurement: 'unknown',
                costSource: 'unknown',
            });
            const cash = (await store.list({ limit: 10 })).find(
                (entry) => entry.id === paid.id,
            );
            expect(JSON.stringify(cash)).not.toContain(ownerId);
            const anonymous = await database.execute(
                sql`select sum(credits_milli)::text credits from ai_accounting_archived_purchase_movements where payment_id=${paid.id}::uuid and kind='consumed'`,
            );
            expect(
                BigInt(String(anonymous[0]?.credits ?? '0')),
            ).toBeGreaterThan(0n);
        } finally {
            await connection.unsafe('reset role');
            await connection.end({ timeout: 1 });
            await client.unsafe(`drop owned by ${role}`);
            await client.unsafe(`drop role ${role}`);
        }
    });
    it('pins immutable provider USD revisions by admission time with optimistic publication', async () => {
        const prices = new DrizzleProviderPriceStore(database);
        const request = ProviderPricePublishRequestSchema.parse({
            providerId: 'test-provider',
            modelId: 'fake',
            meter: 'text-tokens',
            inputUsdPerMillionTokens: '1.234567',
            outputUsdPerMillionTokens: '2',
            cacheReadUsdPerMillionTokens: null,
            cacheWriteUsdPerMillionTokens: null,
            usdPer1000Characters: null,
            sourceReference: 'Synthetic test evidence',
            sourceUrl: 'https://example.com/pricing',
            reason: 'Synthetic manually reviewed rate',
            expectedVersion: 0,
            effectiveAt: at.toISOString(),
        });
        expect(
            await database.transaction((tx) =>
                pinProviderPrice(tx, {
                    providerId: 'test-provider',
                    modelId: 'fake',
                    meter: 'text-tokens',
                    at: new Date(at.getTime() - 1),
                }),
            ),
        ).toBeNull();
        const first = await prices.publish(request, ownerId, at);
        const second = await prices.publish(
            {
                ...request,
                expectedVersion: 1,
                effectiveAt: new Date(at.getTime() + 10000).toISOString(),
                inputUsdPerMillionTokens: '3',
            },
            ownerId,
            at,
        );
        await expect(prices.publish(request, ownerId, at)).rejects.toThrow(
            'revision',
        );
        expect(second.version).toBe(2);
        expect(
            await database.transaction((tx) =>
                pinProviderPrice(tx, {
                    providerId: 'test-provider',
                    modelId: 'fake',
                    meter: 'text-tokens',
                    at,
                }),
            ),
        ).toEqual({
            ...first,
            createdBy: null,
            reason: 'Pinned numerical provider price',
            sourceReference: `reviewed-rate:${first.id}`,
            sourceUrl: null,
        });
        expect(
            await database.transaction((tx) =>
                pinProviderPrice(tx, {
                    providerId: 'test-provider',
                    modelId: 'fake',
                    meter: 'text-tokens',
                    at: new Date(at.getTime() + 10000),
                }),
            ),
        ).toEqual({
            ...second,
            createdBy: null,
            reason: 'Pinned numerical provider price',
            sourceReference: `reviewed-rate:${second.id}`,
            sourceUrl: null,
        });
        expect(first.inputUsdPerMillionTokens).toBe('1.234567');
        expect(await prices.list()).toContainEqual(second);
        expect(second.createdBy).toBe(ownerId);
        expect(second.sourceUrl).toBe('https://example.com/pricing');
    });
    it('serializes simultaneous refund totals and prevents overlapping invoice periods', async () => {
        const paid = await payment();
        const results = await Promise.allSettled(
            [1, 2].map(() =>
                store.record(
                    AccountingRecordRequestSchema.parse({
                        ...base(),
                        kind: 'refund',
                        paymentId: paid.id,
                        amountUsd: '1.5',
                        revokeAvailableCredits: '0',
                    }),
                    ownerId,
                    at,
                ),
            ),
        );
        expect(
            results.filter((result) => result.status === 'fulfilled'),
        ).toHaveLength(1);
        const bill = {
            ...base(),
            kind: 'provider_bill',
            providerId: 'test-provider',
            amountUsd: '2',
            periodStart: '2026-10-01T00:00:00Z',
            periodEnd: '2026-11-01T00:00:00Z',
        };
        await store.record(
            AccountingRecordRequestSchema.parse(bill),
            ownerId,
            at,
        );
        await expect(
            store.record(
                AccountingRecordRequestSchema.parse({
                    ...bill,
                    idempotencyKey: randomUUID(),
                }),
                ownerId,
                at,
            ),
        ).rejects.toThrow('overlap');
    });
});
