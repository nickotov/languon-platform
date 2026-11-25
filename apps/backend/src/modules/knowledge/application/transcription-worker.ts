import { setTimeout as sleep } from 'node:timers/promises';
import type { KnowledgeTranscriptionResult } from '@languon/contracts';
import {
    TransientTranscriptionStoreError,
    type KnowledgeTranscriptionJobStore,
    type KnowledgeTranscriptionLease,
} from './transcription-job-store';
import type { KnowledgeTranscriptionProvider } from './transcription-provider';

/** One attempt in the existing worker slot pool; ambiguous provider requests never retry. */
export class KnowledgeTranscriptionWorker {
    private nextRecoveryAt = 0;
    constructor(
        private readonly options: {
            store: KnowledgeTranscriptionJobStore;
            workerId: string;
            createProvider(
                lease: KnowledgeTranscriptionLease,
            ): KnowledgeTranscriptionProvider;
            heartbeatMs?: number;
            timeoutMs?: number;
            now?: () => number;
            wait?: (ms: number, signal: AbortSignal) => Promise<void>;
        },
    ) {}

    async processNext(signal: AbortSignal): Promise<boolean> {
        signal.throwIfAborted();
        const now = this.options.now?.() ?? Date.now();
        if (now >= this.nextRecoveryAt) {
            this.nextRecoveryAt = now + 60_000;
            await this.options.store.recoverExpired();
        }

        const lease = await this.options.store.claim(this.options.workerId);
        if (!lease) {
            return false;
        }

        const controller = new AbortController();
        const remaining =
            lease.deadlineAt.getTime() - (this.options.now?.() ?? Date.now());
        const combined = AbortSignal.any([
            signal,
            controller.signal,
            AbortSignal.timeout(
                Math.max(
                    1,
                    Math.min(remaining, this.options.timeoutMs ?? 120_000),
                ),
            ),
        ]);
        const nowMs = this.options.now ?? Date.now;
        const executionDeadline = Math.min(
            lease.deadlineAt.getTime(),
            nowMs() + (this.options.timeoutMs ?? 120_000),
        );
        let leaseDeadline = lease.leaseDeadline.getTime();
        let settling = false;
        let heartbeat: Promise<void> | undefined;
        const timer = setInterval(() => {
            if (heartbeat) {
                return;
            }

            heartbeat = this.options.store
                .heartbeat(lease)
                .then((renewedUntil) => {
                    if (renewedUntil) {
                        leaseDeadline = renewedUntil.getTime();
                    } else {
                        controller.abort();
                    }
                })
                .catch((error: unknown) => {
                    // A transient renewal error during settlement does not invalidate
                    // the previous grant. Its last confirmed deadline still bounds replay.
                    if (
                        !settling ||
                        !(error instanceof TransientTranscriptionStoreError)
                    ) {
                        controller.abort();
                    }
                })
                .finally(() => {
                    heartbeat = undefined;
                });
        }, this.options.heartbeatMs ?? 15_000);

        try {
            const outcome = await this.transcribe(lease, combined, remaining);
            settling = true;
            await this.settle(
                () =>
                    this.options.store.finish(
                        lease,
                        outcome.result,
                        outcome.failureCode,
                    ),
                () => Math.min(executionDeadline, leaseDeadline) - nowMs(),
                combined,
            );
        } finally {
            clearInterval(timer);
            await heartbeat;
        }

        return true;
    }

    private async settle(
        finish: () => Promise<boolean>,
        remainingMs: () => number,
        signal: AbortSignal,
    ): Promise<void> {
        let delay = 100;
        for (;;) {
            try {
                // Replay always uses the original receipt, disposition and fence.
                // False means it already settled or the fence no longer owns it.
                await finish();

                return;
            } catch (error) {
                if (
                    !(error instanceof TransientTranscriptionStoreError) ||
                    signal.aborted ||
                    remainingMs() <= 0
                ) {
                    throw error;
                }

                const waitMs = Math.min(delay, remainingMs());
                if (this.options.wait) {
                    await this.options.wait(waitMs, signal);
                } else {
                    await sleep(waitMs, undefined, { signal });
                }

                if (signal.aborted || remainingMs() <= 0) {
                    throw error;
                }

                delay = Math.min(delay * 2, 2_000);
            }
        }
    }

    private async transcribe(
        lease: KnowledgeTranscriptionLease,
        signal: AbortSignal,
        remaining: number,
    ): Promise<{
        result: KnowledgeTranscriptionResult | null;
        failureCode?: string;
    }> {
        let result: KnowledgeTranscriptionResult | null = null;
        try {
            if (remaining <= 0) {
                throw new Error('deadline_exceeded');
            }

            signal.throwIfAborted();
            const audio = await this.options.store.audio(lease);
            signal.throwIfAborted();
            result = await this.options.createProvider(lease).transcribe({
                operationId: lease.operationId,
                noteId: lease.noteId,
                assetId: lease.assetId,
                languages: lease.languages,
                audio,
                signal,
            });

            signal.throwIfAborted();

            return { result };
        } catch {
            return {
                result,
                failureCode: signal.aborted
                    ? 'operation_interrupted'
                    : 'transcription_failed',
            };
        }
    }

    async releaseWorkerLeases(signal: AbortSignal) {
        signal.throwIfAborted();

        return this.options.store.recoverExpired();
    }
}
