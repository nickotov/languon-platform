import { describe, expect, it, vi } from 'vitest';
import { DictionaryAudioWorker } from '../../../../../src/modules/dictionaries/application/dictionary-audio-worker';
import { SpeechSubmissionError } from '../../../../../src/modules/dictionaries/application/ports/speech-synthesis-provider';
import { createFixtureAudio } from '../../../../../src/modules/dictionaries/infrastructure/audio/audio-integrity';

function setup(taskId: string | null = null) {
    const now = new Date('2026-09-21T12:00:00Z');
    const job = {
        id: 'job',
        taskId,
        state: taskId ? 'waiting_provider' : 'submitting',
        text: 'hello',
        profile: { configurationId: 'kie-1' },
        deadlineAt: new Date(now.getTime() - 1000),
    };
    const store = {
        find: vi.fn(),
        cleanupCandidate: vi.fn().mockResolvedValue(null),
        claim: vi.fn().mockResolvedValue(job),
        transition: vi.fn().mockResolvedValue(true),
        beginWrite: vi.fn().mockResolvedValue({
            storage: {
                backend: 's3',
                namespace: 'original-bucket',
                key: 'dictionary-audio/key',
            },
        }),
        complete: vi.fn().mockResolvedValue(true),
    };
    const audio = {
        bytes: new Uint8Array([1]),
        mimeType: 'audio/mpeg' as const,
        checksum: 'sha',
    };
    const provider = {
        configurationId: 'kie-1',
        supports: vi.fn(),
        submit: vi.fn().mockResolvedValue({
            state: 'pending',
            taskId: 'upstream',
            retryAfterMs: 2000,
        }),
        poll: vi.fn().mockResolvedValue({ state: 'ready', audio }),
    };
    const storage = {
        identity: { backend: 's3', namespace: 'new-default-bucket' },
        putForReference: vi.fn().mockResolvedValue({
            backend: 's3',
            namespace: 'original-bucket',
            key: 'dictionary-audio/key',
        }),
        read: vi.fn(),
        delete: vi.fn(),
    };
    const clock = { now: vi.fn(() => now) };
    const worker = new DictionaryAudioWorker({
        store: store as never,
        providers: new Map([['kie-1', provider]]),
        storage: storage as never,
        clock,
        budget: {
            ownerDailyCost: 1000,
            globalDailyCost: 10000,
            ownerQueued: 5,
            ownerActive: 2,
            globalActive: 4,
        },
    });
    return { worker, store, provider, storage, job, clock, now };
}
describe('dictionary audio worker', () => {
    it('re-downloads missing stored bytes from the original known task without resubmitting', async () => {
        const { worker, store, storage, provider, job } =
            setup('original-task');
        job.state = 'storing';
        Object.assign(job, {
            ownerId: 'owner',
            dictionaryId: 'dictionary',
            cardId: 'card',
            field: 'source',
            fingerprint: 'fingerprint',
        });
        store.find.mockResolvedValue({
            job,
            asset: {
                storage: {
                    backend: 'postgres',
                    namespace: 'dictionary-audio',
                    key: 'key',
                },
            },
        });
        storage.read.mockResolvedValue(null);
        await worker.runOnce(new AbortController().signal);
        expect(store.transition).toHaveBeenCalledWith(
            job,
            expect.objectContaining({ state: 'waiting_provider' }),
            expect.any(Date),
        );
        expect(provider.submit).not.toHaveBeenCalled();
        job.state = 'waiting_provider';
        await worker.runOnce(new AbortController().signal);
        expect(provider.poll).toHaveBeenCalledWith(
            expect.objectContaining({ taskId: 'original-task' }),
        );
        expect(provider.submit).not.toHaveBeenCalled();
    });
    it('preserves storing after an uncertain upload error', async () => {
        const { worker, store, storage } = setup('known-task');
        storage.putForReference.mockRejectedValue(
            new Error('Upload acknowledgement lost'),
        );
        await worker.runOnce(new AbortController().signal);
        expect(store.beginWrite).toHaveBeenCalledOnce();
        expect(store.complete).not.toHaveBeenCalled();
        expect(store.transition).not.toHaveBeenCalled();
    });
    it.each([null, 'known-task'])(
        'recovers a publication error from storage without provider calls (task %s)',
        async (taskId) => {
            const { worker, store, storage, provider, job } = setup(taskId);
            job.taskId = taskId;
            const audio = createFixtureAudio();
            provider.submit.mockResolvedValue({ state: 'ready', audio });
            provider.poll.mockResolvedValue({ state: 'ready', audio });
            Object.assign(job, {
                ownerId: 'owner',
                cardId: 'card',
                field: 'source',
                fingerprint: 'fingerprint',
            });
            store.complete.mockRejectedValueOnce(
                new Error('Lost commit acknowledgement'),
            );
            await worker.runOnce(new AbortController().signal);
            expect(storage.putForReference).toHaveBeenCalledOnce();
            expect(store.transition).not.toHaveBeenCalled();
            const asset = {
                storage: {
                    backend: 'postgres',
                    namespace: 'dictionary-audio',
                    key: 'key',
                },
            };
            job.state = 'storing';
            store.find = vi.fn().mockResolvedValue({ job, asset });
            storage.read = vi.fn().mockResolvedValue(audio);
            provider.submit.mockClear();
            provider.poll.mockClear();
            store.beginWrite.mockClear();
            await worker.runOnce(new AbortController().signal);
            expect(provider.submit).not.toHaveBeenCalled();
            expect(provider.poll).not.toHaveBeenCalled();
            expect(store.beginWrite).not.toHaveBeenCalled();
            expect(storage.read).toHaveBeenCalledOnce();
            expect(store.complete).toHaveBeenCalledTimes(2);
            expect(store.transition).not.toHaveBeenCalled();
        },
    );
    it('reserves one expensive sweep across concurrent worker slots', async () => {
        const { worker, store } = setup();
        store.claim.mockResolvedValue(null);
        let release!: () => void;
        const held = new Promise<void>((resolve) => {
            release = resolve;
        });
        store.cleanupCandidate.mockImplementation(async () => {
            await held;
            return null;
        });
        const turns = Array.from({ length: 4 }, () =>
            worker.runOnce(new AbortController().signal),
        );
        expect(
            store.cleanupCandidate.mock.calls.map((args) => args[1]),
        ).toEqual([true, false, false, false]);
        release();
        await Promise.all(turns);
    });
    it('reconciles at most once per minute while object cleanup remains active each turn', async () => {
        const { worker, store, clock, now } = setup();
        store.claim.mockResolvedValue(null);
        const signal = new AbortController().signal;
        await worker.runOnce(signal);
        for (let index = 0; index < 20; index += 1)
            await worker.runOnce(signal);
        expect(
            store.cleanupCandidate.mock.calls.filter(
                (call) => call[1] === true,
            ),
        ).toHaveLength(1);
        expect(store.cleanupCandidate).toHaveBeenCalledTimes(21);
        clock.now.mockReturnValue(new Date(now.getTime() + 60000));
        await worker.runOnce(signal);
        expect(
            store.cleanupCandidate.mock.calls.filter(
                (call) => call[1] === true,
            ),
        ).toHaveLength(2);
    });
    it('persists upstream task before future polling', async () => {
        const { worker, store, provider } = setup();
        await worker.runOnce(new AbortController().signal);
        expect(provider.submit).toHaveBeenCalledOnce();
        expect(store.transition).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                state: 'waiting_provider',
                taskId: 'upstream',
            }),
            expect.any(Date),
        );
    });
    it('polls a known task after playback timeout and publishes late success without submitting', async () => {
        const { worker, store, provider, storage } = setup('upstream');
        await worker.runOnce(new AbortController().signal);
        expect(provider.submit).not.toHaveBeenCalled();
        expect(provider.poll).toHaveBeenCalledOnce();
        expect(storage.putForReference).toHaveBeenCalledWith(
            {
                backend: 's3',
                namespace: 'original-bucket',
                key: 'dictionary-audio/key',
            },
            expect.anything(),
            expect.any(AbortSignal),
        );
        expect(store.complete).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                storage: {
                    backend: 's3',
                    namespace: 'original-bucket',
                    key: 'dictionary-audio/key',
                },
            }),
            expect.any(Date),
        );
        expect(store.complete).toHaveBeenCalledOnce();
    });
    it('retains an unknown submission without retrying a paid request', async () => {
        const { worker, store, provider } = setup();
        provider.submit.mockRejectedValue(
            new SpeechSubmissionError('unknown', true),
        );
        await worker.runOnce(new AbortController().signal);
        expect(store.transition).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ state: 'submission_unknown' }),
            expect.any(Date),
        );
    });
    it('keeps a known task through temporary poll failures', async () => {
        const { worker, store, provider } = setup('upstream');
        provider.poll.mockRejectedValue(new Error('offline'));
        await worker.runOnce(new AbortController().signal);
        expect(store.transition).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ state: 'waiting_provider' }),
            expect.any(Date),
        );
        expect(provider.submit).not.toHaveBeenCalled();
    });
    it('does not upload if deletion fences the writer', async () => {
        const { worker, store, storage } = setup('upstream');
        store.beginWrite.mockResolvedValue(null);
        await worker.runOnce(new AbortController().signal);
        expect(storage.putForReference).not.toHaveBeenCalled();
    });
    it('leaves fenced uploads inventoried for durable deletion instead of publishing or resubmitting', async () => {
        const { worker, store, storage, provider } = setup('upstream');
        store.complete.mockResolvedValue(false);
        await worker.runOnce(new AbortController().signal);
        expect(store.beginWrite).toHaveBeenCalledOnce();
        expect(storage.putForReference).toHaveBeenCalledOnce();
        expect(store.complete).toHaveBeenCalledOnce();
        expect(store.transition).not.toHaveBeenCalled();
        expect(provider.submit).not.toHaveBeenCalled();
        // Another lease may own this same key now; inventory-based cleanup owns
        // physical deletion once every writer window has elapsed.
        expect(storage.delete).not.toHaveBeenCalled();
    });
});
