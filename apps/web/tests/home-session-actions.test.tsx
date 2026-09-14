import type { AuthenticationSuccessResponse } from '@languon/contracts';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSessionStore } from '@/fsd/entities/session/model/session-store';
import { AuthProvider } from '@/fsd/features/auth/model/auth-provider';
import { HomeSessionActions } from '@/fsd/features/auth/ui/home-session-actions';
import { authApi } from '@/fsd/shared/api/auth-api';

import { render } from './render';

const response: AuthenticationSuccessResponse = {
    accessToken: 'aaa.bbb.ccc',
    accessTokenExpiresAt: '2026-08-14T10:00:00.000Z',
    session: {
        authenticatedAt: '2026-08-13T10:00:00.000Z',
        createdAt: '2026-08-13T10:00:00.000Z',
        expiresAt: '2026-08-27T10:00:00.000Z',
        id: '10000000-0000-4000-8000-000000000002',
        recentAuthenticationExpiresAt: '2026-08-13T10:05:00.000Z',
    },
    status: 'authenticated',
    tokenType: 'Bearer',
    user: {
        createdAt: '2026-08-13T10:00:00.000Z',
        emailVerified: true,
        id: '10000000-0000-4000-8000-000000000001',
        primaryEmail: 'learner@example.com',
        status: 'active',
    },
};

describe('HomeSessionActions', () => {
    beforeEach(() => {
        useSessionStore.setState({
            accessToken: null,
            accessTokenExpiresAt: null,
            session: null,
            status: 'bootstrapping',
            user: null,
        });
        vi.spyOn(authApi, 'capabilities').mockResolvedValue({
            email: { passwordRecovery: true, signUp: true, verification: true },
            passkeys: { authentication: true, registration: true },
            passwordAuthentication: true,
        });
    });

    it('shows account navigation after refresh bootstrap', async () => {
        vi.spyOn(authApi, 'refresh').mockResolvedValue(response);
        render(
            <AuthProvider>
                <HomeSessionActions />
            </AuthProvider>,
        );

        expect(
            await screen.findByRole('link', { name: 'Security settings' }),
        ).toHaveAttribute('href', '/security');
        expect(
            screen.getByRole('link', { name: 'Dictionaries' }),
        ).toHaveAttribute('href', '/dictionaries');
        expect(
            screen.getByRole('link', { name: 'Account settings' }),
        ).toHaveAttribute('href', '/profile');
        expect(screen.getByText(/learner@example.com/)).toBeInTheDocument();
    });
});
