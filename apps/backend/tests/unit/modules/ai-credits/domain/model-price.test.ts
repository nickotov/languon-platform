import { describe, expect, it } from 'vitest';
import {
    calculateSpeechPrice,
    maximumTextPrice,
} from '../../../../../src/modules/ai-credits/domain/model-price';
import { AiCreditInvalidAmountError } from '../../../../../src/modules/ai-credits/domain/ai-credit';
describe('immutable model tariff arithmetic', () => {
    it('prices the entire Unicode character count with ceiling and minimum', () => {
        expect(calculateSpeechPrice(101, 100, 1)).toBe(11n);
        expect(calculateSpeechPrice(1000, 100, 1)).toBe(100n);
        expect(calculateSpeechPrice(0, 0, 1)).toBe(1n);
        expect(calculateSpeechPrice(1, 1, 1)).toBe(1n);
    });
    it('rejects invalid and unsafe credit arithmetic', () => {
        expect(() => calculateSpeechPrice(-1, 100, 1)).toThrow(
            AiCreditInvalidAmountError,
        );
        expect(() =>
            calculateSpeechPrice(Number.MAX_SAFE_INTEGER, 1000000000, 1),
        ).toThrow(AiCreditInvalidAmountError);
    });
    it('rejects unsafe text inputs before arithmetic', () => {
        expect(() =>
            maximumTextPrice(
                {
                    maxInputTokensPerAttempt: -1,
                    maxOutputTokensPerAttempt: 100,
                },
                {
                    inputCreditsPerMillionTokens: 1,
                    outputCreditsPerMillionTokens: 1,
                },
            ),
        ).toThrow(AiCreditInvalidAmountError);
    });
    it('derives a safe text reservation from both independent meters', () => {
        expect(
            maximumTextPrice(
                {
                    maxInputTokensPerAttempt: 262144,
                    maxOutputTokensPerAttempt: 40960,
                },
                {
                    inputCreditsPerMillionTokens: 1000000,
                    outputCreditsPerMillionTokens: 3000000,
                },
            ),
        ).toBe(385024);
        expect(
            maximumTextPrice(
                { maxInputTokensPerAttempt: 1, maxOutputTokensPerAttempt: 1 },
                {
                    inputCreditsPerMillionTokens: 1,
                    outputCreditsPerMillionTokens: 1,
                },
            ),
        ).toBe(2);
    });
});
