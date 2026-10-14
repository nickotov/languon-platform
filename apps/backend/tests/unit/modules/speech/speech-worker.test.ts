import { describe, expect, it, vi } from 'vitest';
import { SpeechWorker } from '../../../../src/modules/speech/application/speech-worker';
import type {
    SpeechStore,
    SpeechJob,
    SpeechSynthesisProvider,
    AudioObjectStorage,
} from '../../../../src/modules/speech/application/ports';
import { createFixtureAudio } from '../../../../src/modules/speech/domain/audio-integrity';
import {
    SpeechSubmissionError,
    SpeechTaskFailedError,
} from '../../../../src/modules/speech/application/ports/speech-synthesis-provider';

function harness(overrides: Partial<SpeechJob> = {}) {
    const job: SpeechJob = {
        id: 'job',
        recordingId: 'recording',
        text: 'bonjour',
        language: 'fr',
        profile: {
            configurationId: 'fixture-v1',
            provider: 'fixture',
            model: 'tone-v1',
            voice: 'fixture',
            language: 'fr',
            settingsVersion: '1',
            estimatedCostUnitsPerCharacter: 0,
        },
        state: 'submitting',
        taskId: null,
        leaseToken: 'lease',
        deadlineAt: new Date('2027-01-01'),
        storage: { backend: 's3', namespace: 'test', key: 'speech/recording' },
        checksum: null,
        ...overrides,
    };
    const store = {
        deletionInventory: vi.fn().mockResolvedValue([]),
        releaseDeadlines: vi.fn(),
        claim: vi.fn().mockResolvedValue(job),
        submitted: vi.fn(),
        pending: vi.fn(),
        storing: vi.fn().mockResolvedValue(true),
        complete: vi.fn(),
        fail: vi.fn(),
        deleted: vi.fn(),
    } as unknown as SpeechStore;
    const provider = {
        configurationId: 'fixture-v1',
        supports: () => job.profile,
        submit: vi
            .fn()
            .mockResolvedValue({ state: 'ready', audio: createFixtureAudio() }),
        poll: vi
            .fn()
            .mockResolvedValue({ state: 'ready', audio: createFixtureAudio() }),
    } as SpeechSynthesisProvider;
    const storage = {
        identity: { backend: 's3', namespace: 'test' },
        read: vi.fn().mockResolvedValue(null),
        putForReference: vi.fn().mockResolvedValue(job.storage),
        delete: vi.fn(),
    } as unknown as AudioObjectStorage;
    return {
        job,
        store,
        provider,
        storage,
        worker: new SpeechWorker({
            store,
            storage,
            providers: new Map([['fixture-v1', provider]]),
        }),
    };
}

describe('shared speech worker recovery', () => {
    it('publishes validated audio through inventory before completion', async () => {
        const h = harness();
        await h.worker.runOnce();
        expect(h.provider.submit).toHaveBeenCalledOnce();
        expect(h.store.storing).toHaveBeenCalledOnce();
        expect(h.storage.putForReference).toHaveBeenCalledOnce();
        expect(h.store.complete).toHaveBeenCalledOnce();
    });
    it('preserves ambiguous submissions without trying again', async () => {
        const h = harness();
        vi.mocked(h.provider.submit).mockRejectedValue(
            new SpeechSubmissionError('unknown', false),
        );
        await h.worker.runOnce();
        expect(h.store.fail).toHaveBeenCalledWith(
            h.job,
            'unknown',
            expect.any(Date),
        );
        expect(h.provider.submit).toHaveBeenCalledOnce();
    });
    it('never republishes from a stale lease', async () => {
        const h = harness();
        vi.mocked(h.store.storing).mockResolvedValue(false);
        await h.worker.runOnce();
        expect(h.storage.putForReference).not.toHaveBeenCalled();
        expect(h.store.complete).not.toHaveBeenCalled();
    });
    it('recovers an existing immutable object without resynthesizing', async () => {
        const audio = createFixtureAudio();
        const h = harness({ state: 'storing', checksum: audio.checksum });
        vi.mocked(h.storage.read).mockResolvedValue(audio);
        await h.worker.runOnce();
        expect(h.provider.submit).not.toHaveBeenCalled();
        expect(h.provider.poll).not.toHaveBeenCalled();
        expect(h.store.complete).toHaveBeenCalledOnce();
    });
    it('retries storage failures as storage work instead of resubmitting', async () => {
        const h = harness();
        vi.mocked(h.storage.putForReference).mockRejectedValue(
            new Error('temporary storage outage'),
        );
        await h.worker.runOnce();
        expect(h.store.fail).not.toHaveBeenCalled();
        expect(h.store.pending).toHaveBeenCalled();
    });
    it('known-task polling failures retain task identity', async () => {
        const h = harness({ state: 'processing', taskId: 'provider-task' });
        vi.mocked(h.provider.poll).mockRejectedValue(
            new Error('temporary poll outage'),
        );
        await h.worker.runOnce();
        expect(h.provider.submit).not.toHaveBeenCalled();
        expect(h.store.pending).toHaveBeenCalled();
        expect(h.store.fail).not.toHaveBeenCalled();
    });
    it('settles definitive provider-task failure without resubmitting or persisting provider diagnostics', async () => {
        const h = harness({ state: 'processing', taskId: 'provider-task' });
        const failure = new SpeechTaskFailedError();
        Object.assign(failure, {
            failMsg: 'synthetic private provider diagnostic',
            outputUrl: 'https://invalid.example/synthetic-private-output',
        });
        vi.mocked(h.provider.poll).mockRejectedValue(failure);
        await h.worker.runOnce();
        expect(h.provider.submit).not.toHaveBeenCalled();
        expect(h.store.pending).not.toHaveBeenCalled();
        expect(h.store.complete).not.toHaveBeenCalled();
        expect(h.store.fail).toHaveBeenCalledExactlyOnceWith(
            h.job,
            'failure',
            expect.any(Date),
        );
    });
    it('settles typed provider unavailability with a safe reason and no resubmission', async () => {
        const h = harness({ state: 'processing', taskId: 'provider-task' });
        vi.mocked(h.provider.poll).mockRejectedValue(
            new SpeechTaskFailedError('provider_unavailable'),
        );
        await h.worker.runOnce();
        expect(h.provider.submit).not.toHaveBeenCalled();
        expect(h.store.pending).not.toHaveBeenCalled();
        expect(h.store.complete).not.toHaveBeenCalled();
        expect(h.store.fail).toHaveBeenCalledExactlyOnceWith(
            h.job,
            'failure',
            expect.any(Date),
            'speech_provider_unavailable',
        );
    });
    it('retries physical deletions from durable inventory', async () => {
        const h = harness();
        vi.mocked(h.store.claim).mockResolvedValue(null);
        vi.mocked(h.store.deletionInventory).mockResolvedValue([
            { id: 'deleted-recording', storage: h.job.storage },
        ]);
        expect(await h.worker.runOnce()).toBe(false);
        expect(h.storage.delete).toHaveBeenCalledWith(h.job.storage);
        expect(h.store.deleted).toHaveBeenCalledWith(
            'deleted-recording',
            expect.any(Date),
        );
    });
    it('keeps a known task when its historical provider is temporarily unavailable', async () => {
        const h = harness({
            state: 'processing',
            taskId: 'known-upstream-task',
        });
        await new SpeechWorker({
            store: h.store,
            storage: h.storage,
            providers: new Map(),
        }).runOnce();
        expect(h.store.fail).not.toHaveBeenCalled();
        expect(h.store.pending).toHaveBeenCalledWith(
            h.job,
            30_000,
            expect.any(Date),
        );
    });
    it('publishes inventoried bytes even when the historical provider has been removed', async () => {
        const audio = createFixtureAudio();
        const h = harness({ state: 'storing', checksum: audio.checksum });
        vi.mocked(h.storage.read).mockResolvedValue(audio);
        await new SpeechWorker({
            store: h.store,
            storage: h.storage,
            providers: new Map(),
        }).runOnce();
        expect(h.store.complete).toHaveBeenCalledOnce();
        expect(h.store.fail).not.toHaveBeenCalled();
    });
    it('keeps failed physical deletions in unavailable durable inventory for later retry', async () => {
        const h = harness();
        vi.mocked(h.store.claim).mockResolvedValue(null);
        vi.mocked(h.store.deletionInventory).mockResolvedValue([
            { id: 'failed-delete', storage: h.job.storage },
        ]);
        vi.mocked(h.storage.delete).mockRejectedValue(
            new Error('offline private storage'),
        );
        expect(await h.worker.runOnce()).toBe(false);
        expect(h.store.deleted).not.toHaveBeenCalled();
        expect(h.store.releaseDeadlines).toHaveBeenCalled();
    });
});
