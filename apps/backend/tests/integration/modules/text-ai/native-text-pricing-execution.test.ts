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
import { randomUUID } from 'node:crypto';
import { createDrizzleDatabase, type PostgresClient } from '@languon/database';
import { eq, sql } from 'drizzle-orm';
import { Agent } from '@mastra/core/agent';
import { noopLogger } from '@mastra/core/logger';
import type { ProviderPrice } from '@languon/contracts';
import {
    sumTextAiProviderUsage,
    type TextAiProviderUsage,
} from '../../../../src/modules/text-ai/application/ports/text-ai-provider-usage';
import {
    createTextAiMastraModel,
    findTextAiModel,
} from '../../../../src/modules/text-ai/infrastructure/ai/text-ai-provider-catalog';
import { withTextAiProviderAttemptWitness } from '../../../../src/modules/text-ai/infrastructure/ai/text-ai-provider-attempt-context';
import { readProviderTokenUsage } from '../../../../src/modules/text-ai/infrastructure/ai/provider-token-usage';
import { providerTextExpenseMicros } from '../../../../src/modules/ai-credits/domain/provider-expense';
import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { aiProviderPriceRevisionsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/provider-price-schema';
import {
    aiCreditNativeCallDispatchesTable,
    aiCreditActionAttemptsTable,
} from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/action-accounting-schema';
import { aiProviderExpenseRecordsTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-schema';
import { DrizzleActionAccountingParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant';
import { DrizzleAiCreditTransactionParticipant } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant';
import { aiCreditGrantBalancesTable } from '../../../../src/modules/ai-credits/infrastructure/persistence/drizzle/schema';
import {
    conversationMessagesTable,
    conversationTurnsTable,
} from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/schema';
import {
    prepareConversationActionSettlement,
    settleConversationAction,
} from '../../../../src/modules/conversations/infrastructure/conversation-action-accounting';
import { reserveConversationActionFixture } from '../../support/accounting-action-fixture';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

afterEach(() => vi.unstubAllGlobals());
const dispatchedAt = '2026-10-28T12:00:00.000Z';
const price: ProviderPrice = {
    id: '00000000-0000-4000-8000-000000000001',
    version: 1,
    createdAt: dispatchedAt,
    createdBy: null,
    effectiveAt: dispatchedAt,
    providerId: 'openrouter',
    modelId: 'openai/gpt-6-luna',
    meter: 'text-tokens',
    inputUsdPerMillionTokens: null,
    outputUsdPerMillionTokens: null,
    cacheReadUsdPerMillionTokens: null,
    cacheWriteUsdPerMillionTokens: null,
    usdPer1000Characters: null,
    minimumUsdPerRequest: null,
    sourceReference: 'synthetic-native',
    sourceUrl: null,
    reason: 'Synthetic native tariff',
    nativeRules: {
        version: 1,
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: null,
        variants: [
            {
                id: 'openai',
                applies: {
                    endpointIds: ['openai'],
                    serviceTiers: ['standard'],
                },
                components: [
                    {
                        meter: 'inputTokens',
                        pricePerUnit: '1',
                        unitQuantity: 1000000,
                        chargeWhen: 'positive-usage',
                    },
                    {
                        meter: 'outputTokens',
                        pricePerUnit: '0',
                        unitQuantity: 1000000,
                        chargeWhen: 'positive-usage',
                    },
                ],
            },
            {
                id: 'other',
                applies: { endpointIds: ['other'], serviceTiers: ['standard'] },
                components: [
                    {
                        meter: 'inputTokens',
                        pricePerUnit: '2',
                        unitQuantity: 1000000,
                        chargeWhen: 'positive-usage',
                    },
                    {
                        meter: 'outputTokens',
                        pricePerUnit: '0',
                        unitQuantity: 1000000,
                        chargeWhen: 'positive-usage',
                    },
                ],
            },
        ],
    },
};
const witness = {
    attemptId: '00000000-0000-4000-8000-000000000002',
    jobId: '00000000-0000-4000-8000-000000000003',
};
function agent(
    authorize: (input: {
        witness: { attemptId: string; jobId: string };
        inputTokens: number;
        outputTokens: number;
    }) => Promise<{ callId: string; dispatchedAt: string }> = vi.fn(
        async () => ({
            callId: '00000000-0000-4000-8000-000000000004',
            dispatchedAt,
        }),
    ),
    observe?: Parameters<
        typeof createTextAiMastraModel
    >[0]['observeNativeCall'],
    pinnedPrice: ProviderPrice = price,
) {
    const model = createTextAiMastraModel({
        apiKey: 'synthetic',
        model: findTextAiModel(
            `${pinnedPrice.providerId}/${pinnedPrice.modelId}`,
        )!,
        providerPrice: pinnedPrice,
        providerBudget: {
            inputCostMicrosPerMillionTokens: 1,
            outputCostMicrosPerMillionTokens: 1,
            maxCostMicrosPerAttempt: 100000,
            maxInputTokensPerAttempt: 10000,
            maxOutputTokensPerAttempt: 100,
        },
        authorizeNativeCall: authorize,
        ...(observe ? { observeNativeCall: observe } : {}),
    });
    const value = new Agent({
        id: 'native-execution',
        name: 'Native execution',
        instructions: 'Return OK.',
        model,
        defaultOptions: { maxSteps: 1 },
        defaultGenerateOptionsLegacy: { maxRetries: 0, maxSteps: 1 },
    });
    value.__registerPrimitives({ logger: noopLogger });
    return { value, authorize };
}
describe('native text production SDK execution evidence', () => {
    it('requires a durable receipt before synthetic external HTTP and settles trusted reported USD exactly', async () => {
        const fetch = vi.fn(async () =>
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
                    prompt_tokens: 10,
                    completion_tokens: 1,
                    total_tokens: 11,
                    cost: 0.0000001,
                },
            }),
        );
        vi.stubGlobal('fetch', fetch);
        const { value, authorize } = agent();
        const result = await withTextAiProviderAttemptWitness(witness, () =>
            value.generate('Synthetic.', {
                modelSettings: { maxOutputTokens: 10, maxRetries: 0 },
                toolChoice: 'none',
            }),
        );
        const usage = readProviderTokenUsage(
            result.usage,
            { maxInputTokens: 10000, maxOutputTokens: 100 },
            result,
        );
        expect(authorize).toHaveBeenCalledOnce();
        expect(fetch).toHaveBeenCalledOnce();
        expect(usage.calls).toHaveLength(1);
        expect(providerTextExpenseMicros(price, usage)).toBe(1n);
    });
    it('does not turn missing endpoint and missing reported cost into an invented native cost', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                // Match an OpenRouter response which omitted the provider field, rather
                // than allowing the SDK's request-side default to masquerade as evidence.
                const body = (await Response.json({
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
                        prompt_tokens: 10,
                        completion_tokens: 1,
                        total_tokens: 11,
                    },
                }).json()) as Record<string, unknown>;
                delete body.provider;
                return Response.json(body);
            }),
        );
        const { value } = agent();
        const result = await withTextAiProviderAttemptWitness(witness, () =>
            value.generate('Synthetic.', {
                modelSettings: { maxOutputTokens: 10, maxRetries: 0 },
                toolChoice: 'none',
            }),
        );
        expect(
            providerTextExpenseMicros(
                price,
                readProviderTokenUsage(
                    result.usage,
                    { maxInputTokens: 10000, maxOutputTokens: 100 },
                    result,
                ),
            ),
        ).toBeNull();
    });
});

describe.runIf(isDatabaseIntegrationEnabled())(
    'durable native SDK text accounting',
    () => {
        let client: PostgresClient;
        let db: ReturnType<typeof createDrizzleDatabase<typeof databaseSchema>>;
        let ownerId: string;
        beforeAll(async () => {
            client = createTestPostgresClient();
            db = createDrizzleDatabase(client, databaseSchema);
        });
        // Forward-migrating a fresh disposable schema can exceed Vitest's default
        // hook budget under disk load; SDK and test-body deadlines stay unchanged.
        beforeEach(async () => {
            await resetTestDatabase(client);
            await migrateTestDatabase(client);
            ownerId = randomUUID();
            await db
                .insert(usersTable)
                .values({ id: ownerId, status: 'active' });
            await db.insert(aiProviderPriceRevisionsTable).values({
                id: randomUUID(),
                providerId: price.providerId,
                modelId: price.modelId,
                meter: 'text-tokens',
                version: 1,
                effectiveAt: new Date(dispatchedAt),
                createdAt: new Date(dispatchedAt),
                createdBy: ownerId,
                data: price,
            });
        }, 30_000);
        afterAll(async () => {
            await client?.end();
        });
        async function admit(
            options: {
                pinnedPrice?: ProviderPrice;
                funding?: 'customer' | 'operator';
            } = {},
        ) {
            const pinnedPrice = options.pinnedPrice ?? price;
            const funding = options.funding ?? 'operator';
            const action = await db.transaction((tx) =>
                reserveConversationActionFixture(tx, {
                    ownerId,
                    providerId: pinnedPrice.providerId,
                    modelId: pinnedPrice.modelId,
                    maximumMilli: 1000n,
                    operatorMaximumMicros: 100000n,
                    funding,
                    tariff: {
                        inputCreditsPerMillionTokens:
                            funding === 'customer' ? '1' : '0',
                        outputCreditsPerMillionTokens:
                            funding === 'customer' ? '1' : '0',
                    },
                }),
            );
            const admitted = await db.transaction((tx) =>
                new DrizzleActionAccountingParticipant(tx).admitAttempt({
                    actionId: action.id,
                    ownerId,
                    callId: randomUUID(),
                    purpose: 'answer',
                    inputTokens: 10000,
                    maxOutputTokens: 1000,
                    budget: {
                        maxInputTokensPerAttempt: 10000,
                        maxOutputTokensPerAttempt: 1000,
                        maxCostMicrosPerAttempt: 100000,
                        inputCostMicrosPerMillionTokens: 0,
                        outputCostMicrosPerMillionTokens: 0,
                    },
                    executionWitness: {
                        jobId: action.id,
                        leaseToken: action.id,
                    },
                    at: new Date(),
                }),
            );
            const authorizeNativeCall: NonNullable<
                Parameters<
                    typeof createTextAiMastraModel
                >[0]['authorizeNativeCall']
            > = async () => {
                // Each SDK call receives nearly the entire attempt envelope. The second
                // call can fit only after the first call's small actual usage is durable.
                const rows = await db.execute(
                    sql`select languon_authorize_native_text_call(${admitted.id}::uuid, 9000::integer, 800::integer) as receipt`,
                );
                return rows[0]!.receipt as {
                    callId: string;
                    dispatchedAt: string;
                };
            };
            const observeNativeCall: NonNullable<
                Parameters<
                    typeof createTextAiMastraModel
                >[0]['observeNativeCall']
            > = async (input) => {
                await db.execute(
                    sql`select languon_observe_native_text_call(${input.callId}::uuid, ${JSON.stringify({ usage: input.usage, ...(input.execution ? { execution: input.execution } : {}) })}::jsonb)`,
                );
            };
            const { value } = agent(
                authorizeNativeCall,
                observeNativeCall,
                pinnedPrice,
            );
            const generate = () =>
                withTextAiProviderAttemptWitness(
                    { attemptId: admitted.id, jobId: action.id },
                    () =>
                        value.generate('Synthetic.', {
                            modelSettings: {
                                maxOutputTokens: 10,
                                maxRetries: 0,
                            },
                            toolChoice: 'none',
                        }),
                );
            const settle = (usage?: TextAiProviderUsage) =>
                db.transaction((tx) =>
                    new DrizzleActionAccountingParticipant(tx).recordAttempt({
                        actionId: action.id,
                        ownerId,
                        callId: admitted.id,
                        successful: Boolean(usage),
                        ...(usage ? { usage } : {}),
                        at: new Date(),
                    }),
                );
            const expenses = () =>
                db
                    .select()
                    .from(aiProviderExpenseRecordsTable)
                    .where(
                        eq(
                            aiProviderExpenseRecordsTable.attemptId,
                            admitted.id,
                        ),
                    );
            return { action, admitted, generate, settle, expenses };
        }
        function fakeResponse(
            usage: Record<string, number> = {
                prompt_tokens: 10,
                completion_tokens: 1,
                total_tokens: 11,
                cost: 0.0000001,
            },
        ) {
            const fetch = vi.fn(async () =>
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
                    usage,
                }),
            );
            vi.stubGlobal('fetch', fetch);
            return fetch;
        }
        function sdkUsage(
            result: Awaited<
                ReturnType<Awaited<ReturnType<typeof admit>>['generate']>
            >,
        ) {
            return readProviderTokenUsage(
                result.usage,
                { maxInputTokens: 10000, maxOutputTokens: 1000 },
                result,
            );
        }
        it('binds SDK dispatch to a DB receipt and settles its checkpointed native evidence', async () => {
            fakeResponse();
            const execution = await admit();
            const result = await execution.generate();
            const usage = sdkUsage(result);
            expect(
                await db.select().from(aiCreditNativeCallDispatchesTable),
            ).toMatchObject([
                {
                    id: usage.calls![0]!.callId,
                    providerUsage: { providerCostUsd: '0.0000001' },
                    observedAt: expect.any(Date),
                },
            ]);
            await execution.settle(usage);
            expect(
                await db
                    .select()
                    .from(aiCreditActionAttemptsTable)
                    .where(
                        eq(
                            aiCreditActionAttemptsTable.id,
                            execution.admitted.id,
                        ),
                    ),
            ).toMatchObject([
                { state: 'settled', providerUsage: expect.anything() },
            ]);
            expect(await execution.expenses()).toMatchObject([
                { amountUsdMicros: 1n, measurement: 'measured' },
            ]);
        });
        it('retains raw reported cost checkpoint when SDK aggregate token usage is absent', async () => {
            fakeResponse({ cost: 0.0000001 });
            const execution = await admit();
            const result = await execution.generate();
            // The SDK synthesizes zero aggregate counters for this response; those
            // defaults are not provider token evidence for failure cleanup.
            expect(sdkUsage(result)).toMatchObject({
                inputTokens: 0,
                outputTokens: 0,
            });
            expect(
                await db.select().from(aiCreditNativeCallDispatchesTable),
            ).toMatchObject([
                {
                    providerUsage: { providerCostUsd: '0.0000001' },
                    observedAt: expect.any(Date),
                },
            ]);
            // Production failure cleanup has no usable aggregate SDK counters.
            await execution.settle();
            expect(
                await db
                    .select()
                    .from(aiCreditActionAttemptsTable)
                    .where(
                        eq(
                            aiCreditActionAttemptsTable.id,
                            execution.admitted.id,
                        ),
                    ),
            ).toMatchObject([
                { inputTokens: null, outputTokens: null, successful: 0 },
            ]);
            expect(await execution.expenses()).toMatchObject([
                {
                    amountUsdMicros: 1n,
                    measurement: 'measured',
                    costSource: 'calculated',
                },
            ]);
        });
        it('reuses the observed remainder for two sequential SDK calls instead of reserving both full envelopes', async () => {
            const fetch = fakeResponse();
            const execution = await admit();
            const first = sdkUsage(await execution.generate());
            const second = sdkUsage(await execution.generate());
            expect(fetch).toHaveBeenCalledTimes(2);
            const receipts = await db
                .select()
                .from(aiCreditNativeCallDispatchesTable);
            expect(receipts).toHaveLength(2);
            expect(
                receipts.every(
                    (receipt) =>
                        receipt.inputLimit === 9000 &&
                        receipt.outputLimit === 800 &&
                        receipt.observedAt !== null,
                ),
            ).toBe(true);
            await execution.settle(sumTextAiProviderUsage(first, second));
            // Exact per-call fractions are summed before the final USD-micro ceil.
            expect(await execution.expenses()).toMatchObject([
                { amountUsdMicros: 1n, measurement: 'measured' },
            ]);
        });
        it('rejects missing, foreign and duplicate receipt sets without losing the real checkpoint', async () => {
            fakeResponse();
            const execution = await admit();
            const usage = sdkUsage(await execution.generate());
            expect(usage.calls).toHaveLength(1);
            const call = usage.calls![0]!;
            for (const calls of [
                [],
                [{ ...call, callId: randomUUID() }],
                [call, call],
            ]) {
                await expect(
                    execution.settle({ ...usage, calls }),
                ).rejects.toThrow();
            }
            await expect(
                db.execute(
                    sql`select languon_observe_native_text_call(${randomUUID()}::uuid, ${JSON.stringify({ usage: { requests: 1 } })}::jsonb)`,
                ),
            ).rejects.toThrow();
            await expect(
                db.execute(
                    sql`select languon_observe_native_text_call(${call.callId}::uuid, ${JSON.stringify({ usage: { ...call.usage, providerCostUsd: '0' }, execution: { endpointId: 'openai', serviceTier: 'standard' } })}::jsonb)`,
                ),
            ).rejects.toThrow();
            expect(await execution.expenses()).toHaveLength(0);
            await execution.settle(usage);
            expect(await execution.expenses()).toMatchObject([
                { amountUsdMicros: 1n, measurement: 'measured' },
            ]);
        });
        it('preserves an incurred reported-cost overrun and blocks the next SDK dispatch before HTTP', async () => {
            const fetch = fakeResponse({
                prompt_tokens: 10,
                completion_tokens: 1,
                total_tokens: 11,
                cost: 0.2,
            });
            const execution = await admit();
            const usage = sdkUsage(await execution.generate());
            await expect(execution.generate()).rejects.toThrow();
            expect(fetch).toHaveBeenCalledOnce();
            await execution.settle(usage);
            expect(await execution.expenses()).toMatchObject([
                { amountUsdMicros: 200000n, measurement: 'measured' },
            ]);
        });

        const families = [
            {
                providerId: 'deepseek',
                modelId: 'deepseek-flash',
                expectedMicros: 5n,
            },
            {
                providerId: 'evolink',
                modelId: 'gpt-6-luna',
                expectedMicros: 295n,
            },
        ] as const;
        const familyCases = families.flatMap((family) =>
            (['operator', 'customer'] as const).flatMap((funding) =>
                (['success', 'failure'] as const).map((outcome) => ({
                    ...family,
                    funding,
                    outcome,
                })),
            ),
        );
        it.each(familyCases)(
            'native $providerId $funding $outcome completes the production SDK and financial action path',
            async ({
                providerId,
                modelId,
                expectedMicros,
                funding,
                outcome,
            }) => {
                const nativeRules: NonNullable<ProviderPrice['nativeRules']> = {
                    version: 1,
                    validFrom: '2026-01-01T00:00:00.000Z',
                    validUntil: null,
                    ...(providerId === 'evolink'
                        ? {
                              currency: {
                                  code: 'UC',
                                  usdNumerator: '1',
                                  unitDenominator: '680000',
                              },
                          }
                        : {}),
                    variants: [
                        {
                            id: 'synthetic-official-shape',
                            applies: {},
                            components: [
                                {
                                    meter: 'inputTokens',
                                    pricePerUnit:
                                        providerId === 'deepseek' ? '0.3' : '1',
                                    unitQuantity: 1000000,
                                    chargeWhen: 'positive-usage',
                                    ...(providerId === 'evolink'
                                        ? {
                                              minimum: '100',
                                              rounding: {
                                                  quantum: '1',
                                                  mode: 'ceil',
                                              },
                                          }
                                        : {}),
                                },
                                {
                                    meter: 'outputTokens',
                                    pricePerUnit:
                                        providerId === 'deepseek' ? '1.2' : '1',
                                    unitQuantity: 1000000,
                                    chargeWhen: 'positive-usage',
                                    ...(providerId === 'evolink'
                                        ? {
                                              minimum: '100',
                                              rounding: {
                                                  quantum: '1',
                                                  mode: 'ceil',
                                              },
                                          }
                                        : {}),
                                },
                            ],
                        },
                    ],
                };
                const pinnedPrice = {
                    ...price,
                    id: randomUUID(),
                    providerId,
                    modelId,
                    nativeRules,
                };
                await db.insert(aiProviderPriceRevisionsTable).values({
                    id: pinnedPrice.id,
                    providerId,
                    modelId,
                    meter: 'text-tokens',
                    version: 1,
                    effectiveAt: new Date(dispatchedAt),
                    createdAt: new Date(dispatchedAt),
                    createdBy: ownerId,
                    data: pinnedPrice,
                });
                if (funding === 'customer')
                    await db.transaction((tx) =>
                        new DrizzleAiCreditTransactionParticipant(
                            tx,
                        ).issueGrant({
                            ownerId,
                            amount: 5000n,
                            source: 'admin',
                            sourceReference: randomUUID(),
                            createdAt: new Date(),
                            expiresAt: null,
                        }),
                    );
                const execution = await admit({ pinnedPrice, funding });
                expect(execution.action.heldMilli).toBe(
                    funding === 'customer' ? 1000n : 0n,
                );
                const fetch = vi.fn(
                    async (_url: unknown, _request?: RequestInit) =>
                        outcome === 'failure'
                            ? Response.json(
                                  {
                                      error: {
                                          message:
                                              'Synthetic controlled failure',
                                          type: 'server_error',
                                      },
                                  },
                                  { status: 503 },
                              )
                            : Response.json({
                                  id: 'synthetic',
                                  object: 'chat.completion',
                                  created: 1,
                                  choices: [
                                      {
                                          index: 0,
                                          message: {
                                              role: 'assistant',
                                              content: 'Usable native answer.',
                                          },
                                          finish_reason: 'stop',
                                      },
                                  ],
                                  usage: {
                                      prompt_tokens: 10,
                                      completion_tokens: 1,
                                      total_tokens: 11,
                                  },
                              }),
                );
                vi.stubGlobal('fetch', fetch);
                let text = '';
                if (outcome === 'success') {
                    const result = await execution.generate();
                    text = result.text;
                    expect(text).toBe('Usable native answer.');
                    await execution.settle(sdkUsage(result));
                } else {
                    await expect(execution.generate()).rejects.toThrow();
                    await execution.settle();
                }
                expect(fetch).toHaveBeenCalledOnce();
                const request = JSON.parse(
                    String(fetch.mock.calls[0]![1]!.body),
                ) as Record<string, unknown>;
                expect(request.model).toBe(modelId);
                expect(
                    request.max_tokens ?? request.max_completion_tokens,
                ).toBe(10);
                const receipts = await db
                    .select()
                    .from(aiCreditNativeCallDispatchesTable)
                    .where(
                        eq(
                            aiCreditNativeCallDispatchesTable.attemptId,
                            execution.admitted.id,
                        ),
                    );
                expect(receipts).toHaveLength(1);
                expect(receipts[0]!.observedAt !== null).toBe(
                    outcome === 'success',
                );
                await db.transaction(async (tx) => {
                    const [turn] = await tx
                        .select()
                        .from(conversationTurnsTable)
                        .where(
                            eq(conversationTurnsTable.id, execution.action.id),
                        );
                    await prepareConversationActionSettlement(tx, turn!);
                    if (outcome === 'success')
                        await tx.insert(conversationMessagesTable).values({
                            id: randomUUID(),
                            conversationId: turn!.conversationId,
                            turnId: turn!.id,
                            role: 'assistant',
                            content: text,
                            attachments: [],
                            status: 'complete',
                            sourceVersion: '1',
                            sourceProvenance: 'saved',
                            createdAt: new Date(),
                        });
                    const [terminal] = await tx
                        .update(conversationTurnsTable)
                        .set({
                            status:
                                outcome === 'success' ? 'succeeded' : 'failed',
                            failureCode:
                                outcome === 'failure'
                                    ? 'synthetic_failure'
                                    : null,
                            leaseToken: null,
                            leaseUntil: null,
                        })
                        .where(
                            eq(conversationTurnsTable.id, execution.action.id),
                        )
                        .returning();
                    await settleConversationAction(tx, terminal!);
                });
                const [turn] = await db
                    .select()
                    .from(conversationTurnsTable)
                    .where(eq(conversationTurnsTable.id, execution.action.id));
                expect(turn).toMatchObject({
                    status: outcome === 'success' ? 'succeeded' : 'failed',
                    billing: {
                        state:
                            funding === 'operator'
                                ? 'free'
                                : outcome === 'success'
                                  ? 'charged'
                                  : 'released',
                        heldCredits: funding === 'customer' ? '1' : '0',
                        chargedCredits:
                            funding === 'customer' && outcome === 'success'
                                ? '0.001'
                                : '0',
                    },
                });
                const messages = await db
                    .select()
                    .from(conversationMessagesTable)
                    .where(
                        eq(
                            conversationMessagesTable.turnId,
                            execution.action.id,
                        ),
                    );
                expect(messages.map((message) => message.content)).toEqual(
                    outcome === 'success' ? ['Usable native answer.'] : [],
                );
                expect(await execution.expenses()).toMatchObject([
                    {
                        providerId,
                        modelId,
                        amountUsdMicros:
                            outcome === 'success' ? expectedMicros : null,
                        measurement:
                            outcome === 'success' ? 'measured' : 'unknown',
                    },
                ]);
                if (funding === 'customer')
                    expect(
                        await db
                            .select()
                            .from(aiCreditGrantBalancesTable)
                            .where(
                                eq(aiCreditGrantBalancesTable.ownerId, ownerId),
                            ),
                    ).toMatchObject([
                        {
                            remainingCredits:
                                outcome === 'success' ? 4999n : 5000n,
                        },
                    ]);
            },
        );
    },
);
