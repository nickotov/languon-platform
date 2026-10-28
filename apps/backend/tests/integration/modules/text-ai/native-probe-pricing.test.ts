import { randomUUID } from 'node:crypto';
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
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { eq } from 'drizzle-orm';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { aiProviderPriceRevisionsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/provider-price-schema';
import { aiProviderExpenseRecordsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-schema';
import { textAiProbesTable } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/probe-schema';
import { DrizzleTextAiProbeStore } from '../../../../src/modules/text-ai/infrastructure/persistence/drizzle/drizzle-text-ai-probe-store';
import { TextAiProbeService } from '../../../../src/modules/text-ai/application/text-ai-probe-service';
import { createTextAiProbeExecutor } from '../../../../src/modules/text-ai/infrastructure/ai/text-ai-probe-executor';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

const run = describe.runIf(isDatabaseIntegrationEnabled());
const at = new Date('2026-10-28T12:00:00.000Z');
const limits = {
    maximumCostMicros: 100_000n,
    dailyMaximumCostMicros: 1_000_000n,
    cooldownSeconds: 0,
    evidenceHours: 24,
};

run('native text probe accounting', () => {
    let client: PostgresClient;
    let db: ReturnType<typeof createDrizzleDatabase<typeof databaseSchema>>;
    let store: DrizzleTextAiProbeStore;
    let actorId: string;
    beforeAll(async () => {
        client = createTestPostgresClient();
        db = createDrizzleDatabase(client, databaseSchema);
        store = new DrizzleTextAiProbeStore(db);
    });
    beforeEach(async () => {
        await resetTestDatabase(client);
        await migrateTestDatabase(client);
        actorId = randomUUID();
        await db.insert(usersTable).values({ id: actorId, status: 'active' });
        await db.insert(aiProviderPriceRevisionsTable).values({
            id: randomUUID(),
            providerId: 'deepseek',
            modelId: 'deepseek-flash',
            meter: 'text-tokens',
            version: 1,
            effectiveAt: at,
            createdAt: at,
            createdBy: actorId,
            data: {
                providerId: 'deepseek',
                modelId: 'deepseek-flash',
                meter: 'text-tokens',
                inputUsdPerMillionTokens: null,
                outputUsdPerMillionTokens: null,
                cacheReadUsdPerMillionTokens: null,
                cacheWriteUsdPerMillionTokens: null,
                usdPer1000Characters: null,
                minimumUsdPerRequest: null,
                effectiveAt: at.toISOString(),
                sourceReference: 'synthetic-native',
                sourceUrl: null,
                reason: 'Synthetic native probe tariff',
                nativeRules: {
                    version: 1,
                    validFrom: '2026-01-01T00:00:00.000Z',
                    validUntil: null,
                    variants: [
                        {
                            id: 'flat',
                            applies: {},
                            components: [
                                {
                                    meter: 'inputTokens',
                                    pricePerUnit: '0.3',
                                    unitQuantity: 1000000,
                                    chargeWhen: 'positive-usage',
                                },
                                {
                                    meter: 'outputTokens',
                                    pricePerUnit: '1.2',
                                    unitQuantity: 1000000,
                                    chargeWhen: 'positive-usage',
                                },
                            ],
                        },
                    ],
                },
            },
        });
    });
    afterAll(async () => {
        await client?.end();
    });
    afterEach(() => vi.unstubAllGlobals());
    async function reserve() {
        return store.reserve({
            actorId,
            identity: {
                providerId: 'deepseek',
                modelId: 'deepseek-flash',
                routeId: 'deepseek/deepseek-flash',
                fingerprint: 'a'.repeat(64),
            },
            request: {
                routeId: 'deepseek/deepseek-flash',
                approvedMaximumCostUsd: '0.1',
                kind: 'quick',
            },
            at,
            limits,
        });
    }
    it('uses the real probe service and SDK with fake external HTTP, then persists native facts and expense', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                Response.json({
                    id: 'synthetic',
                    object: 'chat.completion',
                    created: 1,
                    choices: [
                        {
                            index: 0,
                            message: { role: 'assistant', content: 'OK' },
                            finish_reason: 'stop',
                        },
                    ],
                    usage: {
                        prompt_tokens: 100,
                        completion_tokens: 10,
                        total_tokens: 110,
                    },
                }),
            ),
        );
        const service = new TextAiProbeService(
            store,
            createTextAiProbeExecutor({
                credentials: { DEEPSEEK_API_KEY: 'synthetic' },
                flows: {},
            }),
            limits,
            () => at,
        );
        const saved = await service.run(actorId, {
            routeId: 'deepseek/deepseek-flash',
            approvedMaximumCostUsd: '0.1',
            kind: 'quick',
        });
        expect(saved).toMatchObject({
            state: 'passed',
            measurement: 'measured',
            providerCostUsd: '0.000042',
        });
        const expenses = await db
            .select()
            .from(aiProviderExpenseRecordsTable)
            .where(eq(aiProviderExpenseRecordsTable.actionId, saved.id));
        expect(expenses).toMatchObject([
            { amountUsdMicros: 42n, measurement: 'measured' },
        ]);
    });
    it('settles an unambiguous native tariff without inventing a reservation amount', async () => {
        const reservation = await reserve();
        const saved = await store.finish(
            reservation,
            {
                valid: true,
                failure: null,
                elapsedMs: 1,
                inputTokens: 100,
                outputTokens: 10,
                measurement: 'measured',
                nativeUsage: {
                    inputTokens: 100,
                    outputTokens: 10,
                    requests: 1,
                },
            },
            at,
        );
        expect(saved).toMatchObject({
            state: 'passed',
            measurement: 'measured',
            providerCostUsd: '0.000042',
        });
    });
    it('records the entire OpenRouter reported-cost overrun through the real SDK while failing the probe', async () => {
        const [seed] = await db.select().from(aiProviderPriceRevisionsTable);
        await db.insert(aiProviderPriceRevisionsTable).values({
            id: randomUUID(),
            providerId: 'openrouter',
            modelId: 'openai/gpt-6-luna',
            meter: 'text-tokens',
            version: 1,
            effectiveAt: at,
            createdAt: at,
            createdBy: actorId,
            data: {
                ...seed!.data,
                providerId: 'openrouter',
                modelId: 'openai/gpt-6-luna',
            },
        });
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                Response.json({
                    id: 'synthetic',
                    object: 'chat.completion',
                    created: 1,
                    provider: 'openai',
                    choices: [
                        {
                            index: 0,
                            message: { role: 'assistant', content: 'OK' },
                            finish_reason: 'stop',
                        },
                    ],
                    usage: {
                        prompt_tokens: 100,
                        completion_tokens: 10,
                        total_tokens: 110,
                        cost: 0.2,
                    },
                }),
            ),
        );
        const service = new TextAiProbeService(
            store,
            createTextAiProbeExecutor({
                credentials: { OPENROUTER_API_KEY: 'synthetic' },
                flows: {},
            }),
            limits,
            () => at,
        );
        const saved = await service.run(actorId, {
            routeId: 'openrouter/openai/gpt-6-luna',
            approvedMaximumCostUsd: '0.1',
            kind: 'quick',
        });
        expect(saved).toMatchObject({
            state: 'failed',
            measurement: 'measured',
            providerCostUsd: '0.200000',
        });
        expect(
            await db
                .select()
                .from(aiProviderExpenseRecordsTable)
                .where(eq(aiProviderExpenseRecordsTable.actionId, saved.id)),
        ).toMatchObject([
            { amountUsdMicros: 200000n, measurement: 'measured' },
        ]);
    });
    it('rejects a caller-selected above-cap probe cost that differs from immutable native evidence', async () => {
        const reservation = await reserve();
        await expect(
            db
                .update(textAiProbesTable)
                .set({
                    state: 'failed',
                    failure: 'execution_unknown',
                    costMicros: 200000n,
                    inputTokens: 100,
                    outputTokens: 10,
                    providerUsage: {
                        requests: 1,
                        inputTokens: 100,
                        outputTokens: 10,
                    },
                    providerExecutionFacts: {},
                    measurement: 'measured',
                    elapsedMs: 1,
                    completedAt: at,
                })
                .where(eq(textAiProbesTable.id, reservation.id)),
        ).rejects.toThrow();
        const saved = await store.finish(
            reservation,
            {
                valid: true,
                failure: null,
                elapsedMs: 1,
                inputTokens: 100,
                outputTokens: 10,
                measurement: 'measured',
                nativeUsage: {
                    requests: 1,
                    inputTokens: 100,
                    outputTokens: 10,
                },
            },
            at,
        );
        expect(saved).toMatchObject({
            state: 'passed',
            providerCostUsd: '0.000042',
        });
    });
    it('rejects foreign reported money for a DeepSeek probe and retains tariff-only accounting', async () => {
        const reservation = await reserve();
        for (const foreignMoney of [
            { providerCostUsd: '0' },
            { providerCreditsConsumed: '0' },
        ]) {
            await expect(
                store.finish(
                    reservation,
                    {
                        valid: true,
                        failure: null,
                        elapsedMs: 1,
                        inputTokens: 100,
                        outputTokens: 10,
                        measurement: 'measured',
                        nativeUsage: {
                            requests: 1,
                            inputTokens: 100,
                            outputTokens: 10,
                            ...foreignMoney,
                        },
                    },
                    at,
                ),
            ).rejects.toThrow();
        }
        expect(
            await db
                .select()
                .from(aiProviderExpenseRecordsTable)
                .where(
                    eq(aiProviderExpenseRecordsTable.actionId, reservation.id),
                ),
        ).toHaveLength(0);
        const saved = await store.finish(
            reservation,
            {
                valid: true,
                failure: null,
                elapsedMs: 1,
                inputTokens: 100,
                outputTokens: 10,
                measurement: 'measured',
                nativeUsage: {
                    requests: 1,
                    inputTokens: 100,
                    outputTokens: 10,
                },
            },
            at,
        );
        expect(saved).toMatchObject({
            state: 'passed',
            providerCostUsd: '0.000042',
        });
    });
});
