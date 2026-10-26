import { ModelRouterLanguageModel } from '@mastra/core/llm';
import {
    currentTextAiProviderAttemptWitness,
    withTextAiProviderAttemptWitness,
} from '../../../../../src/modules/text-ai/infrastructure/ai/text-ai-provider-attempt-context';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderPriceSchema } from '@languon/contracts';
import {
    createTextAiMastraModel,
    findTextAiModel,
} from '../../../../../src/modules/text-ai/infrastructure/ai/text-ai-provider-catalog';

const route = findTextAiModel('openrouter/openai/gpt-6-luna')!;
const providerPrice = ProviderPriceSchema.parse({
    id: '00000000-0000-4000-8000-000000000009',
    version: 1,
    createdAt: '2026-10-25T00:00:00.000Z',
    createdBy: null,
    providerId: 'openrouter',
    modelId: 'openai/gpt-6-luna',
    meter: 'text-tokens',
    inputUsdPerMillionTokens: '0.17',
    outputUsdPerMillionTokens: '0.51',
    cacheReadUsdPerMillionTokens: null,
    cacheWriteUsdPerMillionTokens: null,
    usdPer1000Characters: null,
    effectiveAt: '2026-10-25T00:00:00.000Z',
    sourceReference: 'synthetic',
    sourceUrl: null,
    reason: 'Synthetic fixture price.',
});
function streamingFailure() {
    return new Response(
        'data: {"error":{"code":401,"message":"private-synthetic-stream"}}\n\ndata: [DONE]\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
    );
}
async function consumeStream<T>(stream: ReadableStream<T>): Promise<T[]> {
    const reader = stream.getReader();
    const parts: T[] = [];
    try {
        while (true) {
            const part = await reader.read();
            if (part.done) break;
            parts.push(part.value);
        }
        return parts;
    } finally {
        reader.releaseLock();
    }
}
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});
describe('request-scoped runtime provider health observation', () => {
    it('preserves successful actual SDK doGenerate results when a health observer is configured', async () => {
        const onProviderFailure = vi.fn(async () => {});
        const model = createTextAiMastraModel({
            apiKey: 'synthetic',
            model: route,
            providerPrice,
            onProviderFailure,
        });
        if (!('doGenerate' in model)) throw new Error('Expected wrapper');
        const providerFetch = vi.fn(
            async () =>
                new Response(
                    JSON.stringify({
                        id: 'synthetic',
                        object: 'chat.completion',
                        created: 1,
                        choices: [
                            {
                                index: 0,
                                finish_reason: 'stop',
                                message: {
                                    role: 'assistant',
                                    content: 'Synthetic success.',
                                },
                            },
                        ],
                        usage: {
                            prompt_tokens: 10,
                            completion_tokens: 3,
                            total_tokens: 13,
                        },
                    }),
                    { headers: { 'content-type': 'application/json' } },
                ),
        );
        vi.stubGlobal('fetch', providerFetch);
        const result = await model.doGenerate({
            prompt: [
                {
                    role: 'user',
                    content: [{ type: 'text', text: 'Synthetic.' }],
                },
            ],
            maxOutputTokens: 16,
        });
        if ('stream' in result) await consumeStream(result.stream);
        expect(providerFetch).toHaveBeenCalledOnce();
        expect(onProviderFailure).not.toHaveBeenCalled();
    });
    it('preserves a nonstream SDK result without attempting to pipe an absent stream', async () => {
        const onProviderFailure = vi.fn(async () => {});
        const success = {
            content: [{ type: 'text', text: 'Synthetic success.' }],
            usage: { inputTokens: 10, outputTokens: 3 },
            finishReason: 'stop',
        };
        vi.spyOn(
            ModelRouterLanguageModel.prototype,
            'doGenerate',
        ).mockResolvedValue(success as never);
        const model = createTextAiMastraModel({
            apiKey: 'synthetic',
            model: route,
            providerPrice,
            onProviderFailure,
        });
        if (!('doGenerate' in model)) throw new Error('Expected wrapper');
        await expect(
            model.doGenerate({
                prompt: [
                    {
                        role: 'user',
                        content: [{ type: 'text', text: 'Synthetic.' }],
                    },
                ],
                maxOutputTokens: 16,
            }),
        ).resolves.toBe(success);
        expect(onProviderFailure).not.toHaveBeenCalled();
    });

    it('retains the admitted witness when the stream is consumed outside its creation context', async () => {
        const witness = {
            attemptId: '00000000-0000-4000-8000-000000000011',
            jobId: '00000000-0000-4000-8000-000000000012',
            workerId: 'synthetic-worker',
            fencingToken: '9',
        };
        const seen: unknown[] = [];
        const model = createTextAiMastraModel({
            apiKey: 'synthetic',
            model: route,
            providerPrice,
            onProviderFailure: async () => {
                seen.push(currentTextAiProviderAttemptWitness());
            },
        });
        if (!('doStream' in model)) throw new Error('Expected wrapper');
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => streamingFailure()),
        );
        const result = await withTextAiProviderAttemptWitness(witness, () =>
            model.doStream({
                prompt: [
                    {
                        role: 'user',
                        content: [{ type: 'text', text: 'Synthetic.' }],
                    },
                ],
                maxOutputTokens: 16,
            }),
        );
        expect(currentTextAiProviderAttemptWitness()).toBeUndefined();
        await consumeStream(result.stream);
        expect(seen).toEqual([witness]);
    });
    it('does not poison shared route health when the learner stops a stream', async () => {
        const controller = new AbortController();
        const onProviderFailure = vi.fn(async () => {});
        const model = createTextAiMastraModel({
            apiKey: 'synthetic',
            model: route,
            providerPrice,
            onProviderFailure,
        });
        if (!('doStream' in model)) throw new Error('Expected wrapper');
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => streamingFailure()),
        );
        const result = await model.doStream({
            prompt: [
                {
                    role: 'user',
                    content: [{ type: 'text', text: 'Synthetic.' }],
                },
            ],
            maxOutputTokens: 16,
            abortSignal: controller.signal,
        });
        controller.abort();
        await consumeStream(result.stream).catch(() => undefined);
        expect(onProviderFailure).not.toHaveBeenCalled();
    });

    it('awaits a safe health write before exposing a streamed error part', async () => {
        let confirmHealth!: () => void;
        const recorded = new Promise<void>((resolve) => {
            confirmHealth = resolve;
        });
        const onProviderFailure = vi.fn(async (_failure: unknown) => {
            await recorded;
        });
        const model = createTextAiMastraModel({
            apiKey: 'synthetic-only',
            model: route,
            providerPrice,
            onProviderFailure,
        });
        if (!('doStream' in model))
            throw new Error('Expected production model wrapper.');
        const providerFetch = vi.fn(async () => streamingFailure());
        vi.stubGlobal('fetch', providerFetch);
        const result = await model.doStream({
            prompt: [
                {
                    role: 'user',
                    content: [{ type: 'text', text: 'Synthetic.' }],
                },
            ],
            maxOutputTokens: 16,
        });
        const parts: unknown[] = [];
        let finished = false;
        const consumed = (async () => {
            parts.push(...(await consumeStream(result.stream)));
            finished = true;
        })();
        await vi.waitFor(() =>
            expect(onProviderFailure).toHaveBeenCalledOnce(),
        );
        expect(finished).toBe(false);
        expect(onProviderFailure.mock.calls[0]?.[0]).toMatchObject({
            reason: 'authorization_failed',
            providerCode: 401,
        });
        expect(JSON.stringify(onProviderFailure.mock.calls)).not.toContain(
            'private-synthetic-stream',
        );
        confirmHealth();
        await consumed;
        expect(parts).toContainEqual(
            expect.objectContaining({ type: 'error' }),
        );
        expect(providerFetch).toHaveBeenCalledOnce();
    });
    it('fails stream consumption if the required health record cannot be persisted', async () => {
        const onProviderFailure = vi.fn(async (_failure: unknown) => {
            throw new Error('Synthetic health storage unavailable.');
        });
        const model = createTextAiMastraModel({
            apiKey: 'synthetic-only',
            model: route,
            providerPrice,
            onProviderFailure,
        });
        if (!('doStream' in model))
            throw new Error('Expected production model wrapper.');
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => streamingFailure()),
        );
        const result = await model.doStream({
            prompt: [
                {
                    role: 'user',
                    content: [{ type: 'text', text: 'Synthetic.' }],
                },
            ],
            maxOutputTokens: 16,
        });
        await expect(
            (async () => {
                await consumeStream(result.stream);
            })(),
        ).rejects.toThrow('health storage unavailable');
        expect(onProviderFailure).toHaveBeenCalledOnce();
    });
});
