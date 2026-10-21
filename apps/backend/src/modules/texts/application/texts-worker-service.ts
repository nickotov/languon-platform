import {
    TextDetectionResultSchema,
    TextTranslationProposalSchema,
} from '@languon/contracts';
import type {
    TextsAiProvider,
    TextsTokenUsage,
    TextJobResult,
} from './ports/texts-ai-provider';
import {
    TextsProviderInvalidOutputError,
    TextsAiError,
} from './ports/texts-ai-provider';
import type { TextsWorkerStore } from './ports/texts-job-store';
import { validateTranslation, TextDomainError } from '../domain/text';
export interface TextsWorkerDependencies {
    store: TextsWorkerStore;
    provider: TextsAiProvider;
    clock: { now(): Date };
    workerId: string;
    leaseMs: number;
    heartbeatMs: number;
    timeoutMs: number;
    globalConcurrency: number;
    userConcurrency: number;
    maxAttempts: number;
    retryDelayMs: number;
    supportedFormats: readonly (
        | 'text-detection:v1'
        | 'text-detection:v2'
        | 'text-translation:v1'
        | 'text-translation:v2'
        | 'text-translation:v3'
    )[];
}
export class TextsWorkerService {
    constructor(private readonly dependencies: TextsWorkerDependencies) {}
    async processNext(signal: AbortSignal): Promise<boolean> {
        const d = this.dependencies;
        signal.throwIfAborted();
        const context = () => ({ now: d.clock.now(), signal });
        const job = await d.store.claimNext(d, context());
        if (!job) return false;
        const controller = new AbortController();
        const combined = AbortSignal.any([
            signal,
            controller.signal,
            AbortSignal.timeout(d.timeoutMs),
        ]);
        let heartbeat: Promise<void> = Promise.resolve();
        let usage: TextsTokenUsage | undefined;
        const timer = setInterval(() => {
            heartbeat = heartbeat
                .then(async () => {
                    const result = await d.store.heartbeat(
                        job.lease,
                        d.leaseMs,
                        context(),
                    );
                    if (!result.owned || result.cancellationRequested)
                        controller.abort();
                })
                .catch(() => controller.abort());
        }, d.heartbeatMs);
        try {
            if (!(await d.store.markDispatched(job.lease, context())))
                return true;
            const result = await abortable(
                d.provider.run({
                    input: job.input,
                    execution: job.execution,
                    budget: job.budget,
                    idempotencyKey: job.providerIdempotencyKey,
                    signal: combined,
                }),
                combined,
            );
            usage = result.usage;
            combined.throwIfAborted();
            let proposal: TextJobResult;
            if (job.input.kind === 'text-translation') {
                if (!('translation' in result.draft))
                    throw new TextsProviderInvalidOutputError(usage);
                proposal = TextTranslationProposalSchema.parse({
                    id: job.lease.jobId,
                    sourceText: job.input.sourceText,
                    sourceLanguage: job.input.sourceLanguage,
                    targetLanguage: job.input.targetLanguage,
                    textId: job.input.textId ?? null,
                    expectedTextVersion: job.input.expectedTextVersion ?? null,
                    alignment: validateTranslation(
                        job.input.segments,
                        result.draft.translation,
                    ),
                });
            } else {
                const parsed = TextDetectionResultSchema.safeParse(
                    result.draft,
                );
                if (!parsed.success)
                    throw new TextsProviderInvalidOutputError(usage);
                proposal = parsed.data;
            }
            await d.store.complete(job.lease, proposal, usage, context());
        } catch (error) {
            if (!signal.aborted) {
                if (error instanceof TextsProviderInvalidOutputError)
                    usage ??= error.usage;
                const code =
                    error instanceof TextDomainError ||
                    error instanceof TextsProviderInvalidOutputError
                        ? 'invalid_model_output'
                        : error instanceof TextsAiError
                          ? error.code
                          : combined.aborted
                            ? 'provider_timeout'
                            : 'provider_unavailable';
                await d.store.fail(
                    job.lease,
                    {
                        code,
                        ...(usage ? { usage } : {}),
                        retryAt:
                            controller.signal.aborted ||
                            job.lease.attempt >= d.maxAttempts ||
                            ![
                                'provider_timeout',
                                'provider_unavailable',
                                'invalid_model_output',
                            ].includes(code)
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
    return new Promise((resolve, reject) => {
        const abort = () =>
            reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
        if (signal.aborted) {
            operation.catch(() => undefined);
            abort();
            return;
        }
        signal.addEventListener('abort', abort, { once: true });
        operation
            .then(resolve, reject)
            .finally(() => signal.removeEventListener('abort', abort));
    });
}
