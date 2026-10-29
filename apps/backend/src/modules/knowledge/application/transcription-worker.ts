import type { KnowledgeTranscriptionResult } from '@languon/contracts';
import type {
    KnowledgeTranscriptionJobStore,
    KnowledgeTranscriptionLease,
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
        if (!lease) return false;
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
        let heartbeat: Promise<void> | undefined;
        const timer = setInterval(() => {
            if (heartbeat) return;
            heartbeat = this.options.store
                .heartbeat(lease)
                .then((alive) => {
                    if (!alive) controller.abort();
                })
                .catch(() => controller.abort())
                .finally(() => {
                    heartbeat = undefined;
                });
        }, this.options.heartbeatMs ?? 15_000);
        let result: KnowledgeTranscriptionResult | null = null;
        try {
            if (remaining <= 0) throw new Error('deadline_exceeded');
            combined.throwIfAborted();
            const audio = await this.options.store.audio(lease);
            combined.throwIfAborted();
            result = await this.options.createProvider(lease).transcribe({
                operationId: lease.operationId,
                noteId: lease.noteId,
                assetId: lease.assetId,
                languages: lease.languages,
                audio,
                signal: combined,
            });
            combined.throwIfAborted();
            await this.options.store.finish(lease, result);
        } catch {
            await this.options.store.finish(
                lease,
                result,
                combined.aborted
                    ? 'operation_interrupted'
                    : 'transcription_failed',
            );
        } finally {
            clearInterval(timer);
            await heartbeat;
        }
        return true;
    }
    async releaseWorkerLeases(signal: AbortSignal) {
        signal.throwIfAborted();
        return this.options.store.recoverExpired();
    }
}
