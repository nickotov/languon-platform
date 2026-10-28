import { randomUUID } from 'node:crypto';
import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import {
    ProviderPricePublishRequestSchema,
    type ProviderNativePricingRules,
} from '@languon/contracts';
import { eq } from 'drizzle-orm';
import * as providerAdmission from '../../../src/modules/ai-credits/domain/provider-cost-admission';
import { databaseSchema } from '../../../src/infrastructure/database/schema';
import { usersTable } from '../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { aiProviderPriceRevisionsTable } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/provider-price-schema';
import {
    aiCreditActionAttemptsTable,
    aiCreditNativeCallDispatchesTable,
} from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import { aiProviderExpenseRecordsTable } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-schema';
import { DrizzleActionAccountingParticipant } from '../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant';
import {
    reserveConversationActionFixture,
    settleConversationActionFixture,
} from '../support/accounting-action-fixture';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../support/test-database';

describe.runIf(isDatabaseIntegrationEnabled())(
    'native financial review regressions',
    () => {
        let client: PostgresClient;
        let database: ReturnType<
            typeof createDrizzleDatabase<typeof databaseSchema>
        >;
        let ownerId: string;
        beforeAll(() => {
            client = createTestPostgresClient();
            database = createDrizzleDatabase(client, databaseSchema);
        });
        beforeEach(async () => {
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            ownerId = randomUUID();
            await database
                .insert(usersTable)
                .values({ id: ownerId, status: 'active' });
        });
        afterAll(async () => {
            await client?.end();
        });
        const budget = {
            maxInputTokensPerAttempt: 100,
            maxOutputTokensPerAttempt: 100,
            maxCostMicrosPerAttempt: 1000000,
            inputCostMicrosPerMillionTokens: 0,
            outputCostMicrosPerMillionTokens: 0,
        };
        async function seed(
            rules: ProviderNativePricingRules,
            providerId = 'openrouter',
            bypassValidation = false,
        ) {
            const candidate = {
                providerId,
                modelId: 'native-financial-fixture',
                meter: 'text-tokens' as const,
                expectedVersion: 0,
                inputUsdPerMillionTokens: null,
                outputUsdPerMillionTokens: null,
                cacheReadUsdPerMillionTokens: null,
                cacheWriteUsdPerMillionTokens: null,
                usdPer1000Characters: null,
                minimumUsdPerRequest: null,
                effectiveAt: '2020-01-01T00:00:00.000Z',
                sourceReference: 'synthetic-financial-review',
                sourceUrl: null,
                reason: 'Synthetic native financial review',
                nativeRules: rules,
            };
            const data = bypassValidation
                ? candidate
                : ProviderPricePublishRequestSchema.parse(candidate);
            await database.insert(aiProviderPriceRevisionsTable).values({
                id: randomUUID(),
                providerId,
                modelId: data.modelId,
                meter: 'text-tokens',
                version: 1,
                effectiveAt: new Date(data.effectiveAt),
                createdAt: new Date(),
                createdBy: ownerId,
                data,
            });
            return database.transaction((tx) =>
                reserveConversationActionFixture(tx, {
                    ownerId,
                    providerId,
                    modelId: data.modelId,
                    maximumMilli: 0n,
                    funding: 'operator',
                    operatorMaximumMicros: 1000000n,
                }),
            );
        }
        const admit = (id: string) =>
            database.transaction((tx) =>
                new DrizzleActionAccountingParticipant(tx).admitAttempt({
                    actionId: id,
                    ownerId,
                    callId: randomUUID(),
                    purpose: 'answer',
                    inputTokens: 100,
                    maxOutputTokens: 100,
                    budget,
                    executionWitness: { jobId: id, leaseToken: id },
                    at: new Date(),
                }),
            );
        function rules(
            transition: number,
            gap: number,
        ): ProviderNativePricingRules {
            const origin = Date.now();
            const components = [
                {
                    meter: 'inputTokens' as const,
                    pricePerUnit: '1',
                    unitQuantity: 1000000,
                    chargeWhen: 'positive-usage' as const,
                },
                {
                    meter: 'outputTokens' as const,
                    pricePerUnit: '1',
                    unitQuantity: 1000000,
                    chargeWhen: 'positive-usage' as const,
                },
            ];
            return {
                version: 1,
                validFrom: new Date(origin - 60000).toISOString(),
                validUntil: null,
                variants: [
                    {
                        id: 'before',
                        applies: {
                            dispatchWindows: [
                                {
                                    from: new Date(
                                        origin - 60000,
                                    ).toISOString(),
                                    until: new Date(
                                        origin + transition,
                                    ).toISOString(),
                                },
                            ],
                        },
                        components,
                    },
                    {
                        id: 'after',
                        applies: {
                            dispatchWindows: [
                                {
                                    from: new Date(
                                        origin + transition + gap,
                                    ).toISOString(),
                                    until: new Date(
                                        origin + 120000,
                                    ).toISOString(),
                                },
                            ],
                        },
                        components: components.map((c) => ({
                            ...c,
                            pricePerUnit: '2',
                        })),
                    },
                ],
            };
        }
        it('rejects incompatible native text meters in SQL even when TypeScript admission is bypassed', async () => {
            for (const [index, meter] of (
                ['characters', 'audioOutputTokens'] as const
            ).entries()) {
                const value = rules(20000, 0);
                value.variants.forEach((v) => {
                    v.components = [
                        {
                            meter,
                            pricePerUnit: '1',
                            unitQuantity: 1,
                            chargeWhen: 'positive-usage',
                        },
                    ];
                });
                // Simulate a malformed historical pin; only the fixture's TS budget validator is bypassed.
                // Authoritative SQL admission, immutable pins, parent policy and worker fences stay real.
                const bypass = vi
                    .spyOn(providerAdmission, 'reviewedTextProviderBudget')
                    .mockImplementation((_price, configured) => configured);
                let action;
                try {
                    action = await seed(
                        value,
                        index === 0 ? 'openrouter' : 'deepseek',
                        true,
                    );
                } finally {
                    bypass.mockRestore();
                }
                await expect(admit(action.id)).rejects.toThrow();
                await expect(
                    client`select languon_authorize_native_text_call(${randomUUID()}::uuid,100,100)`,
                ).rejects.toThrow();
            }
            expect(
                await database.select().from(aiCreditActionAttemptsTable),
            ).toEqual([]);
            expect(
                await database.select().from(aiCreditNativeCallDispatchesTable),
            ).toEqual([]);
        });
        it('rejects an uncovered later dispatch gap before admitting an attempt or issuing HTTP receipts', async () => {
            const action = await seed(rules(20000, 10000));
            await expect(admit(action.id)).rejects.toThrow();
            expect(
                await database.select().from(aiCreditActionAttemptsTable),
            ).toEqual([]);
            expect(
                await database.select().from(aiCreditNativeCallDispatchesTable),
            ).toEqual([]);
        });
        it('admits a covered price transition and pins the complete exclusive action deadline horizon', async () => {
            const action = await seed(rules(20000, 0));
            const attempt = await admit(action.id);
            expect(attempt.budget.nativeExecutionFacts?.latestDispatchAt).toBe(
                new Date(action.deadlineAt.getTime() - 1).toISOString(),
            );
            expect(attempt.reservedCostMicros).toBe(400);
            const receipt =
                await client`select languon_authorize_native_text_call(${attempt.id}::uuid,100,100) as value`;
            expect(receipt[0]!.value.callId).toEqual(expect.any(String));
        });
        it('preserves extreme native credit evidence while settling unrepresentable USD cost as unknown', async () => {
            const value = rules(20000, 0);
            value.reportedCreditUsdPerCredit = '999999999999';
            value.variants.forEach((v) =>
                v.components.forEach((c) => {
                    c.pricePerUnit = '0';
                }),
            );
            const action = await seed(value, 'kie');
            const attempt = await admit(action.id);
            const receipt =
                await client`select languon_authorize_native_text_call(${attempt.id}::uuid,100,100) as value`;
            const callId = receipt[0]!.value.callId as string;
            await client`select languon_observe_native_text_call(${callId}::uuid,${JSON.stringify({ usage: { requests: 1, providerCreditsConsumed: '999999999999' } })}::jsonb)`;
            await database.transaction(async (tx) => {
                await new DrizzleActionAccountingParticipant(tx).recordAttempt({
                    actionId: action.id,
                    ownerId,
                    callId: attempt.id,
                    successful: false,
                    at: new Date(),
                });
                await settleConversationActionFixture(tx, {
                    actionId: action.id,
                    ownerId,
                    outcome: 'failure',
                });
            });
            expect(
                await database
                    .select()
                    .from(aiProviderExpenseRecordsTable)
                    .where(
                        eq(aiProviderExpenseRecordsTable.attemptId, attempt.id),
                    ),
            ).toMatchObject([{ costSource: 'unknown', amountUsdMicros: null }]);
            const checkpoint = await database
                .select()
                .from(aiCreditNativeCallDispatchesTable)
                .where(eq(aiCreditNativeCallDispatchesTable.id, callId));
            expect(checkpoint[0]!.providerUsage?.providerCreditsConsumed).toBe(
                '999999999999',
            );
            expect(
                await database
                    .select()
                    .from(aiCreditActionAttemptsTable)
                    .where(eq(aiCreditActionAttemptsTable.id, attempt.id)),
            ).toMatchObject([{ state: 'settled', actualCostMicros: null }]);
        });
    },
);
