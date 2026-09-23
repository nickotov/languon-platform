import type { DictionaryGenerationProviderBudgetPolicy } from './ports/dictionary-generation-provider-policy';

export const dictionaryAiTextFormats = [
    'single-card:v1',
    'card-authoring:v1',
    'pasted-terms:v1',
    'import-pairs:v1',
    'document-terms:v1',
] as const;

export type DictionaryAiProviderId = 'deepseek' | 'kie';

export interface DictionaryAiModelDefinition {
    adapterRevision: 'openai-compatible:v1';
    aggregateBudget: DictionaryGenerationProviderBudgetPolicy;
    credentialReference: 'DEEPSEEK_API_KEY' | 'KIE_API_KEY';
    id: string;
    label: string;
    perCallMaxInputTokens: number;
    perCallMaxOutputTokens: number;
    providerId: DictionaryAiProviderId;
    supportedFormats: readonly string[];
}

export interface DictionaryAiExecutionSnapshot {
    adapterRevision: string;
    aggregateBudget: DictionaryGenerationProviderBudgetPolicy;
    credentialReference: 'DEEPSEEK_API_KEY' | 'KIE_API_KEY';
    enabledModelIds: string[];
    modelId: string;
    perCallMaxInputTokens: number;
    perCallMaxOutputTokens: number;
    providerId: DictionaryAiProviderId;
    supportedFormats: string[];
}

const commonAggregateBudget = {
    maxInputTokensPerAttempt: 262_144,
    maxOutputTokensPerAttempt: 40_960,
} as const;

export const dictionaryAiModelCatalog: readonly DictionaryAiModelDefinition[] =
    [
        {
            adapterRevision: 'openai-compatible:v1',
            aggregateBudget: {
                ...commonAggregateBudget,
                inputCostMicrosPerMillionTokens: 1_000_000,
                maxCostMicrosPerAttempt: 400_000,
                outputCostMicrosPerMillionTokens: 3_000_000,
            },
            credentialReference: 'DEEPSEEK_API_KEY',
            id: 'deepseek-chat',
            label: 'DeepSeek Chat',
            perCallMaxInputTokens: 64_000,
            perCallMaxOutputTokens: 8_192,
            providerId: 'deepseek',
            supportedFormats: dictionaryAiTextFormats,
        },
        {
            adapterRevision: 'openai-compatible:v1',
            aggregateBudget: {
                ...commonAggregateBudget,
                inputCostMicrosPerMillionTokens: 10_000_000,
                maxCostMicrosPerAttempt: 4_000_000,
                outputCostMicrosPerMillionTokens: 30_000_000,
            },
            credentialReference: 'KIE_API_KEY',
            id: 'gemini-2.5-pro',
            label: 'Gemini 2.5 Pro via Kie',
            perCallMaxInputTokens: 64_000,
            perCallMaxOutputTokens: 8_192,
            providerId: 'kie',
            supportedFormats: dictionaryAiTextFormats,
        },
    ] as const;

export function findDictionaryAiModel(
    providerId: DictionaryAiProviderId,
    modelId: string,
): DictionaryAiModelDefinition | null {
    return (
        dictionaryAiModelCatalog.find(
            (model) => model.providerId === providerId && model.id === modelId,
        ) ?? null
    );
}
