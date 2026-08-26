import { Buffer } from 'node:buffer';

import type {
    ModelRouterModelId,
    OpenAICompatibleConfig,
} from '@mastra/core/llm';
import { Mastra } from '@mastra/core/mastra';

import type {
    ImportPairsProposalGenerator,
    ImportPairsProposalGeneratorRequest,
} from '../../application/ports/import-pairs-proposal-generator';
import {
    dictionaryImportPairsGenerationMinimumInputTokensPerAttempt,
    dictionaryImportPairsGenerationMinimumOutputTokensPerAttempt,
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

export class ImportPairsProposalGeneratorExecutionError extends CardProposalGeneratorError {}

export interface DictionaryImportPairsGenerationStructuredAgent {
    generate(
        message: string,
        options: {
            abortSignal: AbortSignal;
            maxOutputTokens: number;
            runId: string;
            structuredOutput: {
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
}): ImportPairsProposalGenerator {
    return {
        async generate(request) {
            request.signal.throwIfAborted();
            const input =
                DictionaryImportPairsGenerationInputPayloadSchema.parse(
                    request.input,
                );
            if (input.rows.length > dictionaryBatchGenerationLimits.chunkRows)
                throw new ImportPairsProposalGeneratorExecutionError(
                    'invalid_model_output',
                );
            const message = JSON.stringify({
                effectiveSettings: input.effectiveSettings,
                instruction: input.instruction,
                rows: input.rows.map((row) => ({
                    rowIndex: row.rowIndex,
                    source: row.source,
                    translation: row.translation,
                })),
                sourceLanguage: input.context.sourceLanguage,
                targetLanguage: input.context.targetLanguage,
            });
            if (
                request.providerBudget.maxOutputTokensPerAttempt < 8_192 ||
                Buffer.byteLength(message, 'utf8') + 16_384 >
                    request.providerBudget.maxInputTokensPerAttempt
            )
                throw new ImportPairsProposalGeneratorExecutionError(
                    'invalid_model_output',
                );
            try {
                const result = await options.agent.generate(message, {
                    abortSignal: request.signal,
                    maxOutputTokens:
                        request.providerBudget.maxOutputTokensPerAttempt,
                    runId: request.idempotencyKey,
                    structuredOutput: {
                        schema: DictionaryImportPairsGenerationProposalPayloadSchema,
                    },
                    toolChoice: 'none',
                    tracingOptions: { hideInput: true, hideOutput: true },
                });
                if (result.error || result.tripwire)
                    throw new ImportPairsProposalGeneratorExecutionError(
                        'provider_unavailable',
                    );
                const proposal = parseDictionaryImportPairsGenerationProposal(
                    result.object,
                );
                if (!proposalMatchesTrustedInput(proposal, input))
                    throw new ImportPairsProposalGeneratorExecutionError(
                        'invalid_model_output',
                    );
                const usage = result.usage;
                if (
                    !Number.isSafeInteger(usage?.inputTokens) ||
                    !Number.isSafeInteger(usage?.outputTokens) ||
                    usage!.inputTokens! < 0 ||
                    usage!.outputTokens! < 0 ||
                    usage!.inputTokens! >
                        request.providerBudget.maxInputTokensPerAttempt ||
                    usage!.outputTokens! >
                        request.providerBudget.maxOutputTokensPerAttempt
                )
                    throw new ImportPairsProposalGeneratorExecutionError(
                        'invalid_model_output',
                    );
                return {
                    proposal,
                    usage: {
                        inputTokens: usage!.inputTokens!,
                        outputTokens: usage!.outputTokens!,
                    },
                };
            } catch (error) {
                if (request.signal.aborted)
                    throw (
                        request.signal.reason ??
                        new DOMException('Aborted', 'AbortError')
                    );
                if (error instanceof ImportPairsProposalGeneratorExecutionError)
                    throw error;
                throw new ImportPairsProposalGeneratorExecutionError(
                    'invalid_model_output',
                );
            }
        },
        readiness(signal) {
            signal.throwIfAborted();
            return Promise.resolve();
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
          model: ModelRouterModelId | OpenAICompatibleConfig;
          providerBudget: DictionaryGenerationProviderBudgetPolicy;
      };

export function createImportPairsProposalGenerator(
    options: ImportPairsProposalGeneratorFactoryOptions,
): ImportPairsProposalGenerator {
    if (options.mode === 'unavailable')
        return new UnavailableImportPairsProposalGenerator();
    if (options.mode === 'deterministic')
        return new DeterministicImportPairsProposalGenerator(options.proposal);
    if (
        options.providerBudget.maxInputTokensPerAttempt <
            dictionaryImportPairsGenerationMinimumInputTokensPerAttempt ||
        options.providerBudget.maxOutputTokensPerAttempt <
            dictionaryImportPairsGenerationMinimumOutputTokensPerAttempt
    )
        throw new Error(
            'Import-pairs generation requires the bounded 262144 input-token and 40960 output-token envelope.',
        );
    const agent: DictionaryImportPairsGenerationAgent =
        createDictionaryImportPairsGenerationAgent({ model: options.model });
    const runtime = new Mastra({
        agents: { dictionaryImportPairsGenerationAgent: agent },
        logger: false,
    });
    return createMastraImportPairsProposalGenerator({
        agent: runtime.listAgents().dictionaryImportPairsGenerationAgent,
    });
}
