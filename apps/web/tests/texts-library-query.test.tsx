import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/fsd/entities/session';
import {
    loadLibraryFolders,
    useTextLibrary,
} from '@/fsd/pages/texts/hooks/use-text-library';
import { useTextFolder } from '@/fsd/pages/texts/hooks/use-text-folder';

vi.mock('@/fsd/shared/i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));
const folderId = '10000000-0000-4000-8000-000000000001';
const textId = '10000000-0000-4000-8000-000000000002';
const cursor = '10000000-0000-4000-8000-000000000003';
const date = '2026-10-15T12:00:00.000Z';
const folder = {
    id: folderId,
    name: 'Reading',
    description: null,
    lifecycle: 'archived' as const,
    version: 7,
    createdAt: date,
    updatedAt: date,
};
const document = {
    id: textId,
    folderId,
    title: 'Passage',
    sourceLanguage: 'en' as const,
    targetLanguage: 'ru' as const,
    sourceText: 'Hello.',
    alignment: null,
    status: 'draft' as const,
    lifecycle: 'archived' as const,
    version: 4,
    createdAt: date,
    updatedAt: date,
};
const request = <T,>(operation: (token: string) => Promise<T>) =>
    operation('test-token');
const json = (value: unknown) =>
    new Response(JSON.stringify(value), {
        headers: { 'content-type': 'application/json' },
    });
function setup() {
    const client = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    function Wrapper({ children }: { children: ReactNode }) {
        return (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        );
    }
    return { client, wrapper: Wrapper };
}
beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    useSessionStore.setState({ status: 'authenticated' });
});
afterEach(() => {
    vi.unstubAllGlobals();
    useSessionStore.getState().signOut();
});

describe('texts owner library queries', () => {
    it('traverses every active and archived folder cursor so deep links resolve beyond page one', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(json({ data: [], nextCursor: cursor }))
            .mockResolvedValueOnce(json({ data: [], nextCursor: null }))
            .mockResolvedValueOnce(json({ data: [folder], nextCursor: null }));
        const signal = new AbortController().signal;
        await expect(loadLibraryFolders(request, signal)).resolves.toEqual([
            folder,
        ]);
        expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toEqual(
            [
                '/api/text-folders?limit=100&lifecycle=active',
                `/api/text-folders?cursor=${cursor}&limit=100&lifecycle=active`,
                '/api/text-folders?limit=100&lifecycle=archived',
            ],
        );
        for (const [, options] of vi.mocked(fetch).mock.calls) {
            expect(options?.signal).toBe(signal);
            expect(new Headers(options?.headers).get('authorization')).toBe(
                'Bearer test-token',
            );
        }
    });
    it('restores a folder using its current version and refreshes library state', async () => {
        let restored = false;
        vi.mocked(fetch).mockImplementation(async (url, options) => {
            if (options?.method === 'POST') {
                restored = true;
                return json({
                    folder: { ...folder, lifecycle: 'active', version: 8 },
                });
            }
            const active = String(url).includes('lifecycle=active');
            return json({
                data:
                    active === restored
                        ? [
                              {
                                  ...folder,
                                  lifecycle: restored ? 'active' : 'archived',
                                  version: restored ? 8 : 7,
                              },
                          ]
                        : [],
                nextCursor: null,
            });
        });
        const { client, wrapper } = setup();
        const { result, unmount } = renderHook(() => useTextLibrary(request), {
            wrapper,
        });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        await act(() => result.current.restore.mutateAsync(folder));
        const mutation = vi
            .mocked(fetch)
            .mock.calls.find(([, options]) => options?.method === 'POST');
        expect(mutation?.[0]).toBe(`/api/text-folders/${folderId}/restore`);
        expect(JSON.parse(String(mutation?.[1]?.body))).toEqual({
            expectedVersion: 7,
        });
        await waitFor(() => expect(result.current.folders[0]?.version).toBe(8));
        unmount();
        client.clear();
    });
    it('loads additional text pages and preserves the document version on restore', async () => {
        vi.mocked(fetch).mockImplementation(async (url, options) => {
            if (options?.method === 'POST')
                return json({
                    text: { ...document, lifecycle: 'active', version: 5 },
                });
            const next = String(url).includes('cursor=');
            return json({
                data: next ? [] : [document],
                nextCursor: next ? null : cursor,
            });
        });
        const { client, wrapper } = setup();
        const { result, unmount } = renderHook(
            () => useTextFolder(folderId, 'archived', request, true),
            { wrapper },
        );
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.hasNextPage).toBe(true);
        await act(() => result.current.fetchNextPage());
        await waitFor(() => expect(result.current.hasNextPage).toBe(false));
        expect(result.current.documents.map((item) => item.id)).toEqual([
            textId,
        ]);
        await act(() => result.current.restore.mutateAsync(document));
        const mutation = vi
            .mocked(fetch)
            .mock.calls.find(([, options]) => options?.method === 'POST');
        expect(mutation?.[0]).toBe(`/api/texts/${textId}/restore`);
        expect(JSON.parse(String(mutation?.[1]?.body))).toEqual({
            expectedVersion: 4,
        });
        unmount();
        client.clear();
    });
    it('does not call the owner API while signed out', async () => {
        useSessionStore.getState().signOut();
        const { client, wrapper } = setup();
        const { result, unmount } = renderHook(() => useTextLibrary(request), {
            wrapper,
        });
        expect(result.current.fetchStatus).toBe('idle');
        expect(fetch).not.toHaveBeenCalled();
        unmount();
        client.clear();
    });
});
