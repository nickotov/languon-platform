import type { TextAiRoutingAuthority } from './text-ai-routing-authority';
import type { ProviderPrice, ProviderExecutionFacts } from '@languon/contracts';
export interface TextAiProviderBudgetPolicy {
    nativeProviderPrice?: ProviderPrice;
    nativeExecutionFacts?: ProviderExecutionFacts;
    nativeMaxCalls?: number;
    minimumCostMicrosPerRequest?: number;
    inputCostMicrosPerMillionTokens: number;
    maxCostMicrosPerAttempt: number;
    maxInputTokensPerAttempt: number;
    maxOutputTokensPerAttempt: number;
    outputCostMicrosPerMillionTokens: number;
}

export const textAiMinimumSupportedInputTokens = 32_768;

export const defaultTextAiProviderBudgetPolicy: TextAiProviderBudgetPolicy = {
    inputCostMicrosPerMillionTokens: 0,
    maxCostMicrosPerAttempt: 50_000,
    maxInputTokensPerAttempt: 262_144,
    maxOutputTokensPerAttempt: 40_960,
    outputCostMicrosPerMillionTokens: 0,
};

export function textAiProviderUsageCostMicros(
    policy: TextAiProviderBudgetPolicy,
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

export function textAiProviderMaximumPricedCostMicros(
    policy: TextAiProviderBudgetPolicy,
): number {
    return textAiProviderUsageCostMicros(policy, {
        inputTokens: policy.maxInputTokensPerAttempt,
        outputTokens: policy.maxOutputTokensPerAttempt,
    });
}

export const textAiConversationFormats = [
    'conversation:v1',
    'portrait-interview:v1',
] as const;

export const textAiTextsFormats = [
    'text-detection:v1',
    'text-detection:v2',
    'text-translation:v1',
    'text-translation:v2',
    'text-translation:v3',
    'text-selection-card:v1',
] as const;

export const textAiTextFormats = [
    'single-card:v1',
    'single-card:v2',
    'card-authoring:v1',
    'card-authoring:v2',
    'card-authoring:v3',
    'pasted-terms:v1',
    'pasted-terms:v2',
    'import-pairs:v1',
    'import-pairs:v2',
    'document-terms:v1',
    'document-terms:v2',
    'sentence-generation:v1',
    'sentence-generation:v2',
    'sentence-check:v1',
    ...textAiTextsFormats,
] as const;

export type TextAiWorkFormat =
    | (typeof textAiTextFormats)[number]
    | (typeof textAiConversationFormats)[number];
export const textAiSentenceFormats = [
    'sentence-generation:v1',
    'sentence-generation:v2',
    'sentence-check:v1',
] as const;

export const textAiProviderIds = [
    'deepseek',
    'kie',
    'evolink',
    'openrouter',
] as const;
export type TextAiProviderId = (typeof textAiProviderIds)[number];
export type TextAiCredentialReference =
    | 'DEEPSEEK_API_KEY'
    | 'KIE_API_KEY'
    | 'EVOLINK_API_KEY'
    | 'OPENROUTER_API_KEY';
export type TextAiProviderCredentials = Partial<
    Record<TextAiCredentialReference, string>
>;

export interface TextAiCreditPricing {
    cachedInputCreditsPerMillionTokens?: number | null;
    rateRevisionId?: string;
    inputCreditsPerMillionTokens: number;
    maxCreditsPerAttempt: number;
    outputCreditsPerMillionTokens: number;
    revision: 1;
}

export interface TextAiModelDefinition {
    adapterRevision: 'openai-compatible:v1';
    aggregateBudget: TextAiProviderBudgetPolicy;
    creditPricing: TextAiCreditPricing;
    credentialReference: TextAiCredentialReference;
    id: string;
    /** Historical identities remain readable; retired routes cannot dispatch. */
    retired?: boolean;
    processingControlsRevision?: string;
    label: string;
    perCallMaxInputTokens: number;
    perCallMaxOutputTokens: number;
    providerId: TextAiProviderId;
    supportedCapabilities: readonly ['structured-text'];
    supportedFormats: readonly string[];
}

export interface TextAiExecutionSnapshot {
    routingAuthority?: TextAiRoutingAuthority;
    adapterRevision: string;
    aggregateBudget: TextAiProviderBudgetPolicy;
    credentialReference: TextAiCredentialReference;
    /** Missing only on immutable revisions created before AI-credit support. */
    creditPricing?: TextAiCreditPricing;
    enabledModelIds: string[];
    modelId: string;
    perCallMaxInputTokens: number;
    perCallMaxOutputTokens: number;
    providerId: TextAiProviderId;
    supportedFormats: string[];
}

const commonAggregateBudget = {
    maxInputTokensPerAttempt: 262_144,
    maxOutputTokensPerAttempt: 40_960,
} as const;

export const textAiModelCatalog: readonly TextAiModelDefinition[] = [
    {
        adapterRevision: 'openai-compatible:v1',
        aggregateBudget: {
            ...commonAggregateBudget,
            inputCostMicrosPerMillionTokens: 1_000_000,
            maxCostMicrosPerAttempt: 400_000,
            outputCostMicrosPerMillionTokens: 3_000_000,
        },
        creditPricing: {
            inputCreditsPerMillionTokens: 1_000_000,
            maxCreditsPerAttempt: 400_000,
            outputCreditsPerMillionTokens: 3_000_000,
            revision: 1,
        },
        credentialReference: 'DEEPSEEK_API_KEY',
        id: 'deepseek-flash',
        label: 'DeepSeek Flash',
        perCallMaxInputTokens: 64_000,
        perCallMaxOutputTokens: 8_192,
        providerId: 'deepseek',
        supportedCapabilities: ['structured-text'],
        supportedFormats: [...textAiTextFormats, ...textAiConversationFormats],
    },
    {
        adapterRevision: 'openai-compatible:v1',
        aggregateBudget: {
            ...commonAggregateBudget,
            inputCostMicrosPerMillionTokens: 10_000_000,
            maxCostMicrosPerAttempt: 4_000_000,
            outputCostMicrosPerMillionTokens: 30_000_000,
        },
        creditPricing: {
            inputCreditsPerMillionTokens: 10_000_000,
            maxCreditsPerAttempt: 4_000_000,
            outputCreditsPerMillionTokens: 30_000_000,
            revision: 1,
        },
        credentialReference: 'KIE_API_KEY',
        id: 'gemini-2.5-pro',
        retired: true,
        label: 'Gemini 2.5 Pro via Kie',
        perCallMaxInputTokens: 64_000,
        perCallMaxOutputTokens: 8_192,
        providerId: 'kie',
        supportedCapabilities: ['structured-text'],
        supportedFormats: textAiTextFormats,
    },
    ...gatewayModels(),
] as const;

function gatewayModels(): TextAiModelDefinition[] {
    const routes: Array<
        Pick<
            TextAiModelDefinition,
            | 'providerId'
            | 'id'
            | 'label'
            | 'credentialReference'
            | 'processingControlsRevision'
        >
    > = [
        {
            providerId: 'evolink',
            id: 'gpt-6-luna',
            label: 'Luna via EvoLink',
            credentialReference: 'EVOLINK_API_KEY',
            processingControlsRevision: 'evolink-processing-review-required:v1',
        },
        {
            providerId: 'openrouter',
            id: 'openai/gpt-6-luna',
            label: 'Luna via OpenRouter',
            credentialReference: 'OPENROUTER_API_KEY',
            processingControlsRevision: 'openrouter-restricted:v1',
        },
        {
            providerId: 'openrouter',
            id: 'qwen/qwen3.5-flash-02-23',
            label: 'Qwen3.5 Flash via OpenRouter',
            credentialReference: 'OPENROUTER_API_KEY',
            processingControlsRevision: 'openrouter-restricted:v1',
        },
        {
            providerId: 'openrouter',
            id: 'google/gemini-3.1-flash-lite',
            label: 'Gemini 3.1 Flash Lite via OpenRouter',
            credentialReference: 'OPENROUTER_API_KEY',
            processingControlsRevision: 'openrouter-restricted:v1',
        },
    ];
    return routes.map((route) => ({
        ...route,
        adapterRevision: 'openai-compatible:v1',
        aggregateBudget: {
            ...commonAggregateBudget,
            inputCostMicrosPerMillionTokens: 1_000_000,
            outputCostMicrosPerMillionTokens: 3_000_000,
            maxCostMicrosPerAttempt: 400_000,
        },
        // Legacy snapshot shape only. Published per-flow tariffs govern new work.
        creditPricing: {
            inputCreditsPerMillionTokens: 1_000_000,
            outputCreditsPerMillionTokens: 3_000_000,
            maxCreditsPerAttempt: 400_000,
            revision: 1,
        },
        perCallMaxInputTokens: 64_000,
        perCallMaxOutputTokens: 10_000,
        supportedCapabilities: ['structured-text'],
        supportedFormats: [...textAiTextFormats, ...textAiConversationFormats],
    }));
}

export function findTextAiModel(
    providerId: TextAiProviderId,
    modelId: string,
): TextAiModelDefinition | null {
    return (
        textAiModelCatalog.find(
            (model) => model.providerId === providerId && model.id === modelId,
        ) ?? null
    );
}

export function textAiCreditPricingMatches(
    left: TextAiCreditPricing | undefined,
    right: TextAiCreditPricing,
): boolean {
    return (
        left?.revision === right.revision &&
        left.inputCreditsPerMillionTokens ===
            right.inputCreditsPerMillionTokens &&
        left.outputCreditsPerMillionTokens ===
            right.outputCreditsPerMillionTokens &&
        (left.cachedInputCreditsPerMillionTokens ?? null) ===
            (right.cachedInputCreditsPerMillionTokens ?? null) &&
        left.maxCreditsPerAttempt === right.maxCreditsPerAttempt
    );
}

/** Reviewed request caps, distinct from aggregate accounting and provider maxima.
 * https://api-docs.deepseek.com/quick_start/pricing
 * Dictionary and other current task profiles retain their base caps.
 */
export function textAiExecutionLimits(
    model: TextAiModelDefinition,
    formats: readonly string[],
): { perCallMaxInputTokens: number; perCallMaxOutputTokens: number } {
    if (
        model.providerId === 'deepseek' &&
        model.id === 'deepseek-flash' &&
        formats.length === 1 &&
        (formats[0] === 'text-translation:v2' ||
            formats[0] === 'text-translation:v3')
    )
        return {
            perCallMaxInputTokens: 128_000,
            perCallMaxOutputTokens: 32_768,
        };
    return {
        perCallMaxInputTokens: model.perCallMaxInputTokens,
        perCallMaxOutputTokens: model.perCallMaxOutputTokens,
    };
}
