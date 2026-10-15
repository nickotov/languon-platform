import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthUserSchema } from '@languon/contracts';
import { useSessionStore } from '@/fsd/entities/session';
import { useTextShare } from '@/fsd/features/text-management/hooks/use-text-share';
import { useTextMutation } from '@/fsd/features/text-management/hooks/use-text-mutation';

vi.mock('@/fsd/shared/i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));
vi.mock('@/fsd/shared/ui/toast/toast', () => ({ showToast: vi.fn() }));
const ownerId = '10000000-0000-4000-8000-000000000001';
const resourceId = '10000000-0000-4000-8000-000000000003';
const timestamp = '2026-10-15T00:00:00.000Z';
const resource = {
    id: resourceId,
    name: 'Reading',
    description: null,
    lifecycle: 'active' as const,
    version: 4,
    createdAt: timestamp,
    updatedAt: timestamp,
    isShared: true,
};
const capability = { shareId: 'share-locator-1234', key: 'k'.repeat(43) };
const request = <T,>(operation: (token: string) => Promise<T>) =>
    operation('test-token');
function signIn(id: string) {
    useSessionStore.setState({
        status: 'authenticated',
        user: AuthUserSchema.parse({
            id,
            handle: null,
            primaryEmail: 'synthetic@example.test',
            status: 'active',
            emailVerified: true,
            createdAt: timestamp,
        }),
    });
}
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
    return { wrapper: Wrapper, client };
}
beforeEach(() => {
    signIn(ownerId);
    vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
    useSessionStore.getState().signOut();
    vi.unstubAllGlobals();
});
it('issues/revokes an actual versioned capability with fragment-only links and retains it only for this session', async () => {
    vi.mocked(fetch)
        .mockResolvedValueOnce(
            new Response(JSON.stringify({ capability }), {
                headers: { 'content-type': 'application/json' },
            }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const changed = vi.fn();
    const environment = setup();
    const hook = renderHook(
        () => useTextShare('folder', resource, request, changed),
        environment,
    );
    await act(async () => {
        hook.result.current.create();
    });
    await waitFor(() =>
        expect(hook.result.current.capability).toEqual(capability),
    );
    expect(hook.result.current.path).toBe(
        `/shared/text-folders/${capability.shareId}#${capability.key}`,
    );
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
        `/api/text-folders/${resourceId}/share`,
    );
    expect(
        JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)),
    ).toEqual({ expectedVersion: 4 });
    expect(changed).toHaveBeenCalledTimes(1);
    await act(async () => {
        hook.result.current.revoke();
    });
    await waitFor(() => expect(hook.result.current.step).toBe('revoked'));
    expect(hook.result.current.capability).toBeUndefined();
    expect(hook.result.current.active).toBe(false);
    expect(vi.mocked(fetch).mock.calls[1]?.[1]?.method).toBe('DELETE');
    environment.client.clear();
});
it('does not retain or display a late capability when the account changes during creation', async () => {
    let resolve!: (value: Response) => void;
    vi.mocked(fetch).mockReturnValue(
        new Promise((done) => {
            resolve = done;
        }),
    );
    const changed = vi.fn();
    const environment = setup();
    const hook = renderHook(
        () => useTextShare('folder', resource, request, changed),
        environment,
    );
    act(() => hook.result.current.create());
    await act(async () => {
        signIn('10000000-0000-4000-8000-000000000002');
        resolve(
            new Response(JSON.stringify({ capability }), {
                headers: { 'content-type': 'application/json' },
            }),
        );
    });
    await waitFor(() => expect(hook.result.current.busy).toBe(false));
    expect(hook.result.current.path).toBe('');
    expect(changed).not.toHaveBeenCalled();
    await act(async () => {
        signIn(ownerId);
    });
    const second = renderHook(
        () => useTextShare('folder', resource, request),
        environment,
    );
    expect(second.result.current.capability).toBeUndefined();
    environment.client.clear();
});
it('serializes repeated mutation clicks while the same operation is in flight', async () => {
    let finish!: (value: string) => void;
    const operation = vi.fn(
        () =>
            new Promise<string>((resolve) => {
                finish = resolve;
            }),
    );
    const saved = vi.fn();
    const environment = setup();
    const hook = renderHook(() => useTextMutation(request), environment);
    act(() => {
        void hook.result.current.run(operation, saved);
        void hook.result.current.run(operation, saved);
    });
    expect(operation).toHaveBeenCalledTimes(1);
    await act(async () => {
        finish('saved');
    });
    await waitFor(() => expect(saved).toHaveBeenCalledWith('saved'));
    environment.client.clear();
});
