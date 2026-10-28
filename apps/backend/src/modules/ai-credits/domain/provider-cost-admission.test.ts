import { describe, expect, it } from 'vitest';
import type { ProviderPrice } from '@languon/contracts';
import {
    nativeTextProviderReservationMicros,
    providerAffordableOutputTokens,
    reviewedTextProviderBudget,
    type ProviderExecutionBudget,
} from './provider-cost-admission';

const facts = { dispatchedAt: '2026-10-28T12:00:00.000Z' };
const price: ProviderPrice = {
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
    effectiveAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: null,
    sourceReference: 'synthetic',
    sourceUrl: null,
    reason: 'Synthetic bounded fixture',
    nativeRules: {
        version: 1,
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: null,
        variants: [
            {
                id: 'base',
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
    },
};
const configured: ProviderExecutionBudget = {
    inputCostMicrosPerMillionTokens: 0,
    outputCostMicrosPerMillionTokens: 0,
    maxCostMicrosPerAttempt: 2700,
    maxInputTokensPerAttempt: 1000,
    maxOutputTokensPerAttempt: 10000,
};

describe('native provider dispatch admission', () => {
    it('finds the exact affordable output boundary without flattening official precision', () => {
        const budget = reviewedTextProviderBudget(
            price,
            configured,
            undefined,
            facts,
        );
        expect(budget.nativeProviderPrice).toBe(price);
        expect(
            providerAffordableOutputTokens({
                inputTokens: 1000,
                outputLimit: 10000,
                budget,
            }),
        ).toBe(2000);
        expect(
            providerAffordableOutputTokens({
                inputTokens: 1000,
                outputLimit: 10000,
                spentCostMicros: 1200,
                budget,
            }),
        ).toBe(1000);
        expect(
            providerAffordableOutputTokens({
                inputTokens: 1001,
                outputLimit: 10000,
                budget,
            }),
        ).toBe(0);
    });
    it('bounds mixed per-call context cards and repeated native component minimums', () => {
        const mixed = structuredClone(price);
        mixed.nativeRules!.variants = [
            {
                id: 'input',
                applies: {
                    inputTokens: { minInclusive: 0, maxExclusive: 1001 },
                },
                components: [
                    {
                        meter: 'inputTokens',
                        pricePerUnit: '2',
                        unitQuantity: 1_000_000,
                        chargeWhen: 'positive-usage',
                    },
                    {
                        meter: 'outputTokens',
                        pricePerUnit: '0',
                        unitQuantity: 1_000_000,
                        chargeWhen: 'positive-usage',
                    },
                ],
            },
            {
                id: 'output',
                applies: { inputTokens: { minInclusive: 1001 } },
                components: [
                    {
                        meter: 'inputTokens',
                        pricePerUnit: '0',
                        unitQuantity: 1_000_000,
                        chargeWhen: 'positive-usage',
                    },
                    {
                        meter: 'outputTokens',
                        pricePerUnit: '3',
                        unitQuantity: 1_000_000,
                        chargeWhen: 'positive-usage',
                    },
                ],
            },
        ];
        expect(
            nativeTextProviderReservationMicros(mixed, facts, 2000, 2000),
        ).toBe(10000n);
        mixed.nativeRules!.currency = {
            code: 'UC',
            usdNumerator: '1',
            unitDenominator: '680000',
        };
        mixed.nativeRules!.variants = [
            {
                id: 'fees',
                applies: {},
                components: [
                    {
                        meter: 'inputTokens',
                        pricePerUnit: '0',
                        unitQuantity: 1,
                        minimum: '100',
                        chargeWhen: 'request',
                    },
                    {
                        meter: 'outputTokens',
                        pricePerUnit: '0',
                        unitQuantity: 1,
                        minimum: '100',
                        chargeWhen: 'request',
                    },
                ],
            },
        ];
        expect(
            nativeTextProviderReservationMicros(mixed, facts, 1000, 1000),
        ).toBe(1471n);
    });
    it('rejects incompatible or incomplete native text components before reserving money', () => {
        for (const meter of [
            'characters',
            'audioOutputTokens',
            'inputTokens',
        ] as const) {
            const invalid = structuredClone(price);
            invalid.nativeRules!.variants[0]!.components = [
                {
                    meter,
                    pricePerUnit: '1',
                    unitQuantity: 1,
                    chargeWhen: 'positive-usage',
                },
            ];
            expect(
                nativeTextProviderReservationMicros(invalid, facts, 1000, 1000),
            ).toBeNull();
            expect(() =>
                reviewedTextProviderBudget(
                    invalid,
                    configured,
                    undefined,
                    facts,
                ),
            ).toThrow();
        }
    });
    it('fails closed when the dispatch horizon has an unpriced schedule gap', () => {
        const invalid = structuredClone(price);
        invalid.nativeRules!.validUntil = '2026-10-28T12:00:00.001Z';
        expect(
            nativeTextProviderReservationMicros(
                invalid,
                { ...facts, latestDispatchAt: '2026-10-28T12:00:00.001Z' },
                1,
                1,
            ),
        ).toBeNull();
    });
});
