import { z } from 'zod';

import {
    defaultDictionaryGenerationProviderBudgetPolicy,
    dictionaryGenerationMinimumSupportedInputTokens,
    dictionaryGenerationProviderMaximumPricedCostMicros,
    type DictionaryGenerationProviderBudgetPolicy,
} from '../application/ports/dictionary-generation-provider-policy';
import {
    dictionaryPastedTermsGenerationMinimumInputTokensPerAttempt,
    dictionaryPastedTermsGenerationMinimumOutputTokensPerAttempt,
} from '../application/ports/pasted-terms-proposal-generator';
import {
    dictionaryImportPairsGenerationMinimumInputTokensPerAttempt,
    dictionaryImportPairsGenerationMinimumOutputTokensPerAttempt,
} from '../application/ports/import-pairs-proposal-generator';
import {
    dictionaryImportPairsGenerationFormat,
    dictionaryPastedTermsGenerationFormat,
} from '../domain/generation';

const providerPolicyEnvironmentNames = [
    'DICTIONARY_GENERATION_MAX_INPUT_TOKENS',
    'DICTIONARY_GENERATION_MAX_OUTPUT_TOKENS',
    'DICTIONARY_GENERATION_INPUT_COST_MICROS_PER_MILLION_TOKENS',
    'DICTIONARY_GENERATION_OUTPUT_COST_MICROS_PER_MILLION_TOKENS',
    'DICTIONARY_GENERATION_MAX_COST_MICROS_PER_ATTEMPT',
] as const;

const OptionalIntegerSchema = z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().safe().optional(),
);

const ProviderPolicyEnvironmentSchema = z.object({
    DICTIONARY_GENERATION_INPUT_COST_MICROS_PER_MILLION_TOKENS:
        OptionalIntegerSchema,
    DICTIONARY_GENERATION_MAX_COST_MICROS_PER_ATTEMPT: OptionalIntegerSchema,
    DICTIONARY_GENERATION_MAX_INPUT_TOKENS: OptionalIntegerSchema,
    DICTIONARY_GENERATION_MAX_OUTPUT_TOKENS: OptionalIntegerSchema,
    DICTIONARY_GENERATION_OUTPUT_COST_MICROS_PER_MILLION_TOKENS:
        OptionalIntegerSchema,
});

export function loadDictionaryGenerationProviderBudgetPolicy(
    values: NodeJS.ProcessEnv,
    options: { requireExplicit: boolean },
): DictionaryGenerationProviderBudgetPolicy {
    const raw = ProviderPolicyEnvironmentSchema.parse(values);
    const configuredCount = providerPolicyEnvironmentNames.filter(
        (name) => raw[name] !== undefined,
    ).length;
    if (
        (options.requireExplicit &&
            configuredCount !== providerPolicyEnvironmentNames.length) ||
        (!options.requireExplicit &&
            configuredCount !== 0 &&
            configuredCount !== providerPolicyEnvironmentNames.length)
    ) {
        throw policyConfigurationError(
            'All five dictionary generation provider budget settings must be configured together.',
        );
    }
    if (configuredCount === 0) {
        return defaultDictionaryGenerationProviderBudgetPolicy;
    }

    const policy: DictionaryGenerationProviderBudgetPolicy = {
        inputCostMicrosPerMillionTokens:
            raw.DICTIONARY_GENERATION_INPUT_COST_MICROS_PER_MILLION_TOKENS!,
        maxCostMicrosPerAttempt:
            raw.DICTIONARY_GENERATION_MAX_COST_MICROS_PER_ATTEMPT!,
        maxInputTokensPerAttempt: raw.DICTIONARY_GENERATION_MAX_INPUT_TOKENS!,
        maxOutputTokensPerAttempt: raw.DICTIONARY_GENERATION_MAX_OUTPUT_TOKENS!,
        outputCostMicrosPerMillionTokens:
            raw.DICTIONARY_GENERATION_OUTPUT_COST_MICROS_PER_MILLION_TOKENS!,
    };
    if (
        policy.maxInputTokensPerAttempt <
            dictionaryGenerationMinimumSupportedInputTokens ||
        policy.maxInputTokensPerAttempt > 262_144
    ) {
        throw policyConfigurationError(
            `DICTIONARY_GENERATION_MAX_INPUT_TOKENS must be between ${dictionaryGenerationMinimumSupportedInputTokens} and 262144 so the fixed provider framing, prompt, structured-output schema, and a valid card input fit before dispatch.`,
        );
    }
    if (
        policy.maxOutputTokensPerAttempt < 128 ||
        policy.maxOutputTokensPerAttempt > 40_960
    ) {
        throw policyConfigurationError(
            'DICTIONARY_GENERATION_MAX_OUTPUT_TOKENS must be between 128 and 40960.',
        );
    }
    for (const [name, value] of [
        [
            'DICTIONARY_GENERATION_INPUT_COST_MICROS_PER_MILLION_TOKENS',
            policy.inputCostMicrosPerMillionTokens,
        ],
        [
            'DICTIONARY_GENERATION_OUTPUT_COST_MICROS_PER_MILLION_TOKENS',
            policy.outputCostMicrosPerMillionTokens,
        ],
    ] as const) {
        if (value < 1 || value > 1_000_000_000) {
            throw policyConfigurationError(
                `${name} must be between 1 and 1000000000.`,
            );
        }
    }
    if (
        policy.maxCostMicrosPerAttempt < 1 ||
        policy.maxCostMicrosPerAttempt > 10_000_000
    ) {
        throw policyConfigurationError(
            'DICTIONARY_GENERATION_MAX_COST_MICROS_PER_ATTEMPT must be between 1 and 10000000.',
        );
    }
    const maximumPricedCost =
        dictionaryGenerationProviderMaximumPricedCostMicros(policy);
    if (policy.maxCostMicrosPerAttempt < maximumPricedCost) {
        throw policyConfigurationError(
            'DICTIONARY_GENERATION_MAX_COST_MICROS_PER_ATTEMPT must cover the configured maximum input and output token prices.',
        );
    }
    return policy;
}

export function assertDictionaryGenerationProviderBudgetSupportsFormats(
    policy: DictionaryGenerationProviderBudgetPolicy,
    formats: readonly string[],
): void {
    if (
        formats.includes(dictionaryPastedTermsGenerationFormat) &&
        (policy.maxInputTokensPerAttempt <
            dictionaryPastedTermsGenerationMinimumInputTokensPerAttempt ||
            policy.maxOutputTokensPerAttempt <
                dictionaryPastedTermsGenerationMinimumOutputTokensPerAttempt)
    ) {
        throw policyConfigurationError(
            'Pasted-term generation requires a 262144 input-token and 40960 output-token aggregate provider envelope.',
        );
    }
    if (
        formats.includes(dictionaryImportPairsGenerationFormat) &&
        (policy.maxInputTokensPerAttempt <
            dictionaryImportPairsGenerationMinimumInputTokensPerAttempt ||
            policy.maxOutputTokensPerAttempt <
                dictionaryImportPairsGenerationMinimumOutputTokensPerAttempt)
    )
        throw policyConfigurationError(
            'Import-pairs generation requires a 262144 input-token and 40960 output-token aggregate provider envelope.',
        );
}

function policyConfigurationError(message: string): z.ZodError {
    return new z.ZodError([
        {
            code: 'custom',
            message,
            path: ['DICTIONARY_GENERATION_MAX_COST_MICROS_PER_ATTEMPT'],
        },
    ]);
}
