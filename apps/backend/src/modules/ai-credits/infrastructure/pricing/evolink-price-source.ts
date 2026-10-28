import { z } from 'zod';
import type {
    ProviderNativeComponent,
    ProviderNativePricingRules,
    ProviderNativeUsageMeter,
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

const price = z.object({
    uc: z.string(),
    credits: z.string(),
    cny: z.string(),
    usd: z.string(),
});
const tier = z.object({
    when: z.unknown(),
    rate: price,
    minimum_charge: price,
    billing_rule: z.literal('per_token'),
    pricing_status: z.literal('available'),
});
const component = z.object({
    id: z.string(),
    role: z.string(),
    dimension: z.string(),
    unit: z.literal('1k_tokens'),
    billing_unit_size: z.number().int().positive(),
    rate: price,
    minimum_charge: price,
    billing_rule: z.literal('per_token'),
    pricing_status: z.literal('available'),
    quantity_rule: z.unknown(),
    rounding: z.object({
        point: z.literal('per_component_subtotal'),
        mode: z.literal('ceil'),
    }),
    tiers: z.array(tier).max(16).default([]),
});
const response = z.object({
    meta: z.object({
        schema_version: z.literal('2'),
        pricing_version: z.string(),
        currency: z.literal('USD'),
        exchange_rate_version: z.string(),
        updated_at: z.string().datetime({ offset: true }),
        fresh_until: z.string().datetime({ offset: true }),
    }),
    model: z.object({
        model_id: z.string(),
        operation: z.literal('text_generation'),
        modality: z.literal('text'),
        lifecycle: z.string(),
        components: z.array(z.unknown()).min(1).max(128),
    }),
});
const mapping: Record<
    string,
    { meter: ProviderNativeUsageMeter; variable: string; dimension: string }
> = {
    input: {
        meter: 'uncachedInputTokens',
        variable: 'input_tokens',
        dimension: 'input_token',
    },
    output: {
        meter: 'outputTokens',
        variable: 'output_tokens',
        dimension: 'output_token',
    },
    cache_hit: {
        meter: 'cacheReadTokens',
        variable: 'cache_read_tokens',
        dimension: 'cache_read_token',
    },
    cache_write: {
        meter: 'cacheWriteTokens',
        variable: 'cache_write_tokens',
        dimension: 'cache_write_token',
    },
};
function multiply(value: string, integer: bigint): string {
    const normalized = publishedRate(value);
    const [whole, fraction = ''] = normalized.split('.');
    const digits = (BigInt(`${whole}${fraction}`) * integer)
        .toString()
        .padStart(fraction.length + 1, '0');
    return publishedRate(
        fraction.length
            ? `${digits.slice(0, -fraction.length)}.${digits.slice(-fraction.length)}`
            : digits,
    );
}
function validateMoney(value: z.infer<typeof price>): string {
    const units = publishedRate(value.uc);
    if (
        !/^\d+$/.test(units) ||
        multiply(value.cny, 100_000n) !== units ||
        multiply(value.credits, 10_000n) !== units
    )
        throw new Error('Native currency ratios changed.');
    return units;
}
function threshold(value: unknown): number {
    const expression = z
        .object({
            op: z.literal('gt'),
            args: z.tuple([
                z
                    .object({
                        op: z.literal('variable'),
                        name: z.literal('prompt_tokens'),
                    })
                    .strict(),
                z
                    .object({
                        op: z.literal('constant'),
                        value: z.string().regex(/^\d+$/),
                    })
                    .strict(),
            ]),
        })
        .strict()
        .parse(value);
    const result = Number(expression.args[1].value);
    if (!Number.isSafeInteger(result) || result < 0 || result >= 2_147_483_647)
        throw new Error('Unsupported context tier.');
    return result + 1; // published condition is strictly greater than the threshold
}
function normalize(raw: z.infer<typeof response>): ProviderNativePricingRules {
    const factor = /(?:^|:)USD-CNY=(\d+(?:\.\d+)?)$/.exec(
        raw.meta.exchange_rate_version,
    )?.[1];
    if (!factor) throw new Error('Native exchange-rate provenance changed.');
    const denominator = multiply(factor, 100_000n);
    const components = raw.model.components
        .filter((value) => {
            const role = z.object({ role: z.string() }).parse(value).role;
            if (role.startsWith('image_gen:')) return false; // image-generation tools are not enabled by the text execution contract
            if (!mapping[role])
                throw new Error('Unknown text price component.');
            return true;
        })
        .map((value) => component.parse(value));
    if (
        new Set(components.map((value) => value.role)).size !==
            components.length ||
        !components.some((value) => value.role === 'input') ||
        !components.some((value) => value.role === 'output')
    )
        throw new Error('Text price components are incomplete.');
    for (const value of components) {
        const metadata = mapping[value.role]!;
        if (value.dimension !== metadata.dimension)
            throw new Error('Component dimension changed.');
        const quantity = z
            .object({
                op: z.literal('divide'),
                args: z.tuple([
                    z
                        .object({
                            op: z.literal('variable'),
                            name: z.literal(metadata.variable),
                        })
                        .strict(),
                    z
                        .object({
                            op: z.literal('constant'),
                            value: z.literal(String(value.billing_unit_size)),
                        })
                        .strict(),
                ]),
            })
            .strict()
            .parse(value.quantity_rule);
        if (!quantity) throw new Error('Unknown quantity rule.');
    }
    const boundaries = [
        ...new Set([
            0,
            ...components.flatMap((value) =>
                value.tiers.map((entry) => threshold(entry.when)),
            ),
        ]),
    ].sort((a, b) => a - b);
    const variants = boundaries.map((start, index) => ({
        id: `text-context-${start}`,
        applies: {
            inputTokens: {
                minInclusive: start,
                ...(boundaries[index + 1] === undefined
                    ? {}
                    : { maxExclusive: boundaries[index + 1] }),
            },
        },
        components: components.map((value): ProviderNativeComponent => {
            const chosen =
                value.tiers
                    .filter((entry) => start >= threshold(entry.when))
                    .at(-1) ?? value;
            return {
                meter: mapping[value.role]!.meter,
                pricePerUnit: validateMoney(chosen.rate),
                unitQuantity: value.billing_unit_size,
                minimum: validateMoney(chosen.minimum_charge),
                chargeWhen: 'request',
                rounding: { quantum: '1', mode: 'ceil' },
            };
        }),
    }));
    return {
        version: 1,
        validFrom: raw.meta.updated_at,
        validUntil: null,
        currency: {
            code: 'UC',
            usdNumerator: '1',
            unitDenominator: denominator,
        },
        variants,
    };
}

export class EvoLinkPriceSource implements ProviderPriceSource {
    readonly providerId = 'evolink';
    constructor(
        private readonly fetcher: typeof fetch = fetch,
        private readonly now: () => Date = () => new Date(),
    ) {}
    async fetchPrices(
        targets: ProviderPriceTarget[],
        signal?: AbortSignal,
    ): Promise<ProviderPriceFetchResult[]> {
        const results: ProviderPriceFetchResult[] = [];
        for (const target of targets) {
            if (
                target.providerId !== this.providerId ||
                target.meter !== 'text-tokens'
            ) {
                results.push(
                    sourceFailure(
                        target,
                        'source-changed',
                        'The model meter does not match EvoLink text pricing.',
                    ),
                );
                continue;
            }
            const url = new URL(
                `/v1/catalog/models/${encodeURIComponent(target.modelId)}/pricing-rules?view=full`,
                'https://api.evolink.ai',
            );
            let raw: unknown;
            try {
                raw = await readPricingJson(this.fetcher, url, signal);
            } catch {
                results.push(
                    sourceFailure(
                        target,
                        'unavailable',
                        'Official EvoLink pricing is unavailable.',
                    ),
                );
                continue;
            }
            try {
                const parsed = response.parse(raw);
                if (
                    Date.parse(parsed.meta.fresh_until) <=
                        this.now().getTime() ||
                    Date.parse(parsed.meta.updated_at) > this.now().getTime()
                ) {
                    results.push(
                        sourceFailure(
                            target,
                            'source-changed',
                            'Official EvoLink pricing freshness has expired or its effective timestamp is not current.',
                        ),
                    );
                    continue;
                }
                if (
                    parsed.model.model_id !== target.modelId ||
                    parsed.model.lifecycle !== 'active'
                ) {
                    results.push(
                        sourceFailure(
                            target,
                            'model-not-found',
                            'The exact active model is absent from EvoLink pricing.',
                        ),
                    );
                    continue;
                }
                results.push({
                    target,
                    status: 'available',
                    price: nativePrice(
                        target,
                        normalize(parsed),
                        url.href,
                        `evolink-text-native-v1:${parsed.meta.pricing_version}:${parsed.meta.exchange_rate_version}`,
                    ),
                });
            } catch {
                results.push(
                    sourceFailure(
                        target,
                        'source-changed',
                        'EvoLink native currency, component or tier rules need review.',
                    ),
                );
            }
        }
        return results;
    }
}
