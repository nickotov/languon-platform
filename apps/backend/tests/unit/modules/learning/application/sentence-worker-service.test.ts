import { describe, it, expect, vi } from 'vitest';
import { SentenceWorkerService } from '../../../../../src/modules/learning/application/sentence-worker-service';
import type {
    SentenceWorkerStore,
    ClaimedSentenceJob,
} from '../../../../../src/modules/learning/application/ports/sentence-worker-store';
import type { SentenceAiProvider } from '../../../../../src/modules/learning/application/ports/sentence-ai-provider';
const now = new Date('2026-10-05T12:00:00Z');
function setup(timeoutMs = 2000) {
    const job = {
        kind: 'sentence-generation',
        lease: { jobId: 'job', workerId: 'worker', attempt: 1, fence: 'fence' },
        providerIdempotencyKey: 'sentence-generation:job:1',
        execution: {},
        budget: {},
        input: {
            schemaVersion: 1,
            generationPolicyVersion: 1,
            dictionaryId: 'dict',
            direction: 'source-to-target',
            sourceLanguage: 'en',
            targetLanguage: 'de',
            priorityEntryId: 'entry',
            candidates: [
                {
                    entryId: 'entry',
                    learningVersion: 1,
                    sourceText: 'go',
                    targetText: 'gehen',
                },
            ],
        },
    } as unknown as ClaimedSentenceJob;
    const store = {
        claimNext: vi.fn<SentenceWorkerStore['claimNext']>(async () => job),
        heartbeat: vi.fn<SentenceWorkerStore['heartbeat']>(),
        markDispatched: vi.fn<SentenceWorkerStore['markDispatched']>(
            async () => 'dispatch',
        ),
        completeGeneration: vi.fn<SentenceWorkerStore['completeGeneration']>(),
        completeCheck: vi.fn<SentenceWorkerStore['completeCheck']>(),
        fail: vi.fn<SentenceWorkerStore['fail']>(),
        releaseWorkerLeases:
            vi.fn<SentenceWorkerStore['releaseWorkerLeases']>(),
    };
    const provider = {
        generate: vi.fn<SentenceAiProvider['generate']>(),
        check: vi.fn<SentenceAiProvider['check']>(),
    };
    const service = new SentenceWorkerService({
        store,
        provider,
        clock: { now: () => now },
        workerId: 'worker',
        leaseMs: 30000,
        heartbeatMs: 10000,
        timeoutMs,
        globalConcurrency: 2,
        learnerConcurrency: 1,
        maxAttempts: 3,
        retryDelayMs: 1000,
    });
    return { store, provider, service, job };
}
describe('sentence worker fencing and failure publication', () => {
    it('releases a slot when a provider ignores the abort signal', async () => {
        const f = setup(20);
        f.provider.generate.mockImplementation(() => new Promise(() => {}));
        await f.service.processNext(new AbortController().signal);
        expect(f.store.fail).toHaveBeenCalledWith(
            f.job.lease,
            {
                code: 'provider_timeout',
                retryAt: new Date(now.getTime() + 1000),
            },
            { now, signal: expect.any(AbortSignal) },
        );
        expect(f.store.completeGeneration).not.toHaveBeenCalled();
    });

    it('does not dispatch or call provider when no job exists', async () => {
        const f = setup();
        f.store.claimNext.mockResolvedValue(null);
        expect(await f.service.processNext(new AbortController().signal)).toBe(
            false,
        );
        expect(f.provider.generate).not.toHaveBeenCalled();
    });
    it('does not call provider after cancellation or lost dispatch fence', async () => {
        const f = setup();
        f.store.markDispatched.mockResolvedValue('terminalized');
        expect(await f.service.processNext(new AbortController().signal)).toBe(
            true,
        );
        expect(f.provider.generate).not.toHaveBeenCalled();
        expect(f.store.completeGeneration).not.toHaveBeenCalled();
    });
    it('fails invalid model output without publishing an exercise or retrying it', async () => {
        const f = setup();
        f.provider.generate.mockResolvedValue({
            draft: {
                sourceText: 'Go.',
                referenceTranslation: 'Gehen.',
                segments: [{ text: 'Go.', entryId: null }],
                targets: [],
            },
            usage: { inputTokens: 10, outputTokens: 20 },
        });
        await f.service.processNext(new AbortController().signal);
        expect(f.store.completeGeneration).not.toHaveBeenCalled();
        expect(f.store.fail).toHaveBeenCalledWith(
            f.job.lease,
            {
                code: 'invalid_model_output',
                retryAt: null,
                usage: { inputTokens: 10, outputTokens: 20 },
            },
            { now, signal: expect.any(AbortSignal) },
        );
        expect(f.provider.generate.mock.calls[0]?.[0].idempotencyKey).toBe(
            'sentence-generation:job:1',
        );
    });
    it('bounds provider failures with one retry and pinned job identity', async () => {
        const f = setup();
        f.provider.generate.mockRejectedValue(
            new Error('provider detail must not persist'),
        );
        await f.service.processNext(new AbortController().signal);
        expect(f.store.fail).toHaveBeenCalledWith(
            f.job.lease,
            {
                code: 'provider_unavailable',
                retryAt: new Date(now.getTime() + 1000),
            },
            { now, signal: expect.any(AbortSignal) },
        );
    });
});
