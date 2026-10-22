import { describe, expect, it } from 'vitest';
import { readProviderTokenUsage } from '../../../../../src/modules/text-ai/infrastructure/ai/provider-token-usage';
const limits = { maxInputTokens: 100, maxOutputTokens: 20 };
describe('provider token meter normalization', () => {
    it('preserves ordinary totals and reported cache categories without inventing absent meters', () => {
        expect(
            readProviderTokenUsage(
                { inputTokens: 80, outputTokens: 10 },
                limits,
            ),
        ).toEqual({ inputTokens: 80, outputTokens: 10 });
        expect(
            readProviderTokenUsage(
                { inputTokens: 80, outputTokens: 10, cachedInputTokens: 30 },
                limits,
            ),
        ).toEqual({ inputTokens: 80, outputTokens: 10, cacheReadTokens: 30 });
        expect(
            readProviderTokenUsage(
                {
                    inputTokens: { total: 80, cacheRead: 30, cacheWrite: 5 },
                    outputTokens: { total: 10 },
                },
                limits,
            ),
        ).toEqual({
            inputTokens: 80,
            outputTokens: 10,
            cacheReadTokens: 30,
            cacheWriteTokens: 5,
        });
        expect(
            readProviderTokenUsage(
                {
                    inputTokens: 80,
                    outputTokens: 10,
                    inputTokenDetails: {
                        cacheReadTokens: 0,
                        cacheWriteTokens: 5,
                    },
                },
                limits,
            ),
        ).toEqual({
            inputTokens: 80,
            outputTokens: 10,
            cacheReadTokens: 0,
            cacheWriteTokens: 5,
        });
    });
    it('rejects conflicting, impossible and out-of-allowance categories', () => {
        for (const value of [
            {
                inputTokens: 80,
                outputTokens: 10,
                cachedInputTokens: 30,
                cacheReadTokens: 31,
            },
            {
                inputTokens: 80,
                outputTokens: 10,
                cacheReadTokens: 70,
                cacheWriteTokens: 11,
            },
            { inputTokens: 101, outputTokens: 10 },
            { inputTokens: 80, outputTokens: 21 },
            { inputTokens: 80, outputTokens: 10, cacheReadTokens: -1 },
            { inputTokens: 80, outputTokens: 10, cacheWriteTokens: 0.5 },
        ])
            expect(() => readProviderTokenUsage(value, limits)).toThrow();
    });
});
