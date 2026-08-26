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
    CardProposalGenerator,
    CardProposalGeneratorRequest,
} from '../../application/ports/card-proposal-generator';
import { CardProposalGeneratorError } from '../../application/ports/card-proposal-generator';
import type { DictionaryGenerationProviderBudgetPolicy } from '../../application/ports/dictionary-generation-provider-policy';
import {
    DictionaryGenerationProposalPayloadSchema,
    DictionarySingleCardGenerationInputPayloadSchema,
    type DictionaryGenerationProposalPayload,
} from '../../domain/generation';
import {
    createDictionaryCardGenerationAgent,
    type DictionaryCardGenerationAgent,
} from './dictionary-card-generation-agent';

export const DictionaryCardGenerationModelInputSchema =
    DictionarySingleCardGenerationInputPayloadSchema;
export const DictionaryCardGenerationModelOutputSchema =
    DictionaryGenerationProposalPayloadSchema;

// Covers provider message wrappers and model-specific special tokens after the
// exact prompt, input JSON, and structured-output JSON Schema are counted.
export const dictionaryCardGenerationProviderFramingTokenReserve = 16_384;

const dictionaryCardGenerationFixedInputBytes =
    Buffer.byteLength(
        getLocalPrompt('dictionary-card-generation-agent'),
        'utf8',
    ) +
    Buffer.byteLength(
        JSON.stringify(
            z.toJSONSchema(DictionaryCardGenerationModelOutputSchema),
        ),
        'utf8',
    ) +
    dictionaryCardGenerationProviderFramingTokenReserve;

export class CardProposalGeneratorUnavailableError extends CardProposalGeneratorError {
    public constructor() {
        super('provider_unavailable');
        this.name = 'CardProposalGeneratorUnavailableError';
    }
}

export class CardProposalGeneratorExecutionError extends CardProposalGeneratorError {
    public constructor(
        public readonly reason:
            'invalid_input' | 'invalid_output' | 'provider_failure',
    ) {
        super(
            reason === 'invalid_input' || reason === 'invalid_output'
                ? 'invalid_model_output'
                : 'provider_unavailable',
        );
        this.name = 'CardProposalGeneratorExecutionError';
    }
}

export interface DictionaryCardGenerationStructuredAgent {
    generate(
        message: string,
        options: {
            abortSignal: AbortSignal;
            maxOutputTokens: number;
            runId: string;
            structuredOutput: {
                schema: typeof DictionaryCardGenerationModelOutputSchema;
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

export function createMastraCardProposalGenerator(options: {
    agent: DictionaryCardGenerationStructuredAgent;
    providerReadiness?: (signal: AbortSignal) => Promise<void>;
}): CardProposalGenerator {
    return {
        async generate(request) {
            request.signal.throwIfAborted();
            const input = validatedInput(request.input);
            const message = JSON.stringify(input);
            if (
                Buffer.byteLength(message, 'utf8') +
                    dictionaryCardGenerationFixedInputBytes >
                request.providerBudget.maxInputTokensPerAttempt
            ) {
                throw new CardProposalGeneratorExecutionError('invalid_input');
            }

            try {
                const result = await options.agent.generate(message, {
                    abortSignal: request.signal,
                    maxOutputTokens:
                        request.providerBudget.maxOutputTokensPerAttempt,
                    runId: request.idempotencyKey,
                    structuredOutput: {
                        schema: DictionaryCardGenerationModelOutputSchema,
                    },
                    toolChoice: 'none',
                    tracingOptions: {
                        hideInput: true,
                        hideOutput: true,
                    },
                });
                request.signal.throwIfAborted();

                if (result.error || result.tripwire) {
                    throw new CardProposalGeneratorExecutionError(
                        'provider_failure',
                    );
                }

                const proposal = validatedOutput(result.object);
                if (!result.usage) return proposal;
                if (
                    !Number.isSafeInteger(result.usage.inputTokens) ||
                    !Number.isSafeInteger(result.usage.outputTokens) ||
                    result.usage.inputTokens! < 0 ||
                    result.usage.outputTokens! < 0 ||
                    result.usage.inputTokens! >
                        request.providerBudget.maxInputTokensPerAttempt ||
                    result.usage.outputTokens! >
                        request.providerBudget.maxOutputTokensPerAttempt
                ) {
                    throw new CardProposalGeneratorExecutionError(
                        'invalid_output',
                    );
                }
                return {
                    proposal,
                    usage: {
                        inputTokens: result.usage.inputTokens!,
                        outputTokens: result.usage.outputTokens!,
                    },
                };
            } catch (error) {
                if (request.signal.aborted) {
                    throw (
                        request.signal.reason ??
                        new DOMException('Aborted', 'AbortError')
                    );
                }
                if (error instanceof CardProposalGeneratorExecutionError) {
                    throw error;
                }
                throw new CardProposalGeneratorExecutionError(
                    'provider_failure',
                );
            }
        },
        readiness(signal) {
            signal.throwIfAborted();
            if (!options.providerReadiness)
                return Promise.reject(
                    new CardProposalGeneratorUnavailableError(),
                );
            return options.providerReadiness(signal).catch(() => {
                signal.throwIfAborted();
                throw new CardProposalGeneratorUnavailableError();
            });
        },
    };
}

export type DeterministicCardProposalResolver = (
    request: CardProposalGeneratorRequest,
) =>
    | DictionaryGenerationProposalPayload
    | Promise<DictionaryGenerationProposalPayload>;

export class DeterministicCardProposalGenerator implements CardProposalGenerator {
    public constructor(
        private readonly resolve: DeterministicCardProposalResolver = defaultDeterministicProposal,
    ) {}

    public async generate(
        request: CardProposalGeneratorRequest,
    ): Promise<DictionaryGenerationProposalPayload> {
        request.signal.throwIfAborted();
        validatedInput(request.input);
        try {
            const proposal = await this.resolve(request);
            request.signal.throwIfAborted();
            return validatedOutput(proposal);
        } catch (error) {
            if (request.signal.aborted) {
                throw (
                    request.signal.reason ??
                    new DOMException('Aborted', 'AbortError')
                );
            }
            if (error instanceof CardProposalGeneratorExecutionError) {
                throw error;
            }
            throw new CardProposalGeneratorExecutionError('provider_failure');
        }
    }

    public readiness(signal: AbortSignal): Promise<void> {
        signal.throwIfAborted();
        return Promise.resolve();
    }
}

export class UnavailableCardProposalGenerator implements CardProposalGenerator {
    public generate(
        request: CardProposalGeneratorRequest,
    ): Promise<DictionaryGenerationProposalPayload> {
        request.signal.throwIfAborted();
        return Promise.reject(new CardProposalGeneratorUnavailableError());
    }

    public readiness(signal: AbortSignal): Promise<void> {
        signal.throwIfAborted();
        return Promise.reject(new CardProposalGeneratorUnavailableError());
    }
}

export type CardProposalGeneratorFactoryOptions =
    | { mode: 'unavailable' }
    | {
          mode: 'deterministic';
          proposal?: DeterministicCardProposalResolver;
      }
    | {
          mode: 'mastra';
          model: ModelRouterModelId | OpenAICompatibleConfig;
          providerBudget: DictionaryGenerationProviderBudgetPolicy;
          providerProbeFetch?: typeof fetch;
      };

export function createCardProposalGenerator(
    options: CardProposalGeneratorFactoryOptions,
): CardProposalGenerator {
    if (options.mode === 'unavailable') {
        return new UnavailableCardProposalGenerator();
    }
    if (options.mode === 'deterministic') {
        return new DeterministicCardProposalGenerator(options.proposal);
    }

    const agent: DictionaryCardGenerationAgent =
        createDictionaryCardGenerationAgent({ model: options.model });
    const runtime = new Mastra({
        agents: { dictionaryCardGenerationAgent: agent },
        logger: false,
    });
    const providerReadiness = openAICompatibleProviderReadiness(
        options.model,
        options.providerProbeFetch ?? globalThis.fetch,
    );
    return createMastraCardProposalGenerator({
        agent: runtime.listAgents().dictionaryCardGenerationAgent,
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
        if (!response.ok) throw new CardProposalGeneratorUnavailableError();
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
    const parsed = DictionaryCardGenerationModelInputSchema.safeParse(value);
    if (!parsed.success) {
        throw new CardProposalGeneratorExecutionError('invalid_input');
    }
    return parsed.data;
}

function validatedOutput(value: unknown): DictionaryGenerationProposalPayload {
    const parsed = DictionaryCardGenerationModelOutputSchema.safeParse(value);
    if (!parsed.success) {
        throw new CardProposalGeneratorExecutionError('invalid_output');
    }
    return parsed.data;
}

function defaultDeterministicProposal(
    request: CardProposalGeneratorRequest,
): DictionaryGenerationProposalPayload {
    return {
        candidate: {
            overrides: request.input.original.overrides,
            values: request.input.original.values,
        },
        fieldFeedback: [],
        warnings: [],
    };
}
