import { z } from 'zod';
import type {
    ProviderNativeComponent,
    ProviderNativePricingRules,
} from '@languon/contracts';
import type {
    ProviderPriceFetchResult,
    ProviderPriceSource,
    ProviderPriceTarget,
} from '../../application/provider-price-source';
import {
    currentInstant,
    nativePrice,
    publishedRate,
    sourceFailure,
} from './native-price-source';
import { readPricingJson, readPricingText } from './pricing-http';

const listUrl = new URL('https://api.kie.ai/client/v1/model-pricing/page');
const listSchema = z.object({
    code: z.literal(200),
    data: z.object({
        records: z.array(z.record(z.string(), z.unknown())).max(100),
        pages: z.number().int().min(0).max(20),
        current: z.number().int().min(1).max(20),
        total: z.number().int().min(0).max(2000),
    }),
});
const rowSchema = z.object({
    modelDescription: z.string(),
    creditPrice: z.string(),
    creditUnit: z.string(),
    usdPrice: z.string(),
    anchor: z.string(),
});
const productSchema = z.object({
    props: z.object({
        pageProps: z.object({
            pageData: z.object({
                groupData: z
                    .array(
                        z.object({
                            model: z.string(),
                            pricingDesc: z.string(),
                        }),
                    )
                    .max(128),
            }),
        }),
    }),
});
const normalized = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]/g, '');
const months = [
    'jan',
    'feb',
    'mar',
    'apr',
    'may',
    'jun',
    'jul',
    'aug',
    'sep',
    'oct',
    'nov',
    'dec',
];
function anchorUrl(raw: string): URL {
    const url = new URL(raw);
    if (
        url.origin !== 'https://kie.ai' ||
        url.username ||
        url.password ||
        !/^\/[a-zA-Z0-9/_.-]+$/.test(url.pathname)
    )
        throw new Error('Invalid official product anchor.');
    return url;
}
function productData(html: string) {
    const script =
        /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(
            html,
        )?.[1];
    if (!script) throw new Error('Official product data missing.');
    return productSchema.parse(JSON.parse(script)).props.pageProps.pageData
        .groupData;
}
function multiply(value: string, integer: bigint): bigint {
    const [whole, fraction = ''] = publishedRate(value).split('.');
    return BigInt(`${whole}${fraction.padEnd(24, '0')}`) * integer;
}
function creditUsd(rows: z.infer<typeof rowSchema>[]): string | undefined {
    const ratios = rows
        .map((row) => {
            const usd = multiply(row.usdPrice, 1n),
                credits = multiply(row.creditPrice, 1n);
            if (credits === 0n) {
                if (usd !== 0n) throw new Error('Credit conversion missing.');
                return undefined;
            }
            const numerator = usd * 10n ** 24n;
            if (numerator % credits)
                throw new Error(
                    'Credit conversion requires unsupported precision.',
                );
            const digits = (numerator / credits).toString().padStart(25, '0');
            return publishedRate(
                `${digits.slice(0, -24)}.${digits.slice(-24)}`,
            );
        })
        .filter((value): value is string => value !== undefined);
    if (new Set(ratios).size > 1)
        throw new Error(
            'Provider credit conversion differs across components.',
        );
    return ratios[0];
}
function expiry(description: string): string | null {
    const dates = [
        ...description.matchAll(
            /valid until\s+([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/gi,
        ),
    ].map((match) => {
        const month = months.indexOf(match[1]!.toLowerCase().slice(0, 3));
        const date = Number(match[2]);
        if (month < 0 || date < 1 || date > 31)
            throw new Error('Unknown promotional expiry.');
        // The source does not declare its expiry timezone. Expire at the start
        // of the named UTC day instead of silently extending the promotion.
        const instant = new Date(Date.UTC(Number(match[3]), month, date));
        if (instant.getUTCMonth() !== month)
            throw new Error('Invalid promotion date.');
        return instant.toISOString();
    });
    if (/limited.time|promotional pricing/i.test(description) && !dates.length)
        throw new Error('Promotional validity is unknown.');
    return dates.sort()[0] ?? null;
}
function rateComponents(
    rows: z.infer<typeof rowSchema>[],
    target: ProviderPriceTarget,
): ProviderNativeComponent[] {
    return rows.map((row) => {
        const label = row.modelDescription.toLowerCase();
        const unit = row.creditUnit.toLowerCase();
        let meter: ProviderNativeComponent['meter'];
        let quantity: number;
        if (
            unit === 'per 1000 characters' &&
            target.meter === 'speech-characters'
        ) {
            meter = 'characters';
            quantity = 1000;
        } else if (
            unit === 'per million tokens' &&
            /audio output/.test(label) &&
            target.meter === 'speech-tokens'
        ) {
            meter = 'audioOutputTokens';
            quantity = 1_000_000;
        } else if (
            unit === 'per million tokens' &&
            /\binput\b/.test(label) &&
            target.meter !== 'speech-characters'
        ) {
            meter = 'inputTokens';
            quantity = 1_000_000;
        } else if (
            unit === 'per million tokens' &&
            /\boutput\b/.test(label) &&
            target.meter === 'text-tokens'
        ) {
            meter = 'outputTokens';
            quantity = 1_000_000;
        } else throw new Error('Official billing meter changed.');
        return {
            meter,
            pricePerUnit: publishedRate(row.usdPrice),
            unitQuantity: quantity,
            chargeWhen: 'positive-usage',
        };
    });
}

export class KiePriceSource implements ProviderPriceSource {
    readonly providerId = 'kie';
    constructor(
        private readonly fetcher: typeof fetch = fetch,
        private readonly now: () => Date = () => new Date(),
    ) {}
    async fetchPrices(
        targets: ProviderPriceTarget[],
        signal?: AbortSignal,
    ): Promise<ProviderPriceFetchResult[]> {
        if (!targets.length) return [];
        const records: Record<string, unknown>[] = [];
        try {
            const first = listSchema.parse(
                await readPricingJson(this.fetcher, listUrl, signal, {
                    pageNum: 1,
                    pageSize: 100,
                    modelDescription: '',
                    interfaceType: '',
                }),
            );
            if (
                first.data.current !== 1 ||
                (first.data.pages === 0 && first.data.records.length)
            )
                throw new Error('Invalid price pagination.');
            records.push(...first.data.records);
            for (let page = 2; page <= first.data.pages; page++) {
                const next = listSchema.parse(
                    await readPricingJson(this.fetcher, listUrl, signal, {
                        pageNum: page,
                        pageSize: 100,
                        modelDescription: '',
                        interfaceType: '',
                    }),
                );
                if (
                    next.data.current !== page ||
                    next.data.pages !== first.data.pages ||
                    next.data.total !== first.data.total
                )
                    throw new Error(
                        'Official catalog changed during pagination.',
                    );
                records.push(...next.data.records);
            }
            if (records.length !== first.data.total)
                throw new Error('Incomplete official pricing list.');
        } catch {
            return targets.map((target) =>
                sourceFailure(
                    target,
                    'unavailable',
                    'The official Kie pricing list is unavailable or changed during retrieval.',
                ),
            );
        }
        const products = new Map<string, ReturnType<typeof productData>>();
        const results: ProviderPriceFetchResult[] = [];
        for (const target of targets) {
            if (target.providerId !== this.providerId) {
                results.push(
                    sourceFailure(
                        target,
                        'model-not-found',
                        'The provider does not match Kie pricing.',
                    ),
                );
                continue;
            }
            const core = normalized(target.modelId.split('/').at(-1)!);
            const candidates = records.filter((record) => {
                if (typeof record.anchor !== 'string') return false;
                try {
                    const url = anchorUrl(record.anchor);
                    return (
                        url.searchParams.get('model') === target.modelId ||
                        (typeof record.modelDescription === 'string' &&
                            normalized(record.modelDescription).startsWith(
                                core,
                            ))
                    );
                } catch {
                    return false;
                }
            });
            if (candidates.length > 32) {
                results.push(
                    sourceFailure(
                        target,
                        'source-changed',
                        'The model pricing identity is ambiguous.',
                    ),
                );
                continue;
            }
            const selected: z.infer<typeof rowSchema>[] = [];
            let description = '';
            let sourceUrl = 'https://kie.ai/pricing';
            let failed = false;
            for (const candidate of candidates) {
                try {
                    const row = rowSchema.parse(candidate);
                    const url = anchorUrl(row.anchor);
                    const key = url.href;
                    let groups = products.get(key);
                    if (!groups) {
                        groups = productData(
                            await readPricingText(this.fetcher, url, signal),
                        );
                        products.set(key, groups);
                    }
                    const matching = groups.filter(
                        (group) => group.model === target.modelId,
                    );
                    if (matching.length !== 1) continue; // A 200 product page may now advertise a different model.
                    selected.push(row);
                    description = matching[0]!.pricingDesc;
                    sourceUrl = url.href;
                } catch {
                    failed = true;
                    break;
                }
            }
            if (failed) {
                results.push(
                    sourceFailure(
                        target,
                        'source-changed',
                        'Kie product identity or public price data needs review.',
                    ),
                );
                continue;
            }
            if (!selected.length) {
                results.push(
                    sourceFailure(
                        target,
                        'model-not-found',
                        'No current official price matches the exact model identity; replacement models and similarly named TTS models are not substituted.',
                    ),
                );
                continue;
            }
            try {
                const components = rateComponents(selected, target);
                if (
                    new Set(components.map((item) => item.meter)).size !==
                        components.length ||
                    (target.meter === 'speech-tokens' &&
                        (!components.some(
                            (item) => item.meter === 'inputTokens',
                        ) ||
                            !components.some(
                                (item) => item.meter === 'audioOutputTokens',
                            ))) ||
                    (target.meter === 'text-tokens' &&
                        (!components.some(
                            (item) => item.meter === 'inputTokens',
                        ) ||
                            !components.some(
                                (item) => item.meter === 'outputTokens',
                            )))
                )
                    throw new Error(
                        'Incomplete or duplicate price components.',
                    );
                const validUntil = expiry(description);
                const at = currentInstant(this.now);
                if (validUntil !== null && validUntil <= at)
                    throw new Error('Published promotion expired.');
                const conversion = creditUsd(selected);
                const rules: ProviderNativePricingRules = {
                    version: 1,
                    validFrom: at,
                    validUntil,
                    ...(conversion === undefined
                        ? {}
                        : { reportedCreditUsdPerCredit: conversion }),
                    variants: [
                        { id: 'public-default', applies: {}, components },
                    ],
                };
                results.push({
                    target,
                    status: 'available',
                    price: nativePrice(
                        target,
                        rules,
                        sourceUrl,
                        'kie-public-pricing-native-v1:nominal-usd-no-topup-bonus',
                    ),
                });
            } catch {
                results.push(
                    sourceFailure(
                        target,
                        'source-changed',
                        'Kie billing units, credit conversion or promotional validity needs review.',
                    ),
                );
            }
        }
        return results;
    }
}
