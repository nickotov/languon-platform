import { Buffer } from 'node:buffer';
import { isIP } from 'node:net';

import { getLocalPrompt } from '@languon/prompts';
import type {
    ModelRouterModelId,
    OpenAICompatibleConfig,
} from '@mastra/core/llm';
import { Mastra } from '@mastra/core/mastra';
import { z } from 'zod';

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

export const DictionaryCardAuthoringModelInputSchema =
    DictionaryCardAuthoringProviderInputSchema;
export const DictionaryCardAuthoringModelOutputSchema =
    DictionaryCardAuthoringProviderDeltaSchema;
export const dictionaryCardAuthoringProviderFramingTokenReserve = 16_384;

const fixedInputBytes =
    Buffer.byteLength(
        getLocalPrompt('dictionary-card-authoring-agent'),
        'utf8',
    ) +
    Buffer.byteLength(
        JSON.stringify(
            z.toJSONSchema(DictionaryCardAuthoringModelOutputSchema),
        ),
        'utf8',
    ) +
    dictionaryCardAuthoringProviderFramingTokenReserve;

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
            maxOutputTokens: number;
            runId: string;
            structuredOutput: {
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
    providerReadiness?: (signal: AbortSignal) => Promise<void>;
}): CardAuthoringProposalGenerator {
    return {
        async generate(request) {
            request.signal.throwIfAborted();
            const input = validatedInput(request.input);
            const message = JSON.stringify(input);
            if (
                Buffer.byteLength(message, 'utf8') + fixedInputBytes >
                request.providerBudget.maxInputTokensPerAttempt
            )
                throw new CardAuthoringProposalGeneratorExecutionError(
                    'invalid_input',
                );
            try {
                const result = await options.agent.generate(message, {
                    abortSignal: request.signal,
                    maxOutputTokens:
                        request.providerBudget.maxOutputTokensPerAttempt,
                    runId: request.idempotencyKey,
                    structuredOutput: {
                        schema: DictionaryCardAuthoringModelOutputSchema,
                    },
                    toolChoice: 'none',
                    tracingOptions: { hideInput: true, hideOutput: true },
                });
                request.signal.throwIfAborted();
                if (result.error || result.tripwire)
                    throw new CardAuthoringProposalGeneratorExecutionError(
                        'provider_failure',
                    );
                const delta = validatedOutput(result.object, input);
                if (!result.usage) return delta;
                if (
                    !Number.isSafeInteger(result.usage.inputTokens) ||
                    !Number.isSafeInteger(result.usage.outputTokens) ||
                    result.usage.inputTokens! < 0 ||
                    result.usage.outputTokens! < 0 ||
                    result.usage.inputTokens! >
                        request.providerBudget.maxInputTokensPerAttempt ||
                    result.usage.outputTokens! >
                        request.providerBudget.maxOutputTokensPerAttempt
                )
                    throw new CardAuthoringProposalGeneratorExecutionError(
                        'invalid_output',
                    );
                return {
                    delta,
                    usage: {
                        inputTokens: result.usage.inputTokens!,
                        outputTokens: result.usage.outputTokens!,
                    },
                };
            } catch (error) {
                if (request.signal.aborted)
                    throw (
                        request.signal.reason ??
                        new DOMException('Aborted', 'AbortError')
                    );
                if (
                    error instanceof
                    CardAuthoringProposalGeneratorExecutionError
                )
                    throw error;
                throw new CardAuthoringProposalGeneratorExecutionError(
                    'provider_failure',
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
          model: ModelRouterModelId | OpenAICompatibleConfig;
          providerBudget: DictionaryGenerationProviderBudgetPolicy;
          providerProbeFetch?: typeof fetch;
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
    const providerReadiness = openAICompatibleProviderReadiness(
        options.model,
        options.providerProbeFetch ?? globalThis.fetch,
    );
    return createMastraCardAuthoringProposalGenerator({
        agent: runtime.listAgents().dictionaryCardAuthoringAgent,
        ...(providerReadiness ? { providerReadiness } : {}),
    });
}

function openAICompatibleProviderReadiness(
    model: ModelRouterModelId | OpenAICompatibleConfig,
    fetchProvider: typeof fetch,
): ((signal: AbortSignal) => Promise<void>) | undefined {
    if (typeof model === 'string' || !model.url || !model.apiKey)
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
    return {
        suggestions: request.input.requestedFields.map((field) => {
            const base =
                field === 'translation'
                    ? `${request.input.source} (${request.input.targetLanguage})`
                    : field === 'transcription'
                      ? `[${request.input.source}]`
                      : field === 'definition'
                        ? `Meaning of ${request.input.source}`
                        : field === 'example'
                          ? `Example with ${request.input.source}.`
                          : `Translation of example with ${request.input.source}.`;
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
