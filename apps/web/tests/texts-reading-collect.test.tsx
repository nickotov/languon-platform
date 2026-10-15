import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCollect } from '@/fsd/features/text-reading/hooks/use-collect';
import { textsApi } from '@/fsd/entities/texts';
import type {
    ReadingSelection,
    TextReadingProps,
} from '@/fsd/features/text-reading/types';
vi.mock('@/fsd/entities/texts', () => ({
    textsApi: {
        enqueueSelection: vi.fn(),
        getSelectionJob: vi.fn(),
        cancelSelectionJob: vi.fn(),
    },
    TextsApiError: class extends Error {},
}));
vi.mock('@/fsd/entities/dictionary', () => ({
    dictionaryApi: { listDictionaries: vi.fn() },
}));
const source = {
    kind: 'owned-text' as const,
    textId: 'text',
    expectedTextVersion: 1,
};
const selected: ReadingSelection = {
    kind: 'valid',
    text: 'word',
    sentence: 'A word.',
    sentenceStart: 0,
    selection: { side: 'source', pairId: 'pair', startOffset: 2, endOffset: 6 },
    rect: { top: 0, left: 0, width: 20, height: 10 },
};
const props: TextReadingProps = {
    collectionActorKey: 'user-a',
    document: {
        id: 'text',
        version: 1,
        status: 'translated',
        sourceLanguage: 'en',
        targetLanguage: 'ru',
        sourceText: 'A word.',
        alignment: null,
    },
    source,
    matchMode: false,
    requestWithSession: async (request) => request('token'),
};
const job = {
    id: 'job',
    state: 'completed',
    dictionaryId: 'dictionary',
    cardId: 'card',
    failureCode: null,
};
describe('text collection authority and retry', () => {
    beforeEach(() => vi.clearAllMocks());
    it('reuses the operation ID after an ambiguous enqueue failure and preserves selection as focus moves', async () => {
        vi.mocked(textsApi.enqueueSelection)
            .mockRejectedValueOnce(new Error('connection lost'))
            .mockResolvedValueOnce({ job } as never);
        const { result } = renderHook(() => useCollect(props));
        act(() => result.current.onSelection(selected));
        act(() => result.current.submit({ kind: 'new', name: 'Reading' }));
        await waitFor(() => expect(result.current.step).toBe('error'));
        act(() => result.current.onSelection(null));
        expect(result.current.selection).toEqual(selected);
        act(() => result.current.retry());
        await waitFor(() => expect(result.current.step).toBe('success'));
        const calls = vi.mocked(textsApi.enqueueSelection).mock.calls;
        expect(calls[0]![1].operationId).toBe(calls[1]![1].operationId);
        expect(result.current.dictionaryId).toBe('dictionary');
        expect(result.current.marks).toEqual([selected]);
    });
    it('does not accept an enqueue result after unmount and aborts its request', async () => {
        let finish: (value: never) => void = () => undefined;
        vi.mocked(textsApi.enqueueSelection).mockImplementation(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        );
        const { result, unmount } = renderHook(() => useCollect(props));
        act(() => result.current.onSelection(selected));
        act(() => result.current.submit({ kind: 'new', name: 'Reading' }));
        const signal = vi.mocked(textsApi.enqueueSelection).mock.calls[0]![3];
        unmount();
        expect(signal?.aborted).toBe(true);
        await act(async () => finish({ job } as never));
        expect(textsApi.getSelectionJob).not.toHaveBeenCalled();
    });
    it('prevents concurrent duplicate submissions before the next render', async () => {
        vi.mocked(textsApi.enqueueSelection).mockImplementation(
            () => new Promise(() => undefined),
        );
        const { result, unmount } = renderHook(() => useCollect(props));
        act(() => result.current.onSelection(selected));
        act(() => {
            result.current.submit({ kind: 'new', name: 'Reading' });
            result.current.submit({ kind: 'new', name: 'Reading' });
        });
        expect(textsApi.enqueueSelection).toHaveBeenCalledTimes(1);
        unmount();
    });
    it('allows a new occurrence while another addition is pending without aborting the earlier request', async () => {
        const finish: Array<(value: never) => void> = [];
        vi.mocked(textsApi.enqueueSelection).mockImplementation(
            () =>
                new Promise((resolve) => {
                    finish.push(resolve);
                }),
        );
        const { result } = renderHook(() => useCollect(props));
        act(() => result.current.onSelection(selected));
        act(() => result.current.submit({ kind: 'new', name: 'First' }));
        const second = {
            ...selected,
            text: 'other',
            selection: {
                ...selected.selection,
                startOffset: 10,
                endOffset: 15,
            },
        };
        act(() => result.current.onSelection(second));
        act(() => result.current.submit({ kind: 'new', name: 'Second' }));
        expect(textsApi.enqueueSelection).toHaveBeenCalledTimes(2);
        expect(
            vi.mocked(textsApi.enqueueSelection).mock.calls[0]![3]?.aborted,
        ).toBe(false);
        await act(async () =>
            finish[1]!({ job: { ...job, dictionaryId: 'second' } } as never),
        );
        await act(async () => finish[0]!({ job } as never));
        expect(result.current.tasks.map((task) => task.state)).toEqual([
            'success',
            'success',
        ]);
        expect(result.current.marks).toEqual([second, selected]);
        expect(result.current.dictionaryId).toBe('second');
    });
    it('starts a new operation only after a confirmed terminal failure', async () => {
        vi.mocked(textsApi.enqueueSelection)
            .mockResolvedValueOnce({
                job: {
                    ...job,
                    state: 'failed',
                    failureCode: 'provider_unavailable',
                    dictionaryId: null,
                },
            } as never)
            .mockResolvedValueOnce({ job } as never);
        const { result } = renderHook(() => useCollect(props));
        act(() => result.current.onSelection(selected));
        act(() => result.current.submit({ kind: 'new', name: 'Reading' }));
        await waitFor(() => expect(result.current.step).toBe('error'));
        expect(result.current.failureCode).toBe('provider_unavailable');
        act(() => result.current.retry());
        await waitFor(() => expect(result.current.step).toBe('success'));
        const calls = vi.mocked(textsApi.enqueueSelection).mock.calls;
        expect(calls[0]![1].operationId).not.toBe(calls[1]![1].operationId);
    });
});
