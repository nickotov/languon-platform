import { maximumAiCreditAmount, AiCreditInvalidAmountError } from './ai-credit';

export function calculateSpeechPrice(
    characters: number,
    rate: number,
    minimum: number,
): bigint {
    if (
        ![characters, rate, minimum].every(
            (value) => Number.isSafeInteger(value) && value >= 0,
        )
    )
        throw new AiCreditInvalidAmountError();
    const charge = (BigInt(characters) * BigInt(rate) + 999n) / 1000n;
    const result = charge > BigInt(minimum) ? charge : BigInt(minimum);
    if (result > maximumAiCreditAmount) throw new AiCreditInvalidAmountError();
    return result;
}
export function maximumTextPrice(
    input: {
        maxInputTokensPerAttempt: number;
        maxOutputTokensPerAttempt: number;
    },
    rates: {
        inputCreditsPerMillionTokens: number;
        outputCreditsPerMillionTokens: number;
    },
): number {
    if (
        ![
            input.maxInputTokensPerAttempt,
            input.maxOutputTokensPerAttempt,
            rates.inputCreditsPerMillionTokens,
            rates.outputCreditsPerMillionTokens,
        ].every((value) => Number.isSafeInteger(value) && value >= 0)
    )
        throw new AiCreditInvalidAmountError();
    const sum =
        (BigInt(input.maxInputTokensPerAttempt) *
            BigInt(rates.inputCreditsPerMillionTokens) +
            999999n) /
            1000000n +
        (BigInt(input.maxOutputTokensPerAttempt) *
            BigInt(rates.outputCreditsPerMillionTokens) +
            999999n) /
            1000000n;
    if (sum <= 0n || sum > maximumAiCreditAmount)
        throw new AiCreditInvalidAmountError();
    return Number(sum);
}
