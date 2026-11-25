import { describe, expect, it } from 'vitest';
import {
    assertLessonEnvelopeFits,
    forecastLessonEnvelope,
} from './generation-lesson-envelope';

const lesson = {
    budget: {
        inputCostMicrosPerMillionTokens: 0,
        outputCostMicrosPerMillionTokens: 0,
        minimumCostMicrosPerRequest: 10,
    },
    calls: [1200, 1500].map((outputTokens) => ({
        outputTokens,
        requestBytes: [16, 16, 16],
        futureSourceTokens: 0,
    })),
    maximumProviderCostMicros: 60,
    maximumCreditsMilli: '3',
    funding: 'customer' as const,
    tariff: {
        inputCreditsPerMillionTokens: '1',
        outputCreditsPerMillionTokens: '1',
    },
    receipts: [],
    now: new Date('2026-11-19T10:00:00Z'),
};

describe('lesson financial preflight', () => {
    it('forecasts operator exposure across all attempts and customer charges for one accepted candidate per unit', () => {
        expect(forecastLessonEnvelope(lesson)).toEqual({
            providerCostMicros: 60n,
            customerCreditsMilli: 3n,
        });
    });

    it('needs no allowance or pricing when only local assembly remains', () => {
        const complete = { ...lesson, calls: [], budget: undefined };
        expect(forecastLessonEnvelope(complete)).toEqual({
            providerCostMicros: 0n,
            customerCreditsMilli: 0n,
        });

        expect(() => assertLessonEnvelopeFits(complete)).not.toThrow();
    });

    it('allows a finite two-unit envelope plus two rejected calls per unit within the operator limit', () => {
        expect(() => assertLessonEnvelopeFits(lesson)).not.toThrow();
        expect(() =>
            assertLessonEnvelopeFits({
                ...lesson,
                maximumProviderCostMicros: 59,
            }),
        ).toThrow('available allowance');
    });

    it('accounts for measured planning, including expense on a discarded response', () => {
        const receipt = {
            inputLimit: 4000,
            actualCostMicros: 1n,
            inputTokens: 1000,
            outputTokens: 1,
            cacheReadTokens: 0,
            successful: 0,
        };

        expect(() =>
            assertLessonEnvelopeFits({ ...lesson, receipts: [receipt] }),
        ).toThrow('available allowance');

        expect(() =>
            assertLessonEnvelopeFits({
                ...lesson,
                maximumProviderCostMicros: 61,
                receipts: [receipt],
            }),
        ).not.toThrow();

        expect(() =>
            assertLessonEnvelopeFits({
                ...lesson,
                maximumProviderCostMicros: 61,
                receipts: [{ ...receipt, successful: 1 }],
            }),
        ).toThrow('available allowance');
    });

    it('prices input on zero-output-rate routes and reserves repairs for multiple exercises', () => {
        const priced = {
            ...lesson,
            funding: 'operator' as const,
            budget: {
                inputCostMicrosPerMillionTokens: 1_000_000,
                outputCostMicrosPerMillionTokens: 0,
            },
            calls: [0, 1].map(() => ({
                requestBytes: [400, 400, 400],
                futureSourceTokens: 50,
                outputTokens: 10,
            })),
        };

        // Two initial 150-token inputs, two targeted repairs and two fallbacks.
        expect(() =>
            assertLessonEnvelopeFits({
                ...priced,
                maximumProviderCostMicros: 900,
            }),
        ).not.toThrow();

        expect(() =>
            assertLessonEnvelopeFits({
                ...priced,
                maximumProviderCostMicros: 899,
            }),
        ).toThrow('allowance');

        expect(() =>
            assertLessonEnvelopeFits({
                ...priced,
                maximumProviderCostMicros: 900,
                funding: 'customer',
                maximumCreditsMilli: '0',
            }),
        ).toThrow('allowance');
    });

    it('weights each initial, repair and fallback by its native input price and per-request charge', () => {
        const date = lesson.now.toISOString();
        const nativeProviderPrice = {
            id: '00000000-0000-4000-8000-000000000001',
            version: 1,
            providerId: 'synthetic',
            modelId: 'native',
            meter: 'text-tokens',
            inputUsdPerMillionTokens: null,
            outputUsdPerMillionTokens: null,
            cacheReadUsdPerMillionTokens: null,
            cacheWriteUsdPerMillionTokens: null,
            usdPer1000Characters: null,
            minimumUsdPerRequest: null,
            effectiveAt: date,
            createdAt: date,
            createdBy: null,
            sourceReference: 'synthetic',
            sourceUrl: null,
            reason: 'Synthetic unit test',
            nativeRules: {
                version: 1,
                validFrom: date,
                validUntil: null,
                variants: [
                    {
                        id: 'base',
                        applies: {},
                        components: [
                            {
                                meter: 'inputTokens',
                                pricePerUnit: '1',
                                unitQuantity: 1_000_000,
                                chargeWhen: 'positive-usage',
                            },
                            {
                                meter: 'outputTokens',
                                pricePerUnit: '0',
                                unitQuantity: 1_000_000,
                                chargeWhen: 'positive-usage',
                            },
                            {
                                meter: 'requests',
                                pricePerUnit: '0.00001',
                                unitQuantity: 1,
                                chargeWhen: 'positive-usage',
                            },
                        ],
                    },
                ],
            },
        };
        const input = {
            ...lesson,
            funding: 'operator' as const,
            budget: { ...lesson.budget, nativeProviderPrice },
            calls: [
                {
                    requestBytes: [400, 800, 200],
                    futureSourceTokens: 0,
                    outputTokens: 20,
                },
            ],
        };

        // At four bytes/token: 100 + 200 + 50 input micros, plus 10 micros per call.
        expect(() =>
            assertLessonEnvelopeFits({
                ...input,
                maximumProviderCostMicros: 380,
            }),
        ).not.toThrow();

        expect(() =>
            assertLessonEnvelopeFits({
                ...input,
                maximumProviderCostMicros: 379,
            }),
        ).toThrow('allowance');
    });

    it('stops when a dispatched cost is unknown', () => {
        expect(() =>
            assertLessonEnvelopeFits({
                ...lesson,
                receipts: [
                    {
                        inputLimit: 4000,
                        actualCostMicros: null,
                        inputTokens: null,
                        outputTokens: null,
                        cacheReadTokens: null,
                        successful: 0,
                    },
                ],
            }),
        ).toThrow('reconciliation');
    });
});
