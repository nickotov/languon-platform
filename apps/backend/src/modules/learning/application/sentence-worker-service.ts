import type {
    SentenceTokenUsage,
    SentenceAiProvider,
} from './ports/sentence-ai-provider';
import { SentenceProviderInvalidModelOutputError } from './ports/sentence-ai-provider';
import type {
    SentenceWorkerStore,
    SentenceJobFormat,
} from './ports/sentence-worker-store';
import { validateSentenceGeneration } from '../domain/sentence-content';
import { validateSentenceCheck } from '../domain/sentence-feedback';
import {
    SentenceInvalidModelOutputError,
    type SentenceModelOutputReason,
} from '../domain/sentence-errors';
export interface SentenceWorkerServiceDependencies {
    store: SentenceWorkerStore;
    provider: SentenceAiProvider;
    clock: { now(): Date };
    workerId: string;
    leaseMs: number;
    heartbeatMs: number;
    timeoutMs: number;
    globalConcurrency: number;
    learnerConcurrency: number;
    maxAttempts: number;
    retryDelayMs: number;
    supportedFormats?: readonly SentenceJobFormat[];
    onInvalidModelOutput?: (event: {
        kind: 'sentence-generation' | 'sentence-check';
        reason: SentenceModelOutputReason;
    }) => void;
}
/** Executes exactly one fenced job; runtime owns the shared bounded slot pool. */
export class SentenceWorkerService {
    constructor(
        private readonly dependencies: SentenceWorkerServiceDependencies,
    ) {}
    async processNext(signal: AbortSignal): Promise<boolean> {
        const d = this.dependencies;
        signal.throwIfAborted();
        const context = () => ({ now: d.clock.now(), signal });
        const job = await d.store.claimNext(
            {
                workerId: d.workerId,
                supportedFormats: d.supportedFormats ?? [
                    'sentence-generation:v1',
                    'sentence-generation:v2',
                    'sentence-check:v1',
                ],
                learningExecutionRevision: 1,
                textAiSelectionRevision: 1,
                creditSettlementRevision: 1,
                leaseMs: d.leaseMs,
                globalConcurrency: d.globalConcurrency,
                learnerConcurrency: d.learnerConcurrency,
            },
            context(),
        );
        if (!job) return false;
        if (
            job.kind === 'sentence-generation' &&
            ((job.format === 'sentence-generation:v1' &&
                job.input.generationPolicyVersion !== 1) ||
                (job.format === 'sentence-generation:v2' &&
                    job.input.generationPolicyVersion !== 2))
        ) {
            await d.store.fail(
                job.lease,
                { code: 'invalid_model_output', retryAt: null },
                context(),
            );
            return true;
        }
        const controller = new AbortController();
        const combined = AbortSignal.any([
            signal,
            controller.signal,
            AbortSignal.timeout(d.timeoutMs),
        ]);
        let heartbeat: Promise<void> | undefined;
        let usage: SentenceTokenUsage | undefined;
        const timer = setInterval(() => {
            if (heartbeat) return;
            heartbeat = d.store
                .heartbeat(job.lease, d.leaseMs, context())
                .then((result) => {
                    if (!result.owned || result.cancellationRequested)
                        controller.abort();
                })
                .catch(() => controller.abort())
                .finally(() => {
                    heartbeat = undefined;
                });
        }, d.heartbeatMs);
        try {
            if (
                (await d.store.markDispatched(job.lease, context())) !==
                'dispatch'
            )
                return true;
            const call = {
                input: job.input,
                execution: job.execution,
                budget: job.budget,
                idempotencyKey: job.providerIdempotencyKey,
                signal: combined,
            };
            if (job.kind === 'sentence-generation') {
                const result = await abortable(
                    d.provider.generate({
                        ...call,
                        input: job.input,
                    }),
                    combined,
                );
                usage = result.usage;
                combined.throwIfAborted();
                await d.store.completeGeneration(
                    job.lease,
                    {
                        content: validateSentenceGeneration(
                            job.input,
                            result.draft,
                        ),
                        ...(result.usage ? { usage: result.usage } : {}),
                    },
                    context(),
                );
            } else {
                const result = await abortable(
                    d.provider.check({
                        ...call,
                        input: job.input,
                    }),
                    combined,
                );
                usage = result.usage;
                combined.throwIfAborted();
                await d.store.completeCheck(
                    job.lease,
                    {
                        feedback: validateSentenceCheck(
                            job.input,
                            result.draft,
                        ),
                        ...(result.usage ? { usage: result.usage } : {}),
                    },
                    context(),
                );
            }
        } catch (error) {
            // Shutdown leaves the lease recoverable. A cancellation/lost fence cannot publish.
            if (!signal.aborted) {
                if (error instanceof SentenceInvalidModelOutputError) {
                    if (
                        error instanceof SentenceProviderInvalidModelOutputError
                    )
                        usage ??= error.usage;
                    try {
                        void Promise.resolve(
                            d.onInvalidModelOutput?.({
                                kind: job.kind,
                                reason: error.reason,
                            }),
                        ).catch(() => undefined);
                    } catch {
                        // Telemetry must never interrupt fenced failure/usage settlement.
                    }
                }
                const code =
                    error instanceof SentenceInvalidModelOutputError
                        ? 'invalid_model_output'
                        : combined.aborted
                          ? 'provider_timeout'
                          : 'provider_unavailable';
                await d.store.fail(
                    job.lease,
                    {
                        code,
                        ...(usage ? { usage } : {}),
                        retryAt:
                            (code === 'invalid_model_output' &&
                                job.kind !== 'sentence-generation') ||
                            controller.signal.aborted ||
                            job.lease.attempt >= d.maxAttempts
                                ? null
                                : new Date(
                                      d.clock.now().getTime() + d.retryDelayMs,
                                  ),
                    },
                    context(),
                );
            }
        } finally {
            clearInterval(timer);
            await heartbeat;
        }
        return true;
    }
    releaseWorkerLeases(signal: AbortSignal) {
        return this.dependencies.store.releaseWorkerLeases(
            this.dependencies.workerId,
            { now: this.dependencies.clock.now(), signal },
        );
    }
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const abort = () =>
            reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
        if (signal.aborted) {
            operation.catch(() => {});
            abort();
            return;
        }
        signal.addEventListener('abort', abort, { once: true });
        operation
            .then(resolve, reject)
            .finally(() => signal.removeEventListener('abort', abort));
    });
}
