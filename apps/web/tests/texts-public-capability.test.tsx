import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { textsApi } from '@/fsd/entities/texts';
import { useSharedText } from '@/fsd/pages/texts/hooks/use-shared-text';
vi.mock('@/fsd/entities/session', () => ({
    useSessionStore: (select: (state: unknown) => unknown) =>
        select({ user: null }),
}));
vi.mock('@/fsd/entities/texts', () => ({
    textsApi: { readSharedText: vi.fn(), readSharedFolder: vi.fn() },
}));
describe('public text capability isolation', () => {
    afterEach(() => {
        vi.clearAllMocks();
        window.history.replaceState(null, '', '/');
    });
    it('keeps the secret out of query identity and retires data after the fragment changes', async () => {
        const first = 'a'.repeat(43);
        const second = 'b'.repeat(43);
        vi.mocked(textsApi.readSharedText).mockResolvedValue({
            folder: null,
            texts: [],
            nextCursor: null,
        });
        window.history.replaceState(null, '', `/shared/texts/locator#${first}`);
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        function wrapper({ children }: { children: ReactNode }) {
            return (
                <QueryClientProvider client={client}>
                    {children}
                </QueryClientProvider>
            );
        }
        const hook = renderHook(() => useSharedText('text', 'locator'), {
            wrapper,
        });
        await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
        const identity = JSON.stringify(
            client
                .getQueryCache()
                .getAll()
                .map((query) => query.queryKey),
        );
        expect(identity).not.toContain(first);
        act(() => {
            window.history.replaceState(
                null,
                '',
                `/shared/texts/locator#${second}`,
            );
            window.dispatchEvent(new HashChangeEvent('hashchange'));
        });
        await waitFor(() =>
            expect(textsApi.readSharedText).toHaveBeenCalledTimes(2),
        );
        expect(vi.mocked(textsApi.readSharedText).mock.calls[1]?.[1]).toBe(
            second,
        );
        expect(
            JSON.stringify(
                client
                    .getQueryCache()
                    .getAll()
                    .map((query) => query.queryKey),
            ),
        ).not.toContain(second);
        hook.unmount();
        await waitFor(() =>
            expect(client.getQueryCache().getAll()).toHaveLength(0),
        );
    });
    it('does not send a request when the fragment is missing or malformed', async () => {
        window.history.replaceState(null, '', '/shared/texts/locator#invalid');
        const client = new QueryClient();
        function wrapper({ children }: { children: ReactNode }) {
            return (
                <QueryClientProvider client={client}>
                    {children}
                </QueryClientProvider>
            );
        }
        const hook = renderHook(() => useSharedText('text', 'locator'), {
            wrapper,
        });
        await waitFor(() =>
            expect(hook.result.current.initializing).toBe(false),
        );
        expect(textsApi.readSharedText).not.toHaveBeenCalled();
        hook.unmount();
    });
});
