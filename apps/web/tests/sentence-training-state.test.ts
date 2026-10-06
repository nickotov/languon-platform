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
    const oneWordApi = (overrides: Partial<SentenceApi> = {}) =>
        api({
            prepare: vi.fn(async () => ({
                ...(await api().prepare(configuration)),
                eligibleCount: 1,
            })),
            ...overrides,
        });
    const successfulAttempt = {
        id: third,
        exerciseId: first,
        contentState: 'current' as const,
        sessionId: second,
        answer: 'Hello',
        revealedHintIds: [],
        assisted: false,
        feedback: {
            score: 100,
            rating: 'perfect' as const,
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
        createdAt: '2026-10-04T00:00:00.000Z',
    };
    it('keeps the last sentence editable until its successful final AI check, then preserves the final draft and feedback in results', async () => {
        const service = oneWordApi({
            check: vi.fn(async () =>
                job({
                    state: 'completed',
                    result: { kind: 'attempt', attempt: successfulAttempt },
                }),
            ),
        });
        const store = new SentenceSession(service);
        await store.start(configuration);
        expect(store.getSnapshot()).toMatchObject({
            roundComplete: true,
            phase: 'exercise',
        });
        store.setDraft('Hello');
        await store.check();
        expect(store.getSnapshot()).toMatchObject({
            phase: 'completed',
            counts: { checked: 1, manuallyReviewed: 0, skipped: 0 },
        });
        expect(store.getSnapshot().roundItems[0]).toMatchObject({
            answer: 'Hello',
            attempt: successfulAttempt,
            outcome: 'ai-checked',
            skipped: false,
        });
        store.setDraft('Unreviewed edit');
        await store.next();
        expect(store.getSnapshot().draft).toBe('Hello');
        expect(service.next).toHaveBeenCalledTimes(1);
        store.stop();
    });
    it('does not complete a failed final check or allow reference disclosure while its outcome is unknown', async () => {
        vi.useFakeTimers();
        const check = vi
            .fn<SentenceApi['check']>()
            .mockRejectedValue(network());
        const service = oneWordApi({ check });
        const store = new SentenceSession(service);
        await store.start(configuration);
        store.setDraft('Hello');
        const checking = store.check();
        await store.recompare();
        expect(service.revealReference).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1500);
        await checking;
        expect(store.getSnapshot()).toMatchObject({
            phase: 'exercise',
            uncertain: true,
        });
        await store.revealReference();
        await store.skip();
        expect(service.revealReference).not.toHaveBeenCalled();
        expect(service.next).toHaveBeenCalledTimes(1);
        expect(store.getSnapshot().counts.skipped).toBe(0);
        store.stop();
    });
    it('compares only the exact captured answer, acknowledges no later edit, and re-compares locally without another review or AI score', async () => {
        const pending =
            deferred<Awaited<ReturnType<SentenceApi['revealReference']>>>();
        const service = api({ revealReference: vi.fn(() => pending.promise) });
        const store = new SentenceSession(service);
        await store.start(configuration);
        store.setDraft('HELLO!');
        const comparing = store.recompare();
        store.setDraft('Later draft');
        pending.resolve({ review });
        await comparing;
        expect(store.getSnapshot()).toMatchObject({
            draft: 'Later draft',
            acknowledgedAnswer: 'HELLO!',
            comparison: { kind: 'match', answer: 'HELLO!', reference: 'Hello' },
            counts: { checked: 0, manuallyReviewed: 1 },
        });
        store.setDraft('Hello');
        await store.recompare();
        expect(store.getSnapshot()).toMatchObject({
            acknowledgedAnswer: 'Hello',
            comparison: { kind: 'match', answer: 'Hello' },
            counts: { checked: 0, manuallyReviewed: 1 },
        });
        expect(service.revealReference).toHaveBeenCalledTimes(1);
        expect(service.check).not.toHaveBeenCalled();
        expect(store.getSnapshot().roundItems[0]).toMatchObject({
            answer: 'Hello',
            comparison: { answer: 'Hello' },
            outcome: 'manual-reviewed',
        });
        store.stop();
    });
    it('fences all answer and advancement actions after an unknown reference transaction until its identical operation is recovered', async () => {
        const revealReference = vi
            .fn<SentenceApi['revealReference']>()
            .mockRejectedValueOnce(network())
            .mockResolvedValue({ review });
        const check = vi
            .fn<SentenceApi['check']>()
            .mockResolvedValue(
                job({ state: 'failed', failureCode: 'provider_timeout' }),
            );
        const service = api({ revealReference, check });
        const store = new SentenceSession(service);
        await store.start(configuration);
        store.setDraft('Hello');
        await store.recompare();
        expect(store.getSnapshot()).toMatchObject({
            referenceUncertain: true,
            uncertain: true,
            reference: null,
            counts: { manuallyReviewed: 0 },
        });
        await store.check();
        await store.skip();
        await store.next();
        store.setDraft('Unreviewed replacement');
        expect(store.getSnapshot().draft).toBe('Hello');
        expect(check).not.toHaveBeenCalled();
        expect(service.next).toHaveBeenCalledTimes(1);
        expect(store.getSnapshot().counts.skipped).toBe(0);
        await store.retry();
        expect(revealReference).toHaveBeenCalledTimes(2);
        expect(revealReference.mock.calls[1]).toEqual(
            revealReference.mock.calls[0],
        );
        expect(store.getSnapshot()).toMatchObject({
            referenceUncertain: false,
            uncertain: false,
            comparison: { kind: 'match', answer: 'Hello' },
            counts: { manuallyReviewed: 1, checked: 0 },
        });
        await store.check();
        expect(check).toHaveBeenCalledTimes(1);
        store.stop();
    });
    it('retains reference uncertainty through a later known capacity response and clears it only on successful recovery or reset', async () => {
        const revealReference = vi
            .fn<SentenceApi['revealReference']>()
            .mockRejectedValueOnce(network())
            .mockRejectedValueOnce(
                new ApiError(429, {
                    code: 'capacity_unavailable',
                    correlationId: 'test',
                    message: 'Busy',
                }),
            )
            .mockResolvedValue({ review });
        const service = api({ revealReference });
        const store = new SentenceSession(service);
        await store.start(configuration);
        await store.revealReference();
        await store.retry();
        expect(store.getSnapshot()).toMatchObject({
            referenceUncertain: true,
            uncertain: true,
        });
        await store.check();
        expect(service.check).not.toHaveBeenCalled();
        await store.retry();
        expect(revealReference.mock.calls[2]).toEqual(
            revealReference.mock.calls[0],
        );
        expect(store.getSnapshot()).toMatchObject({
            referenceUncertain: false,
            uncertain: false,
            comparison: { kind: 'reference-only' },
            counts: { manuallyReviewed: 1 },
        });
        store.stop();
        expect(store.getSnapshot()).toMatchObject({
            referenceUncertain: false,
            uncertain: false,
            reference: null,
        });
    });
    it('reveals without grading an answer and completes a final empty reference reveal separately from AI scores', async () => {
        const service = oneWordApi();
        const store = new SentenceSession(service);
        await store.start(configuration);
        await store.revealReference();
        expect(store.getSnapshot()).toMatchObject({
            phase: 'completed',
            comparison: { kind: 'reference-only', answer: '' },
            acknowledgedAnswer: '',
            counts: { manuallyReviewed: 1, checked: 0, skipped: 0 },
        });
        expect(store.getSnapshot().roundItems[0]?.reference).toEqual(review);
        expect(service.check).not.toHaveBeenCalled();
        store.stop();
    });
    it('records final skipping once, keeps its draft, and never admits an additional sentence', async () => {
        const service = oneWordApi();
        const store = new SentenceSession(service);
        await store.start(configuration);
        store.setDraft('Unfinished translation');
        await store.skip();
        await store.skip();
        expect(store.getSnapshot()).toMatchObject({
            phase: 'completed',
            counts: { skipped: 1 },
            roundItems: [
                {
                    answer: 'Unfinished translation',
                    skipped: true,
                    outcome: 'skipped',
                },
            ],
        });
        expect(service.next).toHaveBeenCalledTimes(1);
        store.stop();
    });
    it('shows results when saved review is exhausted without pretending that every scoped word was practiced', async () => {
        const next = vi
            .fn<SentenceApi['next']>()
            .mockResolvedValueOnce({ kind: 'exercise', exercise })
            .mockResolvedValueOnce({
                kind: 'empty',
                reason: 'review-exhausted',
            });
        const store = new SentenceSession(api({ next }));
        await store.start({ ...configuration, mode: 'review-only' });
        await store.skip();
        expect(store.getSnapshot()).toMatchObject({
            phase: 'completed',
            emptyReason: 'review-exhausted',
            roundEntryCount: 1,
            roundEligibleCount: 10,
            counts: { presented: 1, skipped: 1, checked: 0 },
        });
        expect(store.getSnapshot().roundItems).toHaveLength(1);
        store.stop();
    });
    it('preflights the whole exact sequence before resetting results, then reauthorizes each original exercise in order in a fresh session', async () => {
        const otherEntry = '10000000-0000-4000-8000-000000000004';
        const other: SentenceExercise = {
            ...exercise,
            id: second,
            segments: exercise.segments.map((segment) => ({
                ...segment,
                target: segment.target
                    ? { ...segment.target, entryId: otherEntry }
                    : null,
            })),
        };
        const preflight =
            deferred<Awaited<ReturnType<SentenceApi['prepare']>>>();
        const prepared = {
            ...(await api().prepare(configuration)),
            eligibleCount: 2,
        };
        const prepare = vi
            .fn<SentenceApi['prepare']>()
            .mockResolvedValueOnce(prepared)
            .mockImplementationOnce(() => preflight.promise);
        const next = vi
            .fn<SentenceApi['next']>()
            .mockResolvedValueOnce({ kind: 'exercise', exercise })
            .mockResolvedValueOnce({ kind: 'exercise', exercise: other })
            .mockResolvedValueOnce({ kind: 'exercise', exercise })
            .mockResolvedValueOnce({ kind: 'exercise', exercise: other });
        const store = new SentenceSession(api({ prepare, next }));
        await store.start(configuration);
        await store.skip();
        await store.skip();
        const originalSession = store.getSnapshot().sessionId;
        const originalItems = store.getSnapshot().roundItems;
        const replaying = store.repeatExact();
        expect(store.getSnapshot()).toMatchObject({
            phase: 'completed',
            replayLoading: true,
            roundItems: originalItems,
        });
        expect(next).toHaveBeenCalledTimes(2);
        expect(prepare.mock.calls[1]![0]).toMatchObject({
            mode: 'review-only',
            replayExerciseIds: [first, second],
            scope: { type: 'manual', entryIds: [third, otherEntry] },
        });
        preflight.resolve(prepared);
        await replaying;
        expect(store.getSnapshot().sessionId).not.toBe(originalSession);
        expect(store.getSnapshot()).toMatchObject({
            phase: 'exercise',
            replaying: true,
            replayPosition: 1,
            roundComplete: false,
            reference: null,
            comparison: null,
            draft: '',
            counts: {
                presented: 1,
                skipped: 0,
                checked: 0,
                manuallyReviewed: 0,
            },
        });
        expect(next.mock.calls[2]![0]).toMatchObject({
            replayExerciseId: first,
            visitedExerciseIds: [],
            mode: 'review-only',
        });
        expect(next.mock.calls[2]![0]).not.toHaveProperty('replayExerciseIds');
        await store.skip();
        expect(next.mock.calls[3]![0]).toMatchObject({
            replayExerciseId: second,
            visitedExerciseIds: [first],
        });
        await store.skip();
        expect(store.getSnapshot()).toMatchObject({
            phase: 'completed',
            replayPosition: 2,
            counts: { presented: 2, skipped: 2 },
        });
        expect(
            store.getSnapshot().roundItems.map((item) => item.exercise.id),
        ).toEqual([first, second]);
        prepare.mockResolvedValue(prepared);
        next.mockResolvedValueOnce({
            kind: 'exercise',
            exercise: {
                ...exercise,
                id: '10000000-0000-4000-8000-000000000005',
            },
        });
        await store.generateNew();
        expect(store.getSnapshot()).toMatchObject({
            phase: 'exercise',
            replaying: false,
            replayPosition: null,
            counts: { presented: 1, skipped: 0 },
        });
        expect(next.mock.calls[4]![0]).toMatchObject({
            mode: 'new-only',
            scope: { type: 'manual', entryIds: [third, otherEntry] },
        });
        store.stop();
    });
    it('keeps results after a non-access preflight failure and never substitutes cached or other saved examples after an exact replay becomes stale', async () => {
        const prepare = vi
            .fn<SentenceApi['prepare']>()
            .mockResolvedValueOnce({
                ...(await api().prepare(configuration)),
                eligibleCount: 1,
            })
            .mockRejectedValueOnce(
                new ApiError(503, {
                    code: 'model_unavailable',
                    correlationId: 'test',
                    message: 'Unavailable',
                }),
            )
            .mockResolvedValue({
                ...(await api().prepare(configuration)),
                eligibleCount: 1,
            });
        const next = vi
            .fn<SentenceApi['next']>()
            .mockResolvedValueOnce({ kind: 'exercise', exercise })
            .mockResolvedValueOnce({
                kind: 'exercise',
                exercise: { ...exercise, id: second },
            });
        const store = new SentenceSession(api({ prepare, next }));
        await store.start(configuration);
        await store.skip();
        await store.repeatExact();
        expect(store.getSnapshot()).toMatchObject({
            phase: 'completed',
            replayError: { code: 'model_unavailable' },
            roundItems: [{ exercise }],
        });
        expect(next).toHaveBeenCalledTimes(1);
        await store.repeatExact();
        expect(store.getSnapshot()).toMatchObject({
            phase: 'error',
            error: { code: 'stale_content' },
            roundItems: [],
            reference: null,
            comparison: null,
        });
        expect(next).toHaveBeenCalledTimes(2);
        store.stop();
    });
    it('starts new examples for exactly the previous round words with fresh session and disclosure counters', async () => {
        const next = vi
            .fn<SentenceApi['next']>()
            .mockResolvedValueOnce({ kind: 'exercise', exercise })
            .mockResolvedValueOnce({
                kind: 'exercise',
                exercise: { ...exercise, id: second },
            });
        const store = new SentenceSession(oneWordApi({ next }));
        await store.start(configuration);
        store.setDraft('Hello');
        await store.recompare();
        const oldSession = store.getSnapshot().sessionId;
        await store.generateNew();
        expect(next.mock.calls[1]![0]).toMatchObject({
            mode: 'new-only',
            scope: { type: 'manual', entryIds: [third] },
            visitedExerciseIds: [],
        });
        expect(next.mock.calls[1]![0]).not.toHaveProperty('replayExerciseId');
        expect(store.getSnapshot().sessionId).not.toBe(oldSession);
        expect(store.getSnapshot()).toMatchObject({
            phase: 'exercise',
            replaying: false,
            draft: '',
            reference: null,
            comparison: null,
            counts: {
                presented: 1,
                skipped: 0,
                checked: 0,
                manuallyReviewed: 0,
            },
        });
        store.stop();
    });
    it('keeps completed results through fresh preparation and admission failure, then allows exact replay instead', async () => {
        const preparing =
            deferred<Awaited<ReturnType<SentenceApi['prepare']>>>();
        const admission = deferred<Awaited<ReturnType<SentenceApi['next']>>>();
        const prepared = {
            ...(await api().prepare(configuration)),
            eligibleCount: 1,
        };
        const prepare = vi
            .fn<SentenceApi['prepare']>()
            .mockResolvedValueOnce(prepared)
            .mockImplementationOnce(() => preparing.promise)
            .mockResolvedValue(prepared);
        const next = vi
            .fn<SentenceApi['next']>()
            .mockResolvedValueOnce({ kind: 'exercise', exercise })
            .mockImplementationOnce(() => admission.promise)
            .mockResolvedValue({ kind: 'exercise', exercise });
        const store = new SentenceSession(api({ prepare, next }));
        await store.start(configuration);
        await store.recompare();
        const original = store.getSnapshot();
        const generating = store.generateNew();
        expect(store.getSnapshot()).toMatchObject({
            phase: 'completed',
            busy: true,
            roundItems: original.roundItems,
            counts: original.counts,
        });
        preparing.resolve(prepared);
        await flush();
        expect(store.getSnapshot()).toMatchObject({
            phase: 'completed',
            busy: true,
            roundItems: original.roundItems,
            counts: original.counts,
        });
        admission.reject(
            new ApiError(503, {
                code: 'model_unavailable',
                correlationId: 'test',
                message: 'Unavailable',
            }),
        );
        await generating;
        expect(store.getSnapshot()).toMatchObject({
            phase: 'completed',
            busy: false,
            uncertain: false,
            error: { code: 'model_unavailable' },
            roundItems: original.roundItems,
            counts: original.counts,
        });
        await store.repeatExact();
        expect(next.mock.calls[2]![0]).toMatchObject({
            mode: 'review-only',
            replayExerciseId: first,
        });
        expect(store.getSnapshot()).toMatchObject({
            phase: 'exercise',
            replaying: true,
        });
        store.stop();
    });
    it('restores completed results after unknown fresh admission and recovers the identical paid operation before showing the new exercise', async () => {
        vi.useFakeTimers();
        const next = vi
            .fn<SentenceApi['next']>()
            .mockResolvedValueOnce({ kind: 'exercise', exercise })
            .mockRejectedValueOnce(network())
            .mockRejectedValueOnce(network())
            .mockRejectedValueOnce(network())
            .mockResolvedValueOnce({
                kind: 'exercise',
                exercise: { ...exercise, id: second },
            });
        const store = new SentenceSession(oneWordApi({ next }));
        await store.start(configuration);
        await store.revealReference();
        const oldItems = store.getSnapshot().roundItems;
        const generating = store.generateNew();
        await vi.advanceTimersByTimeAsync(1500);
        await generating;
        expect(store.getSnapshot()).toMatchObject({
            phase: 'completed',
            uncertain: true,
            roundItems: oldItems,
            counts: { manuallyReviewed: 1 },
        });
        await store.repeatExact();
        expect(next).toHaveBeenCalledTimes(4);
        await store.retry();
        expect(next.mock.calls[4]).toEqual(next.mock.calls[1]);
        expect(store.getSnapshot()).toMatchObject({
            phase: 'exercise',
            uncertain: false,
            counts: { presented: 1, manuallyReviewed: 0 },
        });
        expect(store.getSnapshot().roundItems[0]?.exercise.id).toBe(second);
        store.stop();
    });
    it('retains visible completed items, counters and session while fresh generation is queued or running and switches only for its accepted exercise', async () => {
        vi.useFakeTimers();
        const next = vi
            .fn<SentenceApi['next']>()
            .mockResolvedValueOnce({ kind: 'exercise', exercise })
            .mockResolvedValueOnce({
                kind: 'job',
                job: job({ kind: 'sentence-generation', state: 'queued' }),
            });
        const getJob = vi
            .fn<SentenceApi['getJob']>()
            .mockResolvedValueOnce(
                job({ kind: 'sentence-generation', state: 'running' }),
            )
            .mockResolvedValueOnce(
                job({
                    kind: 'sentence-generation',
                    state: 'completed',
                    result: {
                        kind: 'exercise',
                        exercise: { ...exercise, id: second },
                    },
                }),
            );
        const store = new SentenceSession(oneWordApi({ next, getJob }), 10);
        await store.start(configuration);
        store.setDraft('Hello');
        await store.recompare();
        const original = store.getSnapshot();
        await store.generateNew();
        expect(store.getSnapshot()).toMatchObject({
            phase: 'completed',
            busy: true,
            job: { state: 'queued' },
            roundItems: original.roundItems,
            counts: original.counts,
            sessionId: original.sessionId,
        });
        await vi.advanceTimersByTimeAsync(10);
        expect(store.getSnapshot()).toMatchObject({
            phase: 'completed',
            busy: true,
            job: { state: 'running' },
            roundItems: original.roundItems,
            counts: original.counts,
            sessionId: original.sessionId,
        });
        await vi.advanceTimersByTimeAsync(10);
        expect(store.getSnapshot()).toMatchObject({
            phase: 'exercise',
            busy: false,
            configuration: {
                mode: 'new-only',
                scope: { type: 'manual', entryIds: [third] },
            },
            counts: {
                presented: 1,
                manuallyReviewed: 0,
                checked: 0,
                skipped: 0,
            },
            reference: null,
            comparison: null,
            draft: '',
            roundItems: [{ exercise: { id: second } }],
        });
        expect(store.getSnapshot().sessionId).not.toBe(original.sessionId);
        expect(next).toHaveBeenCalledTimes(2);
        store.stop();
    });
    it('restores completed results when a newly admitted generation is cancelled before producing an example', async () => {
        const next = vi
            .fn<SentenceApi['next']>()
            .mockResolvedValueOnce({ kind: 'exercise', exercise })
            .mockResolvedValueOnce({
                kind: 'job',
                job: job({ kind: 'sentence-generation', state: 'queued' }),
            });
        const store = new SentenceSession(oneWordApi({ next }));
        await store.start(configuration);
        await store.revealReference();
        const original = store.getSnapshot();
        await store.generateNew();
        expect(store.getSnapshot()).toMatchObject({
            phase: 'completed',
            busy: true,
            roundItems: original.roundItems,
            counts: original.counts,
            sessionId: original.sessionId,
        });
        await store.cancel();
        expect(store.getSnapshot()).toMatchObject({
            phase: 'completed',
            busy: false,
            roundItems: original.roundItems,
            counts: original.counts,
        });
        store.stop();
    });
    it('recovers a known fresh generation job by reading it without admitting a second generation or inheriting old counters', async () => {
        vi.useFakeTimers();
        const next = vi
            .fn<SentenceApi['next']>()
            .mockResolvedValueOnce({ kind: 'exercise', exercise })
            .mockResolvedValueOnce({
                kind: 'job',
                job: job({ kind: 'sentence-generation', state: 'queued' }),
            });
        const getJob = vi
            .fn<SentenceApi['getJob']>()
            .mockRejectedValueOnce(network())
            .mockRejectedValueOnce(network())
            .mockRejectedValueOnce(network())
            .mockResolvedValueOnce(
                job({
                    kind: 'sentence-generation',
                    state: 'completed',
                    result: {
                        kind: 'exercise',
                        exercise: { ...exercise, id: second },
                    },
                }),
            );
        const store = new SentenceSession(oneWordApi({ next, getJob }), 10);
        await store.start(configuration);
        await store.revealReference();
        await store.generateNew();
        await vi.advanceTimersByTimeAsync(1510);
        expect(store.getSnapshot()).toMatchObject({
            phase: 'completed',
            uncertain: true,
            job: { state: 'queued' },
            counts: { manuallyReviewed: 1 },
        });
        await store.retry();
        expect(next).toHaveBeenCalledTimes(2);
        expect(getJob).toHaveBeenCalledTimes(4);
        expect(store.getSnapshot()).toMatchObject({
            phase: 'exercise',
            busy: false,
            counts: { presented: 1, manuallyReviewed: 0 },
            exercise: { id: second },
        });
        store.stop();
    });
    it('erases protected result snapshots on revoked fresh admission and fences an in-flight reference read after access loss', async () => {
        const next = vi
            .fn<SentenceApi['next']>()
            .mockResolvedValueOnce({ kind: 'exercise', exercise })
            .mockRejectedValueOnce(
                new ApiError(404, {
                    code: 'dictionary_not_found',
                    correlationId: 'test',
                    message: 'Revoked',
                }),
            );
        const store = new SentenceSession(oneWordApi({ next }));
        await store.start(configuration);
        await store.revealReference();
        await store.generateNew();
        expect(store.getSnapshot()).toMatchObject({
            phase: 'error',
            roundItems: [],
            exercise: null,
            reference: null,
            comparison: null,
            draft: '',
        });
        store.stop();
        const read =
            deferred<Awaited<ReturnType<SentenceApi['revealReference']>>>();
        const progressRead = vi
            .fn<SentenceApi['progress']>()
            .mockResolvedValueOnce(progress())
            .mockRejectedValueOnce(
                new ApiError(404, {
                    code: 'dictionary_not_found',
                    correlationId: 'test',
                    message: 'Revoked',
                }),
            );
        const concurrent = new SentenceSession(
            api({
                revealReference: vi.fn(() => read.promise),
                progress: progressRead,
            }),
        );
        await concurrent.start(configuration);
        await flush();
        const revealing = concurrent.recompare();
        await concurrent.retryProgress();
        read.resolve({ review });
        await revealing;
        expect(concurrent.getSnapshot()).toMatchObject({
            phase: 'error',
            roundItems: [],
            reference: null,
            comparison: null,
            draft: '',
        });
        concurrent.stop();
    });
    it('recovers exhausted read-only preparation without admitting work before preparation succeeds', async () => {
        vi.useFakeTimers();
        const prepare = vi
            .fn<SentenceApi['prepare']>()
            .mockRejectedValueOnce(network())
            .mockRejectedValueOnce(network())
            .mockRejectedValueOnce(network())
            .mockResolvedValue(await api().prepare(configuration));
        const service = api({ prepare });
        const store = new SentenceSession(service);
        const starting = store.start(configuration);
        await vi.advanceTimersByTimeAsync(1500);
        await starting;
        expect(service.next).not.toHaveBeenCalled();
        expect(store.getSnapshot().canRetry).toBe(true);
        await store.retry();
        expect(prepare).toHaveBeenCalledTimes(4);
        expect(service.next).toHaveBeenCalledTimes(1);
        expect(store.getSnapshot().exercise).toEqual(exercise);
        store.stop();
    });
    it('finishes after all five distinct words appear, including skipped sentences, without another admission', async () => {
        const exercises = Array.from(
            { length: 6 },
            (_, index): SentenceExercise => ({
                ...exercise,
                id: `10000000-0000-4000-8000-${String(100 + index).padStart(12, '0')}`,
                segments: exercise.segments.map((segment) => ({
                    ...segment,
                    target: segment.target
                        ? {
                              ...segment.target,
                              entryId: `10000000-0000-4000-8000-${String(200 + Math.max(0, index - 1)).padStart(12, '0')}`,
                          }
                        : null,
                })),
            }),
        );
        const next = vi.fn<SentenceApi['next']>();
        for (const item of exercises)
            next.mockResolvedValueOnce({ kind: 'exercise', exercise: item });
        const service = api({
            next,
            prepare: vi.fn(async () => ({
                ...(await api().prepare(configuration)),
                eligibleCount: 5,
                remainingCount: 0,
                usedCount: 5,
            })),
            progress: vi.fn(async () => ({
                ...progress(5),
                eligibleCount: 5,
                remainingCount: 0,
            })),
        });
        const store = new SentenceSession(service);
        await store.start(configuration);
        expect(store.getSnapshot()).toMatchObject({
            roundEntryCount: 1,
            roundComplete: false,
        });
        await store.next();
        expect(store.getSnapshot().roundEntryCount).toBe(1);
        for (let index = 0; index < 4; index++) await store.next();
        expect(store.getSnapshot()).toMatchObject({
            roundEntryCount: 5,
            roundEligibleCount: 5,
            roundComplete: true,
            exercise: exercises[5],
        });
        expect(service.check).not.toHaveBeenCalled();
        expect(service.revealReference).not.toHaveBeenCalled();
        await store.next();
        expect(next).toHaveBeenCalledTimes(6);
        expect(store.getSnapshot().phase).toBe('completed');
        next.mockResolvedValueOnce({
            kind: 'exercise',
            exercise: {
                ...exercises[0]!,
                id: '10000000-0000-4000-8000-000000000500',
            },
        });
        await store.changeMode('new-only');
        expect(next.mock.calls[6]![0]).toMatchObject({
            mode: 'new-only',
            visitedExerciseIds: [],
        });
        expect(store.getSnapshot()).toMatchObject({
            roundEntryCount: 1,
            roundComplete: false,
        });
        store.stop();
    });
    it('retries transient generation transport errors with the identical operation and stops retrying after reset', async () => {
        vi.useFakeTimers();
        const next = vi
            .fn<SentenceApi['next']>()
            .mockRejectedValueOnce(network())
            .mockResolvedValue({ kind: 'exercise', exercise });
        const store = new SentenceSession(api({ next }));
        const starting = store.start(configuration);
        await flush();
        await vi.advanceTimersByTimeAsync(500);
        await starting;
        expect(next).toHaveBeenCalledTimes(2);
        expect(next.mock.calls[1]).toEqual(next.mock.calls[0]);
        next.mockRejectedValueOnce(network());
        const advancing = store.next();
        await flush();
        store.stop();
        await vi.advanceTimersByTimeAsync(2000);
        await advancing;
        expect(next).toHaveBeenCalledTimes(3);
        expect(store.getSnapshot().phase).toBe('idle');
    });
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
        await flush();
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
    it('finishes a maximum one hundred word batch only after its final entry appears', async () => {
        const count = 100;
        let presented = 0;
        const next = vi.fn<SentenceApi['next']>(async () => {
            const index = ++presented;
            return {
                kind: 'exercise',
                exercise: {
                    ...exercise,
                    id: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
                    segments: exercise.segments.map((segment) => ({
                        ...segment,
                        target: segment.target
                            ? {
                                  ...segment.target,
                                  entryId: `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
                              }
                            : null,
                    })),
                },
            };
        });
        const store = new SentenceSession(
            api({
                next,
                prepare: vi.fn(async () => ({
                    ...(await api().prepare(configuration)),
                    eligibleCount: count,
                })),
            }),
        );
        await store.start(configuration);
        for (let index = 1; index < 99; index++) await store.next();
        expect(store.getSnapshot()).toMatchObject({
            roundEntryCount: 99,
            roundComplete: false,
            phase: 'exercise',
        });
        expect(next).toHaveBeenCalledTimes(99);
        await store.next();
        expect(next.mock.calls[99]![0].visitedExerciseIds).toHaveLength(99);
        expect(store.getSnapshot()).toMatchObject({
            roundEntryCount: count,
            roundComplete: true,
            phase: 'exercise',
        });
        await store.next();
        expect(next).toHaveBeenCalledTimes(count);
        expect(store.getSnapshot().phase).toBe('completed');
        store.stop();
    });
    it('replays the exact unknown check payload and keeps a terminal retry as a new operation', async () => {
        const check = vi
            .fn<SentenceApi['check']>()
            .mockRejectedValueOnce(network())
            .mockRejectedValueOnce(network())
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
        expect(check.mock.calls[2]).toEqual(check.mock.calls[0]);
        expect(check.mock.calls[3]).toEqual(check.mock.calls[0]);
        await store.retry();
        expect(check.mock.calls[4]![1].operationId).not.toBe(
            check.mock.calls[3]![1].operationId,
        );
        expect({ ...check.mock.calls[4]![1], operationId: 'same' }).toEqual({
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
    it('automatically recovers a polling failure by reading the known job without resubmitting admission', async () => {
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
        expect(store.getSnapshot().busy).toBe(true);
        await vi.advanceTimersByTimeAsync(500);
        expect(service.check).toHaveBeenCalledTimes(1);
        expect(getJob).toHaveBeenCalledTimes(2);
        store.stop();
    });
    it('cancels a pending polling retry without issuing another read or reviving the job', async () => {
        vi.useFakeTimers();
        const getJob = vi
            .fn<SentenceApi['getJob']>()
            .mockRejectedValue(network());
        const store = new SentenceSession(api({ getJob }), 10);
        await store.start(configuration);
        store.setDraft('Hello');
        await store.check();
        await vi.advanceTimersByTimeAsync(10);
        await store.cancel();
        await vi.advanceTimersByTimeAsync(2000);
        expect(getJob).toHaveBeenCalledTimes(1);
        expect(store.getSnapshot()).toMatchObject({
            busy: false,
            job: { state: 'cancelled' },
        });
        store.stop();
    });
    it('respects capacity Retry-After and replays the same operation automatically', async () => {
        vi.useFakeTimers();
        const check = vi
            .fn<SentenceApi['check']>()
            .mockRejectedValueOnce(
                new ApiError(503, {
                    code: 'capacity_unavailable',
                    correlationId: 'test',
                    message: 'Busy',
                    retryAfterSeconds: 5,
                }),
            )
            .mockResolvedValue(
                job({ state: 'failed', failureCode: 'provider_timeout' }),
            );
        const store = new SentenceSession(api({ check }));
        await store.start(configuration);
        store.setDraft('Hello');
        const checking = store.check();
        await flush();
        await store.retry();
        expect(check).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(4999);
        expect(check).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        await checking;
        expect(check).toHaveBeenCalledTimes(2);
        expect(check.mock.calls[1]).toEqual(check.mock.calls[0]);
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
    it('bounds distinct manual selections to one hundred entries and permits replacing a selected entry', () => {
        const ids = Array.from(
            { length: 101 },
            (_, index) =>
                `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        );
        const setup = new SentenceSetup(api());
        setup.setConfiguration({
            ...configuration,
            scope: { type: 'manual', entryIds: [] },
        });
        setup.setSelectedEntryIds([ids[0]!, ...ids]);
        expect(setup.getSnapshot().selectedEntryIds).toEqual(ids.slice(0, 100));
        expect(setup.getSnapshot().configuration.scope).toEqual({
            type: 'manual',
            entryIds: ids.slice(0, 100),
        });
        setup.setSelectedEntryIds([...ids.slice(0, 99), ids[100]!]);
        expect(setup.getSnapshot().selectedEntryIds).toHaveLength(100);
        expect(setup.getSnapshot().selectedEntryIds).toContain(ids[100]);
        expect(setup.getSnapshot().selectedEntryIds).not.toContain(ids[99]);
        setup.stop();
    });
    it('starts sentence setup in target-to-source direction', () => {
        const setup = new SentenceSetup(api());
        expect(setup.getSnapshot().configuration.direction).toBe(
            'target-to-source',
        );
    });
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
