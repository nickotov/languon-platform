import { hasConclusiveTextAiFailure } from '../../text-ai/application/text-ai-routing-execution';
import {
    CardAuthoringProposalGeneratorError,
    type CardAuthoringProposalGenerator,
} from './ports/card-authoring-proposal-generator';
import type {
    TextSelectionStore,
    SelectionLease,
} from './ports/text-selection-store';
import { TextSelectionError } from '../domain/text-selection';
export class TextSelectionWorker {
    constructor(
        private readonly store: TextSelectionStore,
        private readonly generator: CardAuthoringProposalGenerator,
        private readonly workerId: string,
        private readonly heartbeatMs: number,
        private readonly providerTimeoutMs = 120_000,
    ) {}
    async processNext(signal: AbortSignal): Promise<boolean> {
        signal.throwIfAborted();
        const lease = await this.store.claim(this.workerId);
        if (!lease) return false;
        const controller = new AbortController(),
            abort = () => controller.abort(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
        let timedOut = false;
        const deadline = setTimeout(() => {
            timedOut = true;
            controller.abort(
                new CardAuthoringProposalGeneratorError('provider_timeout'),
            );
        }, this.providerTimeoutMs);
        let rejectAborted: () => void = () => {};
        const aborted = new Promise<never>((_resolve, reject) => {
            rejectAborted = () =>
                reject(
                    controller.signal.reason ?? new Error('Worker interrupted'),
                );
            controller.signal.addEventListener('abort', rejectAborted, {
                once: true,
            });
        });
        // Attach a rejection handler even when cancellation wins before dispatch.
        void aborted.catch(() => {});
        let heartbeat: Promise<void> | null = null;
        const timer = setInterval(() => {
            if (heartbeat) return;
            heartbeat = this.store
                .heartbeat(lease)
                .then((owned) => {
                    if (!owned) controller.abort();
                })
                .catch(() => controller.abort())
                .finally(() => {
                    heartbeat = null;
                });
        }, this.heartbeatMs);
        timer.unref?.();
        try {
            controller.signal.throwIfAborted();
            if (!(await this.store.dispatch(lease))) return true;
            controller.signal.throwIfAborted();
            const result = await Promise.race([
                this.generator.generate({
                    input: lease.input,
                    providerBudget: lease.budget,
                    providerAttempt: {
                        jobId: lease.id,
                        attempt: lease.attempt,
                        workerId: lease.workerId,
                        fencingToken: String(lease.fencingToken),
                    },
                    idempotencyKey: `text-selection:${lease.id}:${lease.attempt}`,
                    signal: controller.signal,
                    ...(lease.execution
                        ? { providerExecution: lease.execution }
                        : {}),
                }),
                aborted,
            ]);
            controller.signal.throwIfAborted();
            await this.store.complete(
                lease,
                'delta' in result ? result.delta : result,
                'delta' in result ? result.usage : undefined,
            );
        } catch (error) {
            await this.fail(
                lease,
                timedOut
                    ? new CardAuthoringProposalGeneratorError(
                          'provider_timeout',
                      )
                    : error,
                !controller.signal.aborted,
            );
        } finally {
            clearInterval(timer);
            clearTimeout(deadline);
            controller.signal.removeEventListener('abort', rejectAborted);
            await heartbeat;
            signal.removeEventListener('abort', abort);
        }
        return true;
    }
    private fail(lease: SelectionLease, error: unknown, allowRetry = false) {
        const code =
            error instanceof TextSelectionError
                ? error.code
                : error instanceof CardAuthoringProposalGeneratorError
                  ? error.category
                  : 'provider_failure';
        return this.store.fail(
            lease,
            code,
            error instanceof CardAuthoringProposalGeneratorError
                ? error.usage
                : undefined,
            allowRetry && hasConclusiveTextAiFailure(error)
                ? 'conclusive-provider-failure'
                : undefined,
        );
    }
    async releaseWorkerLeases() {
        await this.store.releaseWorkerLeases(this.workerId);
    }
}
