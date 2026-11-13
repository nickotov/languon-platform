import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
    AdminAiCatalogDetailResponse,
    AdminAiCatalogReference,
} from '@languon/contracts';
import { aiCatalogApi } from '@/shared/api/ai-catalog-api';
import { useAiCatalog } from './use-ai-catalog';

vi.mock('@/shared/api/ai-catalog-api', () => ({
    aiCatalogApi: { list: vi.fn(), detail: vi.fn() },
}));

beforeEach(() => {
    vi.mocked(aiCatalogApi.list).mockResolvedValue({ entries: [] });
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

const reference = {
    kind: 'prompt',
    id: 'sample',
} satisfies AdminAiCatalogReference;
const response: AdminAiCatalogDetailResponse = {
    entry: {
        ...reference,
        name: 'Sample',
        description: '',
        module: 'example',
        scope: 'application',
        references: [],
        limitations: [],
        sourcePath: 'sample.ts',
        content: 'Exact sample prompt',
    },
};

it('loads summaries first and requests detail only when an entry is selected', async () => {
    vi.mocked(aiCatalogApi.detail).mockResolvedValue(response);
    const { result, rerender } = renderHook(
        ({ selected }: { selected: AdminAiCatalogReference | null }) =>
            useAiCatalog(selected),
        { initialProps: { selected: null as AdminAiCatalogReference | null } },
    );

    await waitFor(() => expect(result.current.listLoading).toBe(false));
    expect(aiCatalogApi.detail).not.toHaveBeenCalled();
    rerender({ selected: reference });
    await waitFor(() => expect(result.current.entry).toEqual(response.entry));
    expect(aiCatalogApi.detail).toHaveBeenCalledTimes(1);
    rerender({ selected: { ...reference } });
    expect(aiCatalogApi.detail).toHaveBeenCalledTimes(1);
});

it('aborts a closed detail and ignores its late response', async () => {
    let resolveDetail!: (value: AdminAiCatalogDetailResponse) => void;
    vi.mocked(aiCatalogApi.detail).mockImplementation(
        () =>
            new Promise((resolve) => {
                resolveDetail = resolve;
            }),
    );

    const { result, rerender } = renderHook(
        ({ selected }: { selected: AdminAiCatalogReference | null }) =>
            useAiCatalog(selected),
        {
            initialProps: {
                selected: reference as AdminAiCatalogReference | null,
            },
        },
    );

    await waitFor(() => expect(aiCatalogApi.detail).toHaveBeenCalled());
    const signal = vi.mocked(aiCatalogApi.detail).mock.calls[0]?.[1];
    rerender({ selected: null });
    expect(signal?.aborted).toBe(true);
    await act(async () => resolveDetail(response));
    expect(result.current.entry).toBeNull();
    expect(result.current.detailLoading).toBe(false);
});

it('recovers a failed detail read through an explicit retry', async () => {
    vi.mocked(aiCatalogApi.detail)
        .mockRejectedValueOnce(new Error('Synthetic connection failure'))
        .mockResolvedValueOnce(response);

    const { result } = renderHook(() => useAiCatalog(reference));

    await waitFor(() =>
        expect(result.current.detailError?.message).toBe(
            'Synthetic connection failure',
        ),
    );

    expect(result.current.entry).toBeNull();
    expect(result.current.detailLoading).toBe(false);

    act(() => result.current.reloadDetail());
    await waitFor(() => expect(result.current.entry).toEqual(response.entry));
    expect(result.current.detailError).toBeNull();
    expect(aiCatalogApi.detail).toHaveBeenCalledTimes(2);
});
