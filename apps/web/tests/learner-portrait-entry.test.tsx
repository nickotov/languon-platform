import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthUser, PortraitState } from '@languon/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/fsd/entities/session';
import { PortraitEntryCard } from '@/fsd/features/portrait-entry';
import type * as LearnerPortraitEntity from '@/fsd/entities/learner-portrait';
import { render } from './render';

const mock = vi.hoisted(() => ({
    state: null as PortraitState | null,
    interview: null as { id: string; locale: 'en'; expiresAt: string } | null,
    error: false,
    refetch: vi.fn(),
    setUse: vi.fn(),
    setCache: vi.fn(),
}));
vi.mock('@/fsd/entities/learner-portrait', async (importOriginal) => ({
    ...(await importOriginal<typeof LearnerPortraitEntity>()),
    usePortraitState: () => ({
        data: mock.state,
        isPending: false,
        isError: mock.error,
        refetch: mock.refetch,
    }),
    usePortraitInterviewStatus: () => ({
        data: { interview: mock.interview, creditsBypass: true },
        isPending: false,
        isError: false,
        refetch: mock.refetch,
    }),
    portraitApi: { setUse: mock.setUse },
    setPortraitStateCache: mock.setCache,
}));
const ownerId = '10000000-0000-4000-8000-000000000001';
const items = {
    languages: [],
    explanationLanguages: [],
    goals: ['Travel'],
    accommodations: [],
    hobbies: [],
};
const requestWithSession = <T,>(operation: (token: string) => Promise<T>) =>
    operation('fixture-token');
function mount() {
    const client = new QueryClient();
    render(
        <QueryClientProvider client={client}>
            <PortraitEntryCard
                variant='dashboard'
                requestWithSession={requestWithSession}
            />
        </QueryClientProvider>,
    );
    return client;
}
beforeEach(() => {
    vi.clearAllMocks();
    mock.error = false;
    mock.interview = null;
    mock.state = {
        version: 0,
        approvedVersion: 0,
        generation: 0,
        useEnabled: false,
        approved: null,
        draft: null,
    };
    useSessionStore.setState({ user: { id: ownerId } as AuthUser });
});

describe('portrait entry real states', () => {
    it('offers both optional creation paths while empty', () => {
        mount();
        expect(
            screen.getByRole('link', { name: 'Start interview' }),
        ).toHaveAttribute('href', '/portrait/intro');
        expect(
            screen.getByRole('link', { name: 'Fill it in myself' }),
        ).toHaveAttribute('href', '/portrait/manual');
    });
    it('keeps a manual draft recoverable without inventing an interview', () => {
        mock.state!.draft = {
            items,
            locale: 'en',
            summary: 'You learn for travel.',
            baseApprovedVersion: 0,
            updatedAt: '2026-10-21T10:00:00.000Z',
            expiresAt: '2026-11-04T10:00:00.000Z',
        };
        mount();
        expect(
            screen.getByRole('heading', {
                name: 'Your draft is ready to review',
            }),
        ).toBeVisible();
        expect(
            screen.getByRole('link', { name: 'Review draft' }),
        ).toHaveAttribute('href', '/portrait/review');
        expect(
            screen.queryByRole('link', { name: 'Resume interview' }),
        ).not.toBeInTheDocument();
    });
    it('shows resumable interview actions with real expiry', () => {
        mock.interview = {
            id: 'interview-fixture',
            locale: 'en',
            expiresAt: '2026-11-04T10:00:00.000Z',
        };
        mount();
        expect(
            screen.getByRole('link', { name: 'Resume interview' }),
        ).toHaveAttribute('href', '/portrait/interview');
        expect(
            screen.getByRole('link', { name: 'Review draft' }),
        ).toBeVisible();
    });
    it('only enables through an explicit action and refreshes chat preference caches', async () => {
        mock.state = {
            ...mock.state!,
            version: 3,
            approvedVersion: 1,
            approved: {
                items,
                locale: 'en',
                summary: 'You learn for travel.',
                updatedAt: '2026-10-21T10:00:00.000Z',
            },
        };
        mock.setUse.mockResolvedValue({
            ...mock.state,
            version: 4,
            useEnabled: true,
        });
        const client = mount();
        const invalidate = vi.spyOn(client, 'invalidateQueries');
        expect(mock.setUse).not.toHaveBeenCalled();
        await userEvent.click(
            screen.getByRole('button', { name: 'Use my portrait' }),
        );
        await waitFor(() =>
            expect(mock.setUse).toHaveBeenCalledWith('fixture-token', {
                expectedVersion: 3,
                enabled: true,
            }),
        );
        expect(invalidate).toHaveBeenCalledWith({
            queryKey: ['conversations', ownerId],
        });
        expect(invalidate).toHaveBeenCalledWith({
            queryKey: ['conversation', ownerId],
        });
    });
    it('offers a real retry when discovery fails', async () => {
        mock.error = true;
        mount();
        await userEvent.click(
            screen.getByRole('button', { name: 'Try again' }),
        );
        expect(mock.refetch).toHaveBeenCalledTimes(2);
    });
});
