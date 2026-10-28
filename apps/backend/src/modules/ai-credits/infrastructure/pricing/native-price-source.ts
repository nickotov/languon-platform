import {
    ProviderNativePricingRulesSchema,
    ProviderNativeRateSchema,
    ProviderPricePublishRequestSchema,
    type ProviderNativePricingRules,
} from '@languon/contracts';
import type {
    FetchedProviderPrice,
    ProviderPriceFetchResult,
    ProviderPriceTarget,
} from '../../application/provider-price-source';

export const currentInstant = (now: () => Date) => now().toISOString();

export function nativePrice(
    target: ProviderPriceTarget,
    rules: ProviderNativePricingRules,
    sourceUrl: string,
    sourceReference: string,
): FetchedProviderPrice {
    const price: FetchedProviderPrice = {
        ...target,
        inputUsdPerMillionTokens: null,
        outputUsdPerMillionTokens: null,
        cacheReadUsdPerMillionTokens: null,
        cacheWriteUsdPerMillionTokens: null,
        usdPer1000Characters: null,
        minimumUsdPerRequest: null,
        nativeRules: ProviderNativePricingRulesSchema.parse(rules),
        sourceUrl,
        sourceReference,
    };
    ProviderPricePublishRequestSchema.parse({
        ...price,
        effectiveAt: rules.validFrom,
        expectedVersion: 0,
        reason: 'Verified official provider price source',
    });
    return price;
}

export function sourceFailure(
    target: ProviderPriceTarget,
    status:
        'unsupported' | 'unavailable' | 'model-not-found' | 'source-changed',
    reason: string,
): ProviderPriceFetchResult {
    return { target, status, reason };
}

/** Normalize exact finite decimal text; rates never pass through Number arithmetic. */
export function publishedRate(value: unknown): string {
    const parsed = ProviderNativeRateSchema.parse(value);
    const [whole, fraction = ''] = parsed.split('.');
    const tail = fraction.replace(/0+$/, '');
    return tail ? `${whole}.${tail}` : whole!;
}
