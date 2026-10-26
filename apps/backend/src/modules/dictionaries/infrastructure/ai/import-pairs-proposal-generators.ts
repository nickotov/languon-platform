import { withQueuedTextAiProviderAttempt } from '../../../text-ai/infrastructure/ai/with-queued-text-ai-provider-attempt';
import { withProviderExecutionOutcome } from '../../../text-ai/infrastructure/ai/provider-execution-outcome';
import { readProviderTokenUsage } from '../../../text-ai/infrastructure/ai/provider-token-usage';
import { Buffer } from 'node:buffer';

import type {
    ModelRouterModelId,
    OpenAICompatibleConfig,
    ModelRouterLanguageModel,
} from '@mastra/core/llm';
import { Mastra } from '@mastra/core/mastra';

import type {
    ImportPairsProposalGenerator,
    ImportPairsProposalGeneratorRequest,
} from '../../application/ports/import-pairs-proposal-generator';
import { CardProposalGeneratorError } from '../../application/ports/card-proposal-generator';
import type { DictionaryGenerationProviderBudgetPolicy } from '../../application/ports/dictionary-generation-provider-policy';
import {
    DictionaryImportPairsGenerationProposalPayloadSchema,
    dictionaryBatchGenerationLimits,
    parseDictionaryImportPairsGenerationProposal,
} from '../../domain/batch-generation';
import { DictionaryImportPairsGenerationInputPayloadSchema } from '../../domain/generation';
import {
    createDictionaryImportPairsGenerationAgent,
    type DictionaryImportPairsGenerationAgent,
} from './dictionary-import-pairs-generation-agent';
import {
    textAiRequestLimits as dictionaryTextRequestLimits,
    type TextAiModelRequestLimits as DictionaryTextModelRequestLimits,
    type TextAiStructuredOutputMode as DictionaryTextStructuredOutputMode,
} from '../../../text-ai/infrastructure/ai/text-ai-provider-catalog';

export class ImportPairsProposalGeneratorExecutionError extends CardProposalGeneratorError {}

export interface DictionaryImportPairsGenerationStructuredAgent {
    generate(
        message: string,
        options: {
            abortSignal: AbortSignal;
            modelSettings: { maxOutputTokens: number; maxRetries: 0 };
            runId: string;
            structuredOutput: {
                jsonPromptInjection?: 'inline';
                schema: typeof DictionaryImportPairsGenerationProposalPayloadSchema;
            };
            toolChoice: 'none';
            tracingOptions: { hideInput: true; hideOutput: true };
        },
    ): Promise<{
        error?: Error | undefined;
        object: unknown;
        tripwire?: unknown | undefined;
        usage?: {
            inputTokens?: number | undefined;
            outputTokens?: number | undefined;
        };
    }>;
}

function proposalMatchesTrustedInput(
    proposal: ReturnType<typeof parseDictionaryImportPairsGenerationProposal>,
    input: ReturnType<
        typeof DictionaryImportPairsGenerationInputPayloadSchema.parse
    >,
): boolean {
    const requested = new Map(input.rows.map((row) => [row.rowIndex, row]));
    const resolved = [...proposal.candidates, ...proposal.failures];
    const enabledFields = new Set([
        ...(input.effectiveSettings.transcriptionEnabled
            ? (['transcription'] as const)
            : []),
        ...(input.effectiveSettings.definitionEnabled
            ? (['definition'] as const)
            : []),
        ...(input.effectiveSettings.exampleEnabled
            ? (['example'] as const)
            : []),
        ...(input.effectiveSettings.exampleTranslationEnabled
            ? (['exampleTranslation'] as const)
            : []),
    ]);
    return (
        resolved.length === requested.size &&
        new Set(resolved.map((row) => row.rowIndex)).size === resolved.length &&
        proposal.candidates.every((row) => {
            const baseline = requested.get(row.rowIndex);
            return (
                baseline !== undefined &&
                row.source === baseline.source &&
                row.translation === baseline.translation &&
                Object.values(row.candidate.overrides).every(
                    (value) => value === null,
                ) &&
                (input.effectiveSettings.transcriptionEnabled ||
                    row.candidate.values.transcription === null) &&
                (input.effectiveSettings.definitionEnabled ||
                    row.candidate.values.definition === null) &&
                (input.effectiveSettings.exampleEnabled ||
                    row.candidate.values.example === null) &&
                (input.effectiveSettings.exampleTranslationEnabled ||
                    row.candidate.values.exampleTranslation === null) &&
                row.fieldFeedback.every((feedback) =>
                    enabledFields.has(
                        feedback.field as
                            | 'definition'
                            | 'example'
                            | 'exampleTranslation'
                            | 'transcription',
                    ),
                )
            );
        }) &&
        proposal.failures.every((row) => {
            const baseline = requested.get(row.rowIndex);
            return (
                baseline !== undefined &&
                row.input === baseline.source &&
                row.source === baseline.source &&
                row.translation === baseline.translation
            );
        })
    );
}

export function createMastraImportPairsProposalGenerator(options: {
    agent: DictionaryImportPairsGenerationStructuredAgent;
    modelRequestLimits?: DictionaryTextModelRequestLimits;
    providerReadiness?: (signal: AbortSignal) => Promise<void>;
    structuredOutputMode?: DictionaryTextStructuredOutputMode;
}): ImportPairsProposalGenerator {
    return {
        async generate(request) {
            let outputReceived = false;
            let meteredUsage:
                ReturnType<typeof readProviderTokenUsage> | undefined;
            const failure = (
                reason: ConstructorParameters<
                    typeof ImportPairsProposalGeneratorExecutionError
                >[0],
            ) => {
                const result = new ImportPairsProposalGeneratorExecutionError(
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
            const input =
                DictionaryImportPairsGenerationInputPayloadSchema.parse(
                    request.input,
                );
            if (input.rows.length > dictionaryBatchGenerationLimits.chunkRows)
                throw failure('invalid_model_output');
            const message = JSON.stringify({
                effectiveSettings: input.effectiveSettings,
                instruction: input.instruction,
                translationContext: input.translationContext,
                rows: input.rows.map((row) => ({
                    rowIndex: row.rowIndex,
                    source: row.source,
                    translation: row.translation,
                })),
                sourceLanguage: input.context.sourceLanguage,
                targetLanguage: input.context.targetLanguage,
            });
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
                requestLimits.maxOutputTokens < 8_192 ||
                Buffer.byteLength(message, 'utf8') + 16_384 >
                    requestLimits.maxInputTokens
            )
                throw failure('invalid_model_output');
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
                                schema: DictionaryImportPairsGenerationProposalPayloadSchema,
                            },
                            toolChoice: 'none',
                            tracingOptions: {
                                hideInput: true,
                                hideOutput: true,
                            },
                        }),
                );
                outputReceived = true;
                if (result.usage) {
                    try {
                        meteredUsage = readProviderTokenUsage(
                            result.usage,
                            requestLimits,
                        );
                    } catch {
                        throw failure('invalid_model_output');
                    }
                }
                if (result.error || result.tripwire)
                    throw withProviderExecutionOutcome(
                        failure('provider_unavailable'),
                        result.error,
                        request.providerExecution?.providerId ?? 'unknown',
                    );
                const proposal = parseDictionaryImportPairsGenerationProposal(
                    result.object,
                );
                if (!proposalMatchesTrustedInput(proposal, input))
                    throw failure('invalid_model_output');
                const usage = result.usage;
                let measuredUsage;
                try {
                    measuredUsage = readProviderTokenUsage(
                        usage,
                        requestLimits,
                    );
                } catch {
                    throw failure('invalid_model_output');
                }

                return {
                    proposal,
                    usage: measuredUsage,
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

                if (request.signal.aborted)
                    throw (
                        request.signal.reason ??
                        new DOMException('Aborted', 'AbortError')
                    );
                if (
                    outputReceived &&
                    error instanceof CardProposalGeneratorError &&
                    error.category === 'invalid_model_output'
                )
                    error.executionOutcome = 'completed';
                if (error instanceof ImportPairsProposalGeneratorExecutionError)
                    throw error;
                if (
                    outputReceived &&
                    error instanceof Error &&
                    error.name === 'ZodError'
                )
                    throw failure('invalid_model_output');
                throw withProviderExecutionOutcome(
                    failure('invalid_model_output'),
                    error,
                    request.providerExecution?.providerId ?? 'unknown',
                );
            }
        },
        readiness(signal) {
            signal.throwIfAborted();
            if (!options.providerReadiness)
                return Promise.reject(
                    new Error('Import-pairs generation is unavailable.'),
                );
            return options.providerReadiness(signal).catch(() => {
                signal.throwIfAborted();
                throw new Error('Import-pairs generation is unavailable.');
            });
        },
    };
}

export type DeterministicImportPairsProposalResolver = (
    request: ImportPairsProposalGeneratorRequest,
) => ReturnType<typeof parseDictionaryImportPairsGenerationProposal>;

function deterministicProposal(request: ImportPairsProposalGeneratorRequest) {
    return parseDictionaryImportPairsGenerationProposal({
        candidates: request.input.rows.map((row) => ({
            rowIndex: row.rowIndex,
            source: row.source,
            translation: row.translation,
            candidate: {
                overrides: {
                    transcriptionCustomLabel: null,
                    definitionEnabled: null,
                    definitionLanguage: null,
                    exampleEnabled: null,
                    exampleLanguage: null,
                    exampleTranslationEnabled: null,
                    transcriptionEnabled: null,
                    transcriptionNotation: null,
                },
                values: {
                    source: row.source,
                    translation: row.translation,
                    transcription: request.input.effectiveSettings
                        .transcriptionEnabled
                        ? `[${[...row.source].slice(0, 198).join('')}]`
                        : null,
                    definition: request.input.effectiveSettings
                        .definitionEnabled
                        ? `Imported meaning of ${row.source}`
                        : null,
                    example: request.input.effectiveSettings.exampleEnabled
                        ? `Example using ${row.source}`
                        : null,
                    exampleTranslation: request.input.effectiveSettings
                        .exampleTranslationEnabled
                        ? `Example using ${row.translation}`
                        : null,
                },
            },
            fieldFeedback: [],
        })),
        failures: [],
        warnings: [],
    });
}

export class DeterministicImportPairsProposalGenerator implements ImportPairsProposalGenerator {
    public constructor(
        private readonly resolve: DeterministicImportPairsProposalResolver = deterministicProposal,
    ) {}

    public async generate(request: ImportPairsProposalGeneratorRequest) {
        request.signal.throwIfAborted();
        const proposal = parseDictionaryImportPairsGenerationProposal(
            this.resolve(request),
        );
        if (!proposalMatchesTrustedInput(proposal, request.input))
            throw new ImportPairsProposalGeneratorExecutionError(
                'invalid_model_output',
            );
        request.signal.throwIfAborted();
        return { proposal, usage: { inputTokens: 0, outputTokens: 0 } };
    }

    public readiness(signal: AbortSignal): Promise<void> {
        signal.throwIfAborted();
        return Promise.resolve();
    }
}

export class UnavailableImportPairsProposalGenerator implements ImportPairsProposalGenerator {
    public generate(
        request: ImportPairsProposalGeneratorRequest,
    ): Promise<never> {
        request.signal.throwIfAborted();
        return Promise.reject(
            new Error('Import-pairs generation is unavailable.'),
        );
    }

    public readiness(signal: AbortSignal): Promise<never> {
        signal.throwIfAborted();
        return Promise.reject(
            new Error('Import-pairs generation is unavailable.'),
        );
    }
}

export type ImportPairsProposalGeneratorFactoryOptions =
    | { mode: 'unavailable' }
    | {
          mode: 'deterministic';
          proposal?: DeterministicImportPairsProposalResolver;
      }
    | {
          mode: 'mastra';
          model:
              | ModelRouterModelId
              | OpenAICompatibleConfig
              | ModelRouterLanguageModel;
          modelRequestLimits?: DictionaryTextModelRequestLimits;
          providerBudget: DictionaryGenerationProviderBudgetPolicy;
          providerReadiness?: (signal: AbortSignal) => Promise<void>;
          structuredOutputMode?: DictionaryTextStructuredOutputMode;
      };

export function createImportPairsProposalGenerator(
    options: ImportPairsProposalGeneratorFactoryOptions,
): ImportPairsProposalGenerator {
    if (options.mode === 'unavailable')
        return new UnavailableImportPairsProposalGenerator();
    if (options.mode === 'deterministic')
        return new DeterministicImportPairsProposalGenerator(options.proposal);
    // Accounting may admit fewer than five chunks. Require only a single
    // affordable chunk here; generate() checks its actual input and remaining caps.
    if (
        options.providerBudget.maxInputTokensPerAttempt < 16_384 ||
        options.providerBudget.maxOutputTokensPerAttempt < 8_192
    )
        throw new Error(
            'Import-pairs generation requires a bounded per-chunk input/output envelope.',
        );
    const agent: DictionaryImportPairsGenerationAgent =
        createDictionaryImportPairsGenerationAgent({ model: options.model });
    const runtime = new Mastra({
        agents: { dictionaryImportPairsGenerationAgent: agent },
        logger: false,
    });
    return createMastraImportPairsProposalGenerator({
        agent: runtime.listAgents().dictionaryImportPairsGenerationAgent,
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
