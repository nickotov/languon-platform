import {
    PortraitConflictError,
    PortraitDraftUnavailableError,
} from './ports/portrait-store';
import type {
    InterviewRunner,
    InterviewStore,
    ClaimedInterviewOperation,
} from './ports/interview-store';

/** Durable worker ownership is independent of the admitting HTTP connection. */
export class InterviewWorkerService {
    constructor(
        private readonly dependencies: {
            store: Pick<
                InterviewStore,
                'claim' | 'heartbeat' | 'complete' | 'fail'
            >;
            createRunner(
                operation: ClaimedInterviewOperation,
            ): InterviewRunner | Promise<InterviewRunner>;
            heartbeatMs?: number;
            timeoutMs?: number;
        },
    ) {}
    async processNext(signal: AbortSignal): Promise<boolean> {
        signal.throwIfAborted();
        const operation = await this.dependencies.store.claim();
        if (!operation) return false;
        const controller = new AbortController();
        const combined = AbortSignal.any([
            signal,
            controller.signal,
            AbortSignal.timeout(this.dependencies.timeoutMs ?? 120_000),
        ]);
        let pending: Promise<void> | undefined;
        const timer = setInterval(() => {
            if (pending) return;
            pending = this.dependencies.store
                .heartbeat(operation)
                .catch(() => {
                    controller.abort();
                })
                .finally(() => {
                    pending = undefined;
                });
        }, this.dependencies.heartbeatMs ?? 2000);
        try {
            // Check the fence immediately before creating any provider-bound runner.
            await this.dependencies.store.heartbeat(operation);
            const runner = await this.dependencies.createRunner(operation);
            const result = await runner.run({ operation, signal: combined });
            combined.throwIfAborted();
            await this.dependencies.store.complete(
                operation,
                result,
                new Date(),
            );
        } catch {
            try {
                await this.dependencies.store.fail(
                    operation,
                    combined.aborted
                        ? 'response_interrupted'
                        : 'generation_failed',
                    new Date(),
                );
            } catch (failure) {
                // Lease recovery owns completion once cancellation/deletion invalidates this claim.
                if (
                    !(failure instanceof PortraitConflictError) &&
                    !(failure instanceof PortraitDraftUnavailableError)
                )
                    throw failure;
            }
        } finally {
            clearInterval(timer);
            await pending;
        }
        return true;
    }
}
