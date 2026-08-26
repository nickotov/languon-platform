export interface DictionaryGenerationProviderBudgetPolicy {
    inputCostMicrosPerMillionTokens: number;
    maxCostMicrosPerAttempt: number;
    maxInputTokensPerAttempt: number;
    maxOutputTokensPerAttempt: number;
    outputCostMicrosPerMillionTokens: number;
}

export const dictionaryGenerationMinimumSupportedInputTokens = 32_768;

export const defaultDictionaryGenerationProviderBudgetPolicy: DictionaryGenerationProviderBudgetPolicy =
    {
        inputCostMicrosPerMillionTokens: 0,
        maxCostMicrosPerAttempt: 50_000,
        maxInputTokensPerAttempt: 262_144,
        maxOutputTokensPerAttempt: 40_960,
        outputCostMicrosPerMillionTokens: 0,
    };

export function dictionaryGenerationProviderUsageCostMicros(
    policy: DictionaryGenerationProviderBudgetPolicy,
    usage: { inputTokens: number; outputTokens: number },
): number {
    return (
        Math.ceil(
            (usage.inputTokens * policy.inputCostMicrosPerMillionTokens) /
                1_000_000,
        ) +
        Math.ceil(
            (usage.outputTokens * policy.outputCostMicrosPerMillionTokens) /
                1_000_000,
        )
    );
}

export function dictionaryGenerationProviderMaximumPricedCostMicros(
    policy: DictionaryGenerationProviderBudgetPolicy,
): number {
    return dictionaryGenerationProviderUsageCostMicros(policy, {
        inputTokens: policy.maxInputTokensPerAttempt,
        outputTokens: policy.maxOutputTokensPerAttempt,
    });
}
