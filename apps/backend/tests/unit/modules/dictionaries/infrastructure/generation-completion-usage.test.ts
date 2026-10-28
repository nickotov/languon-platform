import { describe, expect, it } from 'vitest';
import { generationCompletionUsage } from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/generation-completion-usage';

const budget = {
    maxInputTokensPerAttempt: 10_000,
    maxOutputTokensPerAttempt: 1_000,
    maxCostMicrosPerAttempt: 1_000,
    inputCostMicrosPerMillionTokens: 1_000,
    outputCostMicrosPerMillionTokens: 1_000,
};
const job = {
    attemptCount: 1,
    providerReservedCostMicros: 1_000,
    providerReservedInputTokens: 10_000,
    providerReservedOutputTokens: 1_000,
};

describe('dictionary completion provider usage projection', () => {
    it('keeps native expense in canonical receipts when synthetic flat rates exceed integer storage and reservation', () => {
        const syntheticBudget = {
            ...budget,
            inputCostMicrosPerMillionTokens: Number.MAX_SAFE_INTEGER,
        };
        expect(
            generationCompletionUsage(
                job,
                syntheticBudget,
                { inputTokens: 9_000, outputTokens: 1 },
                true,
            ),
        ).toEqual({ costMicros: null, inputTokens: 9_000, outputTokens: 1 });
        expect(() =>
            generationCompletionUsage(
                job,
                syntheticBudget,
                { inputTokens: 9_000, outputTokens: 1 },
                false,
            ),
        ).toThrow('exceeds reservation');
    });
    it('preserves per-attempt and cumulative token limits for native completion', () => {
        expect(() =>
            generationCompletionUsage(
                job,
                budget,
                { inputTokens: 10_001, outputTokens: 1 },
                true,
            ),
        ).toThrow('Invalid provider usage');
        expect(() =>
            generationCompletionUsage(
                { ...job, attemptCount: 2 },
                budget,
                { inputTokens: 1, outputTokens: 1 },
                true,
            ),
        ).toThrow('exceeds reservation');
    });
    it('keeps legacy expense projection and missing-meter reservation behavior', () => {
        expect(
            generationCompletionUsage(
                job,
                budget,
                { inputTokens: 1_000, outputTokens: 1_000 },
                false,
            ),
        ).toEqual({ costMicros: 2, inputTokens: 1_000, outputTokens: 1_000 });
        expect(
            generationCompletionUsage(job, budget, undefined, false),
        ).toEqual({
            costMicros: 1_000,
            inputTokens: 10_000,
            outputTokens: 1_000,
        });
        expect(generationCompletionUsage(job, budget, undefined, true)).toEqual(
            { costMicros: null, inputTokens: 10_000, outputTokens: 1_000 },
        );
    });
});
