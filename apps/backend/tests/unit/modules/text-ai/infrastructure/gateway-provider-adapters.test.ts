import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import type { ProviderPrice } from '@languon/contracts';
import { noopLogger } from '@mastra/core/logger';
import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    createTextAiMastraModel,
    findTextAiModel,
    textAiModelIds,
} from '../../../../../src/modules/text-ai/infrastructure/ai/text-ai-provider-catalog';
import { resolveTextAiExecutionSnapshot } from '../../../../../src/modules/text-ai/infrastructure/ai/text-ai-provider-resolver';
import { textAiModelCatalog } from '../../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import { loadTextAiProviderCredentials } from '../../../../../src/config/environment';
import { createTextAiSyntheticFlows } from '../../../../../src/infrastructure/text-ai/probe-flow-registry';

afterEach(() => vi.unstubAllGlobals());

const routes = textAiModelIds.filter(
    (id) => id.startsWith('openrouter/') || id.startsWith('evolink/'),
);

function syntheticPrice(providerId: string, modelId: string): ProviderPrice {
    return {
        id: '00000000-0000-4000-8000-000000000009',
        version: 1,
        createdAt: '2026-10-25T00:00:00.000Z',
        createdBy: null,
        providerId,
        modelId,
        meter: 'text-tokens',
        inputUsdPerMillionTokens: '0.17',
        outputUsdPerMillionTokens: '0.51',
        cacheReadUsdPerMillionTokens: null,
        cacheWriteUsdPerMillionTokens: null,
        usdPer1000Characters: null,
        effectiveAt: '2026-10-25T00:00:00.000Z',
        sourceReference: 'synthetic-fixture-only',
        sourceUrl: null,
        reason: 'Synthetic deterministic fixture.',
    };
}

function agent(routeId: string, minimumUsdPerRequest?: string) {
    const model = findTextAiModel(routeId)!;
    const instance = new Agent({
        id: `synthetic-${routeId.replaceAll('/', '-')}`,
        name: 'Synthetic route check',
        instructions: 'Return the requested synthetic JSON.',
        model: createTextAiMastraModel({
            apiKey: 'synthetic-fixture-only',
            model,
            providerPrice: {
                ...syntheticPrice(model.providerId, model.modelId),
                ...(minimumUsdPerRequest ? { minimumUsdPerRequest } : {}),
            },
        }),
        defaultGenerateOptionsLegacy: { maxRetries: 0, maxSteps: 1 },
        defaultStreamOptionsLegacy: { maxRetries: 0, maxSteps: 1 },
        defaultOptions: { maxSteps: 1 },
    });
    instance.__registerPrimitives({ logger: noopLogger });
    return instance;
}

function completion(content = '{"ok":true}') {
    return new Response(
        JSON.stringify({
            id: 'synthetic',
            object: 'chat.completion',
            created: 1,
            choices: [
                {
                    index: 0,
                    finish_reason: 'stop',
                    message: { role: 'assistant', content },
                },
            ],
            usage: {
                prompt_tokens: 12,
                completion_tokens: 5,
                total_tokens: 17,
            },
        }),
        { headers: { 'content-type': 'application/json' } },
    );
}

describe('reviewed gateway production adapters', () => {
    it.each(['pasted-terms', 'document-terms'] as const)(
        'sends an empty-only warnings array with legal wire items for %s',
        async (flowId) => {
            const schema = createTextAiSyntheticFlows()[flowId]!.schema!;
            const empty = { candidates: [], failures: [], warnings: [] };
            expect(schema.safeParse(empty).success).toBe(true);
            expect(
                schema.safeParse({ ...empty, warnings: ['unexpected'] })
                    .success,
            ).toBe(false);

            const providerFetch = vi.fn(
                async (_url: unknown, init?: RequestInit) => {
                    const body = JSON.parse(String(init?.body));
                    const warnings =
                        body.response_format.json_schema.schema.properties
                            .warnings;
                    expect(warnings.items).toEqual({ type: 'string' });
                    expect(warnings.maxItems).toBe(0);
                    return completion(JSON.stringify(empty));
                },
            );
            vi.stubGlobal('fetch', providerFetch);

            const result = await agent('openrouter/openai/gpt-6-luna').generate(
                'Synthetic empty-array schema check.',
                {
                    modelSettings: { maxOutputTokens: 128, maxRetries: 0 },
                    structuredOutput: { schema },
                    toolChoice: 'none',
                },
            );

            expect(result.object).toEqual(empty);
            expect(providerFetch).toHaveBeenCalledOnce();
        },
    );

    it('bounds request-priced gateway endpoints by the pinned reviewed minimum', async () => {
        const providerFetch = vi.fn(
            async (_url: unknown, init?: RequestInit) => {
                const body = JSON.parse(String(init?.body));
                expect(body.provider.max_price.request).toBe(0.00015);
                return completion();
            },
        );
        vi.stubGlobal('fetch', providerFetch);
        await agent('openrouter/openai/gpt-6-luna', '0.000150').generate(
            'Synthetic fixture.',
            {
                modelSettings: { maxOutputTokens: 73, maxRetries: 0 },
                structuredOutput: { schema: z.object({ ok: z.boolean() }) },
                toolChoice: 'none',
            },
        );
        expect(providerFetch).toHaveBeenCalledOnce();
    });

    it.each(routes)(
        'emits fixed wire model, schema and reduced allowance: %s',
        async (routeId) => {
            const model = findTextAiModel(routeId)!;
            const providerFetch = vi.fn(
                async (url: unknown, init?: RequestInit) => {
                    expect(String(url)).toBe(
                        `${model.apiBaseUrl}/chat/completions`,
                    );
                    expect(init?.method).toBe('POST');
                    const body = JSON.parse(String(init?.body));
                    expect(body).toMatchObject({
                        model: model.modelId,
                        max_tokens: 73,
                        response_format: {
                            type: 'json_schema',
                            json_schema: { strict: false },
                        },
                    });
                    expect(body.models).toBeUndefined();
                    expect(body.plugins).toBeUndefined();
                    if (model.providerId === 'openrouter')
                        expect(body.provider).toEqual({
                            allow_fallbacks: false,
                            require_parameters: true,
                            data_collection: 'deny',
                            zdr: true,
                            max_price: {
                                prompt: 0.17,
                                completion: 0.51,
                                request: 0,
                                image: 0,
                            },
                        });
                    return completion();
                },
            );
            vi.stubGlobal('fetch', providerFetch);
            const result = await agent(routeId).generate('Synthetic fixture.', {
                modelSettings: { maxOutputTokens: 73, maxRetries: 0 },
                structuredOutput: { schema: z.object({ ok: z.boolean() }) },
                ...(model.providerId === 'openrouter'
                    ? {
                          providerOptions: {
                              openrouter: {
                                  models: ['unapproved/model'],
                                  plugins: [{ id: 'unapproved' }],
                                  provider: {
                                      allow_fallbacks: true,
                                      data_collection: 'allow',
                                  },
                              },
                          },
                      }
                    : {}),
                toolChoice: 'none',
                tracingOptions: { hideInput: true, hideOutput: true },
            });
            expect(result.object).toEqual({ ok: true });
            expect(result.totalUsage).toMatchObject({
                inputTokens: 12,
                outputTokens: 5,
            });
            expect(providerFetch).toHaveBeenCalledTimes(1);
        },
    );

    it('enforces the same gateway restrictions on a streamed request', async () => {
        const providerFetch = vi.fn(
            async (_url: unknown, init?: RequestInit) => {
                const body = JSON.parse(String(init?.body));
                expect(body).toMatchObject({
                    model: 'openai/gpt-6-luna',
                    stream: true,
                    max_tokens: 21,
                    provider: {
                        allow_fallbacks: false,
                        require_parameters: true,
                        data_collection: 'deny',
                        zdr: true,
                    },
                });
                const chunks = [
                    {
                        id: 'synthetic',
                        object: 'chat.completion.chunk',
                        created: 1,
                        choices: [
                            {
                                index: 0,
                                delta: { role: 'assistant', content: 'Hello' },
                                finish_reason: null,
                            },
                        ],
                    },
                    {
                        id: 'synthetic',
                        object: 'chat.completion.chunk',
                        created: 1,
                        choices: [
                            { index: 0, delta: {}, finish_reason: 'stop' },
                        ],
                        usage: {
                            prompt_tokens: 12,
                            completion_tokens: 1,
                            total_tokens: 13,
                        },
                    },
                ];
                return new Response(
                    chunks
                        .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
                        .join('') + 'data: [DONE]\n\n',
                    { headers: { 'content-type': 'text/event-stream' } },
                );
            },
        );
        vi.stubGlobal('fetch', providerFetch);
        const result = await agent('openrouter/openai/gpt-6-luna').stream(
            'Synthetic.',
            { modelSettings: { maxRetries: 0, maxOutputTokens: 21 } },
        );
        const text: string[] = [];
        for await (const part of result.textStream) text.push(part);
        expect(text.join('')).toBe('Hello');
        expect(await result.totalUsage).toMatchObject({
            inputTokens: 12,
            outputTokens: 1,
        });
        expect(providerFetch).toHaveBeenCalledTimes(1);
    });

    it('forwards cancellation without starting another gateway request', async () => {
        const controller = new AbortController();
        let transportSignal: AbortSignal | undefined;
        const providerFetch = vi.fn(
            async (_url: unknown, init?: RequestInit) => {
                transportSignal = init?.signal ?? undefined;
                return await new Promise<Response>((_resolve, reject) => {
                    transportSignal?.addEventListener(
                        'abort',
                        () => reject(transportSignal?.reason),
                        { once: true },
                    );
                });
            },
        );
        vi.stubGlobal('fetch', providerFetch);
        const result = agent('openrouter/openai/gpt-6-luna').generate(
            'Synthetic.',
            {
                abortSignal: controller.signal,
                modelSettings: { maxRetries: 0, maxOutputTokens: 16 },
            },
        );
        // Mastra represents an aborted generation as a tripwire result; owning
        // production providers recheck their signal before publishing it.
        await vi.waitFor(() => expect(providerFetch).toHaveBeenCalledTimes(1));
        controller.abort(new Error('Synthetic cancellation.'));
        expect((await result).tripwire).toBeDefined();
        expect(transportSignal?.aborted).toBe(true);
        expect(providerFetch).toHaveBeenCalledTimes(1);
    });

    it('preserves synthetic read-only tool calls and gateway controls in the real SDK', async () => {
        const execute = vi.fn(async () => ({ meaning: 'A written work.' }));
        const model = findTextAiModel('openrouter/openai/gpt-6-luna')!;
        const providerFetch = vi.fn(
            async (_url: unknown, init?: RequestInit) => {
                const body = JSON.parse(String(init?.body));
                expect(body.tools).toMatchObject([
                    {
                        type: 'function',
                        function: {
                            name: 'syntheticDictionary',
                            parameters: {
                                type: 'object',
                                properties: { term: { type: 'string' } },
                            },
                        },
                    },
                ]);
                expect(body.provider).toMatchObject({
                    allow_fallbacks: false,
                    require_parameters: true,
                    data_collection: 'deny',
                    zdr: true,
                });
                expect(body.max_tokens).toBe(37);
                return new Response(
                    JSON.stringify({
                        id: 'synthetic',
                        object: 'chat.completion',
                        created: 1,
                        choices: [
                            {
                                index: 0,
                                finish_reason: 'tool_calls',
                                message: {
                                    role: 'assistant',
                                    content: null,
                                    tool_calls: [
                                        {
                                            id: 'synthetic-call',
                                            type: 'function',
                                            function: {
                                                name: 'syntheticDictionary',
                                                arguments: '{"term":"book"}',
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                        usage: {
                            prompt_tokens: 12,
                            completion_tokens: 6,
                            total_tokens: 18,
                        },
                    }),
                    { headers: { 'content-type': 'application/json' } },
                );
            },
        );
        vi.stubGlobal('fetch', providerFetch);
        const instance = new Agent({
            id: 'synthetic-tool-fixture',
            name: 'Synthetic tool fixture',
            instructions:
                'Look up the synthetic term with the read-only fixture tool.',
            model: createTextAiMastraModel({
                apiKey: 'synthetic-fixture-only',
                model,
                providerPrice: syntheticPrice(model.providerId, model.modelId),
            }),
            tools: {
                syntheticDictionary: createTool({
                    id: 'syntheticDictionary',
                    description: 'Read-only synthetic dictionary fixture.',
                    inputSchema: z.object({ term: z.string() }),
                    outputSchema: z.object({ meaning: z.string() }),
                    execute,
                }),
            },
            defaultOptions: { maxSteps: 1 },
        });
        instance.__registerPrimitives({ logger: noopLogger });
        const result = await instance.generate('Synthetic term: book.', {
            maxSteps: 1,
            modelSettings: { maxRetries: 0, maxOutputTokens: 37 },
        });
        expect(result.toolCalls).toHaveLength(1);
        expect(execute).toHaveBeenCalledOnce();
        expect(providerFetch).toHaveBeenCalledOnce();
    });

    it('retains an unknown measurement when the provider omits usage', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(
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
                                        content: 'Hello',
                                    },
                                },
                            ],
                        }),
                        { headers: { 'content-type': 'application/json' } },
                    ),
            ),
        );
        const result = await agent('openrouter/openai/gpt-6-luna').generate(
            'Synthetic.',
            { modelSettings: { maxRetries: 0, maxOutputTokens: 21 } },
        );
        expect(result.totalUsage?.inputTokens).toBeUndefined();
        expect(result.totalUsage?.outputTokens).toBeUndefined();
    });

    it('rejects a HTTP 200 error envelope without pretending it is successful output', async () => {
        const providerFetch = vi.fn(
            async () =>
                new Response(
                    JSON.stringify({
                        code: 410,
                        error: { code: 410, message: 'Synthetic retired' },
                    }),
                    { headers: { 'content-type': 'application/json' } },
                ),
        );
        vi.stubGlobal('fetch', providerFetch);
        await expect(
            agent('openrouter/openai/gpt-6-luna').generate('Synthetic.', {
                modelSettings: { maxRetries: 0, maxOutputTokens: 21 },
            }),
        ).rejects.toThrow();
        expect(providerFetch).toHaveBeenCalledTimes(1);
    });

    it.each([401, 402, 429, 503])(
        'never SDK-retries rejection %s',
        async (status) => {
            const providerFetch = vi.fn(
                async () =>
                    new Response(
                        JSON.stringify({
                            error: {
                                message: 'Synthetic unavailable',
                                type: 'fixture',
                                code: status,
                            },
                        }),
                        {
                            status,
                            headers: { 'content-type': 'application/json' },
                        },
                    ),
            );
            vi.stubGlobal('fetch', providerFetch);
            await expect(
                agent('openrouter/openai/gpt-6-luna').generate('Synthetic.', {
                    modelSettings: { maxRetries: 0, maxOutputTokens: 16 },
                }),
            ).rejects.toThrow();
            expect(providerFetch).toHaveBeenCalledTimes(1);
        },
    );

    it.each(routes)(
        'keeps local strict output validation for non-strict gateway schema mode: %s',
        async (routeId) => {
            vi.stubGlobal(
                'fetch',
                vi.fn(async () => completion('{"unrequested":true}')),
            );
            await expect(
                agent(routeId).generate('Synthetic.', {
                    modelSettings: { maxRetries: 0, maxOutputTokens: 21 },
                    structuredOutput: {
                        schema: z.object({ ok: z.boolean() }).strict(),
                    },
                }),
            ).rejects.toThrow();
        },
    );

    it('rejects a gateway without pinned matching provider-price evidence before HTTP', () => {
        const model = findTextAiModel('openrouter/openai/gpt-6-luna')!;
        expect(() =>
            createTextAiMastraModel({ apiKey: 'synthetic', model }),
        ).toThrow();
        expect(() =>
            createTextAiMastraModel({
                apiKey: 'synthetic',
                model,
                providerPrice: syntheticPrice('openrouter', 'unapproved/model'),
            }),
        ).toThrow('does not match');
    });

    it('retains retired Kie identity but rejects its dispatch snapshot', () => {
        const model = textAiModelCatalog.find(
            (model) => model.providerId === 'kie',
        )!;
        expect(model.retired).toBe(true);
        expect(() =>
            resolveTextAiExecutionSnapshot(
                {
                    ...model,
                    modelId: model.id,
                    enabledModelIds: [model.id],
                    supportedFormats: [...model.supportedFormats],
                },
                model.aggregateBudget,
            ),
        ).toThrow('unsupported');
    });

    it('exposes optional credentials quietly and reports only names for invalid credentials', () => {
        const diagnostics = { warn: vi.fn(), error: vi.fn() };
        expect(loadTextAiProviderCredentials({}, diagnostics)).toEqual({});
        expect(diagnostics.warn).not.toHaveBeenCalled();
        expect(
            loadTextAiProviderCredentials(
                {
                    EVOLINK_API_KEY: 'synthetic-evolink',
                    OPENROUTER_API_KEY: 'synthetic-openrouter',
                },
                diagnostics,
            ),
        ).toEqual({
            EVOLINK_API_KEY: 'synthetic-evolink',
            OPENROUTER_API_KEY: 'synthetic-openrouter',
        });
        expect(() =>
            loadTextAiProviderCredentials(
                { EVOLINK_API_KEY: ' ' },
                diagnostics,
            ),
        ).toThrow();
        expect(diagnostics.error).toHaveBeenCalledWith(
            expect.stringContaining('EVOLINK_API_KEY'),
        );
    });
});

describe('production sentence gateway rejection metadata', () => {
    it.each([
        [429, 'rejected'],
        [403, 'ambiguous'],
        [503, 'ambiguous'],
    ] as const)(
        'preserves safe execution outcome for HTTP %s',
        async (status, executionOutcome) => {
            const { createSentenceAiProvider } =
                await import('../../../../../src/modules/learning/infrastructure/ai/sentence-ai-provider');
            const model = textAiModelCatalog.find(
                (model) =>
                    model.providerId === 'openrouter' &&
                    model.id === 'openai/gpt-6-luna',
            )!;
            const providerFetch = vi.fn(
                async () =>
                    new Response(
                        JSON.stringify({
                            error: {
                                message: 'Synthetic provider rejection',
                                code: status,
                            },
                        }),
                        {
                            status,
                            headers: { 'content-type': 'application/json' },
                        },
                    ),
            );
            vi.stubGlobal('fetch', providerFetch);
            await expect(
                createSentenceAiProvider({
                    runtime: { currentFingerprint: () => 'synthetic' },
                    credentials: {
                        OPENROUTER_API_KEY: 'synthetic-fixture-only',
                    },
                }).check({
                    execution: {
                        ...model,
                        modelId: model.id,
                        enabledModelIds: [model.id],
                        supportedFormats: ['sentence-check:v1'],
                        routingAuthority: {
                            revisionId: 'synthetic-revision',
                            flowId: 'sentence-check',
                            tariffPublished: true,
                            automaticReattemptLimit: 1,
                            candidates: [
                                {
                                    routeId: `${model.providerId}/${model.id}`,
                                    fingerprint: 'synthetic',
                                    snapshot: {
                                        ...model,
                                        modelId: model.id,
                                        enabledModelIds: [model.id],
                                        supportedFormats: ['sentence-check:v1'],
                                    },
                                    providerPrice: syntheticPrice(
                                        model.providerId,
                                        model.id,
                                    ),
                                },
                            ],
                        },
                    },
                    budget: model.aggregateBudget,
                    idempotencyKey: 'synthetic-check',
                    signal: new AbortController().signal,
                    input: {
                        schemaVersion: 1,
                        exerciseId: 'synthetic-exercise',
                        sourceText: 'I read a book.',
                        referenceTranslation: 'Leo un libro.',
                        sourceLanguage: 'en',
                        targetLanguage: 'es',
                        answer: 'Leo un libro.',
                        explanationLanguage: 'en',
                        revealedHintIds: [],
                        targets: [
                            {
                                entryId: '00000000-0000-4000-8000-000000000001',
                                learningVersion: 1,
                                sourceText: 'book',
                                targetText: 'libro',
                            },
                        ],
                    },
                }),
            ).rejects.toMatchObject({ executionOutcome });
            expect(providerFetch).toHaveBeenCalledTimes(1);
        },
    );
});
