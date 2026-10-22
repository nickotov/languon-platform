import { readProviderTokenUsage } from '../../../text-ai/infrastructure/ai/provider-token-usage';
import { Buffer } from 'node:buffer';

import { getLocalPrompt } from '@languon/prompts';
import type {
    ModelRouterModelId,
    OpenAICompatibleConfig,
} from '@mastra/core/llm';
import { Mastra } from '@mastra/core/mastra';
import { z } from 'zod';

import type {
    PastedTermsProposalGenerator,
    PastedTermsProposalGeneratorRequest,
} from '../../application/ports/pasted-terms-proposal-generator';
import {
    dictionaryPastedTermsGenerationMinimumInputTokensPerAttempt,
    dictionaryPastedTermsGenerationMinimumOutputTokensPerAttempt,
} from '../../application/ports/pasted-terms-proposal-generator';
import { CardProposalGeneratorError } from '../../application/ports/card-proposal-generator';
import type { DictionaryGenerationProviderBudgetPolicy } from '../../application/ports/dictionary-generation-provider-policy';
import {
    dictionaryBatchGenerationLimits,
    parseDictionaryBatchGenerationProposal,
    type DictionaryBatchGenerationProposalPayload,
} from '../../domain/batch-generation';
import {
    DictionaryGenerationProposalPayloadSchema,
    DictionaryPastedTermsGenerationInputPayloadSchema,
} from '../../domain/generation';
import {
    createDictionaryPastedTermsGenerationAgent,
    type DictionaryPastedTermsGenerationAgent,
} from './dictionary-pasted-terms-generation-agent';
import {
    textAiRequestLimits as dictionaryTextRequestLimits,
    type TextAiModelRequestLimits as DictionaryTextModelRequestLimits,
    type TextAiStructuredOutputMode as DictionaryTextStructuredOutputMode,
} from '../../../text-ai/infrastructure/ai/text-ai-provider-catalog';

const boundedFailureText = z
    .string()
    .trim()
    .min(1)
    .max(1_000)
    .refine((value) => [...value].length <= 500);

const boundedChunkInput = z
    .string()
    .trim()
    .min(1)
    .max(dictionaryBatchGenerationLimits.rowCodePoints * 2)
    .refine(
        (value) =>
            [...value].length <= dictionaryBatchGenerationLimits.rowCodePoints,
    )
    .refine(
        (value) =>
            ![...value].some((character) => {
                const codePoint = character.codePointAt(0)!;
                return (
                    codePoint <= 9 ||
                    codePoint === 11 ||
                    codePoint === 12 ||
                    (codePoint >= 14 && codePoint <= 31) ||
                    (codePoint >= 127 && codePoint <= 159)
                );
            }),
    );

export const DictionaryPastedTermsChunkModelOutputSchema = z
    .object({
        candidates: z
            .array(
                z
                    .object({
                        rowIndex: z.number().int().min(0).max(99),
                        input: boundedChunkInput,
                        candidate:
                            DictionaryGenerationProposalPayloadSchema.shape
                                .candidate,
                        fieldFeedback:
                            DictionaryGenerationProposalPayloadSchema.shape
                                .fieldFeedback,
                    })
                    .strict(),
            )
            .max(dictionaryBatchGenerationLimits.chunkRows),
        failures: z
            .array(
                z
                    .object({
                        rowIndex: z.number().int().min(0).max(99),
                        input: boundedChunkInput,
                        code: z.enum(['invalid_term', 'generation_failed']),
                        message: boundedFailureText,
                        retryable: z.boolean(),
                    })
                    .strict(),
            )
            .max(dictionaryBatchGenerationLimits.chunkRows),
        warnings: z.tuple([]).optional(),
    })
    .strict();

export const dictionaryPastedTermsGenerationProviderFramingTokenReserve = 16_384;
export const dictionaryPastedTermsGenerationMinimumOutputTokensPerChunk = 8_192;

const dictionaryPastedTermsGenerationFixedInputBytes =
    Buffer.byteLength(
        getLocalPrompt('dictionary-pasted-terms-generation-agent'),
        'utf8',
    ) +
    Buffer.byteLength(
        JSON.stringify(
            z.toJSONSchema(DictionaryPastedTermsChunkModelOutputSchema),
        ),
        'utf8',
    ) +
    dictionaryPastedTermsGenerationProviderFramingTokenReserve;

export class PastedTermsProposalGeneratorUnavailableError extends CardProposalGeneratorError {
    public constructor() {
        super('provider_unavailable');
        this.name = 'PastedTermsProposalGeneratorUnavailableError';
    }
}

export class PastedTermsProposalGeneratorExecutionError extends CardProposalGeneratorError {
    public constructor(
        public readonly reason:
            'invalid_input' | 'invalid_output' | 'provider_failure',
    ) {
        super(
            reason === 'invalid_input' || reason === 'invalid_output'
                ? 'invalid_model_output'
                : 'provider_unavailable',
        );
        this.name = 'PastedTermsProposalGeneratorExecutionError';
    }
}

export class PastedTermsProposalGeneratorCapabilityError extends Error {
    public constructor() {
        super(
            'The pasted-terms provider budget cannot safely fit the bounded chunk envelope.',
        );
        this.name = 'PastedTermsProposalGeneratorCapabilityError';
    }
}

export interface DictionaryPastedTermsGenerationStructuredAgent {
    generate(
        message: string,
        options: {
            abortSignal: AbortSignal;
            maxOutputTokens: number;
            runId: string;
            structuredOutput: {
                jsonPromptInjection?: 'inline';
                schema: typeof DictionaryPastedTermsChunkModelOutputSchema;
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

function validatedChunkInput(request: PastedTermsProposalGeneratorRequest) {
    const input = DictionaryPastedTermsGenerationInputPayloadSchema.parse(
        request.input,
    );
    if (input.rows.length > dictionaryBatchGenerationLimits.chunkRows) {
        throw new PastedTermsProposalGeneratorExecutionError('invalid_input');
    }
    return input;
}

function validatedChunkOutput(
    value: unknown,
    request: PastedTermsProposalGeneratorRequest,
): DictionaryBatchGenerationProposalPayload {
    const output = DictionaryPastedTermsChunkModelOutputSchema.parse(value);
    const requestedRows = new Map(
        request.input.rows.map((row) => [row.rowIndex, row.input]),
    );
    const resolvedRows = [...output.candidates, ...output.failures];
    if (
        resolvedRows.length !== requestedRows.size ||
        new Set(resolvedRows.map((row) => row.rowIndex)).size !==
            resolvedRows.length ||
        resolvedRows.some(
            (row) => requestedRows.get(row.rowIndex) !== row.input,
        )
    ) {
        throw new PastedTermsProposalGeneratorExecutionError('invalid_output');
    }
    return parseDictionaryBatchGenerationProposal({
        candidates: output.candidates,
        failures: output.failures,
        warnings: [],
    });
}

function validatedUsage(
    usage:
        | {
              inputTokens: number | undefined;
              outputTokens: number | undefined;
          }
        | undefined,
    budget: DictionaryGenerationProviderBudgetPolicy,
) {
    try {
        return readProviderTokenUsage(usage, {
            maxInputTokens: budget.maxInputTokensPerAttempt,
            maxOutputTokens: budget.maxOutputTokensPerAttempt,
        });
    } catch {
        throw new PastedTermsProposalGeneratorExecutionError('invalid_output');
    }
}

export function createMastraPastedTermsProposalGenerator(options: {
    agent: DictionaryPastedTermsGenerationStructuredAgent;
    modelRequestLimits?: DictionaryTextModelRequestLimits;
    providerReadiness?: (signal: AbortSignal) => Promise<void>;
    structuredOutputMode?: DictionaryTextStructuredOutputMode;
}): PastedTermsProposalGenerator {
    return {
        async generate(request) {
            let meteredUsage:
                ReturnType<typeof readProviderTokenUsage> | undefined;
            const failure = (
                reason: ConstructorParameters<
                    typeof PastedTermsProposalGeneratorExecutionError
                >[0],
            ) => {
                const result = new PastedTermsProposalGeneratorExecutionError(
                    reason,
                );
                if (meteredUsage) result.usage = meteredUsage;
                return result;
            };

            request.signal.throwIfAborted();
            const input = validatedChunkInput(request);
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
                requestLimits.maxOutputTokens <
                    dictionaryPastedTermsGenerationMinimumOutputTokensPerChunk ||
                Buffer.byteLength(message, 'utf8') +
                    dictionaryPastedTermsGenerationFixedInputBytes >
                    requestLimits.maxInputTokens
            ) {
                throw failure('invalid_input');
            }

            try {
                const result = await options.agent.generate(message, {
                    abortSignal: request.signal,
                    maxOutputTokens: requestLimits.maxOutputTokens,
                    runId: request.idempotencyKey,
                    structuredOutput: {
                        ...(options.structuredOutputMode === 'prompt-injection'
                            ? { jsonPromptInjection: 'inline' as const }
                            : {}),
                        schema: DictionaryPastedTermsChunkModelOutputSchema,
                    },
                    toolChoice: 'none',
                    tracingOptions: { hideInput: true, hideOutput: true },
                });
                request.signal.throwIfAborted();
                if (result.usage) {
                    try {
                        meteredUsage = readProviderTokenUsage(
                            result.usage,
                            requestLimits,
                        );
                    } catch {
                        throw failure('invalid_output');
                    }
                }
                if (result.error || result.tripwire) {
                    throw failure('provider_failure');
                }
                return {
                    proposal: validatedChunkOutput(result.object, request),
                    usage: validatedUsage(result.usage, {
                        ...request.providerBudget,
                        maxInputTokensPerAttempt: requestLimits.maxInputTokens,
                        maxOutputTokensPerAttempt:
                            requestLimits.maxOutputTokens,
                    }),
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
                        );
                    } catch {
                        /* Invalid/missing provider meters remain unknown. */
                    }
                }
                if (error instanceof CardProposalGeneratorError && meteredUsage)
                    error.usage = meteredUsage;

                if (request.signal.aborted) {
                    throw (
                        request.signal.reason ??
                        new DOMException('Aborted', 'AbortError')
                    );
                }
                if (
                    error instanceof PastedTermsProposalGeneratorExecutionError
                ) {
                    throw error;
                }
                if (error instanceof Error && error.name === 'ZodError') {
                    throw failure('invalid_output');
                }
                throw failure('provider_failure');
            }
        },
        readiness(signal) {
            signal.throwIfAborted();
            if (!options.providerReadiness)
                return Promise.reject(
                    new PastedTermsProposalGeneratorUnavailableError(),
                );
            return options.providerReadiness(signal).catch(() => {
                signal.throwIfAborted();
                throw new PastedTermsProposalGeneratorUnavailableError();
            });
        },
    };
}

export type DeterministicPastedTermsProposalResolver = (
    request: PastedTermsProposalGeneratorRequest,
) =>
    | DictionaryBatchGenerationProposalPayload
    | Promise<DictionaryBatchGenerationProposalPayload>;

function defaultDeterministicProposal(
    request: PastedTermsProposalGeneratorRequest,
): DictionaryBatchGenerationProposalPayload {
    const settings = request.input.effectiveSettings;
    // Local/test-only structural fixture: a still-valid long term exercises
    // retryable row recovery without embedding a magic command in user content.
    const failures = request.input.rows
        .filter((row) => [...row.input].length > 160)
        .map((row) => ({
            rowIndex: row.rowIndex,
            input: row.input,
            code: 'generation_failed' as const,
            message:
                'Deterministic generation could not resolve this long term.',
            retryable: true,
        }));
    return {
        candidates: request.input.rows
            .filter((row) => [...row.input].length <= 160)
            .map((row) => ({
                rowIndex: row.rowIndex,
                input: row.input,
                candidate: {
                    overrides: {
                        definitionEnabled: null,
                        definitionLanguage: null,
                        exampleEnabled: null,
                        exampleLanguage: null,
                        exampleTranslationEnabled: null,
                        transcriptionCustomLabel: null,
                        transcriptionEnabled: null,
                        transcriptionNotation: null,
                    },
                    values: {
                        definition: settings.definitionEnabled
                            ? `${row.input} definition`
                            : null,
                        example: settings.exampleEnabled
                            ? `${row.input} example`
                            : null,
                        exampleTranslation:
                            settings.exampleEnabled &&
                            settings.exampleTranslationEnabled
                                ? `${row.input} example translation`
                                : null,
                        source: row.input,
                        transcription: settings.transcriptionEnabled
                            ? row.input
                            : null,
                        translation: row.input,
                    },
                },
                fieldFeedback: [],
            })),
        failures,
        warnings: [],
    };
}

export class DeterministicPastedTermsProposalGenerator implements PastedTermsProposalGenerator {
    public constructor(
        private readonly resolve: DeterministicPastedTermsProposalResolver = defaultDeterministicProposal,
    ) {}

    public async generate(request: PastedTermsProposalGeneratorRequest) {
        request.signal.throwIfAborted();
        validatedChunkInput(request);
        try {
            const proposal = await this.resolve(request);
            request.signal.throwIfAborted();
            return {
                proposal: validatedChunkOutput(proposal, request),
                usage: { inputTokens: 0, outputTokens: 0 },
            };
        } catch (error) {
            if (request.signal.aborted) {
                throw (
                    request.signal.reason ??
                    new DOMException('Aborted', 'AbortError')
                );
            }
            if (error instanceof PastedTermsProposalGeneratorExecutionError) {
                throw error;
            }
            throw new PastedTermsProposalGeneratorExecutionError(
                error instanceof Error && error.name === 'ZodError'
                    ? 'invalid_output'
                    : 'provider_failure',
            );
        }
    }

    public readiness(signal: AbortSignal): Promise<void> {
        signal.throwIfAborted();
        return Promise.resolve();
    }
}

export class UnavailablePastedTermsProposalGenerator implements PastedTermsProposalGenerator {
    public generate(
        request: PastedTermsProposalGeneratorRequest,
    ): Promise<never> {
        request.signal.throwIfAborted();
        return Promise.reject(
            new PastedTermsProposalGeneratorUnavailableError(),
        );
    }

    public readiness(signal: AbortSignal): Promise<void> {
        signal.throwIfAborted();
        return Promise.reject(
            new PastedTermsProposalGeneratorUnavailableError(),
        );
    }
}

export type PastedTermsProposalGeneratorFactoryOptions =
    | { mode: 'unavailable' }
    | {
          mode: 'deterministic';
          proposal?: DeterministicPastedTermsProposalResolver;
      }
    | {
          mode: 'mastra';
          model: ModelRouterModelId | OpenAICompatibleConfig;
          modelRequestLimits?: DictionaryTextModelRequestLimits;
          providerBudget: DictionaryGenerationProviderBudgetPolicy;
          providerReadiness?: (signal: AbortSignal) => Promise<void>;
          structuredOutputMode?: DictionaryTextStructuredOutputMode;
      };

export function createPastedTermsProposalGenerator(
    options: PastedTermsProposalGeneratorFactoryOptions,
): PastedTermsProposalGenerator {
    if (options.mode === 'unavailable') {
        return new UnavailablePastedTermsProposalGenerator();
    }
    if (options.mode === 'deterministic') {
        return new DeterministicPastedTermsProposalGenerator(options.proposal);
    }
    if (
        options.providerBudget.maxInputTokensPerAttempt <
            dictionaryPastedTermsGenerationMinimumInputTokensPerAttempt ||
        options.providerBudget.maxOutputTokensPerAttempt <
            dictionaryPastedTermsGenerationMinimumOutputTokensPerAttempt
    ) {
        throw new PastedTermsProposalGeneratorCapabilityError();
    }
    const agent: DictionaryPastedTermsGenerationAgent =
        createDictionaryPastedTermsGenerationAgent({ model: options.model });
    const runtime = new Mastra({
        agents: { dictionaryPastedTermsGenerationAgent: agent },
        logger: false,
    });
    return createMastraPastedTermsProposalGenerator({
        agent: runtime.listAgents().dictionaryPastedTermsGenerationAgent,
        ...(options.modelRequestLimits
            ? { modelRequestLimits: options.modelRequestLimits }
            : {}),
        ...(options.providerReadiness
            ? { providerReadiness: options.providerReadiness }
            : {}),
        ...(options.structuredOutputMode
            ? { structuredOutputMode: options.structuredOutputMode }
            : {}),
    });
}
