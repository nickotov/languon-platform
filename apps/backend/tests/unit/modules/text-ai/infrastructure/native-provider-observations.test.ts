import { Agent } from '@mastra/core/agent';
import { noopLogger } from '@mastra/core/logger';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderPriceSchema, type ProviderPrice } from '@languon/contracts';
import {
    createTextAiMastraModel,
    findTextAiModel,
    assertTextOnlyNativePrompt,
} from '../../../../../src/modules/text-ai/infrastructure/ai/text-ai-provider-catalog';
import { withTextAiProviderAttemptWitness } from '../../../../../src/modules/text-ai/infrastructure/ai/text-ai-provider-attempt-context';
import { readProviderTokenUsage } from '../../../../../src/modules/text-ai/infrastructure/ai/provider-token-usage';
import { reportedPriceDecimal } from '../../../../../src/modules/text-ai/infrastructure/ai/provider-native-observations';
import { providerTextExpenseMicros } from '../../../../../src/modules/ai-credits/domain/provider-expense';
import { sumTextAiProviderUsage } from '../../../../../src/modules/text-ai/application/ports/text-ai-provider-usage';

afterEach(() => vi.unstubAllGlobals());
const dispatchedAt = '2026-10-28T12:00:00.000Z';
const callId = '00000000-0000-4000-8000-000000000010';
const witness = {
    attemptId: '00000000-0000-4000-8000-000000000011',
    jobId: '00000000-0000-4000-8000-000000000012',
};
const limits = { maxInputTokens: 64_000, maxOutputTokens: 8192 };
const price: ProviderPrice = ProviderPriceSchema.parse({
    id: '00000000-0000-4000-8000-000000000009',
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
    sourceReference: 'synthetic-native-fixture',
    sourceUrl: null,
    reason: 'Synthetic native billing fixture',
    nativeRules: {
        version: 1,
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: null,
        variants: ['primary', 'alternate'].map((id, index) => ({
            id,
            applies: {
                endpointIds: [`openai-${id}`],
                serviceTiers: ['standard'],
            },
            components: [
                {
                    meter: 'inputTokens',
                    pricePerUnit: index ? '2' : '1',
                    unitQuantity: 1_000_000,
                    chargeWhen: 'positive-usage',
                },
                {
                    meter: 'outputTokens',
                    pricePerUnit: '0',
                    unitQuantity: 1_000_000,
                    chargeWhen: 'positive-usage',
                },
            ],
        })),
    },
});
const budget = {
    inputCostMicrosPerMillionTokens: 2_000_000,
    outputCostMicrosPerMillionTokens: 1_000_000,
    maxCostMicrosPerAttempt: 50_000,
    maxInputTokensPerAttempt: limits.maxInputTokens,
    maxOutputTokensPerAttempt: limits.maxOutputTokens,
};

function completion(cost?: number) {
    return Response.json({
        id: 'synthetic-request',
        object: 'chat.completion',
        created: 1,
        provider: 'openai-primary',
        choices: [
            {
                index: 0,
                finish_reason: 'stop',
                message: { role: 'assistant', content: 'OK' },
            },
        ],
        usage: {
            prompt_tokens: 12,
            completion_tokens: 5,
            total_tokens: 17,
            ...(cost === undefined ? {} : { cost }),
        },
    });
}
function nativeAgent(
    authorize = vi.fn(async () => ({ callId, dispatchedAt })),
    observe = vi.fn(async () => {}),
) {
    const model = createTextAiMastraModel({
        apiKey: 'synthetic',
        model: findTextAiModel('openrouter/openai/gpt-6-luna')!,
        providerPrice: price,
        providerBudget: budget,
        authorizeNativeCall: authorize,
        observeNativeCall: observe,
    });
    const instance = new Agent({
        id: 'native-fixture',
        name: 'Native fixture',
        instructions: 'Return OK.',
        model,
        defaultOptions: { maxSteps: 1 },
        defaultGenerateOptionsLegacy: { maxRetries: 0, maxSteps: 1 },
    });
    instance.__registerPrimitives({ logger: noopLogger });
    return { agent: instance, model, authorize, observe };
}

describe('native text provider transport observations', () => {
    it('retains sub-micro reported USD cost through the actual SDK without changing privacy controls', async () => {
        const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body));
            expect(body.provider).toMatchObject({
                allow_fallbacks: false,
                require_parameters: true,
                data_collection: 'deny',
                zdr: true,
            });
            expect(body.provider.max_price).toEqual({
                prompt: 2,
                completion: 1,
                request: 0.05,
            });
            expect(body.plugins).toBeUndefined();
            expect(body.models).toBeUndefined();
            return completion(1e-7);
        });
        vi.stubGlobal('fetch', fetcher);
        const { agent, authorize, observe } = nativeAgent();
        const result = await withTextAiProviderAttemptWitness(witness, () =>
            agent.generate('Synthetic text.', {
                modelSettings: { maxOutputTokens: 32, maxRetries: 0 },
                toolChoice: 'none',
            }),
        );
        const usage = readProviderTokenUsage(result.usage, limits, result);
        expect(usage.calls).toMatchObject([
            {
                callId,
                usage: {
                    inputTokens: 12,
                    outputTokens: 5,
                    providerCostUsd: '0.0000001',
                    requests: 1,
                },
                execution: {
                    dispatchedAt,
                    endpointId: 'openai-primary',
                    serviceTier: 'standard',
                },
            },
        ]);
        expect(providerTextExpenseMicros(price, usage)).toBe(1n);
        expect(authorize).toHaveBeenCalledWith(
            expect.objectContaining({ witness, outputTokens: 32 }),
        );
        expect(fetcher).toHaveBeenCalledOnce();
        expect(observe).toHaveBeenCalledWith({
            callId,
            usage: expect.objectContaining({
                inputTokens: 12,
                outputTokens: 5,
                providerCostUsd: '0.0000001',
            }),
            execution: {
                endpointId: 'openai-primary',
                serviceTier: 'standard',
            },
        });
    });

    it('does not dispatch without a durable native call receipt', async () => {
        const fetcher = vi.fn(async () => completion());
        vi.stubGlobal('fetch', fetcher);
        const { agent } = nativeAgent();
        await expect(
            agent.generate('Synthetic text.', {
                modelSettings: { maxOutputTokens: 32, maxRetries: 0 },
            }),
        ).rejects.toThrow();
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('does not publish successful output before its usage checkpoint completes', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => completion(1e-7)),
        );
        let release!: () => void;
        const checkpoint = new Promise<void>((resolve) => {
            release = resolve;
        });
        const observe = vi.fn(() => checkpoint);
        const { agent } = nativeAgent(undefined, observe);
        let completed = false;
        const result = withTextAiProviderAttemptWitness(witness, () =>
            agent.generate('Synthetic text.', {
                modelSettings: { maxOutputTokens: 32, maxRetries: 0 },
                toolChoice: 'none',
            }),
        ).then((value) => {
            completed = true;
            return value;
        });
        await vi.waitFor(() => expect(observe).toHaveBeenCalledOnce());
        expect(completed).toBe(false);
        release();
        await result;
        expect(completed).toBe(true);
    });

    it('keeps actual SDK expense unknown when neither endpoint nor reported cost is present', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                const body = await completion().json();
                delete body.provider;
                return Response.json(body);
            }),
        );
        const { agent } = nativeAgent();
        const result = await withTextAiProviderAttemptWitness(witness, () =>
            agent.generate('Synthetic text.', {
                modelSettings: { maxOutputTokens: 32, maxRetries: 0 },
                toolChoice: 'none',
            }),
        );
        const usage = readProviderTokenUsage(result.usage, limits, result);
        expect(usage.calls).toHaveLength(1);
        expect(usage.calls?.[0]?.execution.endpointId).toBeUndefined();
        expect(usage.calls?.[0]?.usage.providerCostUsd).toBeUndefined();
        expect(providerTextExpenseMicros(price, usage)).toBeNull();
    });

    it('captures streamed native cost while filtering raw provider frames from consumers', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(
                async () =>
                    new Response(
                        [
                            `data: ${JSON.stringify({ id: 'synthetic-stream', object: 'chat.completion.chunk', created: 1, provider: 'openai-primary', choices: [{ index: 0, delta: { role: 'assistant', content: 'OK' }, finish_reason: null }] })}\n\n`,
                            `data: ${JSON.stringify({ id: 'synthetic-stream', object: 'chat.completion.chunk', created: 1, provider: 'openai-primary', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17, cost: 0.0000011 } })}\n\n`,
                            'data: [DONE]\n\n',
                        ].join(''),
                        { headers: { 'content-type': 'text/event-stream' } },
                    ),
            ),
        );
        const { agent } = nativeAgent();
        const stream = await withTextAiProviderAttemptWitness(witness, () =>
            agent.stream('Synthetic text.', {
                modelSettings: { maxOutputTokens: 32, maxRetries: 0 },
                toolChoice: 'none',
            }),
        );
        for await (const part of stream.fullStream)
            expect(part.type).not.toBe('raw');
        const output = await stream.getFullOutput();
        const usage = readProviderTokenUsage(
            await stream.totalUsage,
            limits,
            output,
        );
        expect(usage.calls?.[0]?.usage.providerCostUsd).toBe('0.0000011');
        expect(providerTextExpenseMicros(price, usage)).toBe(2n);
    });

    it('rejects media before authorization and keeps ambiguous endpoint pricing unknown', () => {
        expect(() =>
            assertTextOnlyNativePrompt([
                {
                    role: 'user',
                    content: [{ type: 'image', image: 'synthetic' }],
                },
            ]),
        ).toThrow('media');
        expect(() =>
            assertTextOnlyNativePrompt(
                [],
                [{ type: 'provider-defined', id: 'synthetic-search' }],
            ),
        ).toThrow();
        expect(
            providerTextExpenseMicros(
                price,
                { inputTokens: 12, outputTokens: 5 },
                { dispatchedAt, serviceTier: 'standard' },
            ),
        ).toBeNull();
        expect(reportedPriceDecimal(1e-7)).toBe('0.0000001');
        expect(() => reportedPriceDecimal(-1)).toThrow();
    });

    it('preserves per-call schedules/minima when a dictionary batch accumulates usage', () => {
        const one = {
            inputTokens: 1,
            outputTokens: 1,
            calls: [
                {
                    callId,
                    usage: {
                        inputTokens: 1,
                        outputTokens: 1,
                        requests: 1 as const,
                    },
                    execution: { dispatchedAt },
                },
            ],
        };
        const two = {
            ...one,
            calls: [
                {
                    ...one.calls[0]!,
                    callId: '00000000-0000-4000-8000-000000000013',
                },
            ],
        };
        expect(sumTextAiProviderUsage(one, two)).toMatchObject({
            inputTokens: 2,
            outputTokens: 2,
            calls: [one.calls[0], two.calls[0]],
        });
    });
});
