import { describe, expect, it } from 'vitest';
import {
    ProviderPricePublishRequestSchema,
    type ProviderPrice,
} from '@languon/contracts';
import {
    providerSpeechExpenseMicros,
    providerTextExpenseMicros,
} from '../../../../../src/modules/ai-credits/domain/provider-expense';
const price: ProviderPrice = {
    id: '11111111-1111-4111-8111-111111111111',
    version: 1,
    providerId: 'test',
    modelId: 'fake',
    meter: 'text-tokens',
    inputUsdPerMillionTokens: '0.000001',
    outputUsdPerMillionTokens: '0.000001',
    cacheReadUsdPerMillionTokens: null,
    cacheWriteUsdPerMillionTokens: null,
    usdPer1000Characters: null,
    effectiveAt: '2026-10-22T00:00:00Z',
    createdAt: '2026-10-22T00:00:00Z',
    createdBy: null,
    sourceReference: 'Synthetic fixture only',
    sourceUrl: null,
    reason: 'Synthetic fixture rate',
};
describe('pinned exact provider expense', () => {
    it('rounds combined input/output expense once to USD micros', () => {
        expect(
            providerTextExpenseMicros(price, {
                inputTokens: 1,
                outputTokens: 1,
            }),
        ).toBe(1n);
        expect(
            providerTextExpenseMicros(
                {
                    ...price,
                    inputUsdPerMillionTokens: '1.234567',
                    outputUsdPerMillionTokens: '8.765432',
                },
                { inputTokens: 1000000, outputTokens: 1000000 },
            ),
        ).toBe(9999999n);
    });
    it('keeps missing tariffs and missing cache rates unknown', () => {
        expect(
            providerTextExpenseMicros(null, {
                inputTokens: 1,
                outputTokens: 1,
            }),
        ).toBeNull();
        expect(
            providerTextExpenseMicros(price, {
                inputTokens: 10,
                outputTokens: 1,
                cacheReadTokens: 5,
            }),
        ).toBeNull();
        expect(() =>
            providerTextExpenseMicros(price, {
                inputTokens: 1,
                outputTokens: 1,
                cacheReadTokens: 2,
            }),
        ).toThrow();
    });
    it('handles cache and speech meters without floating point', () => {
        expect(
            providerTextExpenseMicros(
                {
                    ...price,
                    inputUsdPerMillionTokens: '2',
                    outputUsdPerMillionTokens: '4',
                    cacheReadUsdPerMillionTokens: '1',
                    cacheWriteUsdPerMillionTokens: '3',
                },
                {
                    inputTokens: 1000000,
                    outputTokens: 1000000,
                    cacheReadTokens: 200000,
                    cacheWriteTokens: 300000,
                },
            ),
        ).toBe(6100000n);
        expect(
            providerSpeechExpenseMicros(
                {
                    ...price,
                    meter: 'speech-characters',
                    usdPer1000Characters: '0.123456',
                },
                1,
            ),
        ).toBe(124n);
    });
    it('requires source evidence, meter-compatible rates and safe source references', () => {
        const {
            id: _id,
            version: _version,
            createdAt: _at,
            createdBy: _by,
            ...fields
        } = price;
        const valid = { ...fields, expectedVersion: 0 };
        expect(
            ProviderPricePublishRequestSchema.safeParse({
                ...valid,
                sourceUrl: 'not-a-url',
            }).success,
        ).toBe(false);
        expect(
            ProviderPricePublishRequestSchema.safeParse({
                ...valid,
                sourceUrl: 'https://user:password@example.com/prices',
            }).success,
        ).toBe(false);
        expect(ProviderPricePublishRequestSchema.safeParse(valid).success).toBe(
            true,
        );
        expect(
            ProviderPricePublishRequestSchema.safeParse({
                ...valid,
                sourceUrl: 'javascript:alert(1)',
            }).success,
        ).toBe(false);
        expect(
            ProviderPricePublishRequestSchema.safeParse({
                ...valid,
                meter: 'speech-characters',
            }).success,
        ).toBe(false);
        expect(
            ProviderPricePublishRequestSchema.safeParse({
                ...valid,
                inputUsdPerMillionTokens: '1e-6',
            }).success,
        ).toBe(false);
    });
});
