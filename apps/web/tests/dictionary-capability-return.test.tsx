import type { AuthenticationSuccessResponse } from '@languon/contracts';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSessionStore } from '@/fsd/entities/session/model/session-store';
import { AuthProvider } from '@/fsd/features/auth/model/auth-provider';
import { LoginForm } from '@/fsd/features/auth/ui/login-form';
import { authApi } from '@/fsd/shared/api/auth-api';
import {
    capabilityReturnFragment,
    preserveCapabilityReturnFragment,
} from '@/fsd/shared/lib/capability-return';

import { render } from './render';

const replace = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push, replace }),
}));

const response: AuthenticationSuccessResponse = {
    accessToken: 'aaa.bbb.ccc',
    accessTokenExpiresAt: '2026-08-22T10:00:00.000Z',
    session: {
        authenticatedAt: '2026-08-21T10:00:00.000Z',
        createdAt: '2026-08-21T10:00:00.000Z',
        expiresAt: '2026-08-28T10:00:00.000Z',
        id: '10000000-0000-4000-8000-000000000002',
        recentAuthenticationExpiresAt: '2026-08-21T10:05:00.000Z',
    },
    status: 'authenticated',
    tokenType: 'Bearer',
    user: {
        createdAt: '2026-08-21T10:00:00.000Z',
        emailVerified: true,
        id: '10000000-0000-4000-8000-000000000001',
        primaryEmail: 'reader@example.com',
        status: 'active',
    },
};

describe('shared dictionary capability return', () => {
    const destination = '/shared/dictionaries/share-locator-1234';
    const key = 'k'.repeat(43);

    beforeEach(() => {
        replace.mockReset();
        push.mockReset();
        useSessionStore.getState().signOut();
        window.history.replaceState(
            {},
            '',
            `/login?returnTo=${encodeURIComponent(destination)}#${key}`,
        );
        vi.spyOn(authApi, 'refresh').mockRejectedValue(new Error('no cookie'));
        vi.spyOn(authApi, 'capabilities').mockResolvedValue({
            email: { passwordRecovery: true, signUp: true, verification: true },
            passkeys: { authentication: false, registration: false },
            passwordAuthentication: true,
        });
    });

    it('accepts only a narrowly valid shared destination and capability fragment', () => {
        expect(capabilityReturnFragment(destination)).toBe(`#${key}`);
        expect(capabilityReturnFragment('/security')).toBe('');
        expect(capabilityReturnFragment(destination, '#not-long-enough')).toBe(
            '',
        );
    });

    it('keeps the key after the authentication URL so it never enters a query', () => {
        const verification = preserveCapabilityReturnFragment(
            `/verify-email?${new URLSearchParams({
                flowId: 'flow',
                returnTo: destination,
            }).toString()}`,
            destination,
        );
        const [requestUrl, fragment] = verification.split('#');
        expect(requestUrl).not.toContain(key);
        expect(
            new URL(requestUrl!, 'https://languon.test').searchParams.get(
                'returnTo',
            ),
        ).toBe(destination);
        expect(fragment).toBe(key);
    });

    it('returns an authenticated reader to the same fragment capability', async () => {
        const user = userEvent.setup();
        vi.spyOn(authApi, 'passwordLogin').mockResolvedValue(response);
        render(
            <AuthProvider>
                <LoginForm returnTo={destination} />
            </AuthProvider>,
        );
        await screen.findByRole('link', { name: 'Forgot password?' });
        await user.type(screen.getByLabelText('Email'), 'reader@example.com');
        await user.type(
            screen.getByLabelText('Password'),
            'a very secure password',
        );
        await user.click(screen.getByRole('button', { name: 'Sign in' }));
        await waitFor(() =>
            expect(replace).toHaveBeenCalledWith(`${destination}#${key}`),
        );
    });
});
