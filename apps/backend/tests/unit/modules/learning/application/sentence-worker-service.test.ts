import { describe, it, expect, vi } from 'vitest';
import { SentenceInvalidModelOutputError } from '../../../../../src/modules/learning/domain/sentence-errors';
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
        format: 'sentence-generation:v1',
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
    const onInvalidModelOutput = vi.fn();
    const service = new SentenceWorkerService({
        onInvalidModelOutput,
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
    return { store, provider, service, job, onInvalidModelOutput };
}
describe('sentence worker fencing and failure publication', () => {
    it.each(['rejected', 'ambiguous'])(
        'forwards only conclusive provider retry evidence (%s)',
        async (executionOutcome) => {
            const f = setup();
            f.job.lease.capability = 'synthetic-private-sentence-lease-secret';
            f.provider.generate.mockRejectedValue(
                Object.assign(new Error('Synthetic provider HTTP failure'), {
                    executionOutcome,
                }),
            );
            await f.service.processNext(new AbortController().signal);
            expect(
                JSON.stringify(
                    f.provider.generate.mock.calls[0]?.[0].providerAttempt,
                ),
            ).not.toContain('synthetic-private-sentence-lease-secret');
            expect(f.store.fail.mock.calls[0]?.[0].capability).toBe(
                'synthetic-private-sentence-lease-secret',
            );
            const failure = f.store.fail.mock.calls[0]![1];
            expect(failure.retryDisposition).toBe(
                executionOutcome === 'rejected'
                    ? 'conclusive-provider-failure'
                    : undefined,
            );
        },
    );
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
        expect(f.store.claimNext.mock.calls[0]?.[0].supportedFormats).toEqual([
            'sentence-generation:v1',
            'sentence-generation:v2',
            'sentence-preparation:v1',
            'sentence-preparation:v2',
            'sentence-check:v1',
        ]);
    });
    it('rejects preparation format/policy mismatches before paid dispatch', async () => {
        const f = setup();
        f.store.claimNext.mockResolvedValue({
            ...f.job,
            kind: 'sentence-generation',
            format: 'sentence-preparation:v2',
            input: {
                ...(f.job.kind === 'sentence-generation' ? f.job.input : {}),
                generationPolicyVersion: 1,
            },
        } as ClaimedSentenceJob);
        await f.service.processNext(new AbortController().signal);
        expect(f.store.markDispatched).not.toHaveBeenCalled();
        expect(f.provider.generate).not.toHaveBeenCalled();
        expect(f.store.fail).toHaveBeenCalledWith(
            f.job.lease,
            { code: 'invalid_model_output', retryAt: null },
            expect.any(Object),
        );
    });
    it.each(['sentence-generation:v1', 'sentence-preparation:v1'] as const)(
        'completes %s through the same validated executor',
        async (format) => {
            const f = setup();
            const entryId = '00000000-0000-4000-8000-000000000001';
            f.store.claimNext.mockResolvedValue({
                ...f.job,
                kind: 'sentence-generation',
                format,
                input: {
                    ...(f.job.kind === 'sentence-generation'
                        ? f.job.input
                        : {}),
                    schemaVersion: 1,
                    generationPolicyVersion: 1,
                    dictionaryId: 'dict',
                    direction: 'source-to-target',
                    sourceLanguage: 'en',
                    targetLanguage: 'de',
                    priorityEntryId: entryId,
                    candidates: [
                        {
                            entryId,
                            learningVersion: 1,
                            sourceText: 'go',
                            targetText: 'gehen',
                        },
                    ],
                },
            });
            f.provider.generate.mockResolvedValue({
                draft: {
                    sourceText: 'We go today.',
                    referenceTranslation: 'Wir gehen heute.',
                    segments: [
                        { text: 'We ', entryId: null },
                        { text: 'go', entryId },
                        { text: ' today.', entryId: null },
                    ],
                    targets: [
                        {
                            entryId,
                            normalizedHint: 'gehen',
                            hintForm: 'infinitive',
                        },
                    ],
                },
                usage: { inputTokens: 10, outputTokens: 20 },
            });
            await f.service.processNext(new AbortController().signal);
            expect(f.store.fail).not.toHaveBeenCalled();
            expect(f.store.completeGeneration).toHaveBeenCalledOnce();
            const call = f.store.completeGeneration.mock.calls[0]!;
            expect(call[1].content.hints).toEqual([
                { id: 'hint-1', text: 'gehen' },
            ]);
            expect(
                call[1].content.segments.every(
                    (segment) => !segment.contextualHintId,
                ),
            ).toBe(true);
        },
    );
    it('honors the processable release allowlist, including an empty disabled list', async () => {
        const f = setup();
        f.service = new SentenceWorkerService({
            store: f.store,
            provider: f.provider,
            clock: { now: () => now },
            workerId: 'worker',
            leaseMs: 30000,
            heartbeatMs: 10000,
            timeoutMs: 1000,
            globalConcurrency: 2,
            learnerConcurrency: 1,
            maxAttempts: 3,
            retryDelayMs: 1000,
            supportedFormats: [],
        });
        f.store.claimNext.mockResolvedValue(null);
        await f.service.processNext(new AbortController().signal);
        expect(f.store.claimNext.mock.calls[0]?.[0].supportedFormats).toEqual(
            [],
        );
        expect(f.provider.generate).not.toHaveBeenCalled();
    });
    it('rejects a persisted format/policy mismatch before dispatch or provider billing', async () => {
        const f = setup();
        f.store.claimNext.mockResolvedValue({
            ...f.job,
            kind: 'sentence-generation',
            format: 'sentence-generation:v2',
            input: {
                ...(f.job.kind === 'sentence-generation' ? f.job.input : {}),
                generationPolicyVersion: 1,
            },
        } as ClaimedSentenceJob);
        await f.service.processNext(new AbortController().signal);
        expect(f.store.markDispatched).not.toHaveBeenCalled();
        expect(f.provider.generate).not.toHaveBeenCalled();
        expect(f.store.fail).toHaveBeenCalledWith(
            f.job.lease,
            { code: 'invalid_model_output', retryAt: null },
            { now, signal: expect.any(AbortSignal) },
        );
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
    it('retries invalid generation within the attempt cap without publishing an exercise', async () => {
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
                retryAt: new Date(now.getTime() + 1000),
                usage: { inputTokens: 10, outputTokens: 20 },
            },
            { now, signal: expect.any(AbortSignal) },
        );
        expect(f.provider.generate.mock.calls[0]?.[0].idempotencyKey).toBe(
            'sentence-generation:job:1',
        );
    });
    it('terminalizes invalid generation on the last allowed attempt and preserves measured usage', async () => {
        const f = setup();
        f.store.claimNext.mockResolvedValue({
            ...f.job,
            lease: { ...f.job.lease, attempt: 3 },
        });
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
            { ...f.job.lease, attempt: 3 },
            {
                code: 'invalid_model_output',
                retryAt: null,
                usage: { inputTokens: 10, outputTokens: 20 },
            },
            { now, signal: expect.any(AbortSignal) },
        );
        expect(f.provider.generate).toHaveBeenCalledTimes(1);
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
    it.each([false, true])(
        'publishes only a safe check rejection reason and settles despite observer failure %j',
        async (observerThrows) => {
            const f = setup();
            const entryId = '00000000-0000-4000-8000-000000000001';
            const job: ClaimedSentenceJob = {
                ...f.job,
                kind: 'sentence-check',
                format: 'sentence-check:v1',
                input: {
                    schemaVersion: 1,
                    exerciseId: 'exercise',
                    sourceText: 'Private source.',
                    referenceTranslation: 'Private reference.',
                    sourceLanguage: 'en',
                    targetLanguage: 'de',
                    targets: [
                        {
                            entryId,
                            learningVersion: 1,
                            sourceText: 'go',
                            targetText: 'gehen',
                        },
                    ],
                    answer: 'Private answer.',
                    explanationLanguage: 'en',
                    revealedHintIds: [],
                },
            };
            f.store.claimNext.mockResolvedValue(job);
            if (observerThrows)
                f.onInvalidModelOutput.mockImplementation(() => {
                    throw new Error('observer failed');
                });
            f.provider.check.mockResolvedValue({
                draft: {
                    proposedPercentage: 100,
                    meaning: 'correct',
                    grammar: 'correct',
                    targets: [],
                    issues: [],
                    improvedTranslation: 'Private improved.',
                    explanation: 'Private feedback.',
                },
                usage: { inputTokens: 10, outputTokens: 20 },
            });
            await expect(
                f.service.processNext(new AbortController().signal),
            ).resolves.toBe(true);
            expect(f.onInvalidModelOutput.mock.calls).toEqual([
                [
                    {
                        kind: 'sentence-check',
                        reason: 'target_assessments_invalid',
                    },
                ],
            ]);
            expect(f.store.fail).toHaveBeenCalledWith(
                job.lease,
                {
                    code: 'invalid_model_output',
                    retryAt: null,
                    usage: { inputTokens: 10, outputTokens: 20 },
                },
                { now, signal: expect.any(AbortSignal) },
            );
            expect(f.store.completeCheck).not.toHaveBeenCalled();
            expect(f.provider.check).toHaveBeenCalledOnce();
        },
    );
    it('preserves a provider rejection reason without exposing its private message or retrying a check', async () => {
        const f = setup();
        const job = {
            ...f.job,
            kind: 'sentence-check',
            format: 'sentence-check:v1',
            input: {},
        } as ClaimedSentenceJob;
        f.store.claimNext.mockResolvedValue(job);
        f.provider.check.mockRejectedValue(
            new SentenceInvalidModelOutputError(
                'Private provider details',
                'schema_invalid',
            ),
        );
        await f.service.processNext(new AbortController().signal);
        expect(f.onInvalidModelOutput.mock.calls).toEqual([
            [{ kind: 'sentence-check', reason: 'schema_invalid' }],
        ]);
        expect(f.store.fail).toHaveBeenCalledWith(
            job.lease,
            { code: 'invalid_model_output', retryAt: null },
            { now, signal: expect.any(AbortSignal) },
        );
    });
    it('isolates an asynchronous observer rejection from job settlement', async () => {
        const f = setup();
        const job = {
            ...f.job,
            kind: 'sentence-check',
            format: 'sentence-check:v1',
            input: {},
        } as ClaimedSentenceJob;
        f.store.claimNext.mockResolvedValue(job);
        f.onInvalidModelOutput.mockRejectedValue(
            new Error('observer rejected asynchronously'),
        );
        f.provider.check.mockRejectedValue(
            new SentenceInvalidModelOutputError(undefined, 'schema_invalid'),
        );
        await expect(
            f.service.processNext(new AbortController().signal),
        ).resolves.toBe(true);
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(f.store.fail).toHaveBeenCalledWith(
            job.lease,
            { code: 'invalid_model_output', retryAt: null },
            { now, signal: expect.any(AbortSignal) },
        );
        expect(f.onInvalidModelOutput.mock.calls).toEqual([
            [{ kind: 'sentence-check', reason: 'schema_invalid' }],
        ]);
    });
});
