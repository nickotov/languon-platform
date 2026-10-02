import { useEffect } from 'react';
import { act, fireEvent, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useManualSelection } from '@/fsd/features/flashcard-training/hooks/use-manual-selection';
import { useFlashcardSetup } from '@/fsd/features/flashcard-training/hooks/use-flashcard-setup';
import { ManualSelection } from '@/fsd/features/flashcard-training/ui/manual-selection/manual-selection';
import type {
    EntriesPage,
    LearningApi,
    StartPayload,
} from '@/fsd/features/flashcard-training/types';
import { render } from './render';

const first = '10000000-0000-4000-8000-000000000001';
const second = '10000000-0000-4000-8000-000000000002';
const third = '10000000-0000-4000-8000-000000000003';
const pageOne: EntriesPage = {
    entries: [
        { entryId: first, source: 'bonjour', translation: 'hello' },
        { entryId: second, source: 'merci', translation: 'thanks' },
    ],
    nextCursor: 'cursor-two',
};
const pageTwo: EntriesPage = {
    entries: [{ entryId: third, source: 'au revoir', translation: 'goodbye' }],
    nextCursor: null,
};
const searched: EntriesPage = {
    entries: [pageOne.entries[1]!],
    nextCursor: null,
};
function api(): LearningApi {
    return {
        capabilities: vi.fn(),
        getPreferences: vi.fn(),
        putPreferences: vi.fn(),
        getItems: vi.fn(),
        getProgress: vi.fn(),
        rate: vi.fn(),
        undo: vi.fn(),
        listEntries: vi.fn(async (query) =>
            query.search ? searched : query.cursor ? pageTwo : pageOne,
        ),
        prepare: vi.fn(async (input) => {
            const entryIds =
                input.scope.type === 'manual'
                    ? input.scope.entryIds
                    : [first, second, third];
            return {
                entryIds,
                eligibleCount: entryIds.length,
                skippedCount: 0,
                fallbackCount: 0,
            };
        }),
    };
}
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((complete) => {
        resolve = complete;
    });
    return { promise, resolve };
}
async function settle() {
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
}
afterEach(() => vi.useRealTimers());

describe('manual training selector', () => {
    it('sends the 300ms debounced search with bounded cursor pages and resets to page one', async () => {
        vi.useFakeTimers();
        const learningApi = api();
        const { result, unmount } = renderHook(() =>
            useManualSelection(learningApi),
        );
        await act(settle);
        expect(learningApi.listEntries).toHaveBeenLastCalledWith({
            search: undefined,
            cursor: undefined,
            limit: 25,
        });
        act(() => result.current.next());
        await act(settle);
        expect(result.current.page).toBe(2);
        expect(learningApi.listEntries).toHaveBeenLastCalledWith({
            search: undefined,
            cursor: 'cursor-two',
            limit: 25,
        });
        act(() => result.current.setSearch('merci'));
        act(() => vi.advanceTimersByTime(299));
        expect(learningApi.listEntries).toHaveBeenCalledTimes(2);
        await act(async () => {
            vi.advanceTimersByTime(1);
            await settle();
        });
        expect(result.current.page).toBe(1);
        expect(learningApi.listEntries).toHaveBeenLastCalledWith({
            search: 'merci',
            cursor: undefined,
            limit: 25,
        });
        expect(result.current.entries).toEqual(searched.entries);
        unmount();
    });
    it('ignores a late previous-page response after a debounced search replaces the request', async () => {
        vi.useFakeTimers();
        const learningApi = api();
        const oldPage = deferred<EntriesPage>();
        vi.mocked(learningApi.listEntries)
            .mockResolvedValueOnce(pageOne)
            .mockReturnValueOnce(oldPage.promise)
            .mockResolvedValueOnce(searched);
        const { result, unmount } = renderHook(() =>
            useManualSelection(learningApi),
        );
        await act(settle);
        act(() => result.current.next());
        act(() => result.current.setSearch('merci'));
        await act(async () => {
            vi.advanceTimersByTime(300);
            await settle();
        });
        await act(async () => {
            oldPage.resolve(pageTwo);
            await settle();
        });
        expect(result.current).toMatchObject({
            page: 1,
            query: 'merci',
            entries: searched.entries,
            status: 'ready',
        });
        unmount();
    });
    it('retains selections through Next, search, page selection and Previous into the exact Start scope', async () => {
        vi.useFakeTimers();
        const learningApi = api();
        const onStart = vi.fn<(payload: StartPayload | null) => void>();
        function SelectorHarness() {
            const setup = useFlashcardSetup({
                open: true,
                signedIn: false,
                activeCount: 3,
                api: learningApi,
            });
            useEffect(() => {
                setup.setScopeType('manual');
            }, [setup.setScopeType]);
            return (
                <>
                    <ManualSelection
                        api={learningApi}
                        selectedIds={setup.manualIds}
                        onToggle={setup.toggleManual}
                        onSetMany={setup.setManualMany}
                        onClear={setup.clearManual}
                        sourceLanguage={{
                            code: 'fr',
                            name: 'French',
                            direction: 'ltr',
                        }}
                        targetLanguage={{
                            code: 'en',
                            name: 'English',
                            direction: 'ltr',
                        }}
                        disabled={false}
                    />
                    <button
                        disabled={!setup.canStart}
                        onClick={() => {
                            void setup.start().then(onStart);
                        }}
                    >
                        Begin selection
                    </button>
                </>
            );
        }
        const view = render(<SelectorHarness />);
        await act(settle);
        fireEvent.click(screen.getByRole('checkbox', { name: /bonjour/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        await act(settle);
        fireEvent.click(screen.getByRole('checkbox', { name: /au revoir/ }));
        expect(screen.getByText('2 selected')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
        await act(settle);
        expect(screen.getByRole('checkbox', { name: /bonjour/ })).toBeChecked();
        fireEvent.change(
            screen.getByRole('searchbox', { name: 'Search entries' }),
            { target: { value: 'merci' } },
        );
        await act(async () => {
            vi.advanceTimersByTime(300);
            await settle();
        });
        fireEvent.click(
            screen.getByRole('checkbox', {
                name: 'Select all on this page (1)',
            }),
        );
        expect(screen.getByText('3 selected')).toBeInTheDocument();
        await act(async () => {
            fireEvent.click(
                screen.getByRole('button', { name: 'Begin selection' }),
            );
            await settle();
        });
        expect(learningApi.prepare).toHaveBeenLastCalledWith(
            expect.objectContaining({
                scope: { type: 'manual', entryIds: [first, third, second] },
            }),
        );
        expect(onStart).toHaveBeenCalledWith(
            expect.objectContaining({ entryIds: [first, third, second] }),
        );
        expect(learningApi.getPreferences).not.toHaveBeenCalled();
        view.unmount();
    });
});
