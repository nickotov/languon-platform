import { z } from 'zod';
import type {
    FetchedProviderPrice,
    ProviderPriceFetchResult,
    ProviderPriceSource,
    ProviderPriceTarget,
} from '../../application/provider-price-source';
import { scalePublishedPrice } from './exact-price';
import { readPricingJson } from './pricing-http';

const pricingSchema = z.record(z.string(), z.unknown());
const modelSchema = z.object({
    id: z.string(),
    pricing: pricingSchema,
    architecture: z.object({
        input_modalities: z.array(z.string()),
        output_modalities: z.array(z.string()),
    }),
});
const catalogSchema = z.object({ data: z.array(modelSchema).max(10_000) });
const endpointSchema = z.object({
    data: z.object({
        id: z.string(),
        endpoints: z.array(z.object({ pricing: pricingSchema })).max(500),
    }),
});
const catalogUrl = new URL(
    'https://openrouter.ai/api/v1/models?output_modalities=all',
);

// Official TTS docs describe character-based ElevenLabs prompt rates, while other
// speech models may charge output seconds. Modality alone cannot establish units.
// https://openrouter.ai/docs/guides/overview/multimodal/tts

/** The flat accounting meter cannot express context/time tiers or endpoint-dependent prices. */
function normalizedRates(
    pricing: Record<string, unknown>,
    target: ProviderPriceTarget,
): Pick<
    FetchedProviderPrice,
    | 'inputUsdPerMillionTokens'
    | 'outputUsdPerMillionTokens'
    | 'cacheReadUsdPerMillionTokens'
    | 'cacheWriteUsdPerMillionTokens'
    | 'usdPer1000Characters'
    | 'minimumUsdPerRequest'
> {
    if (
        pricing.overrides !== undefined &&
        (!Array.isArray(pricing.overrides) || pricing.overrides.length > 0)
    )
        throw new Error('Tiered prices require a compatible accounting meter.');
    const known = new Set([
        'prompt',
        'completion',
        'input_cache_read',
        'input_cache_write',
        'input_cache_write_1h',
        'request',
        'discount',
        'overrides',
        // These optional services are not the text-token/speech-character meter.
        'web_search',
        'image',
        'audio',
        'input_audio_cache',
        'internal_reasoning',
    ]);
    if (Object.keys(pricing).some((key) => !known.has(key)))
        throw new Error('Unknown pricing components require review.');
    const unsupportedMeters = {
        web_search: 0,
        image: 6,
        audio: 6,
        input_audio_cache: 6,
    };
    for (const [field, places] of Object.entries(unsupportedMeters)) {
        const value = pricing[field];
        if (
            value !== undefined &&
            value !== null &&
            scalePublishedPrice(value, places) !== '0'
        )
            throw new Error('Additional pricing meters require review.');
    }
    if (
        (pricing.discount !== undefined && pricing.discount !== 0) ||
        (pricing.request !== undefined &&
            scalePublishedPrice(pricing.request, 0) !== '0')
    )
        throw new Error('Discounts or request charges require review.');
    const cache = (key: string) =>
        pricing[key] === undefined || pricing[key] === null
            ? null
            : scalePublishedPrice(pricing[key], 6);
    const input = scalePublishedPrice(pricing.prompt, 6);
    const output = scalePublishedPrice(pricing.completion, 6);
    if (
        pricing.internal_reasoning !== undefined &&
        scalePublishedPrice(pricing.internal_reasoning, 6) !== output
    )
        throw new Error('Distinct reasoning rates require review.');
    const write = cache('input_cache_write');
    if (
        pricing.input_cache_write_1h !== undefined &&
        cache('input_cache_write_1h') !== write
    )
        throw new Error('Distinct cache duration rates require review.');
    if (target.meter === 'speech-characters') {
        if (
            output !== '0' ||
            cache('input_cache_read') !== null ||
            write !== null
        )
            throw new Error('Speech pricing is not a flat character rate.');
        return {
            inputUsdPerMillionTokens: null,
            outputUsdPerMillionTokens: null,
            cacheReadUsdPerMillionTokens: null,
            cacheWriteUsdPerMillionTokens: null,
            usdPer1000Characters: scalePublishedPrice(pricing.prompt, 3),
            minimumUsdPerRequest: null,
        };
    }
    return {
        inputUsdPerMillionTokens: input,
        outputUsdPerMillionTokens: output,
        cacheReadUsdPerMillionTokens: cache('input_cache_read'),
        cacheWriteUsdPerMillionTokens: write,
        usdPer1000Characters: null,
        minimumUsdPerRequest: null,
    };
}

function unsupported(
    target: ProviderPriceTarget,
    reason: string,
): ProviderPriceFetchResult {
    return { target, status: 'unsupported', reason };
}

export class OpenRouterPriceSource implements ProviderPriceSource {
    readonly providerId = 'openrouter';
    constructor(private readonly fetcher: typeof fetch = fetch) {}

    async fetchPrices(targets: ProviderPriceTarget[], signal?: AbortSignal) {
        if (targets.length === 0) return [];
        if (signal?.aborted)
            return targets.map((target): ProviderPriceFetchResult => ({
                target,
                status: 'unavailable',
                reason: 'Price retrieval was cancelled.',
            }));
        let catalog: z.infer<typeof catalogSchema>;
        try {
            catalog = catalogSchema.parse(
                await readPricingJson(this.fetcher, catalogUrl, signal),
            );
        } catch {
            return targets.map((target): ProviderPriceFetchResult => ({
                target,
                status: 'unavailable',
                reason: 'The official OpenRouter pricing catalog is unavailable or invalid.',
            }));
        }
        const results: ProviderPriceFetchResult[] = [];
        for (const target of targets) {
            if (signal?.aborted) {
                results.push({
                    target,
                    status: 'unavailable',
                    reason: 'Price retrieval was cancelled.',
                });
                continue;
            }
            results.push(await this.fetchModel(catalog, target, signal));
        }
        return results;
    }

    private async fetchModel(
        catalog: z.infer<typeof catalogSchema>,
        target: ProviderPriceTarget,
        signal?: AbortSignal,
    ): Promise<ProviderPriceFetchResult> {
        const matches = catalog.data.filter(
            (model) => model.id === target.modelId,
        );
        if (target.providerId !== this.providerId || matches.length !== 1)
            return unsupported(
                target,
                'The exact model is absent or ambiguous in the official catalog.',
            );
        const model = matches[0]!;
        const input = model.architecture.input_modalities;
        const output = model.architecture.output_modalities;
        if (
            !input.includes('text') ||
            (target.meter === 'text-tokens' &&
                (output.length !== 1 || output[0] !== 'text')) ||
            (target.meter === 'speech-characters' &&
                (!target.modelId.startsWith('elevenlabs/') ||
                    input.length !== 1 ||
                    output.length !== 1 ||
                    output[0] !== 'speech'))
        )
            return unsupported(
                target,
                'The model pricing units do not match the requested meter.',
            );
        let rates: ReturnType<typeof normalizedRates>;
        try {
            rates = normalizedRates(model.pricing, target);
        } catch {
            return unsupported(
                target,
                'Published rates are tiered, have unsupported components or cannot be represented exactly.',
            );
        }
        const segments = target.modelId.split('/');
        if (
            segments.length !== 2 ||
            segments.some((part) => !part || part === '.' || part === '..')
        )
            return unsupported(
                target,
                'The model identifier is unsupported by the endpoint pricing API.',
            );
        const url = new URL(
            `/api/v1/models/${segments.map(encodeURIComponent).join('/')}/endpoints`,
            'https://openrouter.ai',
        );
        let endpoints: z.infer<typeof endpointSchema>;
        try {
            endpoints = endpointSchema.parse(
                await readPricingJson(this.fetcher, url, signal),
            );
        } catch {
            return {
                target,
                status: 'unavailable',
                reason: 'Official model endpoint prices are unavailable or invalid.',
            };
        }
        try {
            if (
                endpoints.data.id !== target.modelId ||
                endpoints.data.endpoints.length === 0 ||
                endpoints.data.endpoints.some(
                    (endpoint) =>
                        JSON.stringify(
                            normalizedRates(endpoint.pricing, target),
                        ) !== JSON.stringify(rates),
                )
            )
                return unsupported(
                    target,
                    'Endpoint prices differ or no exact uniform endpoint rate is available.',
                );
        } catch {
            return unsupported(
                target,
                'Endpoint prices require unsupported tiers, components or precision.',
            );
        }
        return {
            target,
            status: 'available',
            price: {
                ...target,
                ...rates,
                sourceUrl: url.href,
                sourceReference: 'openrouter-uniform-endpoints-v1',
            },
        };
    }
}
