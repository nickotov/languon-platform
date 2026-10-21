import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    act,
    fireEvent,
    renderHook,
    screen,
    waitFor,
} from '@testing-library/react';
import type { AuthUser, PortraitState } from '@languon/contracts';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { portraitApi, portraitQueryKey } from '@/fsd/entities/learner-portrait';
import { useSessionStore } from '@/fsd/entities/session';
import { PortraitEntryCard } from '@/fsd/features/portrait-entry';
import { usePortraitManagement } from '@/fsd/pages/learner-portrait/hooks/use-portrait-management';
import { render } from './render';

vi.mock('@/fsd/features/auth', () => ({
    useAuth: () => ({
        requestWithSession: <T,>(operation: (token: string) => Promise<T>) =>
            operation('fixture-token'),
    }),
}));

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((success, failure) => {
        resolve = success;
        reject = failure;
    });
    return { promise, resolve, reject };
}

const saved: PortraitState = {
    version: 1,
    approvedVersion: 1,
    generation: 0,
    useEnabled: false,
    draft: null,
    approved: {
        items: {
            languages: [],
            explanationLanguages: [],
            goals: ['Travel'],
            accommodations: [],
            hobbies: [],
        },
        locale: 'en',
        summary: 'You learn for travel.',
        updatedAt: '2026-10-21T00:00:00.000Z',
    },
};
const clients: QueryClient[] = [];
function changeOwner(id: string) {
    useSessionStore.setState({
        status: 'authenticated',
        user: { id } as AuthUser,
    });
}
function clientAndWrapper() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    clients.push(client);
    const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return { client, wrapper };
}

beforeEach(() => {
    changeOwner('owner-a');
    vi.spyOn(portraitApi, 'read').mockResolvedValue(saved);
    vi.spyOn(portraitApi, 'readInterviewStatus').mockResolvedValue({
        interview: null,
        creditsBypass: true,
    });
});
afterEach(() => {
    clients.forEach((client) => client.clear());
    clients.length = 0;
    useSessionStore.getState().signOut();
});

describe('portrait management mutation ownership', () => {
    it('leaves a new owner usable and does not let A settlement clear B pending work', async () => {
        const { client, wrapper } = clientAndWrapper();
        const hook = renderHook(() => usePortraitManagement(), { wrapper });
        await waitFor(() =>
            expect(hook.result.current.query.data).toEqual(saved),
        );
        const a = deferred<PortraitState>();
        const b = deferred<PortraitState>();
        const writeA = vi.fn(() => a.promise);
        const writeB = vi.fn(() => b.promise);
        let resultA!: Promise<PortraitState | null>;
        act(() => {
            resultA = hook.result.current.apply(writeA);
        });
        expect(hook.result.current.pending).toBe(true);
        act(() => changeOwner('owner-b'));
        expect(hook.result.current.pending).toBe(false);
        expect(hook.result.current.error).toBeNull();
        let resultB!: Promise<PortraitState | null>;
        act(() => {
            resultB = hook.result.current.apply(writeB);
        });
        expect(hook.result.current.pending).toBe(true);
        await act(async () => {
            a.reject(new Error('A failed'));
            await resultA;
        });
        expect(hook.result.current.pending).toBe(true);
        expect(hook.result.current.error).toBeNull();
        await act(async () => {
            b.resolve({ ...saved, version: 2, useEnabled: true });
            await resultB;
        });
        expect(hook.result.current.pending).toBe(false);
        expect(hook.result.current.error).toBeNull();
        expect(client.getQueryData(portraitQueryKey('owner-b'))).toMatchObject({
            version: 2,
            useEnabled: true,
        });
    });

    it('hides completed errors on owner change, rejects double submits, and fences A→B→A work', async () => {
        const { wrapper } = clientAndWrapper();
        const hook = renderHook(() => usePortraitManagement(), { wrapper });
        await act(async () => {
            await hook.result.current.apply(async () => {
                throw new Error('A failure');
            });
        });
        expect(hook.result.current.error).toBeInstanceOf(Error);
        act(() => changeOwner('owner-b'));
        expect(hook.result.current.error).toBeNull();
        act(() => changeOwner('owner-a'));
        expect(hook.result.current.error).toBeNull();
        const older = deferred<PortraitState>();
        const newer = deferred<PortraitState>();
        const write = vi.fn(() => older.promise);
        let oldResult!: Promise<PortraitState | null>;
        let duplicate!: Promise<PortraitState | null>;
        act(() => {
            oldResult = hook.result.current.apply(write);
            duplicate = hook.result.current.apply(write);
        });
        await expect(duplicate).resolves.toBeNull();
        expect(write).toHaveBeenCalledTimes(1);
        act(() => changeOwner('owner-b'));
        act(() => changeOwner('owner-a'));
        let newResult!: Promise<PortraitState | null>;
        act(() => {
            newResult = hook.result.current.apply(() => newer.promise);
        });
        await act(async () => {
            older.resolve({ ...saved, version: 2 });
            expect(await oldResult).toBeNull();
        });
        expect(hook.result.current.pending).toBe(true);
        expect(hook.result.current.error).toBeNull();
        await act(async () => {
            newer.resolve({ ...saved, version: 3 });
            await newResult;
        });
        expect(hook.result.current.pending).toBe(false);
    });
});

describe('portrait entry mutation ownership', () => {
    function mount() {
        const { client, wrapper: Wrapper } = clientAndWrapper();
        const requestWithSession = <T,>(
            operation: (token: string) => Promise<T>,
        ) => operation('fixture-token');
        render(
            <Wrapper>
                <PortraitEntryCard
                    variant='dashboard'
                    requestWithSession={requestWithSession}
                />
            </Wrapper>,
        );
        return client;
    }
    it('allows B to enable while A is pending and retains B pending when A later fails', async () => {
        const a = deferred<PortraitState>();
        const b = deferred<PortraitState>();
        const write = vi
            .spyOn(portraitApi, 'setUse')
            .mockImplementationOnce(() => a.promise)
            .mockImplementationOnce(() => b.promise);
        const client = mount();
        const first = await screen.findByRole('button', {
            name: 'Use my portrait',
        });
        fireEvent.click(first);
        expect(first).toBeDisabled();
        act(() => changeOwner('owner-b'));
        const second = await screen.findByRole('button', {
            name: 'Use my portrait',
        });
        expect(second).toBeEnabled();
        fireEvent.click(second);
        expect(write).toHaveBeenCalledTimes(2);
        await act(async () => {
            a.reject(new Error('A failure'));
        });
        expect(second).toBeDisabled();
        expect(client.getQueryData(portraitQueryKey('owner-b'))).toMatchObject({
            version: 1,
            useEnabled: false,
        });
        expect(
            screen.queryByText('Nothing changed. Please try again.'),
        ).not.toBeInTheDocument();
        await act(async () => {
            b.resolve({ ...saved, version: 2, useEnabled: true });
        });
        await waitFor(() =>
            expect(screen.getByText('Chats use your portrait')).toBeVisible(),
        );
    });

    it('hides A errors and fences old A work after A→B→A while the new request completes', async () => {
        const older = deferred<PortraitState>();
        const newer = deferred<PortraitState>();
        const write = vi
            .spyOn(portraitApi, 'setUse')
            .mockRejectedValueOnce(new Error('A failure'))
            .mockImplementationOnce(() => older.promise)
            .mockImplementationOnce(() => newer.promise);
        const client = mount();
        fireEvent.click(
            await screen.findByRole('button', { name: 'Use my portrait' }),
        );
        expect(
            await screen.findByText('Nothing changed. Please try again.'),
        ).toBeVisible();
        act(() => changeOwner('owner-b'));
        expect(
            screen.queryByText('Nothing changed. Please try again.'),
        ).not.toBeInTheDocument();
        act(() => changeOwner('owner-a'));
        const oldButton = await screen.findByRole('button', {
            name: 'Use my portrait',
        });
        fireEvent.click(oldButton);
        act(() => changeOwner('owner-b'));
        act(() => changeOwner('owner-a'));
        const newButton = await screen.findByRole('button', {
            name: 'Use my portrait',
        });
        fireEvent.click(newButton);
        expect(write).toHaveBeenCalledTimes(3);
        await act(async () => {
            older.resolve({ ...saved, version: 2, useEnabled: true });
        });
        expect(newButton).toBeDisabled();
        expect(client.getQueryData(portraitQueryKey('owner-a'))).toMatchObject({
            version: 1,
            useEnabled: false,
        });
        expect(
            screen.queryByText('Nothing changed. Please try again.'),
        ).not.toBeInTheDocument();
        await act(async () => {
            newer.resolve({ ...saved, version: 3, useEnabled: true });
        });
        await waitFor(() =>
            expect(screen.getByText('Chats use your portrait')).toBeVisible(),
        );
    });
});
