import { describe, expect, it } from 'vitest';
import type { ProviderPrice } from '@languon/contracts';
import {
    providerAffordableOutputTokens,
    reviewedTextProviderBudget,
} from './provider-cost-admission';

const price: ProviderPrice = {
    id: '11111111-1111-4111-8111-111111111111',
    version: 1,
    providerId: 'fixture',
    modelId: 'fixture',
    meter: 'text-tokens',
    inputUsdPerMillionTokens: '1',
    outputUsdPerMillionTokens: '2',
    cacheReadUsdPerMillionTokens: '0.2',
    cacheWriteUsdPerMillionTokens: '3',
    usdPer1000Characters: null,
    effectiveAt: '2026-10-22T00:00:00Z',
    createdAt: '2026-10-22T00:00:00Z',
    createdBy: null,
    sourceReference: 'Synthetic fixture only',
    sourceUrl: null,
    reason: 'Synthetic fixture rate',
};
const configured = {
    inputCostMicrosPerMillionTokens: 0,
    outputCostMicrosPerMillionTokens: 0,
    maxCostMicrosPerAttempt: 10,
    maxInputTokensPerAttempt: 1000,
    maxOutputTokensPerAttempt: 1000,
};
describe('reviewed provider execution admission', () => {
    it('uses the largest supported input/cache rate while preserving operator maxima', () => {
        expect(reviewedTextProviderBudget(price, configured)).toEqual({
            ...configured,
            inputCostMicrosPerMillionTokens: 3000000,
            outputCostMicrosPerMillionTokens: 2000000,
        });
    });
    it('caps output against actual reviewed rates and already consumed allowance', () => {
        const budget = reviewedTextProviderBudget(price, configured);
        expect(
            providerAffordableOutputTokens({
                inputTokens: 1,
                outputLimit: 1000,
                budget,
            }),
        ).toBe(3);
        expect(
            providerAffordableOutputTokens({
                inputTokens: 1,
                outputLimit: 1000,
                spentCostMicros: 5,
                budget,
            }),
        ).toBe(1);
        expect(
            providerAffordableOutputTokens({
                inputTokens: 4,
                outputLimit: 1000,
                budget,
            }),
        ).toBe(0);
    });
    it('rejects a request below its minimum without adding that minimum to token costs', () => {
        const budget = reviewedTextProviderBudget(
            { ...price, minimumUsdPerRequest: '0.000006' },
            configured,
        );
        expect(
            providerAffordableOutputTokens({
                inputTokens: 0,
                outputLimit: 1000,
                spentCostMicros: 5,
                budget,
            }),
        ).toBe(0);
        expect(
            providerAffordableOutputTokens({
                inputTokens: 0,
                outputLimit: 1000,
                spentCostMicros: 4,
                budget,
            }),
        ).toBe(3);
        expect(
            providerAffordableOutputTokens({
                inputTokens: 1,
                outputLimit: 1000,
                budget,
            }),
        ).toBe(3);
    });
    it('requires an explicit positive reviewed minimum for EvoLink only', () => {
        expect(() =>
            reviewedTextProviderBudget(
                { ...price, providerId: 'evolink' },
                configured,
            ),
        ).toThrow('minimum');
        expect(() =>
            reviewedTextProviderBudget(
                { ...price, providerId: 'evolink', minimumUsdPerRequest: '0' },
                configured,
            ),
        ).toThrow('minimum');
        expect(() =>
            reviewedTextProviderBudget(
                {
                    ...price,
                    providerId: 'evolink',
                    minimumUsdPerRequest: '0.000150',
                },
                configured,
            ),
        ).not.toThrow();
    });
    it('requires reviewed rates for all declared meters and rejects unsupported numeric rates', () => {
        expect(() => reviewedTextProviderBudget(null, configured)).toThrow();
        expect(() =>
            reviewedTextProviderBudget(
                { ...price, cacheWriteUsdPerMillionTokens: null },
                configured,
            ),
        ).toThrow();
        expect(() =>
            reviewedTextProviderBudget(
                { ...price, outputUsdPerMillionTokens: '2147.483648' },
                configured,
            ),
        ).toThrow();
        expect(() =>
            reviewedTextProviderBudget(
                {
                    ...price,
                    cacheReadUsdPerMillionTokens: null,
                    cacheWriteUsdPerMillionTokens: null,
                },
                configured,
                { read: 'input-price-upper-bound', write: 'none' },
            ),
        ).not.toThrow();
    });
});
