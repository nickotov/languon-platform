import type { OpenAICompatibleConfig } from '@mastra/core/llm';

import {
    findDictionaryAiModel,
    type DictionaryAiModelDefinition,
} from '../../application/dictionary-ai-provider-catalog';

export const dictionaryTextProviderIds = ['deepseek', 'kie'] as const;
export type DictionaryTextProviderId =
    (typeof dictionaryTextProviderIds)[number];

export const dictionaryTextModelIds = [
    'deepseek/deepseek-chat',
    'kie/gemini-2.5-pro',
] as const;
export type DictionaryTextModelId = (typeof dictionaryTextModelIds)[number];

export interface DictionaryTextModelRequestLimits {
    maxInputTokens: number;
    maxOutputTokens: number;
}

export type DictionaryTextProviderReadiness =
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

export interface DictionaryTextModelCatalogEntry {
    apiBaseUrl: string;
    credentialEnvironmentVariable: 'DEEPSEEK_API_KEY' | 'KIE_API_KEY';
    credentialReference: 'env:DEEPSEEK_API_KEY' | 'env:KIE_API_KEY';
    id: DictionaryTextModelId;
    label: string;
    modelId: string;
    pricing: {
        inputCostMicrosPerMillionTokens: number;
        outputCostMicrosPerMillionTokens: number;
    };
    providerId: DictionaryTextProviderId;
    readiness: DictionaryTextProviderReadiness;
    requestLimits: DictionaryTextModelRequestLimits;
    structuredOutput: 'json-schema';
    supportedFormats: readonly string[];
}

function requiredModel(
    providerId: DictionaryTextProviderId,
    modelId: string,
): DictionaryAiModelDefinition {
    const model = findDictionaryAiModel(providerId, modelId);
    if (!model) throw new Error('Curated dictionary AI model is missing.');
    return model;
}

const deepSeekChat = requiredModel('deepseek', 'deepseek-chat');
const kieGemini25Pro = requiredModel('kie', 'gemini-2.5-pro');

export const dictionaryTextModelCatalog = {
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
        structuredOutput: 'json-schema',
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
        structuredOutput: 'json-schema',
        supportedFormats: kieGemini25Pro.supportedFormats,
    },
} as const satisfies Record<
    DictionaryTextModelId,
    DictionaryTextModelCatalogEntry
>;

export function findDictionaryTextModel(
    modelId: string,
): DictionaryTextModelCatalogEntry | undefined {
    return dictionaryTextModelIds.includes(modelId as DictionaryTextModelId)
        ? dictionaryTextModelCatalog[modelId as DictionaryTextModelId]
        : undefined;
}

export function createDictionaryTextMastraModel(options: {
    apiKey: string;
    model: DictionaryTextModelCatalogEntry;
}): OpenAICompatibleConfig {
    return {
        apiKey: options.apiKey,
        modelId: options.model.modelId,
        providerId: options.model.providerId,
        url: options.model.apiBaseUrl,
    };
}

export function createDictionaryTextProviderReadiness(options: {
    apiKey: string;
    fetchProvider?: typeof fetch;
    readiness: DictionaryTextProviderReadiness;
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
            throw new Error('Dictionary text provider is unavailable.');
    };
}

export function dictionaryTextRequestLimits(options: {
    aggregate: {
        maxInputTokensPerAttempt: number;
        maxOutputTokensPerAttempt: number;
    };
    model: DictionaryTextModelRequestLimits;
}): DictionaryTextModelRequestLimits {
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
