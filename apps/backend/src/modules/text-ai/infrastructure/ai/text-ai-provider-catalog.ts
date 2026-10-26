import {
    currentTextAiProviderAttemptWitness,
    withTextAiProviderAttemptWitness,
} from './text-ai-provider-attempt-context';
import {
    sentenceProviderFailure,
    type SentenceProviderFailure,
} from '../../../learning/infrastructure/ai/sentence-provider-failure';
import { ProviderPriceSchema, type ProviderPrice } from '@languon/contracts';
import {
    ModelRouterLanguageModel,
    type OpenAICompatibleConfig,
} from '@mastra/core/llm';

import {
    findTextAiModel as findCuratedTextAiModel,
    type TextAiModelDefinition,
    type TextAiCredentialReference,
} from '../../application/text-ai-provider-catalog';
import type { TextAiProviderBudgetPolicy } from '../../application/text-ai-provider-catalog';

export const textAiProviderIds = [
    'deepseek',
    'kie',
    'evolink',
    'openrouter',
] as const;
export type TextAiProviderId = (typeof textAiProviderIds)[number];

export const textAiModelIds = [
    'deepseek/deepseek-flash',
    'kie/gemini-2.5-pro',
    'evolink/gpt-6-luna',
    'openrouter/openai/gpt-6-luna',
    'openrouter/qwen/qwen3.5-flash-02-23',
    'openrouter/google/gemini-3.1-flash-lite',
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

/** Bump when reviewed SDK/wire enforcement changes; probe evidence must expire. */
export const textAiRequestPolicyRevision = 'text-ai-request-policy:v2';
export interface TextAiModelCatalogEntry {
    adapterRevision: string;
    requestPolicyRevision: string;
    apiBaseUrl: string;
    processingControlsRevision?: string;
    processingApprovalRequired?: boolean;
    credentialEnvironmentVariable: TextAiCredentialReference;
    credentialReference: `env:${TextAiCredentialReference}`;
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

const deepSeekFlash = requiredModel('deepseek', 'deepseek-flash');
const kieGemini25Pro = requiredModel('kie', 'gemini-2.5-pro');

export const textAiModelCatalog = {
    'deepseek/deepseek-flash': {
        adapterRevision: deepSeekFlash.adapterRevision,
        requestPolicyRevision: textAiRequestPolicyRevision,
        apiBaseUrl: 'https://api.deepseek.com',
        credentialEnvironmentVariable: deepSeekFlash.credentialReference,
        credentialReference: `env:${deepSeekFlash.credentialReference}`,
        id: 'deepseek/deepseek-flash',
        label: deepSeekFlash.label,
        modelId: deepSeekFlash.id,
        pricing: {
            // Conservative admission bounds; actual usage remains provider
            // reported and pricing revisions are immutable when persisted.
            inputCostMicrosPerMillionTokens: 1_000_000,
            outputCostMicrosPerMillionTokens: 3_000_000,
        },
        providerId: deepSeekFlash.providerId,
        readiness: {
            acceptedStatuses: [200],
            method: 'GET',
            url: 'https://api.deepseek.com/models',
        },
        // These are request caps, not the five-call batch/job allowance.
        requestLimits: {
            maxInputTokens: deepSeekFlash.perCallMaxInputTokens,
            maxOutputTokens: deepSeekFlash.perCallMaxOutputTokens,
        },
        // DeepSeek currently rejects response_format.type=json_schema. Mastra
        // injects the schema into the prompt and still parses and validates the
        // returned object locally.
        structuredOutput: 'prompt-injection',
        supportedFormats: deepSeekFlash.supportedFormats,
    },
    'kie/gemini-2.5-pro': {
        adapterRevision: kieGemini25Pro.adapterRevision,
        requestPolicyRevision: textAiRequestPolicyRevision,
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
    'evolink/gpt-6-luna': gatewayCatalogEntry('evolink', 'evolink/gpt-6-luna'),
    'openrouter/openai/gpt-6-luna': gatewayCatalogEntry(
        'openrouter',
        'openrouter/openai/gpt-6-luna',
    ),
    'openrouter/qwen/qwen3.5-flash-02-23': gatewayCatalogEntry(
        'openrouter',
        'openrouter/qwen/qwen3.5-flash-02-23',
    ),
    'openrouter/google/gemini-3.1-flash-lite': gatewayCatalogEntry(
        'openrouter',
        'openrouter/google/gemini-3.1-flash-lite',
    ),
} as const satisfies Record<TextAiModelId, TextAiModelCatalogEntry>;

function gatewayCatalogEntry(
    providerId: 'evolink' | 'openrouter',
    id: TextAiModelId,
): TextAiModelCatalogEntry {
    const model = requiredModel(providerId, id.slice(providerId.length + 1));
    const apiBaseUrl =
        providerId === 'evolink'
            ? 'https://api.evolink.ai/v1'
            : 'https://openrouter.ai/api/v1';
    return {
        apiBaseUrl,
        adapterRevision: model.adapterRevision,
        requestPolicyRevision: textAiRequestPolicyRevision,
        credentialEnvironmentVariable: model.credentialReference,
        credentialReference: `env:${model.credentialReference}`,
        id,
        label: model.label,
        modelId: model.id,
        pricing: {
            inputCostMicrosPerMillionTokens: 1_000_000,
            outputCostMicrosPerMillionTokens: 3_000_000,
        },
        providerId,
        readiness: {
            acceptedStatuses: [200, 204, 405],
            method: 'HEAD',
            // OpenRouter rejects HEAD on completions with 404. Catalog HEAD
            // checks reachability only; matching admin flow checks still gate use.
            url:
                providerId === 'openrouter'
                    ? `${apiBaseUrl}/models`
                    : `${apiBaseUrl}/chat/completions`,
        },
        requestLimits: {
            maxInputTokens: model.perCallMaxInputTokens,
            maxOutputTokens: model.perCallMaxOutputTokens,
        },
        structuredOutput: 'native-json-schema',
        supportedFormats: model.supportedFormats,
        ...(model.processingControlsRevision
            ? { processingControlsRevision: model.processingControlsRevision }
            : {}),
        processingApprovalRequired: providerId === 'evolink',
    };
}

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
    providerPrice?: ProviderPrice;
    onProviderFailure?: (failure: SentenceProviderFailure) => Promise<void>;
}): OpenAICompatibleConfig | ModelRouterLanguageModel {
    const config: OpenAICompatibleConfig = {
        apiKey: options.apiKey,
        modelId: options.model.modelId,
        providerId: options.model.providerId,
        url: options.model.apiBaseUrl,
    };
    if (options.model.providerId === 'evolink')
        return new RestrictedGatewayModel(
            config,
            'evolink',
            undefined,
            options.onProviderFailure,
        );
    if (options.model.providerId !== 'openrouter')
        return options.onProviderFailure
            ? new RestrictedGatewayModel(
                  config,
                  options.model.providerId,
                  undefined,
                  options.onProviderFailure,
              )
            : config;
    const price = ProviderPriceSchema.parse(options.providerPrice);
    if (
        price.providerId !== options.model.providerId ||
        price.modelId !== options.model.modelId ||
        price.meter !== 'text-tokens'
    )
        throw new Error(
            'Pinned gateway price does not match the reviewed route.',
        );
    return new RestrictedGatewayModel(
        config,
        'openrouter',
        {
            prompt: Number(price.inputUsdPerMillionTokens),
            completion: Number(price.outputUsdPerMillionTokens),
            request: Number(price.minimumUsdPerRequest ?? 0),
            image: 0,
        },
        options.onProviderFailure,
    );
}

/** Enforce gateway constraints at the SDK call boundary for structured and streamed calls.
 * These routing filters are not a promise about the gateway's own data handling.
 */
class RestrictedGatewayModel extends ModelRouterLanguageModel {
    constructor(
        config: OpenAICompatibleConfig,
        private readonly providerId: TextAiProviderId,
        private readonly maximumPrice?: {
            prompt: number;
            completion: number;
            request: number;
            image: 0;
        },
        private readonly onProviderFailure?: (
            failure: SentenceProviderFailure,
        ) => Promise<void>,
    ) {
        super(config);
    }
    override async doGenerate(
        options: Parameters<ModelRouterLanguageModel['doGenerate']>[0],
    ) {
        const witness = currentTextAiProviderAttemptWitness();
        try {
            return this.observe(
                await super.doGenerate(this.restrict(options)),
                options.abortSignal,
                witness,
            );
        } catch (error) {
            await this.record(error, options.abortSignal, witness);
            throw error;
        }
    }
    override async doStream(
        options: Parameters<ModelRouterLanguageModel['doStream']>[0],
    ) {
        const witness = currentTextAiProviderAttemptWitness();
        try {
            return this.observe(
                await super.doStream(this.restrict(options)),
                options.abortSignal,
                witness,
            );
        } catch (error) {
            await this.record(error, options.abortSignal, witness);
            throw error;
        }
    }
    private async record(
        error: unknown,
        signal?: AbortSignal,
        witness?: ReturnType<typeof currentTextAiProviderAttemptWitness>,
    ) {
        // Local cancellation/deadlines are not evidence about shared route health.
        if (
            signal?.aborted ||
            (error instanceof Error &&
                /^(AbortError|TimeoutError)$/.test(error.name) &&
                !('statusCode' in error))
        )
            return;
        const failure = sentenceProviderFailure(error, this.providerId);
        // A learner prompt may elicit a policy 403. It is not credential
        // evidence and must never let that learner exclude the route for others.
        if (
            (failure.httpStatus === 403 || failure.providerCode === 403) &&
            failure.reason !== 'authorization_failed'
        )
            return;
        const record = () => this.onProviderFailure?.(failure);
        if (witness) await withTextAiProviderAttemptWitness(witness, record);
        else await record();
    }
    private observe(
        result: Awaited<ReturnType<ModelRouterLanguageModel['doStream']>>,
        signal?: AbortSignal,
        witness?: ReturnType<typeof currentTextAiProviderAttemptWitness>,
    ) {
        // The installed router currently returns a stream for both methods.
        // Preserve successful nonstream results if an SDK/provider path returns
        // one; health observation must never turn success into a local failure.
        if (
            !this.onProviderFailure ||
            !('stream' in result) ||
            !result.stream ||
            typeof result.stream.pipeThrough !== 'function'
        )
            return result;
        return {
            ...result,
            stream: result.stream.pipeThrough(
                new TransformStream({
                    transform: async (part, controller) => {
                        if (part.type === 'error')
                            await this.record(part.error, signal, witness);
                        controller.enqueue(part);
                    },
                }),
            ),
        };
    }
    private restrict(
        options: Parameters<ModelRouterLanguageModel['doStream']>[0],
    ) {
        if (this.providerId !== 'openrouter' && this.providerId !== 'evolink')
            return options;
        return {
            ...options,
            providerOptions: {
                // Do not inherit caller gateway routing, model lists or plugins.
                [this.providerId]: {
                    // Existing application schemas intentionally contain optional
                    // fields. Ask for native JSON schema without the provider's
                    // stricter all-properties-required subset; local Zod remains
                    // authoritative and no schema repair/coercion is performed.
                    strictJsonSchema: false,
                    ...(this.providerId === 'openrouter'
                        ? {
                              provider: {
                                  allow_fallbacks: false,
                                  require_parameters: true,
                                  data_collection: 'deny',
                                  zdr: true,
                                  max_price: this.maximumPrice!,
                              },
                          }
                        : {}),
                },
            },
        };
    }
}

export function createTextAiMastraGeneratorOptions(options: {
    apiKey: string;
    fetchProvider?: typeof fetch;
    model: TextAiModelCatalogEntry;
    providerBudget: TextAiProviderBudgetPolicy;
    providerPrice?: ProviderPrice;
    onProviderFailure?: (failure: SentenceProviderFailure) => Promise<void>;
}) {
    return {
        mode: 'mastra' as const,
        model: createTextAiMastraModel({
            apiKey: options.apiKey,
            model: options.model,
            ...(options.onProviderFailure
                ? { onProviderFailure: options.onProviderFailure }
                : {}),
            ...(options.providerPrice
                ? { providerPrice: options.providerPrice }
                : {}),
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
