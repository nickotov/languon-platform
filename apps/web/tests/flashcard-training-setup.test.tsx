import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFlashcardSetup } from '@/fsd/features/flashcard-training/hooks/use-flashcard-setup';
import { ApiError } from '@/fsd/features/flashcard-training/lib/api-error';
import type {
    Configuration,
    LearningApi,
} from '@/fsd/features/flashcard-training/types';

const id = '10000000-0000-4000-8000-000000000001';
const configuration: Configuration = {
    front: ['targetExample'],
    back: ['sourceExample'],
};
function api(): LearningApi {
    return {
        capabilities: vi.fn().mockResolvedValue({ flashcardsEnabled: true }),
        getPreferences: vi
            .fn()
            .mockResolvedValue({ configuration, shuffle: false, version: 2 }),
        putPreferences: vi
            .fn()
            .mockResolvedValue({ configuration, shuffle: false, version: 3 }),
        prepare: vi.fn().mockResolvedValue({
            entryIds: [id],
            eligibleCount: 1,
            skippedCount: 0,
            fallbackCount: 0,
        }),
        getItems: vi.fn(),
        listEntries: vi.fn(),
        getProgress: vi.fn(),
        rate: vi.fn(),
        undo: vi.fn(),
    };
}
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((complete) => {
        resolve = complete;
    });
    return { promise, resolve };
}
afterEach(() => vi.useRealTimers());

describe('flashcard setup preferences and preparation', () => {
    it('primary Start and passive preparation honor the final prepare Retry-After deadline', async () => {
        vi.useFakeTimers();
        const learningApi = api();
        vi.mocked(learningApi.prepare).mockRejectedValueOnce(
            new ApiError(429, {
                code: 'rate_limited',
                correlationId: 'test',
                message: 'Wait',
                retryAfterSeconds: 2,
            }),
        );
        const { result, unmount } = renderHook(() =>
            useFlashcardSetup({
                open: true,
                signedIn: false,
                activeCount: 2,
                api: learningApi,
            }),
        );
        const staleStart = result.current.start;
        await act(async () => {
            expect(await staleStart()).toBeNull();
        });
        expect(result.current.canStart).toBe(false);
        await act(async () => {
            await staleStart();
            await result.current.start();
            vi.advanceTimersByTime(1_999);
        });
        expect(learningApi.prepare).toHaveBeenCalledTimes(1);
        expect(result.current.canStart).toBe(false);
        await act(async () => {
            vi.advanceTimersByTime(2);
        });
        expect(result.current.canStart).toBe(true);
        await act(async () => {
            expect(await result.current.start()).not.toBeNull();
        });
        expect(learningApi.prepare).toHaveBeenCalledTimes(2);
        unmount();
    });
    it('preference-write Retry-After blocks Start rather than repeatedly preparing or writing', async () => {
        const learningApi = api();
        const { result, unmount } = renderHook(() =>
            useFlashcardSetup({
                open: true,
                signedIn: true,
                activeCount: 2,
                api: learningApi,
            }),
        );
        await waitFor(() => expect(result.current.prefsStatus).toBe('ready'));
        vi.useFakeTimers();
        vi.mocked(learningApi.putPreferences).mockRejectedValueOnce(
            new ApiError(429, {
                code: 'rate_limited',
                correlationId: 'test',
                message: 'Wait',
                retryAfterSeconds: 3,
            }),
        );
        await act(async () => {
            await result.current.start();
        });
        expect(result.current.canStart).toBe(false);
        await act(async () => {
            await result.current.start();
            await result.current.overwrite();
            vi.advanceTimersByTime(2_999);
        });
        expect(learningApi.putPreferences).toHaveBeenCalledTimes(1);
        expect(learningApi.prepare).toHaveBeenCalledTimes(1);
        await act(async () => {
            vi.advanceTimersByTime(2);
        });
        expect(result.current.canStart).toBe(true);
        await act(async () => {
            expect(await result.current.start()).not.toBeNull();
        });
        expect(learningApi.putPreferences).toHaveBeenCalledTimes(2);
        unmount();
    });
    it('final zero-eligible preparation cannot create a session or save preferences', async () => {
        const learningApi = api();
        vi.mocked(learningApi.prepare).mockResolvedValue({
            entryIds: [],
            eligibleCount: 0,
            skippedCount: 2,
            fallbackCount: 0,
        });
        const { result, unmount } = renderHook(() =>
            useFlashcardSetup({
                open: true,
                signedIn: true,
                activeCount: 2,
                api: learningApi,
            }),
        );
        await waitFor(() => expect(result.current.canStart).toBe(true));
        await act(async () => {
            expect(await result.current.start()).toBeNull();
        });
        expect(learningApi.putPreferences).not.toHaveBeenCalled();
        unmount();
    });
    it('Cancel never saves a draft and reopening restores remembered settings', async () => {
        const learningApi = api();
        const { result, rerender, unmount } = renderHook(
            ({ open }) =>
                useFlashcardSetup({
                    open,
                    signedIn: true,
                    activeCount: 2,
                    api: learningApi,
                }),
            { initialProps: { open: true } },
        );
        await waitFor(() => expect(result.current.prefsStatus).toBe('ready'));
        act(() => {
            result.current.setFront(['translation']);
            result.current.setShuffle(true);
        });
        rerender({ open: false });
        rerender({ open: true });
        await waitFor(() => expect(result.current.prefsStatus).toBe('ready'));
        expect(result.current.front).toEqual(['targetExample']);
        expect(result.current.shuffle).toBe(false);
        expect(learningApi.putPreferences).not.toHaveBeenCalled();
        unmount();
    });
    it('Start saves with remembered version and prepares full scope independently of editor filters', async () => {
        const learningApi = api();
        const { result, unmount } = renderHook(() =>
            useFlashcardSetup({
                open: true,
                signedIn: true,
                activeCount: 2,
                api: learningApi,
            }),
        );
        await waitFor(() => expect(result.current.canStart).toBe(true));
        let started;
        await act(async () => {
            started = await result.current.start();
        });
        expect(learningApi.putPreferences).toHaveBeenCalledWith({
            configuration,
            shuffle: false,
            expectedVersion: 2,
        });
        expect(learningApi.prepare).toHaveBeenLastCalledWith({
            configuration,
            scope: { type: 'all' },
        });
        expect(started).toMatchObject({ entryIds: [id], shuffle: false });
        unmount();
    });
    it('version conflict leaves the draft intact until explicit reload or version-aware overwrite', async () => {
        const learningApi = api();
        const saved = {
            configuration: { front: ['translation'], back: ['source'] },
            shuffle: true,
            version: 7,
        };
        vi.mocked(learningApi.putPreferences).mockRejectedValueOnce(
            new ApiError(409, {
                code: 'version_conflict',
                correlationId: 'test',
                message: 'Changed elsewhere',
            }),
        );
        vi.mocked(learningApi.getPreferences)
            .mockResolvedValueOnce({
                configuration,
                shuffle: false,
                version: 2,
            })
            .mockResolvedValueOnce(
                saved as Awaited<ReturnType<LearningApi['getPreferences']>>,
            );
        const { result, unmount } = renderHook(() =>
            useFlashcardSetup({
                open: true,
                signedIn: true,
                activeCount: 2,
                api: learningApi,
            }),
        );
        await waitFor(() => expect(result.current.prefsStatus).toBe('ready'));
        act(() => result.current.setFront(['definition']));
        await act(async () => {
            expect(await result.current.start()).toBeNull();
        });
        expect(result.current.front).toEqual(['definition']);
        expect(result.current.conflict?.version).toBe(7);
        await act(async () => {
            await result.current.overwrite();
        });
        expect(learningApi.putPreferences).toHaveBeenLastCalledWith({
            configuration: { front: ['definition'], back: ['sourceExample'] },
            shuffle: false,
            expectedVersion: 7,
        });
        expect(result.current.front).toEqual(['definition']);
        expect(result.current.conflict).toBeNull();
        unmount();
    });
    it('explicit reload applies server version without an extra write', async () => {
        const learningApi = api();
        vi.mocked(learningApi.putPreferences).mockRejectedValueOnce(
            new ApiError(409, {
                code: 'version_conflict',
                correlationId: 'test',
                message: 'Conflict',
            }),
        );
        vi.mocked(learningApi.getPreferences)
            .mockResolvedValueOnce({
                configuration,
                shuffle: false,
                version: 2,
            })
            .mockResolvedValueOnce({
                configuration: { front: ['translation'], back: ['source'] },
                shuffle: true,
                version: 7,
            });
        const { result, unmount } = renderHook(() =>
            useFlashcardSetup({
                open: true,
                signedIn: true,
                activeCount: 2,
                api: learningApi,
            }),
        );
        await waitFor(() => expect(result.current.canStart).toBe(true));
        await act(async () => {
            await result.current.start();
        });
        act(() => result.current.reloadSaved());
        expect(result.current.front).toEqual(['translation']);
        expect(result.current.shuffle).toBe(true);
        expect(learningApi.putPreferences).toHaveBeenCalledTimes(1);
        unmount();
    });
    it('anonymous uses role-relative examples without loading/saving personal preferences', async () => {
        const learningApi = api();
        const { result, unmount } = renderHook(() =>
            useFlashcardSetup({
                open: true,
                signedIn: false,
                activeCount: 2,
                api: learningApi,
            }),
        );
        expect(result.current.front).toEqual(['targetExample']);
        expect(result.current.back).toEqual(['sourceExample']);
        await act(async () => {
            await result.current.start();
        });
        expect(learningApi.getPreferences).not.toHaveBeenCalled();
        expect(learningApi.putPreferences).not.toHaveBeenCalled();
        unmount();
    });
    it('empty fields/manual selections block Start; matching sides warn without blocking', async () => {
        const learningApi = api();
        const { result, unmount } = renderHook(() =>
            useFlashcardSetup({
                open: true,
                signedIn: false,
                activeCount: 2,
                api: learningApi,
            }),
        );
        act(() => result.current.setFront([]));
        expect(result.current.canStart).toBe(false);
        expect(result.current.frontError).toBe(true);
        act(() => result.current.setFront(['sourceExample']));
        expect(result.current.identicalSides).toBe(true);
        expect(result.current.canStart).toBe(true);
        act(() => result.current.setScopeType('manual'));
        expect(result.current.scopeEmpty).toBe(true);
        expect(result.current.canStart).toBe(false);
        act(() => result.current.toggleManual(id));
        expect(result.current.canStart).toBe(true);
        unmount();
    });
    it('manual selections persist across changes of scope, but reopening resets them', async () => {
        const learningApi = api();
        const { result, rerender, unmount } = renderHook(
            ({ open }) =>
                useFlashcardSetup({
                    open,
                    signedIn: false,
                    activeCount: 2,
                    api: learningApi,
                }),
            { initialProps: { open: true } },
        );
        act(() => {
            result.current.setScopeType('manual');
            result.current.toggleManual(id);
        });
        act(() => result.current.setScopeType('all'));
        act(() => result.current.setScopeType('manual'));
        expect(result.current.manualIds.has(id)).toBe(true);
        rerender({ open: false });
        rerender({ open: true });
        expect(result.current.manualIds.size).toBe(0);
        expect(result.current.scopeType).toBe('all');
        unmount();
    });
    it('close during Start cancels session creation, and duplicate starts have one in-flight write', async () => {
        const learningApi = api();
        const write =
            deferred<Awaited<ReturnType<LearningApi['putPreferences']>>>();
        vi.mocked(learningApi.putPreferences).mockReturnValueOnce(
            write.promise,
        );
        const { result, rerender, unmount } = renderHook(
            ({ open }) =>
                useFlashcardSetup({
                    open,
                    signedIn: true,
                    activeCount: 2,
                    api: learningApi,
                }),
            { initialProps: { open: true } },
        );
        await waitFor(() => expect(result.current.canStart).toBe(true));
        let first!: Promise<unknown>;
        let second!: Promise<unknown>;
        await act(async () => {
            first = result.current.start();
            second = result.current.start();
        });
        expect(learningApi.putPreferences).toHaveBeenCalledTimes(1);
        rerender({ open: false });
        await act(async () => {
            write.resolve({ configuration, shuffle: false, version: 3 });
        });
        expect(await first).toBeNull();
        expect(await second).toBeNull();
        expect(learningApi.prepare).toHaveBeenCalledTimes(1);
        unmount();
    });
    it('late preference response cannot leak previous signed-in configuration after sign-out', async () => {
        const learningApi = api();
        const load =
            deferred<Awaited<ReturnType<LearningApi['getPreferences']>>>();
        vi.mocked(learningApi.getPreferences).mockReturnValueOnce(load.promise);
        const { result, rerender, unmount } = renderHook(
            ({ signedIn }) =>
                useFlashcardSetup({
                    open: true,
                    signedIn,
                    activeCount: 2,
                    api: learningApi,
                }),
            { initialProps: { signedIn: true } },
        );
        rerender({ signedIn: false });
        await act(async () => {
            load.resolve({
                configuration: { front: ['definition'], back: ['source'] },
                shuffle: false,
                version: 8,
            });
        });
        expect(result.current.front).toEqual(['targetExample']);
        expect(result.current.shuffle).toBe(true);
        unmount();
    });
});
