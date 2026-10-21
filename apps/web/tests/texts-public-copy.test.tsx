import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSessionStore } from '@/fsd/entities/session';
import { textsApi } from '@/fsd/entities/texts';
import { useSharedTextCopy } from '@/fsd/pages/texts/hooks/use-shared-text-copy';
vi.mock('@/fsd/entities/texts', () => ({
    textsApi: {
        listFolders: vi.fn(),
        copySharedText: vi.fn(),
        getText: vi.fn(),
        copySharedFolder: vi.fn(),
        copySharedFolderText: vi.fn(),
    },
}));
const requestWithSession = <T,>(request: (token: string) => Promise<T>) =>
    request('session');
function setup(sessionRequest = requestWithSession) {
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
    const onDone = vi.fn();
    const hook = renderHook(
        () =>
            useSharedTextCopy({
                target: {
                    mode: 'text',
                    textId: 'text',
                    version: 3,
                    total: 1,
                    defaultName: 'My copy',
                },
                kind: 'text',
                shareId: 'share',
                shareKey: 'secret',
                requestWithSession: sessionRequest,
                onDone,
            }),
        { wrapper },
    );
    return { ...hook, onDone, client };
}
describe('public text copy idempotency', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useSessionStore.setState({
            user: { id: 'learner' } as NonNullable<
                ReturnType<typeof useSessionStore.getState>['user']
            >,
            status: 'authenticated',
        });
        vi.mocked(textsApi.listFolders).mockResolvedValue({
            data: [],
            nextCursor: null,
        });
    });
    it('requires a current shared-folder confirmation before copying into it', async () => {
        vi.mocked(textsApi.listFolders).mockResolvedValue({
            data: [
                {
                    id: 'destination',
                    name: 'Shared',
                    lifecycle: 'active',
                    isShared: true,
                    shareId: 'share-target',
                    shareVersion: 2,
                } as never,
            ],
            nextCursor: null,
        });
        vi.mocked(textsApi.copySharedText).mockResolvedValue({
            id: 'new-copy',
        } as never);
        vi.mocked(textsApi.getText).mockResolvedValue({
            text: { folderId: 'destination' },
        } as never);
        const { result } = setup();
        await waitFor(() =>
            expect(result.current.folders.isSuccess).toBe(true),
        );
        act(() => {
            result.current.setDestination('existing');
            result.current.setFolderId('destination');
        });
        expect(result.current.valid).toBe(false);
        await act(async () => {
            await result.current.submit();
        });
        expect(textsApi.copySharedText).not.toHaveBeenCalled();
        act(() => result.current.confirmShare(true));
        await act(async () => {
            await result.current.submit();
        });
        expect(
            vi.mocked(textsApi.copySharedText).mock.calls[0]![3],
        ).toMatchObject({
            folderId: 'destination',
            sharedFolderConfirmation: {
                shareId: 'share-target',
                shareVersion: 2,
            },
        });
    });
    it('locks immediate duplicate clicks and reuses an operation after an ambiguous failure', async () => {
        let reject!: (reason: Error) => void;
        vi.mocked(textsApi.copySharedText).mockImplementationOnce(
            () =>
                new Promise((_resolve, fail) => {
                    reject = fail;
                }),
        );
        const { result, onDone } = setup();
        let pending!: Promise<void>;
        act(() => {
            pending = result.current.submit();
            void result.current.submit();
        });
        expect(textsApi.copySharedText).toHaveBeenCalledTimes(1);
        await act(async () => {
            reject(new Error('network interrupted'));
            await pending;
        });
        expect(result.current.state).toBe('failed');
        vi.mocked(textsApi.copySharedText).mockResolvedValue({
            id: 'copy',
        });
        vi.mocked(textsApi.getText).mockResolvedValue({
            text: { folderId: 'destination' },
        } as Awaited<ReturnType<typeof textsApi.getText>>);
        await act(async () => {
            await result.current.submit();
        });
        const calls = vi.mocked(textsApi.copySharedText).mock.calls;
        expect(calls[0]![3].operationId).toBe(calls[1]![3].operationId);
        expect(calls[1]![3]).toMatchObject({
            folderId: null,
            expectedVersion: 3,
        });
        expect(onDone).toHaveBeenCalledWith('destination');
    });
    it('loads only active owned destinations', async () => {
        setup();
        await waitFor(() => expect(textsApi.listFolders).toHaveBeenCalled());
        expect(vi.mocked(textsApi.listFolders).mock.calls[0]?.[1]).toEqual({
            lifecycle: 'active',
            limit: 100,
        });
    });
    it('invalidates fresh actor-scoped library and folder caches before opening the destination', async () => {
        vi.mocked(textsApi.copySharedText).mockResolvedValue({ id: 'copy' });
        vi.mocked(textsApi.getText).mockResolvedValue({
            text: { folderId: 'destination' },
        } as Awaited<ReturnType<typeof textsApi.getText>>);
        const { result, client, onDone } = setup();
        const library = ['texts', 'learner', 'folders'];
        const folder = ['texts', 'learner', 'folder', 'destination'];
        const other = ['texts', 'other', 'folders'];
        for (const key of [library, folder, other]) {
            client.setQueryDefaults(key, { staleTime: Infinity });
            client.setQueryData(key, { old: true });
        }
        onDone.mockImplementation(() => {
            expect(client.getQueryState(library)?.isInvalidated).toBe(true);
            expect(client.getQueryState(folder)?.isInvalidated).toBe(true);
            expect(client.getQueryState(other)?.isInvalidated).toBe(false);
        });
        await act(async () => {
            await result.current.submit();
        });
        expect(onDone).toHaveBeenCalledWith('destination');
    });
    it('discards late old-account results without invalidating or opening either account’s folder', async () => {
        let resolve!: (value: { id: string }) => void;
        vi.mocked(textsApi.copySharedText).mockImplementationOnce(
            () =>
                new Promise((done) => {
                    resolve = done;
                }),
        );
        const { result, client, onDone } = setup();
        client.setQueryData(['texts', 'learner', 'folders'], []);
        client.setQueryData(['texts', 'other', 'folders'], []);
        let pending!: Promise<void>;
        act(() => {
            pending = result.current.submit();
        });
        act(() => {
            useSessionStore.setState({
                user: { id: 'other' } as NonNullable<
                    ReturnType<typeof useSessionStore.getState>['user']
                >,
            });
        });
        await act(async () => {
            resolve({ id: 'old-copy' });
            await pending;
        });
        expect(textsApi.getText).not.toHaveBeenCalled();
        expect(onDone).not.toHaveBeenCalled();
        expect(
            client.getQueryState(['texts', 'learner', 'folders'])
                ?.isInvalidated,
        ).toBe(false);
        expect(
            client.getQueryState(['texts', 'other', 'folders'])?.isInvalidated,
        ).toBe(false);
        expect(result.current.state).toBe('idle');
    });
    it('does not execute an old operation with a replacement actor token after session refresh waits', async () => {
        let resume!: () => void;
        let requests = 0;
        const sessionRequest = async <T,>(
            request: (token: string) => Promise<T>,
        ) => {
            requests += 1;
            if (requests === 2)
                await new Promise<void>((resolve) => {
                    resume = resolve;
                });
            return request('latest-actor-token');
        };
        const { result, onDone } = setup(sessionRequest);
        await waitFor(() => expect(textsApi.listFolders).toHaveBeenCalled());
        let pending!: Promise<void>;
        act(() => {
            pending = result.current.submit();
        });
        act(() => {
            useSessionStore.setState({
                user: { id: 'other' } as NonNullable<
                    ReturnType<typeof useSessionStore.getState>['user']
                >,
            });
        });
        await act(async () => {
            resume();
            await pending;
        });
        expect(textsApi.copySharedText).not.toHaveBeenCalled();
        expect(onDone).not.toHaveBeenCalled();
    });
});
