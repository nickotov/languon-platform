import { afterEach, describe, expect, it, vi } from 'vitest';
import { SentenceSession } from '@/fsd/features/sentence-training/model/sentence-session';
import { SentenceSetup } from '@/fsd/features/sentence-training/model/sentence-setup';
import { SentenceHistory } from '@/fsd/features/sentence-training/model/sentence-history';
import { ApiError } from '@/fsd/features/sentence-training/lib/api-error';
import type {
    Configuration,
    SentenceApi,
} from '@/fsd/features/sentence-training/types';
import type {
    SentenceExercise,
    SentenceJob,
    SentenceProgressResponse,
    SentenceManualReview,
} from '@languon/contracts';

const first = '10000000-0000-4000-8000-000000000001';
const second = '10000000-0000-4000-8000-000000000002';
const third = '10000000-0000-4000-8000-000000000003';
const configuration: Configuration = {
    direction: 'source-to-target',
    mode: 'saved-first',
    scope: { type: 'all' },
    explanationLanguage: 'fr',
};
const exercise: SentenceExercise = {
    id: first,
    dictionaryId: second,
    direction: 'source-to-target',
    sourceLanguage: 'fr',
    targetLanguage: 'en',
    sourceText: 'Bonjour',
    segments: [
        {
            id: 'segment-1',
            start: 0,
            end: 7,
            text: 'Bonjour',
            target: {
                entryId: third,
                occurrenceId: 'occurrence-1',
                hintId: 'hint-1',
            },
        },
    ],
    hints: [{ id: 'hint-1', text: 'hello' }],
    generationPolicyVersion: 1,
    createdAt: '2026-10-04T00:00:00.000Z',
};
const progress = (usedCount = 0): SentenceProgressResponse => ({
    direction: 'source-to-target',
    eligibleCount: 10,
    usedCount,
    remainingCount: 10 - usedCount,
    completedCheckCount: 0,
    manualReviewCount: 0,
    assistedCheckCount: 0,
    ratings: { perfect: 0, good: 0, notBad: 0, practiseAgainLater: 0 },
});
const job = (patch: Partial<SentenceJob> = {}): SentenceJob => ({
    id: second,
    kind: 'sentence-check',
    state: 'queued',
    cancellationRequested: false,
    attemptCount: 0,
    createdAt: '2026-10-04T00:00:00.000Z',
    updatedAt: '2026-10-04T00:00:00.000Z',
    failureCode: null,
    result: null,
    ...patch,
});
const review: SentenceManualReview = {
    id: third,
    exercise,
    contentState: 'current',
    sessionId: second,
    referenceTranslation: 'Hello',
    createdAt: '2026-10-04T00:00:00.000Z',
};
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}
function api(overrides: Partial<SentenceApi> = {}): SentenceApi {
    return {
        capabilities: vi.fn(async () => ({ sentencesEnabled: true })),
        listEntries: vi.fn(async () => ({ entries: [], nextCursor: null })),
        prepare: vi.fn(async () => ({
            direction: 'source-to-target',
            mode: 'saved-first',
            sourceLanguage: 'fr',
            targetLanguage: 'en',
            explanationLanguage: 'fr',
            eligibleCount: 10,
            usedCount: 0,
            remainingCount: 10,
            savedUncheckedCount: 1,
            savedReviewCount: 1,
        })),
        next: vi.fn(async () => ({ kind: 'exercise', exercise })),
        getJob: vi.fn(async () => job()),
        cancelJob: vi.fn(async () => job({ state: 'cancelled' })),
        check: vi.fn(async () => job()),
        revealReference: vi.fn(async () => ({ review })),
        attempts: vi.fn(async () => ({ attempts: [], nextCursor: null })),
        manualReviews: vi.fn(async () => ({ reviews: [], nextCursor: null })),
        progress: vi.fn(async () => progress()),
        ...overrides,
    };
}
const network = () =>
    new ApiError(0, {
        code: 'service_unavailable',
        correlationId: 'test',
        message: 'Unknown result',
    });
const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
};
afterEach(() => vi.useRealTimers());

describe('sentence session admission and recovery', () => {
    it('synchronously prevents duplicate paid generation and checking before React rerenders', async () => {
        const pending = deferred<Awaited<ReturnType<SentenceApi['next']>>>();
        const checkPending = deferred<SentenceJob>();
        const service = api({
            next: vi.fn(() => pending.promise),
            check: vi.fn(() => checkPending.promise),
        });
        const store = new SentenceSession(service);
        const starting = store.start(configuration);
        void store.start(configuration);
        void store.next();
        expect(service.next).toHaveBeenCalledTimes(1);
        pending.resolve({ kind: 'exercise', exercise });
        await starting;
        store.setDraft('Hello');
        const checking = store.check();
        void store.check();
        void store.next();
        expect(service.check).toHaveBeenCalledTimes(1);
        checkPending.resolve(
            job({ state: 'failed', failureCode: 'provider_timeout' }),
        );
        await checking;
        store.stop();
    });
    it('replays the exact unknown check payload and keeps a terminal retry as a new operation', async () => {
        const check = vi
            .fn<SentenceApi['check']>()
            .mockRejectedValueOnce(network())
            .mockResolvedValueOnce(
                job({ state: 'failed', failureCode: 'provider_timeout' }),
            )
            .mockResolvedValue(
                job({ state: 'failed', failureCode: 'provider_timeout' }),
            );
        const store = new SentenceSession(api({ check }));
        await store.start(configuration);
        store.setDraft('Hello');
        store.toggleHint('hint-1');
        await store.check();
        expect(store.getSnapshot().uncertain).toBe(true);
        store.setDraft('Changed');
        await store.next();
        expect(store.getSnapshot().draft).toBe('Hello');
        await store.retry();
        expect(check.mock.calls[1]).toEqual(check.mock.calls[0]);
        await store.retry();
        expect(check.mock.calls[2]![1].operationId).not.toBe(
            check.mock.calls[1]![1].operationId,
        );
        expect({ ...check.mock.calls[2]![1], operationId: 'same' }).toEqual({
            ...check.mock.calls[0]![1],
            operationId: 'same',
        });
        store.stop();
    });
    it('fences old target completions after cleanup and clears private answer/reference buffers', async () => {
        const pending = deferred<Awaited<ReturnType<SentenceApi['next']>>>();
        const store = new SentenceSession(
            api({ next: vi.fn(() => pending.promise) }),
        );
        const start = store.start(configuration);
        store.stop();
        pending.resolve({ kind: 'exercise', exercise });
        await start;
        expect(store.getSnapshot()).toMatchObject({
            phase: 'idle',
            exercise: null,
            draft: '',
            reference: null,
            progress: null,
        });
    });
    it('free reference has no check/model/credit dependency and retries exact IDs separately', async () => {
        const reveal = vi
            .fn<SentenceApi['revealReference']>()
            .mockRejectedValueOnce(network())
            .mockResolvedValue({ review });
        const service = api({ revealReference: reveal });
        const store = new SentenceSession(service);
        await store.start(configuration);
        await store.revealReference();
        expect(store.getSnapshot().referenceError?.status).toBe(0);
        await store.revealReference();
        await store.revealReference();
        expect(reveal).toHaveBeenCalledTimes(2);
        expect(reveal.mock.calls[0]).toEqual(reveal.mock.calls[1]);
        expect(service.check).not.toHaveBeenCalled();
        expect(store.getSnapshot().counts).toMatchObject({
            checked: 0,
            manuallyReviewed: 1,
        });
        store.stop();
    });
    it('blocks checking until the requested manual disclosure is confirmed', async () => {
        const pending = deferred<{ review: SentenceManualReview }>();
        const service = api({ revealReference: vi.fn(() => pending.promise) });
        const store = new SentenceSession(service);
        await store.start(configuration);
        store.setDraft('Hello');
        const revealing = store.revealReference();
        await store.check();
        expect(service.check).not.toHaveBeenCalled();
        pending.resolve({ review });
        await revealing;
        await store.check();
        expect(service.check).toHaveBeenCalledTimes(1);
        store.stop();
    });
    it('clears protected content on live access loss and never retries an access-revoked job', async () => {
        const store = new SentenceSession(
            api({
                check: vi.fn(async () =>
                    job({ state: 'failed', failureCode: 'access_revoked' }),
                ),
            }),
        );
        await store.start(configuration);
        store.setDraft('Hello');
        await store.revealReference();
        await store.check();
        expect(store.getSnapshot()).toMatchObject({
            phase: 'error',
            exercise: null,
            draft: '',
            reference: null,
            canRetry: false,
        });
        expect(store.getSnapshot().error?.code).toBe('dictionary_not_found');
        store.stop();
    });
    it('only accepts the latest progress read within the same session', async () => {
        const older = deferred<SentenceProgressResponse>();
        const newer = deferred<SentenceProgressResponse>();
        const store = new SentenceSession(
            api({
                progress: vi
                    .fn<SentenceApi['progress']>()
                    .mockImplementationOnce(() => older.promise)
                    .mockImplementationOnce(() => newer.promise),
            }),
        );
        await store.start(configuration);
        await store.revealReference();
        newer.resolve(progress(3));
        await flush();
        older.resolve(progress(1));
        await flush();
        expect(store.getSnapshot().progress?.usedCount).toBe(3);
        store.stop();
    });
    it('does not revive a cancelled job when an older running poll resolves later', async () => {
        vi.useFakeTimers();
        const pending = deferred<SentenceJob>();
        const service = api({
            getJob: vi.fn(() => pending.promise),
            cancelJob: vi.fn(async () =>
                job({
                    state: 'cancelled',
                    updatedAt: '2026-10-04T00:00:01.000Z',
                }),
            ),
        });
        const store = new SentenceSession(service, 10);
        await store.start(configuration);
        store.setDraft('Hello');
        await store.check();
        await vi.advanceTimersByTimeAsync(10);
        expect(service.getJob).toHaveBeenCalledTimes(1);
        await store.cancel();
        pending.resolve(job({ state: 'running' }));
        await flush();
        await vi.advanceTimersByTimeAsync(100);
        expect(store.getSnapshot().job?.state).toBe('cancelled');
        expect(store.getSnapshot().busy).toBe(false);
        expect(service.getJob).toHaveBeenCalledTimes(1);
        store.stop();
    });
    it('recovers a polling failure by reading the known job without resubmitting admission', async () => {
        vi.useFakeTimers();
        const getJob = vi
            .fn<SentenceApi['getJob']>()
            .mockRejectedValueOnce(network())
            .mockResolvedValue(
                job({ state: 'failed', failureCode: 'provider_timeout' }),
            );
        const service = api({ getJob });
        const store = new SentenceSession(service, 10);
        await store.start(configuration);
        store.setDraft('Hello');
        await store.check();
        await vi.advanceTimersByTimeAsync(10);
        expect(store.getSnapshot().uncertain).toBe(true);
        await store.retry();
        expect(service.check).toHaveBeenCalledTimes(1);
        expect(getJob).toHaveBeenCalledTimes(2);
        store.stop();
    });
    it('respects explicit capacity Retry-After before a fresh admission', async () => {
        vi.useFakeTimers();
        const check = vi.fn<SentenceApi['check']>().mockRejectedValue(
            new ApiError(503, {
                code: 'capacity_unavailable',
                correlationId: 'test',
                message: 'Busy',
                retryAfterSeconds: 5,
            }),
        );
        const store = new SentenceSession(api({ check }));
        await store.start(configuration);
        store.setDraft('Hello');
        await store.check();
        await store.retry();
        expect(check).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(5000);
        await store.retry();
        expect(check).toHaveBeenCalledTimes(2);
        store.stop();
    });
    it('preserves overlimit Unicode input, rejects it before payment and uses the dictionary-front explanation language', async () => {
        const service = api();
        const store = new SentenceSession(service);
        const { explanationLanguage: _ignored, ...withoutLanguage } =
            configuration;
        await store.start(withoutLanguage);
        store.setDraft('😀'.repeat(4001));
        await store.check();
        expect(store.getSnapshot().draft).toBe('😀'.repeat(4001));
        expect(service.check).not.toHaveBeenCalled();
        expect(store.getSnapshot().error?.code).toBe('invalid_request');
        store.setDraft('😀'.repeat(4000));
        await store.check();
        const payload = vi.mocked(service.check).mock.calls[0]![1];
        expect([...payload.answer]).toHaveLength(4000);
        expect(payload.explanationLanguage).toBe('fr');
        store.stop();
    });
    it('acknowledges drafts only after a stored AI attempt, preserving unsaved draft status on definitive rejection', async () => {
        const service = api({
            check: vi.fn().mockRejectedValue(
                new ApiError(409, {
                    code: 'model_unavailable',
                    correlationId: 'test',
                    message: 'Unavailable',
                }),
            ),
        });
        const store = new SentenceSession(service);
        await store.start(configuration);
        store.setDraft('Hello');
        await store.check();
        expect(store.getSnapshot()).toMatchObject({
            draft: 'Hello',
            submittedAnswer: 'Hello',
            acknowledgedAnswer: null,
            busy: false,
        });
        expect(store.getSnapshot().draft).not.toBe(
            store.getSnapshot().acknowledgedAnswer,
        );
        store.stop();
    });
    it('retains truthful last-good progress after failures and retries without another paid operation', async () => {
        const read = vi
            .fn<SentenceApi['progress']>()
            .mockResolvedValueOnce(progress(2))
            .mockRejectedValueOnce(network())
            .mockResolvedValueOnce(progress(3));
        const service = api({ progress: read });
        const store = new SentenceSession(service);
        await store.start(configuration);
        await flush();
        await store.revealReference();
        await flush();
        expect(store.getSnapshot()).toMatchObject({
            progress: { usedCount: 2 },
            progressLoading: false,
        });
        expect(store.getSnapshot().progressError?.code).toBe('network_timeout');
        await store.retryProgress();
        expect(store.getSnapshot()).toMatchObject({
            progress: { usedCount: 3 },
            progressError: null,
            progressLoading: false,
        });
        expect(service.next).toHaveBeenCalledTimes(1);
        expect(service.check).not.toHaveBeenCalled();
        store.stop();
    });
    it('exposes a failed initial progress read as unavailable rather than fabricated zero values', async () => {
        const store = new SentenceSession(
            api({ progress: vi.fn().mockRejectedValue(network()) }),
        );
        await store.start(configuration);
        await flush();
        expect(store.getSnapshot().progress).toBeNull();
        expect(store.getSnapshot().progressLoading).toBe(false);
        expect(store.getSnapshot().progressError?.code).toBe('network_timeout');
        store.stop();
    });
    it('keeps session counts and manual reviews across mode changes and only clears visited IDs when restarting review', async () => {
        const service = api();
        const store = new SentenceSession(service);
        await store.start(configuration);
        await store.revealReference();
        const sessionId = store.getSnapshot().sessionId;
        await store.changeMode('new-only');
        expect(store.getSnapshot().sessionId).toBe(sessionId);
        expect(store.getSnapshot().counts).toMatchObject({
            presented: 1,
            manuallyReviewed: 1,
        });
        expect(vi.mocked(service.next).mock.calls[1]![0]).toMatchObject({
            mode: 'new-only',
            visitedExerciseIds: [first],
        });
        await store.restartReview();
        expect(vi.mocked(service.next).mock.calls[2]![0]).toMatchObject({
            mode: 'review-only',
            visitedExerciseIds: [],
            sessionId,
        });
        expect(store.getSnapshot().counts.manuallyReviewed).toBe(1);
        await store.revealReference();
        expect(store.getSnapshot().counts.manuallyReviewed).toBe(1);
        store.stop();
    });
    it('counts completed assisted AI attempts and their ratings once, independently of manual review totals', async () => {
        const attempt = {
            id: third,
            exercise,
            contentState: 'current' as const,
            sessionId: second,
            answer: 'Hello',
            explanationLanguage: 'fr' as const,
            revealedHintIds: ['hint-1'],
            assisted: true,
            referenceRevealed: false,
            createdAt: '2026-10-04T00:00:00.000Z',
            feedback: {
                percentage: 100,
                rating: 'perfect' as const,
                meaning: 'correct' as const,
                grammar: 'correct' as const,
                targets: [
                    {
                        entryId: third,
                        status: 'used' as const,
                        explanation: 'Used',
                    },
                ],
                issues: [],
                improvedTranslation: 'Hello',
                explanation: 'Correct',
            },
        };
        const completed = job({
            state: 'completed',
            result: { kind: 'attempt', attempt },
        });
        const store = new SentenceSession(
            api({ check: vi.fn(async () => completed) }),
        );
        await store.start(configuration);
        store.setDraft('Hello');
        await store.check();
        await store.check();
        expect(store.getSnapshot().acknowledgedAnswer).toBe('Hello');
        expect(store.getSnapshot().counts).toMatchObject({
            checked: 1,
            assisted: 1,
            manuallyReviewed: 0,
            ratings: { perfect: 1 },
        });
        await store.revealReference();
        expect(store.getSnapshot().counts).toMatchObject({
            checked: 1,
            assisted: 1,
            manuallyReviewed: 1,
            ratings: { perfect: 1 },
        });
        store.stop();
    });
});

describe('sentence query stores', () => {
    it('invalidates prepared entries, chosen IDs and both history streams while fencing inflight protected reads', async () => {
        const entryRead =
            deferred<Awaited<ReturnType<SentenceApi['listEntries']>>>();
        const reviewRead =
            deferred<Awaited<ReturnType<SentenceApi['manualReviews']>>>();
        const service = api({
            listEntries: vi.fn(() => entryRead.promise),
            manualReviews: vi.fn(() => reviewRead.promise),
        });
        const setup = new SentenceSetup(service);
        const history = new SentenceHistory(service);
        setup.enable();
        setup.setSelectedEntryIds([first]);
        history.enable();
        setup.invalidate();
        history.invalidate();
        entryRead.resolve({
            entries: [
                { entryId: first, source: 'private', translation: 'private' },
            ],
            nextCursor: 'next',
        });
        reviewRead.resolve({ reviews: [review], nextCursor: 'next' });
        await flush();
        expect(setup.getSnapshot()).toMatchObject({
            entries: [],
            selectedEntryIds: [],
            prepared: null,
            entriesLoading: false,
            hasMore: false,
        });
        expect(history.getSnapshot()).toMatchObject({
            attempts: [],
            reviews: [],
            loading: false,
            hasMoreReviews: false,
        });
        await setup.loadMore();
        await history.loadMoreReviews();
        expect(service.listEntries).toHaveBeenCalledTimes(1);
        expect(service.manualReviews).toHaveBeenCalledTimes(1);
    });
    it('fences stale setup results after switching search and direction', async () => {
        vi.useFakeTimers();
        const oldPrepare =
            deferred<Awaited<ReturnType<SentenceApi['prepare']>>>();
        const oldEntries =
            deferred<Awaited<ReturnType<SentenceApi['listEntries']>>>();
        const service = api({
            prepare: vi
                .fn<SentenceApi['prepare']>()
                .mockImplementationOnce(() => oldPrepare.promise)
                .mockResolvedValue({
                    ...(await api().prepare(configuration)),
                    direction: 'target-to-source',
                }),
            listEntries: vi
                .fn<SentenceApi['listEntries']>()
                .mockImplementationOnce(() => oldEntries.promise)
                .mockResolvedValue({ entries: [], nextCursor: null }),
        });
        const store = new SentenceSetup(service);
        store.enable();
        store.setConfiguration({
            ...configuration,
            direction: 'target-to-source',
        });
        store.setSearch('new');
        await vi.advanceTimersByTimeAsync(250);
        oldPrepare.resolve(await api().prepare(configuration));
        oldEntries.resolve({
            entries: [{ entryId: first, source: 'old', translation: 'old' }],
            nextCursor: null,
        });
        await flush();
        expect(store.getSnapshot().prepared?.direction).toBe(
            'target-to-source',
        );
        expect(store.getSnapshot().entries).toEqual([]);
        store.stop();
    });
    it('clears both personal history streams on authorization loss', async () => {
        const service = api({
            manualReviews: vi
                .fn<SentenceApi['manualReviews']>()
                .mockResolvedValueOnce({ reviews: [review], nextCursor: null })
                .mockRejectedValueOnce(
                    new ApiError(404, {
                        code: 'dictionary_not_found',
                        correlationId: 'test',
                        message: 'Unavailable',
                    }),
                ),
        });
        const store = new SentenceHistory(service);
        store.enable();
        await flush();
        expect(store.getSnapshot().reviews).toHaveLength(1);
        store.refresh();
        await flush();
        expect(store.getSnapshot()).toMatchObject({
            attempts: [],
            reviews: [],
            hasMoreReviews: false,
        });
        store.stop();
    });
});
