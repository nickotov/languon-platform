import { describe, expect, it, vi } from 'vitest';
import { PracticeSession } from '@/fsd/features/flashcard-training/model/practice-session';
import { ApiError } from '@/fsd/features/flashcard-training/lib/api-error';
import type {
    FlashcardItem,
    LearningApi,
} from '@/fsd/features/flashcard-training/types';

const first = '10000000-0000-4000-8000-000000000001';
const second = '10000000-0000-4000-8000-000000000002';
const attemptId = '10000000-0000-4000-8000-000000000004';
const configuration = {
    front: ['targetExample' as const],
    back: ['sourceExample' as const],
};
function item(entryId: string, learningVersion = 1): FlashcardItem {
    return {
        entryId,
        learningVersion,
        front: [
            {
                field: 'translation',
                requestedFields: ['targetExample'],
                text: 'hello',
                language: 'en',
                direction: 'ltr',
                fallback: true,
            },
        ],
        back: [
            {
                field: 'source',
                requestedFields: ['sourceExample'],
                text: 'bonjour',
                language: 'fr',
                direction: 'ltr',
                fallback: true,
            },
        ],
    };
}
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}
function error(code: ConstructorParameters<typeof ApiError>[1]['code']) {
    return new ApiError(code === 'entry_not_found' ? 404 : 409, {
        code,
        correlationId: 'test',
        message: 'test',
    });
}
function api(): LearningApi {
    return {
        capabilities: vi.fn().mockResolvedValue({ flashcardsEnabled: true }),
        getPreferences: vi.fn(),
        putPreferences: vi.fn(),
        prepare: vi.fn(),
        listEntries: vi.fn(),
        getItems: vi.fn(async (input) => ({
            items: input.entryIds.map((id: string) => item(id)),
            unavailableEntryIds: [],
        })),
        getProgress: vi
            .fn()
            .mockResolvedValue({ total: 2, known: 0, again: 0, unstudied: 2 }),
        rate: vi.fn(async (input) => ({
            attemptId,
            entryId: input.entryId,
            learningVersion: input.expectedLearningVersion,
            rating: input.rating,
        })),
        undo: vi.fn().mockResolvedValue({
            attemptId,
            entryId: first,
            learningVersion: 1,
            rating: null,
        }),
    };
}
function session(
    learningApi = api(),
    signedIn = true,
    entryIds = [first, second],
) {
    return new PracticeSession({
        api: learningApi,
        signedIn,
        entryIds,
        configuration,
        shuffle: false,
        sessionId: '10000000-0000-4000-8000-000000000003',
    });
}
async function settle() {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

describe('flashcard training session controller', () => {
    it('surfaces a rejected save without waiting for or later advancing on the fade', async () => {
        const learningApi = api();
        vi.mocked(learningApi.rate).mockRejectedValueOnce(
            error('learning_version_conflict'),
        );
        const practice = session(learningApi);
        const fade = deferred<void>();
        practice.start();
        await settle();
        practice.rate('known', fade.promise);
        await settle();
        expect(practice.getState()).toMatchObject({
            index: 0,
            pending: null,
            conflict: 'content',
            reviewEvents: 0,
        });
        fade.resolve();
        await settle();
        expect(practice.getState().index).toBe(0);
        expect(practice.getState().reviewEvents).toBe(0);
        practice.dispose();
    });

    it.each([true, false])(
        'waits for the swipe fade before advancing, with input guarded (signedIn=%s)',
        async (signedIn) => {
            const learningApi = api();
            const practice = session(learningApi, signedIn);
            const fade = deferred<void>();
            practice.start();
            await settle();
            practice.rate('known', fade.promise);
            await settle();
            expect(practice.getState()).toMatchObject({
                index: 0,
                pending: { status: 'saving' },
                reviewEvents: 0,
            });
            practice.flip();
            practice.rate('again');
            practice.undo();
            expect(practice.getState().face).toBe('front');
            expect(learningApi.rate).toHaveBeenCalledTimes(signedIn ? 1 : 0);
            fade.resolve();
            await settle();
            expect(practice.getState()).toMatchObject({
                index: 1,
                pending: null,
                reviewEvents: 1,
                savedCount: signedIn ? 1 : 0,
            });
            practice.dispose();
        },
    );

    it.each([true, false])(
        'does not revive a disposed session when its fade completes (signedIn=%s)',
        async (signedIn) => {
            const practice = session(api(), signedIn);
            const fade = deferred<void>();
            practice.start();
            await settle();
            practice.rate('known', fade.promise);
            await settle();
            practice.dispose();
            fade.resolve();
            await settle();
            expect(practice.getState()).toMatchObject({
                phase: 'unavailable',
                queue: [],
                pending: null,
                reviewEvents: 0,
            });
        },
    );

    it.each(['learning_version_conflict', 'idempotency_conflict'] as const)(
        'retains the previous confirmed rating after a later card %s rejection',
        async (code) => {
            const learningApi = api();
            const practice = session(learningApi);
            practice.start();
            await settle();
            practice.flip();
            practice.rate('known');
            await settle();
            const lastAck = practice.getState().lastAck;
            vi.mocked(learningApi.rate).mockRejectedValueOnce(error(code));
            practice.rate('again');
            await settle();
            expect(practice.getState()).toMatchObject({
                index: 1,
                reviewEvents: 1,
                savedCount: 1,
            });
            expect(practice.getState().lastAck).toBe(lastAck);
            if (code === 'learning_version_conflict') {
                vi.mocked(learningApi.getItems).mockResolvedValueOnce({
                    items: [item(second, 2)],
                    unavailableEntryIds: [],
                });
                await practice.resolveContentConflict();
            } else practice.dismissConflict();
            practice.undo();
            await settle();
            expect(learningApi.undo).toHaveBeenCalledWith(
                attemptId,
                expect.any(String),
            );
            expect(practice.getState()).toMatchObject({
                index: 0,
                face: 'back',
                reviewEvents: 0,
                savedCount: 0,
                outcomes: {},
                lastAck: null,
            });
            // The rejected second card can change epoch independently; Undo is bound to the first card.
            expect(practice.getState().items[first]?.learningVersion).toBe(1);
            practice.dispose();
        },
    );
    it('a preserved Undo still respects a backend conflict on the previously rated card epoch', async () => {
        const learningApi = api();
        const practice = session(learningApi);
        practice.start();
        await settle();
        practice.rate('known');
        await settle();
        vi.mocked(learningApi.rate).mockRejectedValueOnce(
            error('learning_version_conflict'),
        );
        practice.rate('again');
        await settle();
        await practice.resolveContentConflict();
        vi.mocked(learningApi.undo).mockRejectedValueOnce(
            error('learning_version_conflict'),
        );
        practice.undo();
        await settle();
        expect(practice.getState()).toMatchObject({
            index: 1,
            reviewEvents: 1,
            savedCount: 1,
            lastAck: null,
            conflict: 'undo',
        });
        expect(practice.getState().outcomes[first]).toBe('known');
        practice.dispose();
    });
    it('does not advance until ACK; retry uses identical operation and payload and retains face', async () => {
        const learningApi = api();
        const firstWrite = deferred<never>();
        const secondWrite =
            deferred<Awaited<ReturnType<LearningApi['rate']>>>();
        vi.mocked(learningApi.rate)
            .mockReturnValueOnce(firstWrite.promise)
            .mockReturnValueOnce(secondWrite.promise);
        const practice = session(learningApi);
        practice.start();
        await settle();
        practice.flip();
        practice.rate('again');
        practice.rate('known');
        expect(learningApi.rate).toHaveBeenCalledTimes(1);
        expect(practice.getState()).toMatchObject({
            index: 0,
            face: 'back',
            reviewEvents: 0,
        });
        const payload = vi.mocked(learningApi.rate).mock.calls[0]![0];
        firstWrite.reject(new TypeError('network lost'));
        await settle();
        practice.flip();
        practice.rate('known');
        expect(practice.getState()).toMatchObject({
            index: 0,
            face: 'back',
            pending: { status: 'error' },
        });
        practice.retry();
        practice.retry();
        expect(vi.mocked(learningApi.rate).mock.calls[1]![0]).toEqual(payload);
        expect(learningApi.rate).toHaveBeenCalledTimes(2);
        secondWrite.resolve({
            attemptId,
            entryId: first,
            learningVersion: 1,
            rating: 'again',
        });
        await settle();
        expect(practice.getState()).toMatchObject({
            index: 1,
            face: 'front',
            reviewEvents: 1,
            savedCount: 1,
            outcomes: { [first]: 'again' },
        });
        practice.dispose();
    });
    it('Undo ACK restores exact latest snapshot including card face and outcomes', async () => {
        const learningApi = api();
        const undo = deferred<Awaited<ReturnType<LearningApi['undo']>>>();
        vi.mocked(learningApi.undo).mockReturnValueOnce(undo.promise);
        const practice = session(learningApi);
        practice.start();
        await settle();
        practice.flip();
        practice.rate('known');
        await settle();
        practice.undo();
        expect(practice.getState().index).toBe(1);
        expect(learningApi.undo).toHaveBeenCalledWith(
            attemptId,
            expect.any(String),
        );
        undo.resolve({
            attemptId,
            entryId: first,
            learningVersion: 1,
            rating: null,
        });
        await settle();
        expect(practice.getState()).toMatchObject({
            index: 0,
            face: 'back',
            reviewEvents: 0,
            savedCount: 0,
            outcomes: {},
            lastAck: null,
        });
        practice.dispose();
    });
    it('Undo retries its own exact operation and never regenerates a rating', async () => {
        const learningApi = api();
        vi.mocked(learningApi.undo).mockRejectedValueOnce(new Error('timeout'));
        const practice = session(learningApi);
        practice.start();
        await settle();
        practice.rate('known');
        await settle();
        practice.undo();
        await settle();
        practice.retry();
        await settle();
        expect(vi.mocked(learningApi.undo).mock.calls[1]).toEqual(
            vi.mocked(learningApi.undo).mock.calls[0],
        );
        expect(learningApi.rate).toHaveBeenCalledTimes(1);
        expect(practice.getState().index).toBe(0);
        practice.dispose();
    });
    it('anonymous rounds and Undo are local, and Again requires an explicit new round', async () => {
        const learningApi = api();
        const practice = session(learningApi, false);
        practice.start();
        await settle();
        practice.rate('again');
        practice.rate('known');
        expect(practice.getState()).toMatchObject({
            phase: 'results',
            round: 1,
            reviewEvents: 2,
            savedCount: 0,
        });
        expect(learningApi.rate).not.toHaveBeenCalled();
        expect(learningApi.getProgress).not.toHaveBeenCalled();
        practice.undo();
        expect(practice.getState()).toMatchObject({
            phase: 'card',
            index: 1,
            reviewEvents: 1,
        });
        practice.rate('known');
        practice.practiseAgain();
        await settle();
        expect(practice.getState()).toMatchObject({
            phase: 'card',
            round: 2,
            queue: [first],
            roundStats: { reviewed: 0 },
        });
        practice.dispose();
    });
    it('items are requested in batches at most 25 even with a 10,000 entry manifest', async () => {
        const learningApi = api();
        const ids = Array.from(
            { length: 10_000 },
            (_, index) => `entry-${index}`,
        );
        const practice = session(learningApi, false, ids);
        practice.start();
        await settle();
        expect(
            vi.mocked(learningApi.getItems).mock.calls[0]![0].entryIds,
        ).toHaveLength(25);
        for (let count = 0; count < 26; count += 1) {
            practice.rate('known');
            await settle();
        }
        expect(
            vi
                .mocked(learningApi.getItems)
                .mock.calls.every(([input]) => input.entryIds.length <= 25),
        ).toBe(true);
        expect(practice.getState().index).toBe(26);
        practice.dispose();
    });
    it('skips removed entries without aborting access to the dictionary', async () => {
        const learningApi = api();
        vi.mocked(learningApi.rate).mockRejectedValueOnce(
            error('entry_not_found'),
        );
        const practice = session(learningApi);
        practice.start();
        await settle();
        practice.rate('known');
        await settle();
        expect(practice.getState()).toMatchObject({
            phase: 'card',
            index: 0,
            queue: [second],
            reviewEvents: 0,
            notices: ['entriesSkipped'],
        });
        expect(practice.getState().items[first]).toBeUndefined();
        practice.dispose();
    });
    it('content conflict reloads updated version and requires a new explicit rating', async () => {
        const learningApi = api();
        vi.mocked(learningApi.rate).mockRejectedValueOnce(
            error('learning_version_conflict'),
        );
        const practice = session(learningApi);
        practice.start();
        await settle();
        practice.flip();
        practice.rate('known');
        await settle();
        expect(practice.getState()).toMatchObject({
            index: 0,
            face: 'back',
            conflict: 'content',
            pending: null,
        });
        practice.rate('known');
        practice.dismissConflict();
        expect(learningApi.rate).toHaveBeenCalledTimes(1);
        vi.mocked(learningApi.getItems).mockResolvedValueOnce({
            items: [item(first, 2)],
            unavailableEntryIds: [],
        });
        await practice.resolveContentConflict();
        await settle();
        expect(practice.getState()).toMatchObject({
            face: 'front',
            conflict: null,
        });
        practice.rate('again');
        await settle();
        expect(
            vi.mocked(learningApi.rate).mock.calls[1]![0]
                .expectedLearningVersion,
        ).toBe(2);
        practice.dispose();
    });
    it('cross-session Undo conflict cannot overwrite current progress', async () => {
        const learningApi = api();
        vi.mocked(learningApi.undo).mockRejectedValueOnce(
            error('undo_conflict'),
        );
        const practice = session(learningApi);
        practice.start();
        await settle();
        practice.rate('known');
        await settle();
        practice.undo();
        await settle();
        expect(practice.getState()).toMatchObject({
            index: 1,
            lastAck: null,
            conflict: 'undo',
            savedCount: 1,
        });
        practice.undo();
        expect(learningApi.undo).toHaveBeenCalledTimes(1);
        practice.dispose();
    });
    it('revocation purges cached content and late writes/progress cannot resurrect it', async () => {
        const learningApi = api();
        const write = deferred<Awaited<ReturnType<LearningApi['rate']>>>();
        vi.mocked(learningApi.rate).mockReturnValueOnce(write.promise);
        const practice = session(learningApi);
        practice.start();
        await settle();
        practice.rate('known');
        vi.mocked(learningApi.getProgress).mockRejectedValueOnce(
            error('shared_dictionary_not_found'),
        );
        await practice.refreshProgress();
        write.resolve({
            attemptId,
            entryId: first,
            learningVersion: 1,
            rating: 'known',
        });
        await settle();
        expect(practice.getState()).toMatchObject({
            phase: 'unavailable',
            queue: [],
            items: {},
            progress: null,
            pending: null,
        });
        practice.dispose();
    });
    it('unmount/disposal cancels asynchronous mutation and clears private content', async () => {
        const learningApi = api();
        const load = deferred<Awaited<ReturnType<LearningApi['getItems']>>>();
        vi.mocked(learningApi.getItems).mockReturnValueOnce(load.promise);
        const practice = session(learningApi);
        practice.start();
        practice.dispose();
        load.resolve({ items: [item(first)], unavailableEntryIds: [] });
        await settle();
        expect(practice.getState()).toMatchObject({
            phase: 'unavailable',
            items: {},
            queue: [],
        });
    });
    it('all missing items complete a skipped round rather than loop or show a blank card', async () => {
        const learningApi = api();
        vi.mocked(learningApi.getItems).mockResolvedValueOnce({
            items: [],
            unavailableEntryIds: [first, second],
        });
        const practice = session(learningApi);
        practice.start();
        await settle();
        expect(practice.getState()).toMatchObject({
            phase: 'results',
            queue: [],
            reviewEvents: 0,
        });
        expect(learningApi.getItems).toHaveBeenCalledTimes(1);
        practice.dispose();
    });
});
