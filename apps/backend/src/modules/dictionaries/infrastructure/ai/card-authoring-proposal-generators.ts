import { withQueuedTextAiProviderAttempt } from '../../../text-ai/infrastructure/ai/with-queued-text-ai-provider-attempt';
import { withProviderExecutionOutcome } from '../../../text-ai/infrastructure/ai/provider-execution-outcome';
import { cardAuthoringProviderInputTokens } from './card-authoring-input-envelope';
import {
    cardAuthoringProviderFailure,
    type CardAuthoringProviderFailure,
} from './card-authoring-provider-failure';
import { readProviderTokenUsage } from '../../../text-ai/infrastructure/ai/provider-token-usage';
import { isIP } from 'node:net';

import type {
    ModelRouterModelId,
    OpenAICompatibleConfig,
    ModelRouterLanguageModel,
} from '@mastra/core/llm';
import { Mastra } from '@mastra/core/mastra';

import type {
    CardAuthoringProposalGenerator,
    CardAuthoringProposalGeneratorRequest,
} from '../../application/ports/card-authoring-proposal-generator';
import { CardAuthoringProposalGeneratorError } from '../../application/ports/card-authoring-proposal-generator';
import type { DictionaryGenerationProviderBudgetPolicy } from '../../application/ports/dictionary-generation-provider-policy';
import {
    DictionaryCardAuthoringProviderDeltaSchema,
    DictionaryCardAuthoringProviderInputSchema,
    type DictionaryCardAuthoringProviderDelta,
    validateDictionaryCardAuthoringProviderDelta,
} from '../../domain/card-authoring';
import {
    createDictionaryCardAuthoringAgent,
    type DictionaryCardAuthoringAgent,
} from './dictionary-card-authoring-agent';
import {
    textAiRequestLimits as dictionaryTextRequestLimits,
    type TextAiModelRequestLimits as DictionaryTextModelRequestLimits,
    type TextAiStructuredOutputMode as DictionaryTextStructuredOutputMode,
} from '../../../text-ai/infrastructure/ai/text-ai-provider-catalog';

export const DictionaryCardAuthoringModelInputSchema =
    DictionaryCardAuthoringProviderInputSchema;
export const DictionaryCardAuthoringModelOutputSchema =
    DictionaryCardAuthoringProviderDeltaSchema;
export { dictionaryCardAuthoringProviderFramingTokenReserve } from './card-authoring-input-envelope';

export class CardAuthoringProposalGeneratorUnavailableError extends CardAuthoringProposalGeneratorError {
    public constructor() {
        super('provider_unavailable');
        this.name = 'CardAuthoringProposalGeneratorUnavailableError';
    }
}

export class CardAuthoringProposalGeneratorExecutionError extends CardAuthoringProposalGeneratorError {
    public constructor(
        public readonly reason:
            'invalid_input' | 'invalid_output' | 'provider_failure',
    ) {
        super(
            reason === 'provider_failure'
                ? 'provider_unavailable'
                : 'invalid_model_output',
        );
        this.name = 'CardAuthoringProposalGeneratorExecutionError';
    }
}

export interface DictionaryCardAuthoringStructuredAgent {
    generate(
        message: string,
        options: {
            abortSignal: AbortSignal;
            modelSettings: { maxOutputTokens: number; maxRetries: 0 };
            runId: string;
            structuredOutput: {
                jsonPromptInjection?: 'inline';
                schema: typeof DictionaryCardAuthoringModelOutputSchema;
            };
            toolChoice: 'none';
            tracingOptions: { hideInput: true; hideOutput: true };
        },
    ): Promise<{
        error: Error | undefined;
        object: unknown;
        tripwire: unknown | undefined;
        usage?: {
            inputTokens: number | undefined;
            outputTokens: number | undefined;
        };
    }>;
}

export function createMastraCardAuthoringProposalGenerator(options: {
    agent: DictionaryCardAuthoringStructuredAgent;
    modelRequestLimits?: DictionaryTextModelRequestLimits;
    providerReadiness?: (signal: AbortSignal) => Promise<void>;
    structuredOutputMode?: DictionaryTextStructuredOutputMode;
    onProviderFailure?: (event: CardAuthoringProviderFailure) => void;
}): CardAuthoringProposalGenerator {
    return {
        async generate(request) {
            let outputReceived = false;
            let meteredUsage:
                ReturnType<typeof readProviderTokenUsage> | undefined;
            const failure = (
                reason: ConstructorParameters<
                    typeof CardAuthoringProposalGeneratorExecutionError
                >[0],
            ) => {
                const result = new CardAuthoringProposalGeneratorExecutionError(
                    reason,
                );
                if (meteredUsage) result.usage = meteredUsage;
                result.executionOutcome =
                    outputReceived && result.category === 'invalid_model_output'
                        ? 'completed'
                        : 'ambiguous';
                return result;
            };

            request.signal.throwIfAborted();
            const input = validatedInput(request.input);
            const message = JSON.stringify(input);
            const requestLimits = dictionaryTextRequestLimits({
                aggregate: request.providerBudget,
                model: options.modelRequestLimits ?? {
                    maxInputTokens:
                        request.providerBudget.maxInputTokensPerAttempt,
                    maxOutputTokens:
                        request.providerBudget.maxOutputTokensPerAttempt,
                },
            });
            if (
                cardAuthoringProviderInputTokens(input) >
                requestLimits.maxInputTokens
            )
                throw failure('invalid_input');
            try {
                const result = await withQueuedTextAiProviderAttempt(
                    request.providerAttempt,
                    Boolean(request.providerExecution?.routingAuthority),
                    () =>
                        options.agent.generate(message, {
                            abortSignal: request.signal,
                            modelSettings: {
                                maxOutputTokens: requestLimits.maxOutputTokens,
                                maxRetries: 0,
                            },
                            runId: request.idempotencyKey,
                            structuredOutput: {
                                ...(options.structuredOutputMode ===
                                'prompt-injection'
                                    ? { jsonPromptInjection: 'inline' as const }
                                    : {}),
                                schema: DictionaryCardAuthoringModelOutputSchema,
                            },
                            toolChoice: 'none',
                            tracingOptions: {
                                hideInput: true,
                                hideOutput: true,
                            },
                        }),
                );
                outputReceived = true;
                request.signal.throwIfAborted();
                if (result.usage) {
                    try {
                        meteredUsage = readProviderTokenUsage(
                            result.usage,
                            requestLimits,
                            result,
                        );
                    } catch {
                        throw failure('invalid_output');
                    }
                }
                if (result.error || result.tripwire) {
                    reportProviderFailure(
                        result.error,
                        request.idempotencyKey,
                        options.onProviderFailure,
                    );
                    throw withProviderExecutionOutcome(
                        failure('provider_failure'),
                        result.error,
                        request.providerExecution?.providerId ?? 'unknown',
                    );
                }
                const delta = validatedOutput(result.object, input);
                if (!result.usage) return delta;
                let usage;
                try {
                    usage = readProviderTokenUsage(
                        result.usage,
                        requestLimits,
                        result,
                    );
                } catch {
                    throw failure('invalid_output');
                }

                return {
                    delta,
                    usage,
                };
            } catch (error) {
                if (
                    error instanceof Error &&
                    error.name === 'AI_NoObjectGeneratedError' &&
                    'usage' in error
                ) {
                    try {
                        meteredUsage = readProviderTokenUsage(
                            error.usage,
                            requestLimits,
                            error,
                        );
                    } catch {
                        /* Invalid/missing provider meters remain unknown. */
                    }
                }
                if (
                    error instanceof CardAuthoringProposalGeneratorError &&
                    meteredUsage
                )
                    error.usage = meteredUsage;

                if (request.signal.aborted)
                    throw (
                        request.signal.reason ??
                        new DOMException('Aborted', 'AbortError')
                    );
                if (
                    outputReceived &&
                    error instanceof CardAuthoringProposalGeneratorError &&
                    error.category === 'invalid_model_output'
                )
                    error.executionOutcome = 'completed';
                if (
                    error instanceof
                    CardAuthoringProposalGeneratorExecutionError
                )
                    throw error;
                reportProviderFailure(
                    error,
                    request.idempotencyKey,
                    options.onProviderFailure,
                );
                throw withProviderExecutionOutcome(
                    failure('provider_failure'),
                    error,
                    request.providerExecution?.providerId ?? 'unknown',
                );
            }
        },
        readiness(signal) {
            signal.throwIfAborted();
            if (!options.providerReadiness)
                return Promise.reject(
                    new CardAuthoringProposalGeneratorUnavailableError(),
                );
            return options.providerReadiness(signal).catch(() => {
                signal.throwIfAborted();
                throw new CardAuthoringProposalGeneratorUnavailableError();
            });
        },
    };
}

export type DeterministicCardAuthoringProposalResolver = (
    request: CardAuthoringProposalGeneratorRequest,
) =>
    | DictionaryCardAuthoringProviderDelta
    | Promise<DictionaryCardAuthoringProviderDelta>;

export class DeterministicCardAuthoringProposalGenerator implements CardAuthoringProposalGenerator {
    public constructor(
        private readonly resolve: DeterministicCardAuthoringProposalResolver = defaultDeterministicDelta,
    ) {}

    public async generate(request: CardAuthoringProposalGeneratorRequest) {
        request.signal.throwIfAborted();
        const input = validatedInput(request.input);
        try {
            const delta = validatedOutput(await this.resolve(request), input);
            request.signal.throwIfAborted();
            return {
                delta,
                usage: { inputTokens: 0, outputTokens: 0 },
            };
        } catch (error) {
            if (request.signal.aborted)
                throw (
                    request.signal.reason ??
                    new DOMException('Aborted', 'AbortError')
                );
            if (error instanceof CardAuthoringProposalGeneratorExecutionError)
                throw error;
            throw new CardAuthoringProposalGeneratorExecutionError(
                'provider_failure',
            );
        }
    }

    public readiness(signal: AbortSignal): Promise<void> {
        signal.throwIfAborted();
        return Promise.resolve();
    }
}

export class UnavailableCardAuthoringProposalGenerator implements CardAuthoringProposalGenerator {
    public generate(request: CardAuthoringProposalGeneratorRequest) {
        request.signal.throwIfAborted();
        return Promise.reject(
            new CardAuthoringProposalGeneratorUnavailableError(),
        );
    }

    public readiness(signal: AbortSignal): Promise<void> {
        signal.throwIfAborted();
        return Promise.reject(
            new CardAuthoringProposalGeneratorUnavailableError(),
        );
    }
}

export type CardAuthoringProposalGeneratorFactoryOptions =
    | { mode: 'unavailable' }
    | {
          mode: 'deterministic';
          proposal?: DeterministicCardAuthoringProposalResolver;
      }
    | {
          mode: 'mastra';
          model:
              | ModelRouterModelId
              | OpenAICompatibleConfig
              | ModelRouterLanguageModel;
          modelRequestLimits?: DictionaryTextModelRequestLimits;
          providerBudget: DictionaryGenerationProviderBudgetPolicy;
          providerProbeFetch?: typeof fetch;
          providerReadiness?: (signal: AbortSignal) => Promise<void>;
          structuredOutputMode?: DictionaryTextStructuredOutputMode;
      };

export function createCardAuthoringProposalGenerator(
    options: CardAuthoringProposalGeneratorFactoryOptions,
): CardAuthoringProposalGenerator {
    if (options.mode === 'unavailable')
        return new UnavailableCardAuthoringProposalGenerator();
    if (options.mode === 'deterministic')
        return new DeterministicCardAuthoringProposalGenerator(
            options.proposal,
        );
    const agent: DictionaryCardAuthoringAgent =
        createDictionaryCardAuthoringAgent({ model: options.model });
    const runtime = new Mastra({
        agents: { dictionaryCardAuthoringAgent: agent },
        logger: false,
    });
    const providerReadiness =
        options.providerReadiness ??
        openAICompatibleProviderReadiness(
            options.model,
            options.providerProbeFetch ?? globalThis.fetch,
        );
    return createMastraCardAuthoringProposalGenerator({
        agent: runtime.listAgents().dictionaryCardAuthoringAgent,
        onProviderFailure: (event) =>
            console.warn('Card authoring provider request failed.', event),
        ...(options.modelRequestLimits
            ? { modelRequestLimits: options.modelRequestLimits }
            : {}),
        ...(providerReadiness ? { providerReadiness } : {}),
        ...(options.structuredOutputMode
            ? { structuredOutputMode: options.structuredOutputMode }
            : {}),
    });
}

function openAICompatibleProviderReadiness(
    model:
        ModelRouterModelId | OpenAICompatibleConfig | ModelRouterLanguageModel,
    fetchProvider: typeof fetch,
): ((signal: AbortSignal) => Promise<void>) | undefined {
    if (
        typeof model === 'string' ||
        !('url' in model) ||
        !model.url ||
        !model.apiKey
    )
        return undefined;
    const baseUrl = new URL(model.url);
    const hostname = baseUrl.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (
        baseUrl.protocol !== 'https:' ||
        baseUrl.username !== '' ||
        baseUrl.password !== '' ||
        baseUrl.search !== '' ||
        baseUrl.hash !== '' ||
        hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.internal') ||
        isPrivateIpAddress(hostname)
    )
        return undefined;
    baseUrl.pathname = `${baseUrl.pathname.replace(/\/$/, '')}/models`;
    return async (signal) => {
        const response = await fetchProvider(baseUrl, {
            cache: 'no-store',
            credentials: 'omit',
            headers: {
                accept: 'application/json',
                authorization: `Bearer ${model.apiKey}`,
            },
            method: 'GET',
            redirect: 'error',
            referrerPolicy: 'no-referrer',
            signal,
        });
        if (!response.ok)
            throw new CardAuthoringProposalGeneratorUnavailableError();
    };
}

function isPrivateIpAddress(hostname: string): boolean {
    if (isIP(hostname) === 6) {
        if (hostname.startsWith('::ffff:'))
            return isPrivateIpAddress(hostname.slice('::ffff:'.length));
        return (
            hostname === '::' ||
            hostname === '::1' ||
            hostname.startsWith('fc') ||
            hostname.startsWith('fd') ||
            /^fe[89ab]/.test(hostname)
        );
    }
    if (isIP(hostname) !== 4) return false;
    const [first = 0, second = 0] = hostname.split('.').map(Number);
    return (
        first === 0 ||
        first === 10 ||
        first === 127 ||
        (first === 100 && second >= 64 && second <= 127) ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        (first === 198 && [18, 19].includes(second)) ||
        first >= 224
    );
}

function validatedInput(value: unknown) {
    const parsed = DictionaryCardAuthoringModelInputSchema.safeParse(value);
    if (!parsed.success)
        throw new CardAuthoringProposalGeneratorExecutionError('invalid_input');
    return parsed.data;
}

function validatedOutput(
    value: unknown,
    input: CardAuthoringProposalGeneratorRequest['input'],
): DictionaryCardAuthoringProviderDelta {
    try {
        return validateDictionaryCardAuthoringProviderDelta(input, value);
    } catch {
        throw new CardAuthoringProposalGeneratorExecutionError(
            'invalid_output',
        );
    }
}

function defaultDeterministicDelta(
    request: CardAuthoringProposalGeneratorRequest,
): DictionaryCardAuthoringProviderDelta {
    const sourceRequested = request.input.requestedFields.includes('source');
    const normalizedSource = request.input.source
        .replace(/\bteh\b/giu, 'the')
        .replace(/\s+/gu, ' ')
        .trim();
    const sourceResult = sourceRequested
        ? normalizedSource === request.input.source
            ? ({ kind: 'unchanged' } as const)
            : ({ kind: 'suggested', value: normalizedSource } as const)
        : null;
    const basisSource =
        sourceResult?.kind === 'suggested'
            ? sourceResult.value
            : request.input.source;
    return {
        ...(sourceRequested ? { sourceResult } : {}),
        suggestions: request.input.requestedFields
            .filter((field) => field !== 'source')
            .map((field) => {
                const base =
                    field === 'translation'
                        ? `${basisSource} (${request.input.targetLanguage})`
                        : field === 'transcription'
                          ? `[${basisSource}]`
                          : field === 'definition'
                            ? `Meaning of ${basisSource}`
                            : field === 'example'
                              ? `Example with ${basisSource}.`
                              : `Translation of ${request.input.exampleForTranslation ?? `example with ${basisSource}`}.`;
                const context = request.input.fieldContext.find(
                    (entry) => entry.field === field,
                )!;
                const excluded = new Set([
                    ...context.excludedValues,
                    ...(context.currentValue === null
                        ? []
                        : [context.currentValue]),
                ]);
                const maximum = ['translation', 'transcription'].includes(field)
                    ? 200
                    : 2_000;
                let nextValue = truncateCodePoints(base, maximum);
                for (let index = 1; excluded.has(nextValue); index += 1) {
                    const suffix = ` · alternative ${index}`;
                    nextValue = `${truncateCodePoints(
                        base,
                        maximum - [...suffix].length,
                    )}${suffix}`;
                }
                return {
                    field,
                    value: nextValue,
                };
            }),
    };
}

function truncateCodePoints(value: string, maximum: number): string {
    return [...value].slice(0, maximum).join('');
}

function reportProviderFailure(
    error: unknown,
    idempotencyKey: string,
    report: ((event: CardAuthoringProviderFailure) => void) | undefined,
) {
    if (!report) return;
    try {
        report(cardAuthoringProviderFailure(error, idempotencyKey));
    } catch {
        /* Diagnostics must never change generation or settlement behavior. */
    }
}
