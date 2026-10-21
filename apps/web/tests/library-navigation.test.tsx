import { StrictMode, useState, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/fsd/entities/session';
import {
    navigationApi,
    useNavigationResources,
    useRecordResourceOpen,
} from '@/fsd/features/library-navigation';
import type { NavigationResource } from '@languon/contracts';
const resource: NavigationResource = {
    kind: 'text',
    id: '20000000-0000-4000-8000-000000000001',
    title: 'Private text',
    href: '/texts/20000000-0000-4000-8000-000000000001',
    pinned: false,
    lastOpenedAt: null,
};
const owner = '10000000-0000-4000-8000-000000000001';
const request = <T,>(operation: (token: string) => Promise<T>) =>
    operation('token');
function wrapper({ children }: { children: ReactNode }) {
    const [client] = useState(
        () =>
            new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    );
    return (
        <StrictMode>
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        </StrictMode>
    );
}
beforeEach(() => {
    useSessionStore.setState({
        status: 'authenticated',
        user: { id: owner } as NonNullable<
            ReturnType<typeof useSessionStore.getState>['user']
        >,
    });
    vi.spyOn(navigationApi, 'opened').mockResolvedValue({ resource });
    vi.spyOn(navigationApi, 'resources').mockResolvedValue({
        resources: [resource],
    });
});
describe('navigation domain client effects', () => {
    it('records a genuine successful open once despite Strict Mode and rerenders', async () => {
        const { rerender } = renderHook(
            ({ loaded }) =>
                useRecordResourceOpen('text', resource.id, loaded, request),
            { initialProps: { loaded: false }, wrapper },
        );
        expect(navigationApi.opened).not.toHaveBeenCalled();
        rerender({ loaded: true });
        await waitFor(() =>
            expect(navigationApi.opened).toHaveBeenCalledOnce(),
        );
        rerender({ loaded: true });
        await act(async () => {});
        expect(navigationApi.opened).toHaveBeenCalledWith(
            'token',
            'text',
            resource.id,
        );
        expect(navigationApi.opened).toHaveBeenCalledOnce();
    });
    it('never records inaccessible/unloaded or signed-out resource views', async () => {
        useSessionStore.setState({ status: 'signed-out', user: null });
        renderHook(
            () => useRecordResourceOpen('text', resource.id, true, request),
            { wrapper },
        );
        await act(async () => {});
        expect(navigationApi.opened).not.toHaveBeenCalled();
    });
    it('passes current resource retention to bounded server shortcuts without recording an open', async () => {
        const { result } = renderHook(
            () =>
                useNavigationResources(
                    {
                        enabled: true,
                        kind: 'text',
                        limit: 4,
                        currentId: resource.id,
                    },
                    request,
                ),
            { wrapper },
        );
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(navigationApi.resources).toHaveBeenCalledWith(
            'token',
            { kind: 'text', limit: 4, currentId: resource.id },
            expect.any(AbortSignal),
        );
        expect(navigationApi.opened).not.toHaveBeenCalled();
    });
    it('does not display another owner’s cached shortcut after switching accounts', async () => {
        const { result } = renderHook(
            () =>
                useNavigationResources(
                    { enabled: true, kind: 'text', limit: 4 },
                    request,
                ),
            { wrapper },
        );
        await waitFor(() =>
            expect(result.current.data?.resources).toEqual([resource]),
        );
        vi.mocked(navigationApi.resources).mockResolvedValue({ resources: [] });
        act(() =>
            useSessionStore.setState({
                user: {
                    id: '10000000-0000-4000-8000-000000000002',
                } as NonNullable<
                    ReturnType<typeof useSessionStore.getState>['user']
                >,
            }),
        );
        expect(result.current.data?.resources).not.toEqual([resource]);
        await waitFor(() => expect(result.current.data?.resources).toEqual([]));
    });
});
