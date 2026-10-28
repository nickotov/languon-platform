import { z } from 'zod';
import type {
    ProviderNativeComponent,
    ProviderNativePricingRules,
    ProviderNativeVariant,
} from '@languon/contracts';
import type {
    ProviderPriceFetchResult,
    ProviderPriceSource,
    ProviderPriceTarget,
} from '../../application/provider-price-source';
import {
    nativePrice,
    publishedRate,
    sourceFailure,
} from './native-price-source';
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
        endpoints: z
            .array(
                z.object({
                    pricing: pricingSchema,
                    tag: z.string().optional(),
                    provider_name: z.string().optional(),
                    service_tier: z.string().nullable().optional(),
                }),
            )
            .min(1)
            .max(500),
    }),
});
const catalogUrl = new URL(
    'https://openrouter.ai/api/v1/models?output_modalities=all',
);
const rateKeys = [
    'prompt',
    'completion',
    'input_cache_read',
    'input_cache_write',
    'input_cache_write_1h',
    'request',
    'internal_reasoning',
    'web_search',
    'image',
    'audio',
    'input_audio_cache',
] as const;
const conditionKeys = ['min_prompt_tokens', 'utc_start', 'utc_end', 'utc_days'];
const weekdays = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
];
const overridesSchema = z.array(z.record(z.string(), z.unknown())).max(32);
function clock(value: unknown): number {
    if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < 0 ||
        value > 2359 ||
        value % 100 >= 60
    )
        throw new Error('Invalid UTC clock.');
    return Math.floor(value / 100) * 60 + (value % 100);
}
function overrides(pricing: Record<string, unknown>) {
    for (const [key, value] of Object.entries(pricing)) {
        if (rateKeys.includes(key as (typeof rateKeys)[number])) {
            if (value != null) publishedRate(value);
        } else if (key === 'discount') {
            if (value !== 0)
                throw new Error('Discount semantics require review.');
        } else if (key !== 'overrides')
            throw new Error('Unknown pricing component.');
    }
    const values = overridesSchema.parse(pricing.overrides ?? []);
    for (const value of values) {
        for (const key of Object.keys(value)) {
            if (
                !conditionKeys.includes(key) &&
                !rateKeys.includes(key as (typeof rateKeys)[number])
            )
                throw new Error('Unknown override condition.');
            if (rateKeys.includes(key as (typeof rateKeys)[number]))
                publishedRate(value[key]);
        }
        if (
            value.min_prompt_tokens !== undefined &&
            (typeof value.min_prompt_tokens !== 'number' ||
                !Number.isSafeInteger(value.min_prompt_tokens) ||
                value.min_prompt_tokens < 0 ||
                value.min_prompt_tokens >= 2_147_483_647)
        )
            throw new Error('Invalid context threshold.');
        if ((value.utc_start === undefined) !== (value.utc_end === undefined))
            throw new Error('Incomplete time window.');
        if (value.utc_start !== undefined) {
            clock(value.utc_start);
            clock(value.utc_end);
        }
        if (value.utc_days !== undefined)
            z.array(
                z.enum([
                    'monday',
                    'tuesday',
                    'wednesday',
                    'thursday',
                    'friday',
                    'saturday',
                    'sunday',
                ]),
            )
                .min(1)
                .max(7)
                .parse(value.utc_days);
    }
    return values;
}
function applies(
    value: Record<string, unknown>,
    input: number,
    instant: number,
) {
    if (
        value.min_prompt_tokens !== undefined &&
        input <= (value.min_prompt_tokens as number)
    )
        return false;
    const date = new Date(instant);
    if (
        value.utc_days !== undefined &&
        !(value.utc_days as string[]).includes(weekdays[date.getUTCDay()]!)
    )
        return false;
    if (value.utc_start !== undefined) {
        const start = clock(value.utc_start),
            end = clock(value.utc_end);
        const minute = date.getUTCHours() * 60 + date.getUTCMinutes();
        if (
            !(start <= end
                ? minute >= start && minute < end
                : minute >= start || minute < end)
        )
            return false;
    }
    return true;
}
function components(
    pricing: Record<string, unknown>,
    target: ProviderPriceTarget,
): ProviderNativeComponent[] {
    const input = publishedRate(pricing.prompt),
        output = publishedRate(pricing.completion);
    if (
        pricing.internal_reasoning != null &&
        publishedRate(pricing.internal_reasoning) !== output
    )
        throw new Error('Distinct reasoning meter is not available.');
    if (
        pricing.input_cache_write_1h != null &&
        publishedRate(pricing.input_cache_write_1h) !==
            (pricing.input_cache_write == null
                ? null
                : publishedRate(pricing.input_cache_write))
    )
        throw new Error('Cache TTL identity requires another reported meter.');
    const result: ProviderNativeComponent[] = [];
    const add = (
        meter: ProviderNativeComponent['meter'],
        rate: unknown,
        chargeWhen: 'positive-usage' | 'request' = 'positive-usage',
    ) => {
        if (rate != null)
            result.push({
                meter,
                pricePerUnit: publishedRate(rate),
                unitQuantity: 1,
                chargeWhen,
            });
    };
    if (target.meter === 'speech-characters') {
        if (
            !target.modelId.startsWith('elevenlabs/') ||
            output !== '0' ||
            pricing.input_cache_read != null ||
            pricing.input_cache_write != null
        )
            throw new Error('Speech character units not established.');
        add('characters', input);
    } else if (target.meter === 'text-tokens') {
        add(
            pricing.input_cache_read != null ||
                pricing.input_cache_write != null
                ? 'uncachedInputTokens'
                : 'inputTokens',
            input,
        );
        add('outputTokens', output);
        add('cacheReadTokens', pricing.input_cache_read);
        add('cacheWriteTokens', pricing.input_cache_write);
    } else throw new Error('Unsupported OpenRouter speech meter.');
    add('requests', pricing.request, 'request');
    // Optional web/image/audio prices are scoped to services absent from the
    // server-owned text-only execution profile, not fees on every text request.
    return result;
}
function normalize(
    endpoint: z.infer<typeof endpointSchema>['data']['endpoints'][number],
    target: ProviderPriceTarget,
    index: number,
    single: boolean,
    now: Date,
    budget: { remaining: number },
): { variants: ProviderNativeVariant[]; until: string | null } {
    const changes = overrides(endpoint.pricing);
    const contexts = [
        ...new Set([
            0,
            ...changes.flatMap((value) =>
                value.min_prompt_tokens === undefined
                    ? []
                    : [(value.min_prompt_tokens as number) + 1],
            ),
        ]),
    ].sort((a, b) => a - b);
    const timed = changes.some(
        (value) =>
            value.utc_start !== undefined || value.utc_days !== undefined,
    );
    const start = timed
        ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
        : now.getTime();
    const end = timed ? start + 32 * 86_400_000 : start + 1;
    const points = new Set([start, end]);
    if (timed)
        for (let date = start; date < end; date += 86_400_000) {
            points.add(date);
            points.add(date + 86_400_000);
            for (const value of changes)
                if (value.utc_start !== undefined) {
                    points.add(date + clock(value.utc_start) * 60_000);
                    points.add(date + clock(value.utc_end) * 60_000);
                }
        }
    const sorted = [...points].sort((a, b) => a - b);
    budget.remaining -=
        contexts.length * (sorted.length - 1) * Math.max(1, changes.length);
    if (budget.remaining < 0)
        throw new Error('Published rule combinations exceed reviewed bounds.');
    const variants: ProviderNativeVariant[] = [];
    for (const [contextIndex, context] of contexts.entries()) {
        const groups = new Map<
            string,
            {
                components: ProviderNativeComponent[];
                windows: Array<{ from: string; until: string }>;
            }
        >();
        for (let position = 0; position < sorted.length - 1; position++) {
            const pricing = { ...endpoint.pricing };
            for (const change of changes)
                if (applies(change, context, sorted[position]!)) {
                    for (const key of rateKeys)
                        if (change[key] !== undefined)
                            pricing[key] = change[key];
                }
            const rates = components(pricing, target);
            const key = JSON.stringify(rates);
            const group = groups.get(key) ?? { components: rates, windows: [] };
            if (timed)
                group.windows.push({
                    from: new Date(sorted[position]!).toISOString(),
                    until: new Date(sorted[position + 1]!).toISOString(),
                });
            groups.set(key, group);
        }
        let groupIndex = 0;
        for (const group of groups.values()) {
            if (!endpoint.tag && !single)
                throw new Error('Endpoint identity is absent.');
            variants.push({
                id: `endpoint-${index}-context-${contextIndex}-rate-${groupIndex++}`,
                applies: {
                    ...(endpoint.tag
                        ? {
                              endpointIds: [
                                  ...new Set([
                                      endpoint.tag,
                                      ...(endpoint.provider_name
                                          ? [endpoint.provider_name]
                                          : []),
                                  ]),
                              ],
                          }
                        : {}),
                    serviceTiers: [endpoint.service_tier ?? 'standard'],
                    ...(contexts.length > 1
                        ? {
                              inputTokens: {
                                  minInclusive: context,
                                  ...(contexts[contextIndex + 1] === undefined
                                      ? {}
                                      : {
                                            maxExclusive:
                                                contexts[contextIndex + 1],
                                        }),
                              },
                          }
                        : {}),
                    ...(timed ? { dispatchWindows: group.windows } : {}),
                },
                components: group.components,
            });
        }
    }
    return { variants, until: timed ? new Date(end).toISOString() : null };
}

export class OpenRouterPriceSource implements ProviderPriceSource {
    readonly providerId = 'openrouter';
    constructor(
        private readonly fetcher: typeof fetch = fetch,
        private readonly now: () => Date = () => new Date(),
    ) {}
    async fetchPrices(
        targets: ProviderPriceTarget[],
        signal?: AbortSignal,
    ): Promise<ProviderPriceFetchResult[]> {
        if (!targets.length) return [];
        if (signal?.aborted)
            return targets.map((target) =>
                sourceFailure(
                    target,
                    'unavailable',
                    'Price retrieval was cancelled.',
                ),
            );
        let catalog: z.infer<typeof catalogSchema>;
        try {
            catalog = catalogSchema.parse(
                await readPricingJson(this.fetcher, catalogUrl, signal),
            );
        } catch {
            return targets.map((target) =>
                sourceFailure(
                    target,
                    'unavailable',
                    'The official OpenRouter pricing catalog is unavailable or invalid.',
                ),
            );
        }
        const results: ProviderPriceFetchResult[] = [];
        for (const target of targets) {
            const matching = catalog.data.filter(
                (model) => model.id === target.modelId,
            );
            if (
                target.providerId !== this.providerId ||
                matching.length !== 1
            ) {
                results.push(
                    sourceFailure(
                        target,
                        'model-not-found',
                        'The exact model is absent or ambiguous in the official catalog.',
                    ),
                );
                continue;
            }
            const model = matching[0]!;
            if (
                !model.architecture.input_modalities.includes('text') ||
                (target.meter === 'text-tokens' &&
                    !model.architecture.output_modalities.includes('text')) ||
                (target.meter !== 'text-tokens' &&
                    !model.architecture.output_modalities.includes('speech'))
            ) {
                results.push(
                    sourceFailure(
                        target,
                        'source-changed',
                        'Published modalities do not match the configured execution meter.',
                    ),
                );
                continue;
            }
            try {
                overrides(model.pricing);
            } catch {
                results.push(
                    sourceFailure(
                        target,
                        'source-changed',
                        'Published pricing keys or conditions need review.',
                    ),
                );
                continue;
            }
            const segments = target.modelId.split('/');
            if (
                segments.length !== 2 ||
                segments.some((part) => !part || part === '.' || part === '..')
            ) {
                results.push(
                    sourceFailure(
                        target,
                        'source-changed',
                        'The exact model identifier is not supported by the endpoint API.',
                    ),
                );
                continue;
            }
            const url = new URL(
                `/api/v1/models/${segments.map(encodeURIComponent).join('/')}/endpoints`,
                'https://openrouter.ai',
            );
            let raw: unknown;
            try {
                raw = await readPricingJson(this.fetcher, url, signal);
            } catch {
                results.push(
                    sourceFailure(
                        target,
                        'unavailable',
                        'Official endpoint prices are unavailable.',
                    ),
                );
                continue;
            }
            try {
                const endpoints = endpointSchema.parse(raw);
                if (endpoints.data.id !== target.modelId) {
                    results.push(
                        sourceFailure(
                            target,
                            'model-not-found',
                            'Endpoint response identifies another model.',
                        ),
                    );
                    continue;
                }
                const at = this.now();
                const ordered = [...endpoints.data.endpoints].sort((a, b) =>
                    (a.tag ?? '').localeCompare(b.tag ?? ''),
                );
                if (ordered.length > 128)
                    throw new Error(
                        'Endpoint variants exceed reviewed bounds.',
                    );
                const budget = { remaining: 100_000 };
                const cards = ordered.map((endpoint, index) =>
                    normalize(
                        endpoint,
                        target,
                        index,
                        ordered.length === 1,
                        at,
                        budget,
                    ),
                );
                const deadlines = cards.flatMap((card) =>
                    card.until === null ? [] : [card.until],
                );
                const rules: ProviderNativePricingRules = {
                    version: 1,
                    validFrom: at.toISOString(),
                    validUntil: deadlines.sort()[0] ?? null,
                    variants: cards.flatMap((card) => card.variants),
                };
                results.push({
                    target,
                    status: 'available',
                    price: nativePrice(
                        target,
                        rules,
                        url.href,
                        'openrouter-native-endpoint-rules-v2:text-and-speech-no-native-tools',
                    ),
                });
            } catch {
                results.push(
                    sourceFailure(
                        target,
                        'source-changed',
                        'OpenRouter endpoint billing units or pricing rules need review.',
                    ),
                );
            }
        }
        return results;
    }
}
