import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/fsd/entities/session';
import { CreditBalance } from '@/fsd/pages/profile/ui/credit-balance/credit-balance';
import { creditBalanceApi } from '@/fsd/pages/profile/api/credit-balance-api';
import { render } from './render';

vi.mock('@/fsd/features/auth', () => ({
    useAuth: () => ({
        requestWithSession: (operation: (token: string) => Promise<unknown>) =>
            operation('synthetic-token'),
    }),
}));
function mount() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return render(
        <QueryClientProvider client={client}>
            <CreditBalance />
        </QueryClientProvider>,
    );
}
beforeEach(() => {
    useSessionStore.setState({
        status: 'authenticated',
        user: {
            id: '00000000-0000-4000-8000-000000000001',
            primaryEmail: 'balance@example.test',
            handle: null,
            createdAt: '2026-10-25T00:00:00Z',
            emailVerified: true,
            status: 'active',
        },
    });
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useSessionStore.getState().signOut();
});
it.each([
    ['0', '0'],
    ['0.001', '<0.01'],
    ['20.125', '20.13'],
])(
    'displays available %s credits without losing exact precision',
    async (availableCredits, label) => {
        vi.spyOn(creditBalanceApi, 'read').mockResolvedValue({
            mode: 'limited',
            availableCredits,
        });
        mount();
        expect(
            await screen.findByText(`Exact balance: ${availableCredits}`),
        ).toBeVisible();
        expect(screen.getByText(label, { selector: 'dd' })).toBeVisible();
    },
);
it('supports unlimited accounts without a fabricated numeric balance', async () => {
    vi.spyOn(creditBalanceApi, 'read').mockResolvedValue({
        mode: 'unlimited',
        availableCredits: null,
    });
    mount();
    expect(await screen.findByText('Unlimited')).toBeVisible();
    expect(screen.queryByText(/Exact balance:/)).not.toBeInTheDocument();
});
it('shows a recoverable error rather than zero and refreshes the current balance', async () => {
    const read = vi
        .spyOn(creditBalanceApi, 'read')
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({ mode: 'limited', availableCredits: '3.125' });
    mount();
    expect(
        await screen.findByText(
            'Could not load your balance. Use Refresh to try again.',
        ),
    ).toHaveTextContent('Could not load your balance');
    expect(screen.queryByText('0', { selector: 'dd' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('Exact balance: 3.125')).toBeVisible();
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
});
it('does not show a previous learner balance after an account switch', async () => {
    vi.spyOn(creditBalanceApi, 'read')
        .mockResolvedValueOnce({ mode: 'limited', availableCredits: '20.125' })
        .mockImplementationOnce(() => new Promise(() => {}));
    mount();
    expect(await screen.findByText('Exact balance: 20.125')).toBeVisible();
    const { act } = await import('@testing-library/react');
    act(() =>
        useSessionStore.setState({
            user: {
                ...useSessionStore.getState().user!,
                id: '00000000-0000-4000-8000-000000000002',
            },
        }),
    );
    expect(screen.queryByText('Exact balance: 20.125')).not.toBeInTheDocument();
    expect(screen.getByText('Loading your balance…')).toBeVisible();
});
