import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeTranscriptionProvider } from './transcription-provider';
import type { KnowledgeTranscriptionResult } from '@languon/contracts';
import { KnowledgeTranscriptionWorker } from './transcription-worker';
import type {
    KnowledgeTranscriptionJobStore,
    KnowledgeTranscriptionLease,
} from './transcription-job-store';

function fixture() {
    const lease: KnowledgeTranscriptionLease = {
        operationId: randomUUID(),
        noteId: randomUUID(),
        assetId: randomUUID(),
        languages: ['es'],
        ownerId: randomUUID(),
        workerId: 'worker',
        fencingToken: 1,
        leaseToken: randomUUID(),
        deadlineAt: new Date(Date.now() + 600_000),
        leaseDeadline: new Date(Date.now() + 60_000),
    };
    const result: KnowledgeTranscriptionResult = {
        receiptId: randomUUID(),
        text: 'Hola.',
        languages: ['es'],
        usage: { type: 'duration', seconds: 1 },
    };
    const store = {
        submit: vi.fn(),
        read: vi.fn(),
        cancel: vi.fn(),
        claim: vi.fn(async () => lease),
        heartbeat: vi.fn(async () => true),
        audio: vi.fn(async () => ({
            bytes: new Uint8Array([1]),
            mimeType: 'audio/wav' as const,
            durationMs: 1000,
        })),
        authorizeDispatch: vi.fn(),
        finish: vi.fn(async () => true),
        recoverExpired: vi.fn(async () => 0),
    } satisfies KnowledgeTranscriptionJobStore;
    const transcribe = vi.fn<KnowledgeTranscriptionProvider['transcribe']>(
        async () => result,
    );
    const createProvider = vi.fn(() => ({ transcribe }));
    const worker = new KnowledgeTranscriptionWorker({
        store,
        workerId: 'worker',
        createProvider,
    });
    return { store, lease, result, transcribe, createProvider, worker };
}
afterEach(() => vi.useRealTimers());
describe('Knowledge transcription worker bounds and failure semantics', () => {
    it('claims once and persists the result without editing or saving a note', async () => {
        const { store, lease, result, transcribe, worker } = fixture();
        expect(await worker.processNext(new AbortController().signal)).toBe(
            true,
        );
        expect(store.claim).toHaveBeenCalledWith('worker');
        expect(transcribe).toHaveBeenCalledTimes(1);
        expect(store.finish).toHaveBeenCalledWith(lease, result);
    });
    it('settles technical failure without automatically retrying external work', async () => {
        const { store, lease, transcribe, worker } = fixture();
        transcribe.mockRejectedValueOnce(
            new Error('Synthetic provider failure'),
        );
        await worker.processNext(new AbortController().signal);
        expect(transcribe).toHaveBeenCalledTimes(1);
        expect(store.finish).toHaveBeenCalledWith(
            lease,
            null,
            'transcription_failed',
        );
    });
    it('never dispatches an already expired admitted operation', async () => {
        const { lease, store, createProvider, worker } = fixture();
        lease.deadlineAt = new Date(Date.now() - 1);
        await worker.processNext(new AbortController().signal);
        expect(createProvider).not.toHaveBeenCalled();
        expect(store.finish).toHaveBeenCalledWith(
            lease,
            null,
            'transcription_failed',
        );
    });
    it('retains observed usage when cancellation races a completed provider response', async () => {
        const { transcribe, store, lease, result, worker } = fixture();
        const controller = new AbortController();
        transcribe.mockImplementationOnce(async () => {
            controller.abort();
            return result;
        });
        await worker.processNext(controller.signal);
        expect(store.finish).toHaveBeenCalledWith(
            lease,
            result,
            'operation_interrupted',
        );
    });
    it('interrupts a slow provider when its lease heartbeat loses authority', async () => {
        vi.useFakeTimers();
        const { store, transcribe, lease, worker } = fixture();
        store.heartbeat.mockResolvedValueOnce(false);
        transcribe.mockImplementationOnce(
            (input) =>
                new Promise((_resolve, reject) =>
                    input.signal.addEventListener(
                        'abort',
                        () => reject(new Error('Aborted')),
                        { once: true },
                    ),
                ),
        );
        const running = worker.processNext(new AbortController().signal);
        await vi.advanceTimersByTimeAsync(15_001);
        await running;
        expect(store.finish).toHaveBeenCalledWith(
            lease,
            null,
            'operation_interrupted',
        );
        expect(transcribe).toHaveBeenCalledTimes(1);
    });
});
