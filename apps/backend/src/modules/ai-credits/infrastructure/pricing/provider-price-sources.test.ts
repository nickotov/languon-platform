import { describe, expect, it, vi } from 'vitest';
import type { ProviderPriceTarget } from '../../application/provider-price-source';
import { scalePublishedPrice } from './exact-price';
import { createProviderPriceSources } from './provider-price-sources';
import { readPricingJson } from './pricing-http';

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
function fixture(
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
                    (value) => ({ pricing: value }),
                ),
            },
        });
    });
    const source = createProviderPriceSources({ fetch: fetcher })[0]!;
    return { source, fetcher };
}

describe('official provider price discovery', () => {
    it('discovers a new model without a model-ID price table and converts decimal rates exactly', async () => {
        const { source, fetcher } = fixture();
        const [result] = await source.fetchPrices([target]);
        expect(result).toMatchObject({
            status: 'available',
            target,
            price: {
                inputUsdPerMillionTokens: '0.065',
                outputUsdPerMillionTokens: '0.26',
                cacheReadUsdPerMillionTokens: '0.01',
                cacheWriteUsdPerMillionTokens: '0.125',
                usdPer1000Characters: null,
                minimumUsdPerRequest: null,
            },
        });
        expect(fetcher).toHaveBeenCalledTimes(2);
        for (const [url, init] of fetcher.mock.calls) {
            expect(new URL(String(url)).origin).toBe('https://openrouter.ai');
            expect(init).toMatchObject({
                method: 'GET',
                redirect: 'error',
                headers: { Accept: 'application/json' },
            });
            expect(init?.signal).toBeInstanceOf(AbortSignal);
        }
    });
    it('keeps absent cache rates unknown, preserving actual zero prices', async () => {
        const { source } = fixture({
            modelPricing: { prompt: '0', completion: '0' },
        });
        expect(await source.fetchPrices([target])).toMatchObject([
            {
                status: 'available',
                price: {
                    inputUsdPerMillionTokens: '0',
                    outputUsdPerMillionTokens: '0',
                    cacheReadUsdPerMillionTokens: null,
                    cacheWriteUsdPerMillionTokens: null,
                },
            },
        ]);
    });
    it.each([
        { prompt: '-1', completion: '0' },
        { prompt: '0.0000000000001', completion: '0' },
        { prompt: '1e-6', completion: '0' },
        { completion: '0' },
        {
            ...flat,
            overrides: [{ min_prompt_tokens: 272000, prompt: '0.0001' }],
        },
        {
            ...flat,
            overrides: [
                { start_time: '00:00', end_time: '01:00', prompt: '0.0001' },
            ],
        },
        { ...flat, input_cache_write_1h: '0.0001' },
        { ...flat, request: '0.01' },
        { ...flat, unknown_future_charge: '1' },
        { ...flat, discount: 0.2 },
    ])(
        'rejects incompatible/ambiguous rates without proposing a price: %j',
        async (pricing) => {
            const { source, fetcher } = fixture({ modelPricing: pricing });
            expect(await source.fetchPrices([target])).toMatchObject([
                { status: 'unsupported' },
            ]);
            expect(fetcher).toHaveBeenCalledTimes(1);
        },
    );
    it('rejects heterogeneous endpoint rates even if the model summary is flat', async () => {
        const { source } = fixture({
            endpointPricing: [flat, { ...flat, prompt: '0.0000001' }],
        });
        expect(await source.fetchPrices([target])).toMatchObject([
            { status: 'unsupported' },
        ]);
    });
    for (const meter of ['text-tokens', 'speech-characters'] as const) {
        for (const level of ['catalog', 'endpoint'] as const) {
            it.each(['web_search', 'image', 'audio', 'input_audio_cache'])(
                `rejects charged or invalid %s at ${level} level for ${meter}`,
                async (field) => {
                    const selected =
                        meter === 'text-tokens'
                            ? target
                            : {
                                  ...target,
                                  modelId: 'elevenlabs/future-speech',
                                  meter,
                              };
                    const pricing =
                        meter === 'text-tokens'
                            ? flat
                            : { prompt: '0.00004', completion: '0' };
                    for (const value of [
                        '3',
                        '0.0000000000001',
                        '-1',
                        'bad',
                        0,
                        {},
                    ]) {
                        const extra = { ...pricing, [field]: value };
                        const { source } = fixture({
                            modelTarget: selected,
                            output:
                                meter === 'text-tokens' ? ['text'] : ['speech'],
                            modelPricing: level === 'catalog' ? extra : pricing,
                            endpointPricing: [
                                level === 'endpoint' ? extra : pricing,
                            ],
                        });
                        expect(
                            await source.fetchPrices([selected]),
                            `${field}: ${JSON.stringify(value)}`,
                        ).toMatchObject([{ status: 'unsupported' }]);
                    }
                },
            );
        }
        it(`accepts absent, null and exact-zero additional meters for ${meter}`, async () => {
            const selected =
                meter === 'text-tokens'
                    ? target
                    : { ...target, modelId: 'elevenlabs/future-speech', meter };
            const pricing =
                meter === 'text-tokens'
                    ? flat
                    : { prompt: '0.00004', completion: '0' };
            const { source } = fixture({
                modelTarget: selected,
                output: meter === 'text-tokens' ? ['text'] : ['speech'],
                modelPricing: {
                    ...pricing,
                    web_search: null,
                    image: '0',
                    audio: '0.000000',
                    input_audio_cache: '0.0000000000000',
                },
                endpointPricing: [pricing],
            });
            expect(await source.fetchPrices([selected])).toMatchObject([
                { status: 'available' },
            ]);
        });
    }
    it('requires an exact model and provider match', async () => {
        const { source } = fixture();
        expect(
            await source.fetchPrices([
                { ...target, modelId: 'missing/model' },
                { ...target, providerId: 'other' },
            ]),
        ).toMatchObject([{ status: 'unsupported' }, { status: 'unsupported' }]);
    });
    it('reads character prices only for a documented text-to-speech family', async () => {
        const speech: ProviderPriceTarget = {
            ...target,
            modelId: 'elevenlabs/future-speech',
            meter: 'speech-characters',
        };
        const { source } = fixture({
            modelTarget: speech,
            output: ['speech'],
            modelPricing: { prompt: '0.00004', completion: '0' },
        });
        expect(await source.fetchPrices([speech])).toMatchObject([
            {
                status: 'available',
                price: {
                    usdPer1000Characters: '0.04',
                    inputUsdPerMillionTokens: null,
                    outputUsdPerMillionTokens: null,
                },
            },
        ]);
        const unknown = { ...speech, modelId: 'unknown/new-speech' };
        const other = fixture({
            modelTarget: unknown,
            output: ['speech'],
            modelPricing: { prompt: '0.00004', completion: '0' },
        });
        expect(await other.source.fetchPrices([unknown])).toMatchObject([
            { status: 'unsupported' },
        ]);
    });
    it('does not reinterpret output-second speech as character pricing', async () => {
        const speech: ProviderPriceTarget = {
            ...target,
            modelId: 'elevenlabs/future-speech',
            meter: 'speech-characters',
        };
        const { source } = fixture({
            modelTarget: speech,
            output: ['speech'],
            modelPricing: { prompt: '0', completion: '0.01' },
        });
        expect(await source.fetchPrices([speech])).toMatchObject([
            { status: 'unsupported' },
        ]);
    });
    it('returns only sanitized unavailability for upstream exceptions and invalid JSON', async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockRejectedValue(new Error('secret upstream detail'));
        const [source] = createProviderPriceSources({ fetch: fetcher });
        const result = await source!.fetchPrices([target]);
        expect(result).toMatchObject([{ status: 'unavailable' }]);
        expect(JSON.stringify(result)).not.toContain('secret');
        fetcher.mockResolvedValue(new Response('not json'));
        expect(await source!.fetchPrices([target])).toMatchObject([
            { status: 'unavailable' },
        ]);
    });
    it('honors caller cancellation without fetching model endpoints', async () => {
        const { source, fetcher } = fixture();
        const controller = new AbortController();
        controller.abort();
        expect(
            await source.fetchPrices([target], controller.signal),
        ).toMatchObject([{ status: 'unavailable' }]);
        expect(fetcher).not.toHaveBeenCalled();
    });
});

describe('pricing HTTP boundary', () => {
    it('rejects nonofficial source origins before sending a request', async () => {
        const fetcher = vi.fn<typeof fetch>();
        await expect(
            readPricingJson(fetcher, new URL('http://localhost/private')),
        ).rejects.toThrow();
        expect(fetcher).not.toHaveBeenCalled();
    });
    it('rejects advertised oversized bodies and HTTP failures', async () => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
            new Response('{}', {
                headers: { 'content-length': '2097153' },
            }),
        );
        const url = new URL('https://openrouter.ai/api/v1/models');
        await expect(readPricingJson(fetcher, url)).rejects.toThrow(
            'too large',
        );
        fetcher.mockResolvedValue(
            new Response('server diagnostic', { status: 500 }),
        );
        await expect(readPricingJson(fetcher, url)).rejects.toThrow(
            'unavailable',
        );
    });
    it('bounds streamed bodies when content-length is absent', async () => {
        const fetcher = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(new Uint8Array(2097153)));
        await expect(
            readPricingJson(
                fetcher,
                new URL('https://openrouter.ai/api/v1/models'),
            ),
        ).rejects.toThrow('too large');
    });
});

describe('exact rate conversion', () => {
    it('normalizes trailing zeros without floating point or rounding', () => {
        expect(scalePublishedPrice('0.0000001250000', 6)).toBe('0.125');
        expect(scalePublishedPrice('1.000000', 3)).toBe('1000');
        expect(scalePublishedPrice('0.000000000001', 6)).toBe('0.000001');
        expect(() => scalePublishedPrice('0.0000000000001', 6)).toThrow();
        expect(() => scalePublishedPrice('1000000000000', 6)).toThrow();
    });
});
