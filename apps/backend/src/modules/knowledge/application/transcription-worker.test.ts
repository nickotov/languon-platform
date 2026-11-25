import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeTranscriptionProvider } from './transcription-provider';
import type { KnowledgeTranscriptionResult } from '@languon/contracts';
import { KnowledgeTranscriptionWorker } from './transcription-worker';
import {
    TransientTranscriptionStoreError,
    type KnowledgeTranscriptionJobStore,
    type KnowledgeTranscriptionLease,
} from './transcription-job-store';

function fixture(
    options: {
        now?: () => number;
        wait?: (ms: number, signal: AbortSignal) => Promise<void>;
        timeoutMs?: number;
        heartbeatMs?: number;
    } = {},
) {
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
        heartbeat: vi.fn<KnowledgeTranscriptionJobStore['heartbeat']>(
            async () => lease.leaseDeadline,
        ),
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
        ...options,
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
        expect(store.finish).toHaveBeenCalledWith(lease, result, undefined);
    });

    it('backs off across multiple transient writes and replays the same fenced result', async () => {
        const wait = vi.fn<(ms: number, signal: AbortSignal) => Promise<void>>(
            async () => undefined,
        );
        const { store, lease, result, transcribe, worker } = fixture({ wait });
        for (let i = 0; i < 7; i++) {
            store.finish.mockRejectedValueOnce(
                new TransientTranscriptionStoreError(),
            );
        }

        await worker.processNext(new AbortController().signal);
        expect(transcribe).toHaveBeenCalledOnce();
        expect(wait.mock.calls.map(([ms]) => ms)).toEqual([
            100, 200, 400, 800, 1600, 2000, 2000,
        ]);

        expect(store.finish.mock.calls).toEqual(
            Array(8).fill([lease, result, undefined]),
        );
    });

    it('propagates a permanent settlement failure immediately', async () => {
        const wait = vi.fn();
        const { store, worker, transcribe } = fixture({ wait });
        store.finish.mockRejectedValue(new Error('Invalid receipt'));
        await expect(
            worker.processNext(new AbortController().signal),
        ).rejects.toThrow('Invalid receipt');

        expect(transcribe).toHaveBeenCalledOnce();
        expect(store.finish).toHaveBeenCalledOnce();
        expect(wait).not.toHaveBeenCalled();
    });

    it.each(['execution', 'lease', 'job'] as const)(
        'stops retries at the confirmed %s deadline',
        async (bound) => {
            let now = Date.now();
            const wait = vi.fn(async (ms: number) => {
                now += ms;
            });
            const { store, lease, transcribe, worker } = fixture({
                now: () => now,
                wait,
                timeoutMs: bound === 'execution' ? 250 : 1000,
            });

            if (bound === 'lease') {
                lease.leaseDeadline = new Date(now + 250);
            } else if (bound === 'job') {
                lease.deadlineAt = new Date(now + 250);
            }

            store.finish.mockRejectedValue(
                new TransientTranscriptionStoreError(),
            );

            await expect(
                worker.processNext(new AbortController().signal),
            ).rejects.toThrow(TransientTranscriptionStoreError);

            expect(wait.mock.calls.map(([ms]) => ms)).toEqual([100, 150]);
            expect(transcribe).toHaveBeenCalledOnce();
            expect(store.finish).toHaveBeenCalledTimes(2);
        },
    );

    it('keeps the last confirmed renewal through a temporary heartbeat outage during settlement', async () => {
        vi.useFakeTimers();
        const wait = async (ms: number) => {
            await vi.advanceTimersByTimeAsync(ms);
        };
        const { store, lease, transcribe, worker } = fixture({
            wait,
            heartbeatMs: 25,
        });

        lease.leaseDeadline = new Date(Date.now() + 50);
        store.heartbeat
            .mockResolvedValueOnce(new Date(Date.now() + 1_000))
            .mockRejectedValue(new TransientTranscriptionStoreError());

        store.finish
            .mockRejectedValueOnce(new TransientTranscriptionStoreError())
            .mockRejectedValueOnce(new TransientTranscriptionStoreError());

        await worker.processNext(new AbortController().signal);
        expect(store.heartbeat).toHaveBeenCalled();
        expect(store.finish).toHaveBeenCalledTimes(3);
        expect(transcribe).toHaveBeenCalledOnce();
    });

    it('stops settlement replay when a renewal reports a lost fence', async () => {
        vi.useFakeTimers();
        const wait = async (ms: number) => {
            await vi.advanceTimersByTimeAsync(ms);
        };
        const { store, transcribe, worker } = fixture({
            wait,
            heartbeatMs: 25,
        });

        store.heartbeat.mockResolvedValue(null);
        store.finish.mockRejectedValue(new TransientTranscriptionStoreError());

        await expect(
            worker.processNext(new AbortController().signal),
        ).rejects.toThrow(TransientTranscriptionStoreError);

        expect(store.finish).toHaveBeenCalledOnce();
        expect(transcribe).toHaveBeenCalledOnce();
    });

    it('interrupts an in-flight backoff immediately on cancellation', async () => {
        const controller = new AbortController();
        const wait = vi.fn(async (_ms: number, signal: AbortSignal) => {
            controller.abort();
            signal.throwIfAborted();
        });
        const { store, transcribe, worker } = fixture({ wait });
        store.finish.mockRejectedValue(new TransientTranscriptionStoreError());
        await expect(
            worker.processNext(controller.signal),
        ).rejects.toMatchObject({ name: 'AbortError' });

        expect(transcribe).toHaveBeenCalledOnce();
        expect(store.finish).toHaveBeenCalledOnce();
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
        store.heartbeat.mockResolvedValueOnce(null);
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
