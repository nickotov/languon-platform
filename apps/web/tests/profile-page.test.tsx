import type { AuthenticationSuccessResponse } from '@languon/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { useSessionStore } from '@/fsd/entities/session/model/session-store';
import { ProfilePage } from '@/fsd/pages/profile';
import { ToastHost } from '@/fsd/shared/ui';

import { render } from './render';

const response: AuthenticationSuccessResponse = {
    accessToken: 'aaa.bbb.ccc',
    accessTokenExpiresAt: '2026-09-14T10:00:00.000Z',
    session: {
        authenticatedAt: '2026-09-14T09:00:00.000Z',
        createdAt: '2026-09-14T09:00:00.000Z',
        expiresAt: '2026-09-28T09:00:00.000Z',
        id: '10000000-0000-4000-8000-000000000002',
        recentAuthenticationExpiresAt: '2026-09-14T09:05:00.000Z',
    },
    status: 'authenticated',
    tokenType: 'Bearer',
    user: {
        createdAt: '2026-09-14T09:00:00.000Z',
        emailVerified: true,
        id: '10000000-0000-4000-8000-000000000001',
        primaryEmail: 'profile@example.test',
        status: 'active',
    },
};

describe('ProfilePage', () => {
    beforeEach(() => useSessionStore.getState().signOut());

    it('offers signed-out users a return-aware sign-in link', () => {
        render(<ProfilePage />);
        expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
            'href',
            '/login?returnTo=/profile',
        );
    });

    it('keeps session restoration explicit while bootstrapping', () => {
        useSessionStore.setState({ status: 'bootstrapping' });
        render(<ProfilePage />);
        expect(screen.getByText('Loading your account…')).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
    });

    it('shows real identity and honest empty account data', async () => {
        useSessionStore.getState().authenticate(response);
        const user = userEvent.setup();
        render(
            <>
                <ProfilePage />
                <ToastHost label='Notifications' />
            </>,
        );

        expect(screen.getByText('profile@example.test')).toBeInTheDocument();
        expect(screen.getAllByText('Not available yet')).toHaveLength(2);
        expect(screen.queryByText(/Anna/i)).not.toBeInTheDocument();

        await user.click(screen.getByRole('tab', { name: /Billing/ }));
        expect(
            screen.getAllByText(
                'No payment method is stored. Billing is coming soon.',
            ),
        ).toHaveLength(2);
        await user.click(screen.getByRole('button', { name: 'Compare plans' }));
        expect(screen.getByText('Subscription is coming soon.')).toBeInTheDocument();

        await user.click(screen.getByRole('tab', { name: /Security/ }));
        expect(screen.getAllByRole('link', { name: 'Manage security' })[0]).toHaveAttribute('href', '/security');
    });
});
