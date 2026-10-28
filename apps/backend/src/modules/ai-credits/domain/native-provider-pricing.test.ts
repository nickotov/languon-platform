import { describe, expect, it } from 'vitest';
import {
    ProviderNativePricingRulesSchema,
    ProviderPricePublishRequestSchema,
    ProviderPriceSchema,
    nativeProviderPricingMatchesMeter,
    type ProviderNativePricingRules,
    type ProviderNativeVariant,
    type ProviderPrice,
    type ProviderNativeCallObservation,
} from '@languon/contracts';
import {
    evaluateNativeProviderCalls,
    evaluateNativeProviderCost,
} from './native-provider-pricing';
import {
    providerSpeechExpenseMicros,
    providerTextExpenseMicros,
} from './provider-expense';

const facts = { dispatchedAt: '2026-10-28T12:00:00Z' };
function rules(variants?: ProviderNativeVariant[]): ProviderNativePricingRules {
    return {
        version: 1,
        validFrom: '2026-01-01T00:00:00Z',
        validUntil: '2027-01-01T00:00:00Z',
        variants: variants ?? [
            {
                id: 'flat',
                applies: {},
                components: [
                    {
                        meter: 'inputTokens',
                        pricePerUnit: '0.3',
                        unitQuantity: 1_000_000,
                        chargeWhen: 'positive-usage',
                    },
                    {
                        meter: 'outputTokens',
                        pricePerUnit: '1.2',
                        unitQuantity: 1_000_000,
                        chargeWhen: 'positive-usage',
                    },
                ],
            },
        ],
    };
}
const usage = { inputTokens: 1_000, outputTokens: 2_000, requests: 1 as const };
function cost(value: ProviderNativePricingRules, input = usage) {
    return evaluateNativeProviderCost(value, facts, input);
}
function single(
    pricePerUnit: string,
    applies: ProviderNativeVariant['applies'] = {},
): ProviderNativeVariant {
    return {
        id: pricePerUnit,
        applies,
        components: [
            {
                meter: 'inputTokens',
                pricePerUnit,
                unitQuantity: 1_000_000,
                chargeWhen: 'positive-usage',
            },
        ],
    };
}

describe('native provider financial arithmetic', () => {
    it('uses exact official rates and rounds the final USD sum once to micros', () => {
        expect(cost(rules())).toMatchObject({
            status: 'calculated',
            micros: 2700n,
            costSource: 'native-rules',
        });
        const precise = rules([
            {
                id: 'precise',
                applies: {},
                components: [
                    {
                        meter: 'outputTokens',
                        pricePerUnit: '0.0833333333333333',
                        unitQuantity: 1_000_000,
                        chargeWhen: 'positive-usage',
                    },
                ],
            },
        ]);
        expect(
            cost(precise, { ...usage, outputTokens: 1_000_000 }),
        ).toMatchObject({ status: 'calculated', micros: 83_334n });
    });
    it('keeps component minima distinct from a minimum on the entire request', () => {
        const priced = rules([
            {
                id: 'minimums',
                applies: {},
                minimumPerRequest: '1',
                components: [
                    {
                        meter: 'inputTokens',
                        pricePerUnit: '0.1',
                        unitQuantity: 1,
                        minimum: '1',
                        chargeWhen: 'positive-usage',
                    },
                    {
                        meter: 'outputTokens',
                        pricePerUnit: '0.1',
                        unitQuantity: 1,
                        minimum: '1',
                        chargeWhen: 'positive-usage',
                    },
                ],
            },
        ]);
        expect(
            cost(priced, { inputTokens: 1, outputTokens: 1, requests: 1 }),
        ).toMatchObject({ status: 'calculated', micros: 2_000_000n });
    });
    it('rounds component subtotals in native UC before exact currency conversion', () => {
        const priced = rules([
            {
                id: 'uc',
                applies: {},
                components: [
                    {
                        meter: 'inputTokens',
                        pricePerUnit: '62',
                        unitQuantity: 1000,
                        minimum: '100',
                        chargeWhen: 'positive-usage',
                        rounding: { quantum: '1', mode: 'ceil' },
                    },
                    {
                        meter: 'outputTokens',
                        pricePerUnit: '306',
                        unitQuantity: 1000,
                        minimum: '100',
                        chargeWhen: 'positive-usage',
                        rounding: { quantum: '1', mode: 'ceil' },
                    },
                ],
            },
        ]);
        priced.currency = {
            code: 'UC',
            usdNumerator: '1',
            unitDenominator: '680000',
        };
        expect(
            cost(priced, { inputTokens: 1620, outputTokens: 331, requests: 1 }),
        ).toMatchObject({ status: 'calculated', micros: 299n });
    });
    it('preserves declared component and total rounding order including half-up ties', () => {
        const priced = rules([
            {
                id: 'rounding',
                applies: {},
                components: [
                    {
                        meter: 'inputTokens',
                        pricePerUnit: '0.0000004',
                        unitQuantity: 1,
                        chargeWhen: 'positive-usage',
                        rounding: { quantum: '0.000001', mode: 'ceil' },
                    },
                    {
                        meter: 'outputTokens',
                        pricePerUnit: '0.0000005',
                        unitQuantity: 1,
                        chargeWhen: 'positive-usage',
                        rounding: { quantum: '0.000001', mode: 'half-up' },
                    },
                ],
                totalRounding: { quantum: '0.000003', mode: 'half-up' },
            },
        ]);
        expect(
            cost(priced, { inputTokens: 1, outputTokens: 1, requests: 1 }),
        ).toMatchObject({ status: 'calculated', micros: 3n });
    });
    it('does not apply a positive-usage component minimum to zero quantity', () => {
        const priced = rules([
            {
                id: 'zero',
                applies: {},
                components: [
                    {
                        meter: 'inputTokens',
                        pricePerUnit: '1',
                        unitQuantity: 1,
                        minimum: '10',
                        chargeWhen: 'positive-usage',
                    },
                ],
            },
        ]);
        expect(
            cost(priced, { inputTokens: 0, outputTokens: 0, requests: 1 }),
        ).toMatchObject({ status: 'calculated', micros: 0n });
        priced.variants[0]!.components[0]!.chargeWhen = 'request';
        expect(
            cost(priced, { inputTokens: 0, outputTokens: 0, requests: 1 }),
        ).toMatchObject({ status: 'calculated', micros: 10_000_000n });
    });
    it('derives uncached input only from complete reported cache evidence', () => {
        const priced = rules([
            {
                id: 'cache',
                applies: {},
                components: [
                    {
                        meter: 'uncachedInputTokens',
                        pricePerUnit: '1',
                        unitQuantity: 1_000_000,
                        chargeWhen: 'positive-usage',
                    },
                    {
                        meter: 'cacheReadTokens',
                        pricePerUnit: '0.1',
                        unitQuantity: 1_000_000,
                        chargeWhen: 'positive-usage',
                    },
                    {
                        meter: 'cacheWriteTokens',
                        pricePerUnit: '1.25',
                        unitQuantity: 1_000_000,
                        chargeWhen: 'positive-usage',
                    },
                ],
            },
        ]);
        expect(cost(priced)).toMatchObject({ status: 'unknown' });
        expect(
            evaluateNativeProviderCost(priced, facts, {
                ...usage,
                cacheReadTokens: 400,
                cacheWriteTokens: 100,
            }),
        ).toMatchObject({ status: 'calculated', micros: 665n });
        expect(
            evaluateNativeProviderCost(priced, facts, {
                ...usage,
                cacheReadTokens: 600,
                cacheWriteTokens: 500,
            }),
        ).toMatchObject({ status: 'unknown' });
    });
    it('does not treat absent audio output tokens as zero or as characters', () => {
        const priced = rules([
            {
                id: 'audio',
                applies: {},
                components: [
                    {
                        meter: 'audioOutputTokens',
                        pricePerUnit: '4.2',
                        unitQuantity: 1_000_000,
                        chargeWhen: 'positive-usage',
                    },
                ],
            },
        ]);
        expect(
            evaluateNativeProviderCost(priced, facts, {
                characters: 1000,
                requests: 1,
            }),
        ).toMatchObject({ status: 'unknown' });
        expect(
            evaluateNativeProviderCost(priced, facts, {
                audioOutputTokens: 1000,
                requests: 1,
            }),
        ).toMatchObject({ status: 'calculated', micros: 4200n });
        expect(
            evaluateNativeProviderCost(
                priced,
                facts,
                { characters: 1000, requests: 1 },
                'upper-bound',
            ),
        ).toMatchObject({ status: 'unknown' });
    });
    it('honors context tier boundaries and includes lower tiers in upper bounds', () => {
        const priced = rules([
            {
                ...single('2', {
                    inputTokens: { minInclusive: 0, maxExclusive: 272001 },
                }),
                id: 'base',
            },
            {
                ...single('1', { inputTokens: { minInclusive: 272001 } }),
                id: 'long',
            },
        ]);
        expect(cost(priced, { ...usage, inputTokens: 272000 })).toMatchObject({
            status: 'calculated',
            micros: 544000n,
            variantIds: ['base'],
        });
        expect(cost(priced, { ...usage, inputTokens: 272001 })).toMatchObject({
            status: 'calculated',
            micros: 272001n,
            variantIds: ['long'],
        });
        expect(
            evaluateNativeProviderCost(
                priced,
                facts,
                { ...usage, inputTokens: 300000 },
                'upper-bound',
            ),
        ).toMatchObject({ status: 'calculated', micros: 600000n });
    });
    it('does not guess a resolved gateway endpoint from a reservation ceiling', () => {
        const priced = rules([
            single('1', { endpointIds: ['a'] }),
            single('2', { endpointIds: ['b'] }),
        ]);
        expect(cost(priced)).toMatchObject({ status: 'unknown' });
        expect(
            evaluateNativeProviderCost(
                priced,
                { ...facts, endpointId: 'a' },
                usage,
            ),
        ).toMatchObject({ status: 'calculated', micros: 1000n });
        expect(
            evaluateNativeProviderCost(priced, facts, usage, 'upper-bound'),
        ).toMatchObject({ status: 'calculated', micros: 2000n });
        expect(
            evaluateNativeProviderCost(
                priced,
                { ...facts, endpointId: 'absent' },
                usage,
            ),
        ).toMatchObject({ status: 'unknown' });
    });
    it('can calculate a gateway amount when unresolved endpoints have identical prices', () => {
        const priced = rules([
            { ...single('1', { endpointIds: ['a'] }), id: 'a' },
            { ...single('1', { endpointIds: ['b'] }), id: 'b' },
        ]);
        expect(cost(priced)).toMatchObject({
            status: 'calculated',
            micros: 1000n,
            variantIds: ['a', 'b'],
        });
    });
    it('selects a declared service tier and does not presume an omitted one', () => {
        const priced = rules([
            single('1', { serviceTiers: ['standard'] }),
            single('2', { serviceTiers: ['priority'] }),
        ]);
        expect(cost(priced)).toMatchObject({ status: 'unknown' });
        expect(
            evaluateNativeProviderCost(
                priced,
                { ...facts, serviceTier: 'standard' },
                usage,
            ),
        ).toMatchObject({ status: 'calculated', micros: 1000n });
    });
    it('evaluates absolute half-open dispatch windows and refuses expired rules', () => {
        const priced = rules([
            single('1', {
                dispatchWindows: [
                    {
                        from: '2026-10-28T10:00:00Z',
                        until: '2026-10-28T12:00:00Z',
                    },
                ],
            }),
            single('2', {
                dispatchWindows: [
                    {
                        from: '2026-10-28T12:00:00Z',
                        until: '2026-10-28T14:00:00Z',
                    },
                ],
            }),
        ]);
        expect(cost(priced)).toMatchObject({
            status: 'calculated',
            micros: 2000n,
        });
        expect(
            evaluateNativeProviderCost(
                priced,
                { dispatchedAt: '2027-01-01T00:00:00Z' },
                usage,
            ),
        ).toMatchObject({ status: 'unknown' });
        expect(
            evaluateNativeProviderCost(
                priced,
                { dispatchedAt: '2025-12-31T23:59:59Z' },
                usage,
            ),
        ).toMatchObject({ status: 'unknown' });
    });
    it('reserves across price transitions but refuses uncovered dispatch-horizon gaps', () => {
        const priced = rules([
            single('1', {
                dispatchWindows: [
                    {
                        from: '2026-10-28T10:00:00Z',
                        until: '2026-10-28T12:00:00Z',
                    },
                ],
            }),
            single('2', {
                dispatchWindows: [
                    {
                        from: '2026-10-28T12:00:00Z',
                        until: '2026-10-28T14:00:00Z',
                    },
                ],
            }),
        ]);
        const future = {
            dispatchedAt: '2026-10-28T11:59:00Z',
            latestDispatchAt: '2026-10-28T12:01:00Z',
        };
        expect(
            evaluateNativeProviderCost(priced, future, usage, 'upper-bound'),
        ).toMatchObject({ status: 'calculated', micros: 2000n });
        priced.variants[1]!.applies.dispatchWindows![0]!.from =
            '2026-10-28T12:00:01Z';
        expect(
            evaluateNativeProviderCost(priced, future, usage, 'upper-bound'),
        ).toMatchObject({ status: 'unknown' });
    });
    it('uses independently conservative cache bounds and never subtracts cache maxima from input', () => {
        const priced = rules([
            {
                id: 'cache',
                applies: {},
                components: [
                    {
                        meter: 'uncachedInputTokens',
                        pricePerUnit: '1',
                        unitQuantity: 1_000_000,
                        chargeWhen: 'positive-usage',
                    },
                    {
                        meter: 'cacheReadTokens',
                        pricePerUnit: '0.1',
                        unitQuantity: 1_000_000,
                        chargeWhen: 'positive-usage',
                    },
                    {
                        meter: 'cacheWriteTokens',
                        pricePerUnit: '1.25',
                        unitQuantity: 1_000_000,
                        chargeWhen: 'positive-usage',
                    },
                ],
            },
        ]);
        expect(
            evaluateNativeProviderCost(priced, facts, usage, 'upper-bound'),
        ).toMatchObject({ status: 'calculated', micros: 2350n });
    });
    it('uses authenticated reported credits or USD only for actual expense, never reservation', () => {
        const priced = rules();
        priced.reportedCreditUsdPerCredit = '0.005';
        expect(
            evaluateNativeProviderCost(priced, facts, {
                ...usage,
                providerCreditsConsumed: '1.23',
            }),
        ).toMatchObject({
            status: 'calculated',
            micros: 6150n,
            costSource: 'reported-credits',
        });
        expect(
            evaluateNativeProviderCost(priced, facts, {
                ...usage,
                providerCostUsd: '0.0012345',
            }),
        ).toMatchObject({
            status: 'calculated',
            micros: 1235n,
            costSource: 'reported-usd',
        });
        expect(
            evaluateNativeProviderCost(
                priced,
                facts,
                { ...usage, providerCostUsd: '0' },
                'upper-bound',
            ),
        ).toMatchObject({
            status: 'calculated',
            micros: 2700n,
            costSource: 'native-rules',
        });
        expect(
            evaluateNativeProviderCost(
                priced,
                facts,
                { ...usage, providerCreditsConsumed: '0' },
                'upper-bound',
            ),
        ).toMatchObject({ status: 'calculated', micros: 2700n });
        expect(
            evaluateNativeProviderCost(priced, facts, {
                ...usage,
                providerCostUsd: '0',
                providerCreditsConsumed: '1.23',
            }),
        ).toMatchObject({ status: 'unknown' });
    });
    it('reports known zero requests as zero and rejects contradictory positive usage', () => {
        expect(
            evaluateNativeProviderCost(rules(), facts, { requests: 0 }),
        ).toMatchObject({ status: 'calculated', micros: 0n });
        expect(
            evaluateNativeProviderCost(rules(), facts, {
                requests: 0,
                inputTokens: 1,
            }),
        ).toMatchObject({ status: 'unknown' });
        expect(
            evaluateNativeProviderCost(
                rules(),
                facts,
                { requests: 0, providerCostUsd: '1' },
                'upper-bound',
            ),
        ).toMatchObject({ status: 'calculated', micros: 0n });
    });
    it('requires explicit credit/USD conversion before using a provider credit observation', () => {
        const priced = rules([
            {
                id: 'audio',
                applies: {},
                components: [
                    {
                        meter: 'audioOutputTokens',
                        pricePerUnit: '4.2',
                        unitQuantity: 1_000_000,
                        chargeWhen: 'positive-usage',
                    },
                ],
            },
        ]);
        expect(
            evaluateNativeProviderCost(priced, facts, {
                requests: 1,
                providerCreditsConsumed: '1',
            }),
        ).toMatchObject({ status: 'unknown' });
        priced.reportedCreditUsdPerCredit = '0.005';
        expect(
            evaluateNativeProviderCost(priced, facts, {
                requests: 1,
                providerCreditsConsumed: '1',
            }),
        ).toMatchObject({ status: 'calculated', micros: 5000n });
    });
    it('does not silently truncate sub-millisecond tariff or dispatch boundaries', () => {
        const priced = { ...rules(), validFrom: '2026-01-01T00:00:00.0001Z' };
        expect(ProviderNativePricingRulesSchema.safeParse(priced).success).toBe(
            false,
        );
        expect(
            evaluateNativeProviderCost(
                rules(),
                { dispatchedAt: '2026-10-28T12:00:00.0001Z' },
                usage,
            ),
        ).toMatchObject({ status: 'unknown' });
    });
    it('validates tariff precision, windows, duplicate identities and rate/settlement separation', () => {
        expect(
            ProviderNativePricingRulesSchema.safeParse(
                rules([single('0.0000000000000000000000001')]),
            ).success,
        ).toBe(false);
        expect(
            ProviderNativePricingRulesSchema.safeParse(
                rules([single('1'), single('1')]),
            ).success,
        ).toBe(false);
        expect(
            ProviderNativePricingRulesSchema.safeParse(
                rules([
                    single('1', {
                        dispatchWindows: [
                            {
                                from: facts.dispatchedAt,
                                until: facts.dispatchedAt,
                            },
                        ],
                    }),
                ]),
            ).success,
        ).toBe(false);
        const publish = {
            providerId: 'kie',
            modelId: 'example',
            meter: 'text-tokens',
            inputUsdPerMillionTokens: null,
            outputUsdPerMillionTokens: null,
            cacheReadUsdPerMillionTokens: null,
            cacheWriteUsdPerMillionTokens: null,
            usdPer1000Characters: null,
            minimumUsdPerRequest: null,
            nativeRules: rules(),
            effectiveAt: facts.dispatchedAt,
            sourceReference: 'verified-test',
            sourceUrl: 'https://example.test/prices',
            reason: 'Native pricing fixture',
            expectedVersion: 0,
        };
        expect(
            ProviderPricePublishRequestSchema.safeParse(publish).success,
        ).toBe(true);
        expect(
            ProviderPricePublishRequestSchema.safeParse({
                ...publish,
                usdPer1000Characters: '0.03',
            }).success,
        ).toBe(false);
        expect(
            ProviderPricePublishRequestSchema.safeParse({
                ...publish,
                nativeRules: undefined,
                meter: 'speech-tokens',
            }).success,
        ).toBe(false);
    });
    it('binds every native variant to measurable units for its outer publication meter', () => {
        const component = (
            meter: ProviderNativeVariant['components'][number]['meter'],
        ) => ({
            meter,
            pricePerUnit: '0',
            unitQuantity: 1,
            chargeWhen: 'positive-usage' as const,
        });
        const tariff = (
            ...meters: ProviderNativeVariant['components'][number]['meter'][]
        ) =>
            rules([
                { id: 'units', applies: {}, components: meters.map(component) },
            ]);
        const publish = {
            providerId: 'example',
            modelId: 'example',
            meter: 'text-tokens',
            inputUsdPerMillionTokens: null,
            outputUsdPerMillionTokens: null,
            cacheReadUsdPerMillionTokens: null,
            cacheWriteUsdPerMillionTokens: null,
            usdPer1000Characters: null,
            minimumUsdPerRequest: null,
            effectiveAt: facts.dispatchedAt,
            sourceReference: 'verified-test',
            sourceUrl: null,
            reason: 'Native pricing fixture',
            expectedVersion: 0,
        };
        for (const [meter, units, valid] of [
            ['text-tokens', ['characters'], false],
            ['text-tokens', ['audioOutputTokens'], false],
            ['text-tokens', ['inputTokens'], false],
            ['text-tokens', ['outputTokens'], false],
            ['text-tokens', ['inputTokens', 'outputTokens'], true],
            [
                'text-tokens',
                [
                    'uncachedInputTokens',
                    'outputTokens',
                    'cacheReadTokens',
                    'cacheWriteTokens',
                ],
                true,
            ],
            ['speech-characters', ['inputTokens', 'outputTokens'], false],
            ['speech-characters', ['characters', 'requests'], true],
            ['speech-tokens', ['characters'], false],
            ['speech-tokens', ['audioOutputTokens'], false],
            ['speech-tokens', ['inputTokens', 'audioOutputTokens'], true],
            [
                'speech-tokens',
                ['inputTokens', 'audioOutputTokens', 'outputTokens'],
                false,
            ],
            ['text-tokens', ['requests'], true],
            ['speech-characters', ['requests'], true],
            ['speech-tokens', ['requests'], true],
            ['unknown', ['requests'], false],
        ] as const) {
            const nativeRules = tariff(...units);
            expect(
                nativeProviderPricingMatchesMeter(meter, nativeRules),
                `${meter}: ${units}`,
            ).toBe(valid);
            expect(
                ProviderPricePublishRequestSchema.safeParse({
                    ...publish,
                    meter,
                    nativeRules,
                }).success,
            ).toBe(valid);
            const { expectedVersion: _expectedVersion, ...snapshot } = publish;
            expect(
                ProviderPriceSchema.safeParse({
                    ...snapshot,
                    meter,
                    nativeRules,
                    id: '00000000-0000-4000-8000-000000000001',
                    version: 1,
                    createdAt: facts.dispatchedAt,
                    createdBy: null,
                }).success,
            ).toBe(valid);
        }
        const mixed = rules([
            {
                ...tariff('inputTokens', 'outputTokens').variants[0]!,
                id: 'valid',
            },
            { ...tariff('characters').variants[0]!, id: 'invalid' },
        ]);
        expect(nativeProviderPricingMatchesMeter('text-tokens', mixed)).toBe(
            false,
        );
    });
    it('bounds aggregate native rule work and UTF-8 serialized size', () => {
        const manyComponents = rules(
            Array.from({ length: 128 }, (_, index) => ({
                ...rules().variants[0]!,
                id: `variant-${index}`,
                components: [
                    'inputTokens',
                    'uncachedInputTokens',
                    'outputTokens',
                    'cacheReadTokens',
                    'cacheWriteTokens',
                    'audioOutputTokens',
                    'characters',
                    'requests',
                ].map((meter) => ({
                    meter: meter as ProviderNativeVariant['components'][number]['meter'],
                    pricePerUnit: '0',
                    unitQuantity: 1,
                    chargeWhen: 'positive-usage' as const,
                })),
            })),
        );
        expect(
            ProviderNativePricingRulesSchema.safeParse(manyComponents).success,
        ).toBe(false); // serialized size cap
        const windows = Array.from({ length: 1025 }, () => ({
            from: '2026-01-01T00:00:00Z',
            until: '2027-01-01T00:00:00Z',
        }));
        const large = rules([
            single('1', { dispatchWindows: windows }),
            { ...single('2', { dispatchWindows: windows }), id: 'second' },
        ]);
        expect(ProviderNativePricingRulesSchema.safeParse(large).success).toBe(
            false,
        );
        const unicode = rules([
            single('1', {
                endpointIds: Array.from({ length: 128 }, () =>
                    '界'.repeat(190),
                ),
            }),
        ]);
        expect(JSON.stringify(unicode).length).toBeLessThan(65_536);
        expect(
            ProviderNativePricingRulesSchema.safeParse(unicode).success,
        ).toBe(false);
        expect(
            ProviderNativePricingRulesSchema.safeParse(rules()).success,
        ).toBe(true);
    });
    it('returns unknown when single-call or aggregate USD micros exceed signed bigint storage', () => {
        const boundaryUsage = {
            inputTokens: 1_000_000_000_000,
            requests: 1 as const,
        };
        expect(
            evaluateNativeProviderCost(
                rules([single('9223372.036854775807')]),
                facts,
                boundaryUsage,
            ),
        ).toMatchObject({
            status: 'calculated',
            micros: 9_223_372_036_854_775_807n,
        });
        expect(
            evaluateNativeProviderCost(
                rules([single('9223372.036854775808')]),
                facts,
                boundaryUsage,
            ),
        ).toMatchObject({ status: 'unknown' });
        const expensive = rules([single('999999999999')]);
        expect(
            evaluateNativeProviderCost(expensive, facts, {
                inputTokens: Number.MAX_SAFE_INTEGER,
                requests: 1,
            }),
        ).toMatchObject({
            status: 'unknown',
            reason: expect.stringContaining('range overflow'),
        });
        expect(
            evaluateNativeProviderCost(rules(), facts, {
                requests: 1,
                providerCostUsd: '999999999999',
            }),
        ).toMatchObject({ status: 'calculated', micros: 999999999999000000n });
        const reportedRules = {
            ...rules(),
            reportedCreditUsdPerCredit: '999999999999',
        };
        expect(
            evaluateNativeProviderCost(reportedRules, facts, {
                requests: 1,
                providerCreditsConsumed: '999999999999',
            }),
        ).toMatchObject({
            status: 'unknown',
            reason: expect.stringContaining('range overflow'),
        });
        const callRules = rules([single('999999999999')]);
        const calls = [0, 1].map((index) => ({
            callId: `00000000-0000-4000-8000-00000000000${index}`,
            execution: facts,
            usage: { requests: 1 as const, inputTokens: 5_000_000 },
        }));
        expect(
            evaluateNativeProviderCost(callRules, facts, calls[0]!.usage)
                .status,
        ).toBe('calculated');
        expect(evaluateNativeProviderCalls(callRules, calls)).toMatchObject({
            status: 'unknown',
            reason: expect.stringContaining('range overflow'),
        });
    });
});

describe('native price authority preserves legacy expense behavior', () => {
    const legacy: ProviderPrice = {
        id: '00000000-0000-4000-8000-000000000001',
        version: 1,
        providerId: 'example',
        modelId: 'model',
        meter: 'text-tokens',
        inputUsdPerMillionTokens: '1',
        outputUsdPerMillionTokens: '2',
        cacheReadUsdPerMillionTokens: null,
        cacheWriteUsdPerMillionTokens: null,
        usdPer1000Characters: null,
        effectiveAt: facts.dispatchedAt,
        createdAt: facts.dispatchedAt,
        createdBy: null,
        sourceReference: 'legacy-fixture',
        sourceUrl: null,
        reason: 'Legacy behavior fixture',
    };
    it('preserves legacy flat token and character expenses without requiring execution facts', () => {
        expect(providerTextExpenseMicros(legacy, usage)).toBe(5000n);
        expect(
            providerSpeechExpenseMicros(
                { meter: 'speech-characters', usdPer1000Characters: '0.03' },
                1000,
            ),
        ).toBe(30000n);
    });
    it('never falls through native prices to flat amounts and requires authoritative dispatch time', () => {
        const native = {
            ...legacy,
            nativeRules: rules(),
            inputUsdPerMillionTokens: null,
            outputUsdPerMillionTokens: null,
        };
        expect(providerTextExpenseMicros(native, usage)).toBeNull();
        expect(providerTextExpenseMicros(native, usage, facts)).toBe(2700n);
        const expired = { dispatchedAt: '2027-01-01T00:00:00Z' };
        // Even an invalid mixed snapshot cannot turn a failed native evaluation into a legacy price.
        expect(
            providerTextExpenseMicros(
                { ...legacy, nativeRules: rules() },
                usage,
                expired,
            ),
        ).toBeNull();
    });
    it('settles native speech using reported credit cost without substituting character estimates', () => {
        const native = {
            meter: 'speech-tokens' as const,
            usdPer1000Characters: null,
            nativeRules: {
                ...rules([
                    {
                        id: 'audio',
                        applies: {},
                        components: [
                            {
                                meter: 'audioOutputTokens' as const,
                                pricePerUnit: '4.2',
                                unitQuantity: 1_000_000,
                                chargeWhen: 'positive-usage' as const,
                            },
                        ],
                    },
                ]),
                reportedCreditUsdPerCredit: '0.005',
            },
        };
        expect(providerSpeechExpenseMicros(native, 1000, facts)).toBeNull();
        expect(
            providerSpeechExpenseMicros(native, 1000, facts, {
                providerCreditsConsumed: '1.23',
            }),
        ).toBe(6150n);
    });
});

describe('native provider attempts with several SDK requests', () => {
    function call(
        index: number,
        reportedUsage: ProviderNativeCallObservation['usage'] = {
            inputTokens: 1,
            requests: 1,
        },
    ): ProviderNativeCallObservation {
        return {
            callId: `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
            usage: reportedUsage,
            execution: facts,
        };
    }
    it('applies the official minimum per call instead of once to aggregated token counts', () => {
        const priced = rules([
            {
                id: 'minimum',
                applies: {},
                components: [
                    {
                        meter: 'inputTokens',
                        pricePerUnit: '0.1',
                        unitQuantity: 1,
                        minimum: '1',
                        chargeWhen: 'positive-usage',
                    },
                ],
            },
        ]);
        expect(
            evaluateNativeProviderCalls(priced, [call(1), call(2)]),
        ).toMatchObject({ status: 'calculated', micros: 2_000_000n });
    });
    it('rounds internal USD micros once after summing exact costs from all calls', () => {
        const priced = rules([
            {
                id: 'tiny',
                applies: {},
                components: [
                    {
                        meter: 'inputTokens',
                        pricePerUnit: '0.0000004',
                        unitQuantity: 1,
                        chargeWhen: 'positive-usage',
                    },
                ],
            },
        ]);
        expect(
            evaluateNativeProviderCalls(
                priced,
                [1, 2, 3, 4, 5].map((index) => call(index)),
            ),
        ).toMatchObject({ status: 'calculated', micros: 2n });
        const uc = rules([
            {
                id: 'uc',
                applies: {},
                components: [
                    {
                        meter: 'inputTokens',
                        pricePerUnit: '1',
                        unitQuantity: 1,
                        chargeWhen: 'positive-usage',
                    },
                ],
            },
        ]);
        uc.currency = {
            code: 'UC',
            usdNumerator: '1',
            unitDenominator: '680000',
        };
        expect(
            evaluateNativeProviderCalls(uc, [call(1), call(2)]),
        ).toMatchObject({ status: 'calculated', micros: 3n });
    });
    it('evaluates each call context tier independently and retains mixed monetary provenance', () => {
        const priced = rules([
            {
                ...single('2', {
                    inputTokens: { minInclusive: 0, maxExclusive: 272001 },
                }),
                id: 'base',
            },
            {
                ...single('1', { inputTokens: { minInclusive: 272001 } }),
                id: 'long',
            },
        ]);
        expect(
            evaluateNativeProviderCalls(priced, [
                call(1, { inputTokens: 272000, requests: 1 }),
                call(2, { inputTokens: 272001, requests: 1 }),
            ]),
        ).toMatchObject({ status: 'calculated', micros: 816001n });
        expect(
            evaluateNativeProviderCalls(priced, [
                call(1),
                call(2, { providerCostUsd: '0.01', requests: 1 }),
            ]),
        ).toMatchObject({
            status: 'calculated',
            micros: 10002n,
            costSource: 'mixed',
        });
    });
    it('rejects duplicate, empty or over-limit call lists and propagates unresolved usage', () => {
        expect(evaluateNativeProviderCalls(rules(), [])).toMatchObject({
            status: 'unknown',
        });
        expect(
            evaluateNativeProviderCalls(rules(), [call(1), call(1)]),
        ).toMatchObject({ status: 'unknown' });
        expect(
            evaluateNativeProviderCalls(
                rules(),
                [1, 2, 3, 4, 5, 6].map((index) => call(index)),
            ),
        ).toMatchObject({ status: 'unknown' });
        expect(
            evaluateNativeProviderCalls(rules(), [call(1), call(2)]),
        ).toMatchObject({ status: 'unknown' });
    });
});
