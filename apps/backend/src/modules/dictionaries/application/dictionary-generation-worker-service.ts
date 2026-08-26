import {
    CardProposalGeneratorError,
    type CardProposalGenerator,
    type CardProposalGeneratorResponse,
} from './ports/card-proposal-generator';
import type { DictionaryGenerationProviderBudgetPolicy } from './ports/dictionary-generation-provider-policy';
import { dictionaryGenerationProviderUsageCostMicros } from './ports/dictionary-generation-provider-policy';
import {
    dictionaryPastedTermsGenerationMinimumOutputTokensPerAttempt,
    type PastedTermsProposalGenerator,
} from './ports/pasted-terms-proposal-generator';
import type { DictionaryGenerationStore } from './ports/dictionary-generation-store';
import {
    dictionaryImportPairsGenerationMinimumOutputTokensPerAttempt,
    type ImportPairsProposalGenerator,
} from './ports/import-pairs-proposal-generator';
import type { DictionaryClock } from './dictionary-service';
import {
    dictionaryPastedTermsGenerationFormat,
    dictionaryImportPairsGenerationFormat,
    dictionaryGenerationFormat,
    dictionaryGenerationReviewLifetimeMs,
    parseDictionaryGenerationProposal,
} from '../domain/generation';
import {
    chunkDictionaryBatchGenerationRows,
    dictionaryBatchGenerationLimits,
    parseDictionaryImportPairsGenerationProposal,
    parseDictionaryBatchGenerationProposal,
} from '../domain/batch-generation';
import { InvalidDictionarySettingsError } from '../domain/settings';
import { dictionaryDocumentGenerationFormat } from '../domain/document-ingestion';
import { DictionaryDocumentGenerationError } from './dictionary-document-generation-processor';
import type { DictionaryDocumentGenerationExecutor } from './dictionary-document-generation-executor';
import type { DictionaryDocumentCleanupProcessor } from './dictionary-document-cleanup-processor';
import type { DictionaryDocumentStore } from './ports/dictionary-document-store';

class ProviderDeadlineError extends Error {}
class WorkerLeaseLostError extends Error {}

function parseGeneratorResponse(
    response: CardProposalGeneratorResponse,
    providerBudget: DictionaryGenerationProviderBudgetPolicy,
) {
    const result =
        'proposal' in response
            ? response
            : { proposal: response, usage: undefined };
    if (
        result.usage &&
        (!Number.isSafeInteger(result.usage.inputTokens) ||
            result.usage.inputTokens < 0 ||
            !Number.isSafeInteger(result.usage.outputTokens) ||
            result.usage.outputTokens < 0 ||
            result.usage.inputTokens >
                providerBudget.maxInputTokensPerAttempt ||
            result.usage.outputTokens >
                providerBudget.maxOutputTokensPerAttempt)
    )
        throw new CardProposalGeneratorError('invalid_model_output');
    return {
        proposal: parseDictionaryGenerationProposal(result.proposal),
        usage: result.usage,
    };
}

async function generatePastedTermsProposal(input: {
    claim: Awaited<ReturnType<DictionaryGenerationStore['claim']>> & {};
    provider: PastedTermsProposalGenerator;
    signal: AbortSignal;
}) {
    if (input.claim.input.format !== dictionaryPastedTermsGenerationFormat) {
        throw new CardProposalGeneratorError('invalid_model_output');
    }
    const claimedInput = input.claim.input;
    const chunks = chunkDictionaryBatchGenerationRows(claimedInput.rows);
    if (
        input.claim.providerBudget.maxOutputTokensPerAttempt <
        (dictionaryPastedTermsGenerationMinimumOutputTokensPerAttempt /
            dictionaryBatchGenerationLimits.maximumRows) *
            dictionaryBatchGenerationLimits.chunkRows *
            chunks.length
    ) {
        throw new CardProposalGeneratorError('invalid_model_output');
    }

    const candidates: ReturnType<
        typeof parseDictionaryBatchGenerationProposal
    >['candidates'] = [];
    const failures: ReturnType<
        typeof parseDictionaryBatchGenerationProposal
    >['failures'] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let costMicros = 0;

    for (const [chunkIndex, rows] of chunks.entries()) {
        const remainingChunks = chunks.length - chunkIndex;
        const remainingInputTokens =
            input.claim.providerBudget.maxInputTokensPerAttempt - inputTokens;
        const remainingOutputTokens =
            input.claim.providerBudget.maxOutputTokensPerAttempt - outputTokens;
        const remainingCostMicros =
            input.claim.providerBudget.maxCostMicrosPerAttempt - costMicros;
        const response = await input.provider.generate({
            idempotencyKey: `${input.claim.id}/generate/chunk/${chunkIndex + 1}-of-${chunks.length}`,
            input: { ...claimedInput, rows },
            providerBudget: {
                ...input.claim.providerBudget,
                maxCostMicrosPerAttempt: Math.floor(
                    remainingCostMicros / remainingChunks,
                ),
                maxInputTokensPerAttempt: Math.floor(
                    remainingInputTokens / remainingChunks,
                ),
                maxOutputTokensPerAttempt: Math.floor(
                    remainingOutputTokens / remainingChunks,
                ),
            },
            signal: input.signal,
        });
        inputTokens += response.usage.inputTokens;
        outputTokens += response.usage.outputTokens;
        costMicros += dictionaryGenerationProviderUsageCostMicros(
            input.claim.providerBudget,
            response.usage,
        );
        if (
            inputTokens > input.claim.providerBudget.maxInputTokensPerAttempt ||
            outputTokens >
                input.claim.providerBudget.maxOutputTokensPerAttempt ||
            costMicros > input.claim.providerBudget.maxCostMicrosPerAttempt
        ) {
            throw new CardProposalGeneratorError('invalid_model_output');
        }
        candidates.push(...response.proposal.candidates);
        failures.push(...response.proposal.failures);
    }

    return {
        proposal: parseDictionaryBatchGenerationProposal({
            candidates: candidates.sort(
                (left, right) => left.rowIndex - right.rowIndex,
            ),
            failures: failures.sort(
                (left, right) => left.rowIndex - right.rowIndex,
            ),
            warnings: [],
        }),
        usage: { inputTokens, outputTokens },
    };
}

async function generateImportPairsProposal(input: {
    claim: Awaited<ReturnType<DictionaryGenerationStore['claim']>> & {};
    provider: ImportPairsProposalGenerator;
    signal: AbortSignal;
}) {
    if (input.claim.input.format !== dictionaryImportPairsGenerationFormat)
        throw new CardProposalGeneratorError('invalid_model_output');
    const claimedInput = input.claim.input;
    const chunks = Array.from(
        {
            length: Math.ceil(
                claimedInput.rows.length /
                    dictionaryBatchGenerationLimits.chunkRows,
            ),
        },
        (_, index) =>
            claimedInput.rows.slice(
                index * dictionaryBatchGenerationLimits.chunkRows,
                (index + 1) * dictionaryBatchGenerationLimits.chunkRows,
            ),
    );
    if (
        input.claim.providerBudget.maxOutputTokensPerAttempt <
        (dictionaryImportPairsGenerationMinimumOutputTokensPerAttempt /
            dictionaryBatchGenerationLimits.maximumRows) *
            dictionaryBatchGenerationLimits.chunkRows *
            chunks.length
    )
        throw new CardProposalGeneratorError('invalid_model_output');
    const candidates: Awaited<
        ReturnType<ImportPairsProposalGenerator['generate']>
    >['proposal']['candidates'] = [];
    const failures: Awaited<
        ReturnType<ImportPairsProposalGenerator['generate']>
    >['proposal']['failures'] = [];
    const warnings: Awaited<
        ReturnType<ImportPairsProposalGenerator['generate']>
    >['proposal']['warnings'] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let costMicros = 0;
    for (const [chunkIndex, rows] of chunks.entries()) {
        const remainingChunks = chunks.length - chunkIndex;
        const response = await input.provider.generate({
            idempotencyKey: `${input.claim.id}/generate/import-chunk/${chunkIndex + 1}-of-${chunks.length}`,
            input: { ...claimedInput, rows },
            providerBudget: {
                ...input.claim.providerBudget,
                maxCostMicrosPerAttempt: Math.floor(
                    (input.claim.providerBudget.maxCostMicrosPerAttempt -
                        costMicros) /
                        remainingChunks,
                ),
                maxInputTokensPerAttempt: Math.floor(
                    (input.claim.providerBudget.maxInputTokensPerAttempt -
                        inputTokens) /
                        remainingChunks,
                ),
                maxOutputTokensPerAttempt: Math.floor(
                    (input.claim.providerBudget.maxOutputTokensPerAttempt -
                        outputTokens) /
                        remainingChunks,
                ),
            },
            signal: input.signal,
        });
        inputTokens += response.usage.inputTokens;
        outputTokens += response.usage.outputTokens;
        costMicros += dictionaryGenerationProviderUsageCostMicros(
            input.claim.providerBudget,
            response.usage,
        );
        if (
            inputTokens > input.claim.providerBudget.maxInputTokensPerAttempt ||
            outputTokens >
                input.claim.providerBudget.maxOutputTokensPerAttempt ||
            costMicros > input.claim.providerBudget.maxCostMicrosPerAttempt
        )
            throw new CardProposalGeneratorError('invalid_model_output');
        candidates.push(...response.proposal.candidates);
        failures.push(...response.proposal.failures);
        warnings.push(...response.proposal.warnings);
    }
    return {
        proposal: parseDictionaryImportPairsGenerationProposal({
            candidates: candidates.sort(
                (left, right) => left.rowIndex - right.rowIndex,
            ),
            failures: failures.sort(
                (left, right) => left.rowIndex - right.rowIndex,
            ),
            warnings: warnings.sort(
                (left, right) => left.rowIndex - right.rowIndex,
            ),
        }),
        usage: { inputTokens, outputTokens },
    };
}

export interface DictionaryGenerationWorkerServiceOptions {
    documentProviderTimeoutMs?: number;
    globalConcurrency?: number;
    heartbeatIntervalMs?: number;
    leaseDurationMs?: number;
    ownerConcurrency?: number;
    pastedTermsProviderTimeoutMs?: number;
    providerTimeoutMs?: number;
    retryDelayMs?: number;
}

export class DictionaryGenerationWorkerService {
    private readonly settings: Required<DictionaryGenerationWorkerServiceOptions>;

    public constructor(
        private readonly dependencies: {
            clock: DictionaryClock;
            documentCleanup?: DictionaryDocumentCleanupProcessor;
            documentExecutor?: DictionaryDocumentGenerationExecutor;
            documentStore?: DictionaryDocumentStore;
            importPairsProvider?: ImportPairsProposalGenerator;
            pastedTermsProvider?: PastedTermsProposalGenerator;
            provider: CardProposalGenerator;
            providerReadiness?: (signal: AbortSignal) => Promise<void>;
            store: DictionaryGenerationStore;
        },
        options: DictionaryGenerationWorkerServiceOptions = {},
    ) {
        this.settings = {
            documentProviderTimeoutMs:
                options.documentProviderTimeoutMs ?? 290_000,
            globalConcurrency: options.globalConcurrency ?? 10,
            heartbeatIntervalMs: options.heartbeatIntervalMs ?? 10_000,
            leaseDurationMs: options.leaseDurationMs ?? 30_000,
            ownerConcurrency: options.ownerConcurrency ?? 1,
            pastedTermsProviderTimeoutMs:
                options.pastedTermsProviderTimeoutMs ?? 120_000,
            providerTimeoutMs: options.providerTimeoutMs ?? 20_000,
            retryDelayMs: options.retryDelayMs ?? 5_000,
        };
        if (
            this.settings.heartbeatIntervalMs < 10 ||
            this.settings.leaseDurationMs <=
                this.settings.heartbeatIntervalMs * 2 ||
            this.settings.providerTimeoutMs < 10 ||
            this.settings.providerTimeoutMs >= this.settings.leaseDurationMs ||
            this.settings.pastedTermsProviderTimeoutMs <
                this.settings.providerTimeoutMs ||
            this.settings.pastedTermsProviderTimeoutMs > 295_000 ||
            this.settings.documentProviderTimeoutMs <
                this.settings.pastedTermsProviderTimeoutMs ||
            this.settings.documentProviderTimeoutMs > 295_000 ||
            this.settings.globalConcurrency < 1 ||
            this.settings.ownerConcurrency < 1
        )
            throw new Error('Invalid dictionary generation worker settings.');
    }

    public async readiness(
        signal: AbortSignal,
        options: { includeProvider?: boolean } = {},
    ): Promise<void> {
        await this.dependencies.store.readiness(signal);
        if (!options.includeProvider) return;
        const readiness =
            this.dependencies.providerReadiness ??
            this.dependencies.provider.readiness?.bind(
                this.dependencies.provider,
            );
        if (!readiness)
            throw new CardProposalGeneratorError('provider_unavailable');
        const controller = new AbortController();
        const onAbort = () => controller.abort(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
            const deadline = new Promise<never>((_resolve, reject) => {
                timeout = setTimeout(() => {
                    const error = new ProviderDeadlineError();
                    controller.abort(error);
                    reject(error);
                }, this.settings.providerTimeoutMs);
            });
            await Promise.race([readiness(controller.signal), deadline]);
            signal.throwIfAborted();
        } catch (error) {
            signal.throwIfAborted();
            if (error instanceof CardProposalGeneratorError) throw error;
            throw new CardProposalGeneratorError(
                error instanceof ProviderDeadlineError
                    ? 'provider_timeout'
                    : 'provider_unavailable',
            );
        } finally {
            if (timeout) clearTimeout(timeout);
            signal.removeEventListener('abort', onAbort);
        }
    }

    public async observeOperationalState(input: {
        signal: AbortSignal;
        windowMs: number;
    }) {
        const now = this.dependencies.clock.now();
        return this.dependencies.store.observeOperationalState({
            context: { now, signal: input.signal },
            windowStartedAt: new Date(now.getTime() - input.windowMs),
        });
    }

    public async processNext(input: {
        signal: AbortSignal;
        supportedFormats: readonly string[];
        workerId: string;
    }): Promise<boolean> {
        input.signal.throwIfAborted();
        if (
            this.dependencies.documentCleanup &&
            (await this.dependencies.documentCleanup.processNext({
                signal: input.signal,
                workerId: `${input.workerId}/document-cleanup`,
            }))
        )
            return true;
        const now = this.dependencies.clock.now();
        await this.dependencies.store.expireReviewPayloads({
            context: { now, signal: input.signal },
            limit: 100,
        });
        const claim = await this.dependencies.store.claim({
            context: { now, signal: input.signal },
            globalConcurrency: this.settings.globalConcurrency,
            leaseDurationMs: this.settings.leaseDurationMs,
            ownerConcurrency: this.settings.ownerConcurrency,
            supportedFormats: input.supportedFormats,
            workerId: input.workerId,
        });
        if (!claim) return false;
        if (input.signal.aborted) return true;

        const providerAbort = new AbortController();
        const internalSignal = new AbortController().signal;
        let leaseDeadline = claim.leaseDeadline;
        let stopped = false;
        let shutdownRequested = false;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
        let resolveHeartbeatWait: (() => void) | undefined;
        let currentProgress: {
            percent: number;
            stage:
                | 'cleaning'
                | 'extracting'
                | 'generating'
                | 'ocr'
                | 'scanning'
                | 'validating';
        } = { percent: 25, stage: 'generating' };
        let rejectLeaseLost!: (reason: unknown) => void;
        const leaseLost = new Promise<never>((_resolve, reject) => {
            rejectLeaseLost = reject;
        });
        const onShutdown = () => {
            shutdownRequested = true;
            providerAbort.abort(input.signal.reason);
        };
        input.signal.addEventListener('abort', onShutdown, { once: true });

        const heartbeatLoop = async () => {
            while (!stopped) {
                await new Promise<void>((resolve) => {
                    resolveHeartbeatWait = resolve;
                    heartbeatTimer = setTimeout(
                        resolve,
                        this.settings.heartbeatIntervalMs,
                    );
                });
                if (stopped) return;
                try {
                    const heartbeatNow = this.dependencies.clock.now();
                    const nextLeaseDeadline = new Date(
                        heartbeatNow.getTime() + this.settings.leaseDurationMs,
                    );
                    const retained = await this.dependencies.store.heartbeat({
                        context: { now: heartbeatNow, signal: internalSignal },
                        fencingToken: claim.fencingToken,
                        jobId: claim.id,
                        leaseDeadline,
                        nextLeaseDeadline,
                        progress: currentProgress,
                        workerId: claim.workerId,
                    });
                    if (!retained) throw new WorkerLeaseLostError();
                    leaseDeadline = nextLeaseDeadline;
                } catch (error) {
                    providerAbort.abort(error);
                    rejectLeaseLost(
                        error instanceof WorkerLeaseLostError
                            ? error
                            : new WorkerLeaseLostError(),
                    );
                    return;
                }
            }
        };
        const heartbeat = heartbeatLoop();

        try {
            const deadline = new Promise<never>((_resolve, reject) => {
                timeout = setTimeout(
                    () => {
                        const error = new ProviderDeadlineError();
                        providerAbort.abort(error);
                        reject(error);
                    },
                    claim.input.format === dictionaryDocumentGenerationFormat
                        ? this.settings.documentProviderTimeoutMs
                        : claim.input.format ===
                                dictionaryPastedTermsGenerationFormat ||
                            claim.input.format ===
                                dictionaryImportPairsGenerationFormat
                          ? this.settings.pastedTermsProviderTimeoutMs
                          : this.settings.providerTimeoutMs,
                );
            });
            const generation =
                claim.input.format === dictionaryImportPairsGenerationFormat
                    ? this.dependencies.importPairsProvider
                        ? generateImportPairsProposal({
                              claim,
                              provider: this.dependencies.importPairsProvider,
                              signal: providerAbort.signal,
                          })
                        : Promise.reject(
                              new CardProposalGeneratorError(
                                  'provider_unavailable',
                              ),
                          )
                    : claim.input.format ===
                        dictionaryPastedTermsGenerationFormat
                      ? this.dependencies.pastedTermsProvider
                          ? generatePastedTermsProposal({
                                claim,
                                provider: this.dependencies.pastedTermsProvider,
                                signal: providerAbort.signal,
                            })
                          : Promise.reject(
                                new CardProposalGeneratorError(
                                    'provider_unavailable',
                                ),
                            )
                      : claim.input.format === dictionaryGenerationFormat
                        ? this.dependencies.provider
                              .generate({
                                  idempotencyKey: `${claim.id}/generate`,
                                  input: claim.input,
                                  providerBudget: claim.providerBudget,
                                  signal: providerAbort.signal,
                              })
                              .then((response) =>
                                  parseGeneratorResponse(
                                      response,
                                      claim.providerBudget,
                                  ),
                              )
                        : claim.input.format ===
                                dictionaryDocumentGenerationFormat &&
                            this.dependencies.documentExecutor
                          ? this.dependencies.documentExecutor.execute({
                                attempt: claim.attempt,
                                fencingToken: claim.fencingToken,
                                input: claim.input,
                                jobId: claim.id,
                                leaseDeadline: claim.leaseDeadline,
                                providerBudget: claim.providerBudget,
                                reportStage: (stage, percent) => {
                                    currentProgress = { percent, stage };
                                    return Promise.resolve();
                                },
                                signal: providerAbort.signal,
                                workerId: claim.workerId,
                            })
                          : Promise.reject(
                                new CardProposalGeneratorError(
                                    'provider_unavailable',
                                ),
                            );
            const generated = await Promise.race([
                generation,
                deadline,
                leaseLost,
            ]);
            if (shutdownRequested) return true;
            stopped = true;
            if (heartbeatTimer) clearTimeout(heartbeatTimer);
            resolveHeartbeatWait?.();
            await heartbeat;

            const validatingNow = this.dependencies.clock.now();
            const validatingLeaseDeadline = new Date(
                validatingNow.getTime() + this.settings.leaseDurationMs,
            );
            const retained = await this.dependencies.store.heartbeat({
                context: { now: validatingNow, signal: internalSignal },
                fencingToken: claim.fencingToken,
                jobId: claim.id,
                leaseDeadline,
                nextLeaseDeadline: validatingLeaseDeadline,
                progress: { percent: 90, stage: 'validating' },
                workerId: claim.workerId,
            });
            if (!retained) throw new WorkerLeaseLostError();
            leaseDeadline = validatingLeaseDeadline;

            const completeNow = this.dependencies.clock.now();
            if (claim.input.format === dictionaryDocumentGenerationFormat) {
                if (
                    !this.dependencies.documentStore ||
                    !('extraction' in generated)
                )
                    throw new CardProposalGeneratorError(
                        'provider_unavailable',
                    );
                const staged =
                    await this.dependencies.documentStore.stageDocumentProposal(
                        {
                            context: {
                                now: completeNow,
                                signal: internalSignal,
                            },
                            extractionFingerprint:
                                generated.extraction.fingerprint,
                            failureUnitCount:
                                generated.extraction.failureUnitCount,
                            fencingToken: claim.fencingToken,
                            jobId: claim.id,
                            observedUnitCount:
                                generated.extraction.observedUnitCount,
                            proposal: generated.proposal,
                            providerUsage: generated.providerUsage,
                            scanAttestation: generated.scanAttestation,
                            reviewExpiresAt: new Date(
                                completeNow.getTime() +
                                    dictionaryGenerationReviewLifetimeMs,
                            ),
                            validUnitCount: generated.extraction.validUnitCount,
                            workerId: claim.workerId,
                        },
                    );
                if (!staged) throw new WorkerLeaseLostError();
                return true;
            }
            const completed = await this.dependencies.store.complete({
                context: { now: completeNow, signal: internalSignal },
                fencingToken: claim.fencingToken,
                jobId: claim.id,
                leaseDeadline,
                proposal: generated.proposal,
                ...('usage' in generated && generated.usage
                    ? { providerUsage: generated.usage }
                    : {}),
                reviewExpiresAt: new Date(
                    completeNow.getTime() +
                        dictionaryGenerationReviewLifetimeMs,
                ),
                workerId: claim.workerId,
            });
            if (!completed) throw new WorkerLeaseLostError();
        } catch (error) {
            if (shutdownRequested) return true;
            const failureNow = this.dependencies.clock.now();
            if (
                claim.input.format === dictionaryDocumentGenerationFormat &&
                error instanceof DictionaryDocumentGenerationError &&
                (error.category === 'no_terms_found' ||
                    error.category === 'too_many_terms') &&
                error.extraction &&
                error.scanAttestation &&
                this.dependencies.documentStore
            ) {
                const retained =
                    await this.dependencies.documentStore.terminalizeExtraction(
                        {
                            context: {
                                now: failureNow,
                                signal: internalSignal,
                            },
                            extractionFingerprint: error.extraction.fingerprint,
                            fencingToken: claim.fencingToken,
                            jobId: claim.id,
                            outcome: error.category,
                            scanAttestation: error.scanAttestation,
                            workerId: claim.workerId,
                        },
                    );
                if (!retained) throw new WorkerLeaseLostError();
                return true;
            }
            if (
                claim.input.format === dictionaryDocumentGenerationFormat &&
                error instanceof DictionaryDocumentGenerationError &&
                (error.category === 'extraction_failed' ||
                    error.category === 'invalid_document' ||
                    error.category === 'ocr_failed') &&
                error.scanAttestation &&
                this.dependencies.documentStore
            ) {
                const retained =
                    await this.dependencies.documentStore.recordDocumentProcessingFailure(
                        {
                            category: error.category,
                            context: {
                                now: failureNow,
                                signal: internalSignal,
                            },
                            fencingToken: claim.fencingToken,
                            jobId: claim.id,
                            retryAt: error.retryable
                                ? new Date(
                                      failureNow.getTime() +
                                          this.settings.retryDelayMs,
                                  )
                                : null,
                            scanAttestation: error.scanAttestation,
                            workerId: claim.workerId,
                        },
                    );
                if (!retained) throw new WorkerLeaseLostError();
                return true;
            }
            const category =
                error instanceof CardProposalGeneratorError
                    ? error.category
                    : error instanceof DictionaryDocumentGenerationError
                      ? error.category
                      : error instanceof ProviderDeadlineError
                        ? 'provider_timeout'
                        : error instanceof InvalidDictionarySettingsError ||
                            (error instanceof Error &&
                                error.name === 'ZodError')
                          ? 'invalid_model_output'
                          : 'provider_unavailable';
            await this.dependencies.store.fail({
                context: { now: failureNow, signal: internalSignal },
                failureCategory: category,
                fencingToken: claim.fencingToken,
                jobId: claim.id,
                leaseDeadline,
                retryAt:
                    category === 'invalid_model_output' ||
                    (error instanceof DictionaryDocumentGenerationError &&
                        !error.retryable)
                        ? null
                        : new Date(
                              failureNow.getTime() + this.settings.retryDelayMs,
                          ),
                workerId: claim.workerId,
            });
        } finally {
            stopped = true;
            if (timeout) clearTimeout(timeout);
            if (heartbeatTimer) clearTimeout(heartbeatTimer);
            resolveHeartbeatWait?.();
            input.signal.removeEventListener('abort', onShutdown);
            await heartbeat;
        }
        return true;
    }

    public async releaseWorkerLeases(input: {
        now?: Date;
        workerId: string;
    }): Promise<void> {
        await this.dependencies.store.releaseWorkerLeases({
            context: {
                now: input.now ?? this.dependencies.clock.now(),
                signal: new AbortController().signal,
            },
            workerId: input.workerId,
        });
    }
}
