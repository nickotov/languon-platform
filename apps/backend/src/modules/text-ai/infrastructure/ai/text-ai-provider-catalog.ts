import type { OpenAICompatibleConfig } from '@mastra/core/llm';

import {
    findTextAiModel as findCuratedTextAiModel,
    type TextAiModelDefinition,
} from '../../application/text-ai-provider-catalog';
import type { TextAiProviderBudgetPolicy } from '../../application/text-ai-provider-catalog';

export const textAiProviderIds = ['deepseek', 'kie'] as const;
export type TextAiProviderId = (typeof textAiProviderIds)[number];

export const textAiModelIds = [
    'deepseek/deepseek-chat',
    'kie/gemini-2.5-pro',
] as const;
export type TextAiModelId = (typeof textAiModelIds)[number];

export interface TextAiModelRequestLimits {
    maxInputTokens: number;
    maxOutputTokens: number;
}

export type TextAiStructuredOutputMode =
    'native-json-schema' | 'prompt-injection';

export type TextAiProviderReadiness =
    | {
          acceptedStatuses: readonly [200];
          method: 'GET';
          url: string;
      }
    | {
          // Kie does not document a /models endpoint for this model-specific
          // OpenAI route. HEAD proves route reachability without generating or
          // billing content; 405 is the expected healthy route response.
          acceptedStatuses: readonly [200, 204, 405];
          method: 'HEAD';
          url: string;
      };

export interface TextAiModelCatalogEntry {
    apiBaseUrl: string;
    credentialEnvironmentVariable: 'DEEPSEEK_API_KEY' | 'KIE_API_KEY';
    credentialReference: 'env:DEEPSEEK_API_KEY' | 'env:KIE_API_KEY';
    id: TextAiModelId;
    label: string;
    modelId: string;
    pricing: {
        inputCostMicrosPerMillionTokens: number;
        outputCostMicrosPerMillionTokens: number;
    };
    providerId: TextAiProviderId;
    readiness: TextAiProviderReadiness;
    requestLimits: TextAiModelRequestLimits;
    structuredOutput: TextAiStructuredOutputMode;
    supportedFormats: readonly string[];
}

function requiredModel(
    providerId: TextAiProviderId,
    modelId: string,
): TextAiModelDefinition {
    const model = findCuratedTextAiModel(providerId, modelId);
    if (!model) throw new Error('Curated text AI model is missing.');
    return model;
}

const deepSeekChat = requiredModel('deepseek', 'deepseek-chat');
const kieGemini25Pro = requiredModel('kie', 'gemini-2.5-pro');

export const textAiModelCatalog = {
    'deepseek/deepseek-chat': {
        apiBaseUrl: 'https://api.deepseek.com',
        credentialEnvironmentVariable: deepSeekChat.credentialReference,
        credentialReference: `env:${deepSeekChat.credentialReference}`,
        id: 'deepseek/deepseek-chat',
        label: deepSeekChat.label,
        modelId: deepSeekChat.id,
        pricing: {
            // Conservative admission bounds; actual usage remains provider
            // reported and pricing revisions are immutable when persisted.
            inputCostMicrosPerMillionTokens: 1_000_000,
            outputCostMicrosPerMillionTokens: 3_000_000,
        },
        providerId: deepSeekChat.providerId,
        readiness: {
            acceptedStatuses: [200],
            method: 'GET',
            url: 'https://api.deepseek.com/models',
        },
        // These are request caps, not the five-call batch/job allowance.
        requestLimits: {
            maxInputTokens: deepSeekChat.perCallMaxInputTokens,
            maxOutputTokens: deepSeekChat.perCallMaxOutputTokens,
        },
        // DeepSeek currently rejects response_format.type=json_schema. Mastra
        // injects the schema into the prompt and still parses and validates the
        // returned object locally.
        structuredOutput: 'prompt-injection',
        supportedFormats: deepSeekChat.supportedFormats,
    },
    'kie/gemini-2.5-pro': {
        apiBaseUrl: 'https://api.kie.ai/gemini-2.5-pro/v1',
        credentialEnvironmentVariable: kieGemini25Pro.credentialReference,
        credentialReference: `env:${kieGemini25Pro.credentialReference}`,
        id: 'kie/gemini-2.5-pro',
        label: kieGemini25Pro.label,
        modelId: kieGemini25Pro.id,
        pricing: {
            inputCostMicrosPerMillionTokens: 10_000_000,
            outputCostMicrosPerMillionTokens: 30_000_000,
        },
        providerId: kieGemini25Pro.providerId,
        readiness: {
            acceptedStatuses: [200, 204, 405],
            method: 'HEAD',
            url: 'https://api.kie.ai/gemini-2.5-pro/v1/chat/completions',
        },
        requestLimits: {
            maxInputTokens: kieGemini25Pro.perCallMaxInputTokens,
            maxOutputTokens: kieGemini25Pro.perCallMaxOutputTokens,
        },
        structuredOutput: 'native-json-schema',
        supportedFormats: kieGemini25Pro.supportedFormats,
    },
} as const satisfies Record<TextAiModelId, TextAiModelCatalogEntry>;

export function findTextAiModel(
    modelId: string,
): TextAiModelCatalogEntry | undefined {
    return textAiModelIds.includes(modelId as TextAiModelId)
        ? textAiModelCatalog[modelId as TextAiModelId]
        : undefined;
}

export function createTextAiMastraModel(options: {
    apiKey: string;
    model: TextAiModelCatalogEntry;
}): OpenAICompatibleConfig {
    return {
        apiKey: options.apiKey,
        modelId: options.model.modelId,
        providerId: options.model.providerId,
        url: options.model.apiBaseUrl,
    };
}

export function createTextAiMastraGeneratorOptions(options: {
    apiKey: string;
    fetchProvider?: typeof fetch;
    model: TextAiModelCatalogEntry;
    providerBudget: TextAiProviderBudgetPolicy;
}) {
    return {
        mode: 'mastra' as const,
        model: createTextAiMastraModel({
            apiKey: options.apiKey,
            model: options.model,
        }),
        modelRequestLimits: options.model.requestLimits,
        providerBudget: options.providerBudget,
        providerReadiness: createTextAiProviderReadiness({
            apiKey: options.apiKey,
            ...(options.fetchProvider
                ? { fetchProvider: options.fetchProvider }
                : {}),
            readiness: options.model.readiness,
        }),
        structuredOutputMode: options.model.structuredOutput,
    };
}

export function createTextAiProviderReadiness(options: {
    apiKey: string;
    fetchProvider?: typeof fetch;
    readiness: TextAiProviderReadiness;
}): (signal: AbortSignal) => Promise<void> {
    const fetchProvider = options.fetchProvider ?? globalThis.fetch;
    return async (signal) => {
        signal.throwIfAborted();
        const response = await fetchProvider(options.readiness.url, {
            cache: 'no-store',
            credentials: 'omit',
            headers: {
                accept: 'application/json',
                authorization: `Bearer ${options.apiKey}`,
            },
            method: options.readiness.method,
            redirect: 'error',
            referrerPolicy: 'no-referrer',
            signal,
        });
        if (
            !options.readiness.acceptedStatuses.includes(
                response.status as never,
            )
        )
            throw new Error('Text AI provider is unavailable.');
    };
}

export function textAiRequestLimits(options: {
    aggregate: {
        maxInputTokensPerAttempt: number;
        maxOutputTokensPerAttempt: number;
    };
    model: TextAiModelRequestLimits;
}): TextAiModelRequestLimits {
    return {
        maxInputTokens: Math.min(
            options.aggregate.maxInputTokensPerAttempt,
            options.model.maxInputTokens,
        ),
        maxOutputTokens: Math.min(
            options.aggregate.maxOutputTokensPerAttempt,
            options.model.maxOutputTokens,
        ),
    };
}
