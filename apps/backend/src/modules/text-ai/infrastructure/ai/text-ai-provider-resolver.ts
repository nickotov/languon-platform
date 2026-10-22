import { parseCreditMilli } from '../../../ai-credits/domain/exact-credit-amount';
import {
    createTextAiMastraGeneratorOptions,
    findTextAiModel as findTextAiProviderModel,
} from './text-ai-provider-catalog';
import {
    findTextAiModel,
    textAiExecutionLimits,
    type TextAiExecutionSnapshot,
    type TextAiProviderBudgetPolicy,
} from '../../application/text-ai-provider-catalog';

export function resolveTextAiExecutionSnapshot(
    snapshot: TextAiExecutionSnapshot,
    budget: TextAiProviderBudgetPolicy,
) {
    const model = findTextAiModel(snapshot.providerId, snapshot.modelId);
    const limits = model
        ? textAiExecutionLimits(model, snapshot.supportedFormats)
        : null;
    if (
        !model ||
        !limits ||
        snapshot.adapterRevision !== model.adapterRevision ||
        snapshot.credentialReference !== model.credentialReference ||
        snapshot.perCallMaxInputTokens !== limits.perCallMaxInputTokens ||
        snapshot.perCallMaxOutputTokens !== limits.perCallMaxOutputTokens ||
        !snapshot.enabledModelIds.includes(snapshot.modelId) ||
        !isStringSubset(snapshot.supportedFormats, model.supportedFormats) ||
        (snapshot.creditPricing !== undefined &&
            (snapshot.creditPricing.revision !== 1 ||
                !Number.isSafeInteger(
                    snapshot.creditPricing.maxCreditsPerAttempt,
                ) ||
                snapshot.creditPricing.maxCreditsPerAttempt <= 0 ||
                ![
                    snapshot.creditPricing.inputCreditsPerMillionTokens,
                    snapshot.creditPricing.outputCreditsPerMillionTokens,
                    ...(snapshot.creditPricing
                        .cachedInputCreditsPerMillionTokens == null
                        ? []
                        : [
                              snapshot.creditPricing
                                  .cachedInputCreditsPerMillionTokens,
                          ]),
                ].every((value) => validCustomerRate(value)))) ||
        !sameBudget(snapshot.aggregateBudget, budget)
    )
        throw new Error('Text AI provider execution snapshot is unsupported.');
    return model;
}

function validCustomerRate(value: number): boolean {
    try {
        parseCreditMilli(String(value));
        return true;
    } catch {
        return false;
    }
}

function sameBudget(
    left: TextAiProviderBudgetPolicy,
    right: TextAiProviderBudgetPolicy,
): boolean {
    return (
        left.inputCostMicrosPerMillionTokens ===
            right.inputCostMicrosPerMillionTokens &&
        left.maxCostMicrosPerAttempt === right.maxCostMicrosPerAttempt &&
        left.maxInputTokensPerAttempt === right.maxInputTokensPerAttempt &&
        left.maxOutputTokensPerAttempt === right.maxOutputTokensPerAttempt &&
        left.outputCostMicrosPerMillionTokens ===
            right.outputCostMicrosPerMillionTokens
    );
}

function isStringSubset(
    required: readonly string[],
    supported: readonly string[],
): boolean {
    // A newer release may add code-reviewed formats to the same model. Older
    // revisions remain valid, but rollback workers still reject revisions that
    // require a format absent from their catalog.
    const supportedValues = new Set(supported);
    return required.every((value) => supportedValues.has(value));
}

/** Resolves trusted adapters only; capability modules retain their own prompts and orchestration. */
export function resolveTextAiProviderOptions(input: {
    snapshot: TextAiExecutionSnapshot;
    budget: TextAiProviderBudgetPolicy;
    credentials: Partial<Record<'DEEPSEEK_API_KEY' | 'KIE_API_KEY', string>>;
    fetchProvider?: typeof fetch;
}) {
    const curated = resolveTextAiExecutionSnapshot(
        input.snapshot,
        input.budget,
    );
    const model = findTextAiProviderModel(
        `${curated.providerId}/${curated.id}`,
    );
    const credential = input.credentials[input.snapshot.credentialReference];
    if (!model || !credential)
        throw new Error('Text AI provider credential is unavailable.');
    return createTextAiMastraGeneratorOptions({
        apiKey: credential,
        model: {
            ...model,
            requestLimits: {
                maxInputTokens: input.snapshot.perCallMaxInputTokens,
                maxOutputTokens: input.snapshot.perCallMaxOutputTokens,
            },
        },
        providerBudget: input.budget,
        ...(input.fetchProvider ? { fetchProvider: input.fetchProvider } : {}),
    });
}
