import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { ProviderPriceTarget } from '../../application/provider-price-source';
import { scalePublishedPrice } from './exact-price';
import { createProviderPriceSources } from './provider-price-sources';
import { readPricingJson } from './pricing-http';

const now = () => new Date('2026-10-28T12:00:00.000Z');
const fixtureText = (name: string) =>
    readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const fixtureJson = (name: string): unknown => JSON.parse(fixtureText(name));
const target: ProviderPriceTarget = {
    providerId: 'openrouter',
    modelId: 'future-vendor/new-model',
    meter: 'text-tokens',
};
const flat = {
    prompt: '0.000000065',
    completion: '0.00000026',
    input_cache_read: '0.00000001',
    input_cache_write: '0.000000125',
};
function openRouterFixture(
    options: {
        modelPricing?: Record<string, unknown>;
        endpointPricing?: Record<string, unknown>[];
        modelTarget?: ProviderPriceTarget;
        output?: string[];
    } = {},
) {
    const selected = options.modelTarget ?? target;
    const pricing = options.modelPricing ?? flat;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
        if (String(url).includes('?'))
            return Response.json({
                data: [
                    {
                        id: selected.modelId,
                        architecture: {
                            input_modalities: ['text'],
                            output_modalities: options.output ?? ['text'],
                        },
                        pricing,
                    },
                ],
            });
        return Response.json({
            data: {
                id: selected.modelId,
                endpoints: (options.endpointPricing ?? [pricing]).map(
                    (value, index) => ({
                        pricing: value,
                        tag: `provider-${index}`,
                        provider_name: `Provider ${index}`,
                        service_tier: null,
                    }),
                ),
            },
        });
    });
    return {
        source: createProviderPriceSources({ fetch: fetcher, now })[0]!,
        fetcher,
    };
}
function officialFixture() {
    const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(async (input, init) => {
            const url = new URL(String(input));
            if (url.origin === 'https://api-docs.deepseek.com')
                return new Response(fixtureText('deepseek-prices.html'));
            if (url.origin === 'https://api.evolink.ai')
                return Response.json(fixtureJson('evolink-luna.json'));
            if (url.origin === 'https://api.kie.ai') {
                expect(init?.method).toBe('POST');
                return Response.json(fixtureJson('kie-prices.json'));
            }
            if (url.origin === 'https://kie.ai')
                return new Response(
                    fixtureText(
                        url.pathname.includes('gemini')
                            ? 'kie-gemini-product.html'
                            : 'kie-eleven-product.html',
                    ),
                );
            if (url.pathname === '/api/v1/models')
                return Response.json(fixtureJson('openrouter-models.json'));
            const name = url.pathname.includes('gpt-6-luna')
                ? 'luna'
                : url.pathname.includes('qwen3.5')
                  ? 'qwen'
                  : url.pathname.includes('gemini-3.1')
                    ? 'gemini'
                    : 'eleven';
            return Response.json(
                fixtureJson(`openrouter-${name}-endpoints.json`),
            );
        });
    return {
        sources: createProviderPriceSources({ fetch: fetcher, now }),
        fetcher,
    };
}
const catalog: ProviderPriceTarget[] = [
    { providerId: 'deepseek', modelId: 'deepseek-flash', meter: 'text-tokens' },
    { providerId: 'evolink', modelId: 'gpt-6-luna', meter: 'text-tokens' },
    { providerId: 'kie', modelId: 'gemini-2.5-pro', meter: 'text-tokens' },
    {
        providerId: 'kie',
        modelId: 'elevenlabs/text-to-speech-turbo-2-5',
        meter: 'speech-characters',
    },
    {
        providerId: 'kie',
        modelId: 'google/gemini-3-8-flash-lite-tts',
        meter: 'speech-tokens',
    },
    {
        providerId: 'openrouter',
        modelId: 'openai/gpt-6-luna',
        meter: 'text-tokens',
    },
    {
        providerId: 'openrouter',
        modelId: 'qwen/qwen3.5-flash-02-23',
        meter: 'text-tokens',
    },
    {
        providerId: 'openrouter',
        modelId: 'google/gemini-3.1-flash-lite',
        meter: 'text-tokens',
    },
    {
        providerId: 'openrouter',
        modelId: 'elevenlabs/eleven-v4-turbo',
        meter: 'speech-characters',
    },
];

describe('complete official pricing source coverage', () => {
    it('registers every real provider and verifies eight current models plus the retired identity diagnostic', async () => {
        const { sources } = officialFixture();
        expect(sources.map((source) => source.providerId).sort()).toEqual([
            'deepseek',
            'evolink',
            'kie',
            'openai',
            'openrouter',
        ]);
        const results = (
            await Promise.all(
                sources.map((source) =>
                    source.fetchPrices(
                        catalog.filter(
                            (item) => item.providerId === source.providerId,
                        ),
                    ),
                ),
            )
        ).flat();
        expect(results).toHaveLength(9);
        expect(
            results.filter((item) => item.status === 'available'),
        ).toHaveLength(8);
        expect(
            results.find((item) => item.target.modelId === 'gemini-2.5-pro'),
        ).toMatchObject({ status: 'model-not-found' });
        expect(results.some((item) => item.status === 'unsupported')).toBe(
            false,
        );
        for (const item of results)
            if (item.status === 'available') {
                expect(item.price.nativeRules?.version).toBe(1);
                for (const field of [
                    'inputUsdPerMillionTokens',
                    'outputUsdPerMillionTokens',
                    'cacheReadUsdPerMillionTokens',
                    'cacheWriteUsdPerMillionTokens',
                    'usdPer1000Characters',
                    'minimumUsdPerRequest',
                ] as const)
                    expect(item.price[field]).toBeNull();
            }
    });
    it('preserves DeepSeek model columns and complete peak/offpeak windows with holiday provenance', async () => {
        const { sources } = officialFixture();
        const [result] = await sources
            .find((source) => source.providerId === 'deepseek')!
            .fetchPrices([catalog[0]!]);
        expect(result?.status).toBe('available');
        if (result?.status !== 'available') return;
        const rules = result.price.nativeRules!;
        expect(rules.validUntil).toBe('2026-11-29T00:00:00.000Z');
        expect(rules.variants[0]?.components).toContainEqual({
            meter: 'uncachedInputTokens',
            pricePerUnit: '0.3',
            unitQuantity: 1_000_000,
            chargeWhen: 'positive-usage',
        });
        expect(rules.variants[1]?.components).toContainEqual({
            meter: 'outputTokens',
            pricePerUnit: '0.6',
            unitQuantity: 1_000_000,
            chargeWhen: 'positive-usage',
        });
        expect(rules.variants[0]?.applies.dispatchWindows).toContainEqual({
            from: '2026-10-28T01:00:00.000Z',
            until: '2026-10-28T04:00:00.000Z',
        });
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValue(
                new Response(fixtureText('deepseek-prices.html')),
            );
        const source = createProviderPriceSources({
            fetch: fetcher,
            now: () => new Date('2026-10-01T12:00:00Z'),
        }).find((item) => item.providerId === 'deepseek')!;
        const [holiday] = await source.fetchPrices([catalog[0]!]);
        if (holiday?.status !== 'available')
            throw new Error('Expected holiday pricing.');
        expect(
            holiday.price.nativeRules?.variants
                .find((item) => item.id === 'weekday-peak')
                ?.applies.dispatchWindows?.some((window) =>
                    window.from.startsWith('2026-10-01'),
                ),
        ).toBe(false);
    });
    it('does not invent holidays outside the reviewed calendar year', async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValue(
                new Response(fixtureText('deepseek-prices.html')),
            );
        const source = createProviderPriceSources({
            fetch: fetcher,
            now: () => new Date('2027-01-01T00:00:00Z'),
        }).find((item) => item.providerId === 'deepseek')!;
        expect(await source.fetchPrices([catalog[0]!])).toMatchObject([
            { status: 'source-changed' },
        ]);
    });
    it('retains EvoLink exact UC conversion, per-component minima/ceil and strictly-greater context tiers', async () => {
        const { sources } = officialFixture();
        const [result] = await sources
            .find((item) => item.providerId === 'evolink')!
            .fetchPrices([catalog[1]!]);
        if (result?.status !== 'available')
            throw new Error('Expected native EvoLink pricing.');
        const rules = result.price.nativeRules!;
        expect(rules.currency).toEqual({
            code: 'UC',
            usdNumerator: '1',
            unitDenominator: '680000',
        });
        expect(rules.variants).toHaveLength(2);
        expect(rules.variants[0]?.applies.inputTokens).toEqual({
            minInclusive: 0,
            maxExclusive: 272001,
        });
        expect(rules.variants[1]?.applies.inputTokens).toEqual({
            minInclusive: 272001,
        });
        expect(rules.variants[0]?.components).toContainEqual({
            meter: 'outputTokens',
            pricePerUnit: '306',
            unitQuantity: 1000,
            minimum: '100',
            chargeWhen: 'request',
            rounding: { quantum: '1', mode: 'ceil' },
        });
        expect(
            rules.variants[1]?.components.find(
                (item) => item.meter === 'outputTokens',
            )?.pricePerUnit,
        ).toBe('459');
    });
    it('rejects unknown EvoLink expressions or inconsistent native FX instead of executing them', async () => {
        for (const change of [
            (data: Record<string, unknown>) => {
                (data.meta as Record<string, unknown>).exchange_rate_version =
                    'unknown';
            },
            (data: Record<string, unknown>) => {
                (
                    data.model as { components: Array<Record<string, unknown>> }
                ).components[0]!.quantity_rule = {
                    op: 'eval',
                    code: 'untrusted',
                };
            },
        ]) {
            const raw = fixtureJson('evolink-luna.json') as Record<
                string,
                unknown
            >;
            change(raw);
            const fetcher = vi
                .fn<typeof fetch>()
                .mockResolvedValue(Response.json(raw));
            const source = createProviderPriceSources({
                fetch: fetcher,
                now,
            }).find((item) => item.providerId === 'evolink')!;
            expect(await source.fetchPrices([catalog[1]!])).toMatchObject([
                { status: 'source-changed' },
            ]);
        }
    });
    it('rejects expired official EvoLink metadata without assigning its cache TTL to the tariff', async () => {
        const raw = fixtureJson('evolink-luna.json') as {
            meta: { fresh_until: string };
        };
        raw.meta.fresh_until = '2026-10-28T11:59:59.000Z';
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValue(Response.json(raw));
        const source = createProviderPriceSources({ fetch: fetcher, now }).find(
            (item) => item.providerId === 'evolink',
        )!;
        expect(await source.fetchPrices([catalog[1]!])).toMatchObject([
            { status: 'source-changed' },
        ]);
        expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
            'Cache-Control': 'no-cache',
        });
    });
    it('verifies Kie native audio-token prices and reported-credit conversion without character guesses', async () => {
        const { sources } = officialFixture();
        const [result] = await sources
            .find((item) => item.providerId === 'kie')!
            .fetchPrices([catalog[4]!]);
        if (result?.status !== 'available')
            throw new Error('Expected native Kie pricing.');
        expect(result.price.meter).toBe('speech-tokens');
        expect(result.price.nativeRules).toMatchObject({
            reportedCreditUsdPerCredit: '0.005',
            validUntil: '2026-12-31T00:00:00.000Z',
            variants: [
                {
                    components: [
                        {
                            meter: 'inputTokens',
                            pricePerUnit: '0.35',
                            unitQuantity: 1_000_000,
                        },
                        {
                            meter: 'audioOutputTokens',
                            pricePerUnit: '4.2',
                            unitQuantity: 1_000_000,
                        },
                    ],
                },
            ],
        });
    });
    it('never copies replacement-model pricing from a retired product URL that returns HTTP200', async () => {
        const rows = {
            code: 200,
            data: {
                current: 1,
                pages: 1,
                total: 1,
                records: [
                    {
                        modelDescription: 'Gemini 2.5 Pro, Input',
                        creditPrice: '160',
                        creditUnit: 'per million tokens',
                        usdPrice: '0.8',
                        anchor: 'https://kie.ai/gemini-2.5-pro',
                    },
                ],
            },
        };
        const fetcher = vi
            .fn<typeof fetch>()
            .mockImplementation(async (url) =>
                String(url).includes('model-pricing')
                    ? Response.json(rows)
                    : new Response(
                          '<script id="__NEXT_DATA__">{"props":{"pageProps":{"pageData":{"groupData":[{"model":"gemini-4-argon","pricingDesc":"Input $0.8"}]}}}}</script>',
                      ),
            );
        const source = createProviderPriceSources({ fetch: fetcher, now }).find(
            (item) => item.providerId === 'kie',
        )!;
        expect(await source.fetchPrices([catalog[2]!])).toMatchObject([
            { status: 'model-not-found' },
        ]);
    });
    it('refuses incomplete Kie pagination instead of publishing partial/ambiguous data', async () => {
        const raw = fixtureJson('kie-prices.json') as {
            data: { total: number };
        };
        raw.data.total++;
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValue(Response.json(raw));
        const source = createProviderPriceSources({ fetch: fetcher, now }).find(
            (item) => item.providerId === 'kie',
        )!;
        expect(await source.fetchPrices([catalog[3]!])).toMatchObject([
            { status: 'unavailable' },
        ]);
    });
});

describe('OpenRouter exact native discovery', () => {
    it('discovers future exact model IDs and keeps the published per-token decimal precision', async () => {
        const { source, fetcher } = openRouterFixture();
        const [result] = await source.fetchPrices([target]);
        expect(result).toMatchObject({
            status: 'available',
            price: {
                nativeRules: {
                    variants: [
                        {
                            components: [
                                {
                                    meter: 'uncachedInputTokens',
                                    pricePerUnit: flat.prompt,
                                    unitQuantity: 1,
                                },
                                {
                                    meter: 'outputTokens',
                                    pricePerUnit: flat.completion,
                                    unitQuantity: 1,
                                },
                                {
                                    meter: 'cacheReadTokens',
                                    pricePerUnit: flat.input_cache_read,
                                    unitQuantity: 1,
                                },
                                {
                                    meter: 'cacheWriteTokens',
                                    pricePerUnit: flat.input_cache_write,
                                    unitQuantity: 1,
                                },
                            ],
                        },
                    ],
                },
            },
        });
        expect(fetcher).toHaveBeenCalledTimes(2);
        for (const [, init] of fetcher.mock.calls)
            expect(init).toMatchObject({
                method: 'GET',
                redirect: 'error',
                headers: { Accept: 'application/json' },
            });
    });
    it('retains endpoint variation and high-precision cache rates rather than flattening them', async () => {
        const { sources } = officialFixture();
        const [result] = await sources[0]!.fetchPrices([catalog[7]!]);
        if (result?.status !== 'available')
            throw new Error('Expected conditional Gemini prices.');
        const standard = result.price.nativeRules!.variants.filter((item) =>
            item.applies.serviceTiers?.includes('standard'),
        );
        expect(standard.length).toBeGreaterThan(1);
        expect(
            standard
                .flatMap((item) => item.components)
                .some(
                    (item) => item.pricePerUnit === '0.0000000833333333333333',
                ),
        ).toBe(true);
        expect(
            new Set(
                standard.flatMap((item) =>
                    item.components
                        .filter(
                            (component) =>
                                component.meter === 'uncachedInputTokens',
                        )
                        .map((component) => component.pricePerUnit),
                ),
            ).size,
        ).toBeGreaterThan(1);
    });
    it('resolves strictly-greater context tiers and per-key override inheritance', async () => {
        const pricing = {
            ...flat,
            overrides: [
                { min_prompt_tokens: 272000, prompt: '0.0000002' },
                { min_prompt_tokens: 272000, completion: '0.00000075' },
            ],
        };
        const { source } = openRouterFixture({ modelPricing: pricing });
        const [result] = await source.fetchPrices([target]);
        if (result?.status !== 'available')
            throw new Error('Expected context price variants.');
        expect(
            result.price.nativeRules!.variants[0]?.applies.inputTokens,
        ).toEqual({ minInclusive: 0, maxExclusive: 272001 });
        expect(
            result.price.nativeRules!.variants[1]?.components,
        ).toContainEqual({
            meter: 'uncachedInputTokens',
            pricePerUnit: '0.0000002',
            unitQuantity: 1,
            chargeWhen: 'positive-usage',
        });
        expect(
            result.price.nativeRules!.variants[1]?.components,
        ).toContainEqual({
            meter: 'outputTokens',
            pricePerUnit: '0.00000075',
            unitQuantity: 1,
            chargeWhen: 'positive-usage',
        });
    });
    it('supports explicit UTC override windows with bounded validity and no gaps', async () => {
        const pricing = {
            ...flat,
            overrides: [
                {
                    utc_start: 2300,
                    utc_end: 100,
                    utc_days: ['wednesday'],
                    prompt: '0.0000001',
                },
            ],
        };
        const { source } = openRouterFixture({ modelPricing: pricing });
        const [result] = await source.fetchPrices([target]);
        if (result?.status !== 'available')
            throw new Error('Expected schedule price variants.');
        expect(result.price.nativeRules!.validUntil).toBe(
            '2026-11-29T00:00:00.000Z',
        );
        expect(result.price.nativeRules!.variants).toHaveLength(2);
        const windows = result.price
            .nativeRules!.variants.flatMap(
                (item) => item.applies.dispatchWindows!,
            )
            .sort((a, b) => a.from.localeCompare(b.from));
        expect(windows[0]?.from).toBe('2026-10-28T00:00:00.000Z');
        for (let index = 1; index < windows.length; index++)
            expect(windows[index]?.from).toBe(windows[index - 1]?.until);
    });
    it('bounds the cross-product of context and scheduled price conditions', async () => {
        const changes = Array.from({ length: 32 }, (_, index) => ({
            min_prompt_tokens: index,
            utc_start: Math.floor(index / 2) * 100 + (index % 2) * 30,
            utc_end: 2359,
            prompt: '0.0000001',
        }));
        const { source } = openRouterFixture({
            modelPricing: { ...flat, overrides: changes },
        });
        expect(await source.fetchPrices([target])).toMatchObject([
            { status: 'source-changed' },
        ]);
    });
    it('keeps absent cache meters absent and preserves actual zero prices', async () => {
        const { source } = openRouterFixture({
            modelPricing: { prompt: '0', completion: '0' },
        });
        const [result] = await source.fetchPrices([target]);
        expect(result).toMatchObject({
            status: 'available',
            price: {
                nativeRules: {
                    variants: [
                        {
                            components: [
                                { meter: 'inputTokens', pricePerUnit: '0' },
                                { meter: 'outputTokens', pricePerUnit: '0' },
                            ],
                        },
                    ],
                },
            },
        });
    });
    it.each([
        { prompt: '-1', completion: '0' },
        { prompt: '1e-6', completion: '0' },
        { completion: '0' },
        { ...flat, unknown_future_charge: '1' },
        { ...flat, discount: 0.2 },
        { ...flat, input_cache_write_1h: '0.1' },
        { ...flat, overrides: [{ start_time: '00:00', prompt: '0.1' }] },
    ])('rejects unreviewed billing semantics: %j', async (pricing) => {
        const { source } = openRouterFixture({ modelPricing: pricing });
        expect(await source.fetchPrices([target])).toMatchObject([
            { status: 'source-changed' },
        ]);
    });
    it('includes nonzero per-request charges instead of silently discarding them', async () => {
        const { source } = openRouterFixture({
            modelPricing: { ...flat, request: '0.01' },
        });
        const [result] = await source.fetchPrices([target]);
        if (result?.status !== 'available')
            throw new Error('Expected request component.');
        expect(
            result.price.nativeRules!.variants[0]?.components,
        ).toContainEqual({
            meter: 'requests',
            pricePerUnit: '0.01',
            unitQuantity: 1,
            chargeWhen: 'request',
        });
    });
    for (const level of ['catalog', 'endpoint'] as const)
        it.each(['web_search', 'image', 'audio', 'input_audio_cache'])(
            `validates optional %s prices at ${level}, while scoping text-only execution`,
            async (field) => {
                for (const value of ['-1', 'bad', 0, {}]) {
                    const extra = { ...flat, [field]: value };
                    const { source } = openRouterFixture({
                        modelPricing: level === 'catalog' ? extra : flat,
                        endpointPricing: [level === 'endpoint' ? extra : flat],
                    });
                    expect(await source.fetchPrices([target])).toMatchObject([
                        { status: 'source-changed' },
                    ]);
                }
                const extra = { ...flat, [field]: '3' };
                const { source } = openRouterFixture({
                    modelPricing: level === 'catalog' ? extra : flat,
                    endpointPricing: [level === 'endpoint' ? extra : flat],
                });
                expect(await source.fetchPrices([target])).toMatchObject([
                    { status: 'available' },
                ]);
            },
        );
    it('requires exact model/provider identity and documented speech billing units', async () => {
        const { source } = openRouterFixture();
        expect(
            await source.fetchPrices([
                { ...target, modelId: 'missing/model' },
                { ...target, providerId: 'other' },
            ]),
        ).toMatchObject([
            { status: 'model-not-found' },
            { status: 'model-not-found' },
        ]);
        const speech = {
            ...target,
            modelId: 'elevenlabs/future-speech',
            meter: 'speech-characters' as const,
        };
        const { source: speechSource } = openRouterFixture({
            modelTarget: speech,
            output: ['speech'],
            modelPricing: { prompt: '0.00004', completion: '0' },
        });
        expect(await speechSource.fetchPrices([speech])).toMatchObject([
            {
                status: 'available',
                price: {
                    nativeRules: {
                        variants: [
                            {
                                components: [
                                    {
                                        meter: 'characters',
                                        pricePerUnit: '0.00004',
                                    },
                                ],
                            },
                        ],
                    },
                },
            },
        ]);
        const { source: invalid } = openRouterFixture({
            modelTarget: speech,
            output: ['speech'],
            modelPricing: { prompt: '0', completion: '0.01' },
        });
        expect(await invalid.fetchPrices([speech])).toMatchObject([
            { status: 'source-changed' },
        ]);
    });
    it('returns sanitized failures and respects cancellation', async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockRejectedValue(new Error('secret upstream detail'));
        const source = createProviderPriceSources({ fetch: fetcher, now })[0]!;
        expect(
            JSON.stringify(await source.fetchPrices([target])),
        ).not.toContain('secret');
        const { source: cancelled, fetcher: calls } = openRouterFixture();
        const controller = new AbortController();
        controller.abort();
        expect(
            await cancelled.fetchPrices([target], controller.signal),
        ).toMatchObject([{ status: 'unavailable' }]);
        expect(calls).not.toHaveBeenCalled();
    });
});

describe('pricing HTTP boundary', () => {
    it('rejects nonofficial sources and POST destinations before sending requests', async () => {
        const fetcher = vi.fn<typeof fetch>();
        await expect(
            readPricingJson(fetcher, new URL('http://localhost/private')),
        ).rejects.toThrow();
        await expect(
            readPricingJson(
                fetcher,
                new URL('https://kie.ai/admin'),
                undefined,
                {
                    pageNum: 1,
                    pageSize: 100,
                    modelDescription: '',
                    interfaceType: '',
                },
            ),
        ).rejects.toThrow();
        expect(fetcher).not.toHaveBeenCalled();
    });
    it('rejects advertised oversized bodies, streamed overflows and HTTP failures', async () => {
        const url = new URL('https://openrouter.ai/api/v1/models');
        for (const response of [
            new Response('{}', { headers: { 'content-length': '2097153' } }),
            new Response(new Uint8Array(2097153)),
        ]) {
            const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
            await expect(readPricingJson(fetcher, url)).rejects.toThrow(
                'too large',
            );
        }
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValue(
                new Response('server diagnostic', { status: 500 }),
            );
        await expect(readPricingJson(fetcher, url)).rejects.toThrow(
            'unavailable',
        );
    });
});

describe('legacy exact rate conversion', () => {
    it('does not change six-decimal legacy money precision or round unsupported legacy rates', () => {
        expect(scalePublishedPrice('0.0000001250000', 6)).toBe('0.125');
        expect(scalePublishedPrice('1.000000', 3)).toBe('1000');
        expect(() => scalePublishedPrice('0.0000000000001', 6)).toThrow();
        expect(() => scalePublishedPrice('1000000000000', 6)).toThrow();
    });
});
