import { maximumAiCreditAmount, AiCreditInvalidAmountError } from './ai-credit';
import {
    parseCreditMilli,
    InvalidExactCreditAmountError,
} from './exact-credit-amount';
import {
    maximumActionChargeNumerator,
    roundActionChargeMilli,
} from './action-pricing';

/** Rates are canonical credits. Returned amounts are integer milli-credits. */
export function calculateSpeechPrice(
    characters: number,
    rate: number,
    minimum: number,
): bigint {
    if (!Number.isSafeInteger(characters) || characters < 0)
        throw new AiCreditInvalidAmountError();
    const rateMilli = rateAmount(rate);
    const minimumMilli = rateAmount(minimum);
    const charge = (BigInt(characters) * rateMilli + 999n) / 1000n;
    const result = charge > minimumMilli ? charge : minimumMilli;
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
        cachedInputCreditsPerMillionTokens?: number | null;
    },
): number {
    if (
        ![
            input.maxInputTokensPerAttempt,
            input.maxOutputTokensPerAttempt,
        ].every((value) => Number.isSafeInteger(value) && value >= 0)
    )
        throw new AiCreditInvalidAmountError();
    rateAmount(rates.inputCreditsPerMillionTokens);
    rateAmount(rates.outputCreditsPerMillionTokens);
    if (rates.cachedInputCreditsPerMillionTokens != null)
        rateAmount(rates.cachedInputCreditsPerMillionTokens);
    const amount = roundActionChargeMilli(
        maximumActionChargeNumerator(
            {
                inputTokens: input.maxInputTokensPerAttempt,
                outputTokens: input.maxOutputTokensPerAttempt,
            },
            {
                inputCreditsPerMillionTokens: String(
                    rates.inputCreditsPerMillionTokens,
                ),
                outputCreditsPerMillionTokens: String(
                    rates.outputCreditsPerMillionTokens,
                ),
                cachedInputCreditsPerMillionTokens:
                    rates.cachedInputCreditsPerMillionTokens == null
                        ? null
                        : String(rates.cachedInputCreditsPerMillionTokens),
            },
        ),
    );
    // Operator-funded flows can legitimately have no customer tariff.
    if (amount < 0n || amount > maximumAiCreditAmount)
        throw new AiCreditInvalidAmountError();
    return Number(amount);
}

function rateAmount(value: number): bigint {
    try {
        return parseCreditMilli(String(value));
    } catch (error) {
        if (error instanceof InvalidExactCreditAmountError)
            throw new AiCreditInvalidAmountError();
        throw error;
    }
}
