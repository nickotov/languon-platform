import type { TextAiProviderRuntimeOptions } from './text-ai-provider-runtime-observer';
import { nativeTextPolicyFingerprint } from './native-text-policy-identity';
import { parseCreditMilli } from '../../../ai-credits/domain/exact-credit-amount';
import {
    createTextAiMastraGeneratorOptions,
    findTextAiModel as findTextAiProviderModel,
} from './text-ai-provider-catalog';
import {
    findTextAiModel,
    textAiExecutionLimits,
    type TextAiExecutionSnapshot,
    type TextAiProviderCredentials,
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
        model.retired === true ||
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
                snapshot.creditPricing.maxCreditsPerAttempt < 0 ||
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
export function resolveTextAiProviderOptions(
    input: TextAiProviderRuntimeOptions & {
        snapshot: TextAiExecutionSnapshot;
        budget: TextAiProviderBudgetPolicy;
        credentials: TextAiProviderCredentials;
        fetchProvider?: typeof fetch;
    },
) {
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
    const candidate = validateTextAiRouteRuntimeIdentity(input.snapshot, input);
    const providerPrice = candidate?.providerPrice;
    if (curated.providerId === 'openrouter' && !providerPrice)
        throw new Error('Pinned gateway pricing is required before dispatch.');
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
        ...(providerPrice ? { providerPrice } : {}),
        ...(input.authorizeNativeCall
            ? { authorizeNativeCall: input.authorizeNativeCall }
            : {}),
        ...(input.observeNativeCall
            ? { observeNativeCall: input.observeNativeCall }
            : {}),
        ...(candidate && input.onProviderFailure
            ? {
                  onProviderFailure: async (failure) => {
                      await input.onProviderFailure!({
                          routeId: candidate.routeId,
                          flowId: input.snapshot.routingAuthority!.flowId,
                          fingerprint: candidate.fingerprint,
                          reason: failure.reason,
                          failure,
                      });
                  },
              }
            : {}),
        ...(input.fetchProvider ? { fetchProvider: input.fetchProvider } : {}),
    });
}

/** Never execute admitted work with rotated credentials or a changed flow contract. */
export function validateTextAiRouteRuntimeIdentity(
    snapshot: TextAiExecutionSnapshot,
    options: TextAiProviderRuntimeOptions,
) {
    const authority = snapshot.routingAuthority;
    if (!authority) return undefined;
    const candidate = authority.candidates.find(
        (candidate) =>
            candidate.snapshot.providerId === snapshot.providerId &&
            candidate.snapshot.modelId === snapshot.modelId,
    );
    const current =
        candidate &&
        options.currentFingerprint?.(candidate.routeId, authority.flowId);
    const expected =
        current && candidate?.providerPrice.nativeRules
            ? nativeTextPolicyFingerprint(current)
            : current;
    if (
        !candidate ||
        !options.currentFingerprint ||
        expected !== candidate.fingerprint
    )
        throw new Error(
            'Approved provider route identity has changed. A matching check is required.',
        );
    return candidate;
}
