import type { AuthenticationSuccessResponse } from '@languon/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { useSyncExternalStore } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSessionStore } from '@/fsd/entities/session/model/session-store';
import { AuthProvider } from '@/fsd/features/auth';
import { ProfilePage } from '@/fsd/pages/profile';
import { AuthApiError, authApi } from '@/fsd/shared/api/auth-api';
import { ToastHost } from '@/fsd/shared/ui';

import { render } from './render';

const replace = vi.fn((path: string) => {
    window.history.replaceState(null, '', path);
    window.dispatchEvent(new Event('popstate'));
});
vi.mock('next/navigation', async () => {
    const { useSyncExternalStore: syncStore } = await vi.importActual<{
        useSyncExternalStore: typeof useSyncExternalStore;
    }>('react');
    return {
        useRouter: () => ({ replace }),
        useSearchParams: () => {
            const search = syncStore(
                (notify) => {
                    window.addEventListener('popstate', notify);
                    return () => window.removeEventListener('popstate', notify);
                },
                () => window.location.search,
            );
            return new URLSearchParams(search);
        },
    };
});

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
        handle: null,
        id: '10000000-0000-4000-8000-000000000001',
        primaryEmail: 'profile@example.test',
        status: 'active',
    },
};

const originalShowModal = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;

describe('ProfilePage', () => {
    beforeEach(() => {
        HTMLDialogElement.prototype.showModal = function () {
            this.setAttribute('open', '');
        };
        HTMLDialogElement.prototype.close = function () {
            this.removeAttribute('open');
            this.dispatchEvent(new Event('close'));
        };
        useSessionStore.getState().signOut();
        window.history.replaceState(null, '', '/profile');
        replace.mockClear();
        vi.spyOn(authApi, 'refresh').mockResolvedValue(response);
        vi.spyOn(authApi, 'capabilities').mockResolvedValue({
            email: { passwordRecovery: true, signUp: true, verification: true },
            passkeys: { authentication: true, registration: true },
            passwordAuthentication: true,
        });
        vi.spyOn(authApi, 'listPasskeys').mockResolvedValue({ passkeys: [] });
    });
    afterEach(() => {
        HTMLDialogElement.prototype.showModal = originalShowModal;
        HTMLDialogElement.prototype.close = originalClose;
    });

    it('offers signed-out users a return-aware sign-in link', () => {
        render(<ProfilePage />);
        expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
            'href',
            '/login?returnTo=/profile',
        );
    });

    it('returns signed-out users to the requested Security tab', () => {
        window.history.replaceState(null, '', '/profile?tab=security');
        render(<ProfilePage />);
        expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
            'href',
            '/login?returnTo=%2Fprofile%3Ftab%3Dsecurity',
        );
    });

    it('keeps session restoration explicit while bootstrapping', () => {
        useSessionStore.setState({ status: 'bootstrapping' });
        render(<ProfilePage />);
        expect(screen.getByText('Loading your account…')).toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'Sign in' }),
        ).not.toBeInTheDocument();
    });

    it('shows real identity and honest empty account data', async () => {
        useSessionStore.getState().authenticate(response);
        const user = userEvent.setup();
        render(
            <AuthProvider>
                <ProfilePage />
                <ToastHost label='Notifications' />
            </AuthProvider>,
        );

        expect(screen.getByText('profile@example.test')).toBeInTheDocument();
        expect(screen.getAllByText('Not available yet')).toHaveLength(2);
        expect(screen.queryByText(/Anna/i)).not.toBeInTheDocument();

        await user.click(screen.getByRole('tab', { name: /Billing/ }));
        expect(replace).toHaveBeenCalledWith('/profile?tab=billing', {
            scroll: false,
        });
        expect(
            screen.getAllByText(
                'No payment method is stored. Billing is coming soon.',
            ),
        ).toHaveLength(2);
        await user.click(screen.getByRole('button', { name: 'Compare plans' }));
        expect(
            screen.getByText('Subscription is coming soon.'),
        ).toBeInTheDocument();

        await user.click(screen.getByRole('tab', { name: /Security/ }));
        expect(replace).toHaveBeenCalledWith('/profile?tab=security', {
            scroll: false,
        });
        expect(
            screen.getByRole('heading', { name: 'Change password' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('heading', { name: 'Passkeys' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('heading', { name: 'Sessions' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'Manage security' }),
        ).not.toBeInTheDocument();
        await user.click(
            screen.getByRole('button', { name: 'Request email change' }),
        );
        expect(
            screen.getByText(
                /no email was sent and your address was not changed/i,
            ),
        ).toBeInTheDocument();
        expect(useSessionStore.getState().user?.primaryEmail).toBe(
            'profile@example.test',
        );
    });

    it('opens Security directly for an authenticated user', () => {
        window.history.replaceState(null, '', '/profile?tab=security');
        useSessionStore.getState().authenticate(response);
        render(
            <AuthProvider>
                <ProfilePage />
            </AuthProvider>,
        );
        expect(screen.getByRole('tab', { name: /Security/ })).toHaveAttribute(
            'aria-selected',
            'true',
        );
        expect(
            screen.getByRole('heading', { name: 'Change password' }),
        ).toBeInTheDocument();
    });

    it('saves a canonical handle and updates the signed-in identity', async () => {
        useSessionStore.getState().authenticate(response);
        const update = vi
            .spyOn(authApi, 'updateHandle')
            .mockResolvedValue({ handle: 'learner_42' });
        render(
            <AuthProvider>
                <ProfilePage />
            </AuthProvider>,
        );
        const user = userEvent.setup();
        await user.type(
            screen.getByRole('textbox', { name: 'Unique handle' }),
            'Learner_42',
        );
        await user.click(screen.getByRole('button', { name: 'Save handle' }));
        expect(update).toHaveBeenCalledWith(
            { handle: 'learner_42' },
            expect.any(String),
        );
        expect(await screen.findByText('@learner_42')).toBeInTheDocument();
        expect(useSessionStore.getState().user?.handle).toBe('learner_42');
    });

    it('preserves the handle draft after an authoritative duplicate conflict and blocks invalid input', async () => {
        useSessionStore.getState().authenticate(response);
        const update = vi.spyOn(authApi, 'updateHandle').mockRejectedValueOnce(
            new AuthApiError(409, {
                code: 'conflict',
                message: 'Already claimed',
            }),
        );
        render(
            <AuthProvider>
                <ProfilePage />
            </AuthProvider>,
        );
        const user = userEvent.setup();
        const field = screen.getByRole('textbox', { name: 'Unique handle' });
        await user.type(field, 'claimed');
        await user.click(screen.getByRole('button', { name: 'Save handle' }));
        expect(await screen.findByText(/handle is taken/i)).toBeInTheDocument();
        expect(field).toHaveValue('claimed');
        expect(useSessionStore.getState().user?.handle).toBeNull();
        await user.clear(field);
        await user.type(field, 'x');
        await user.click(screen.getByRole('button', { name: 'Save handle' }));
        expect(await screen.findByText(/Use 3–30/i)).toBeInTheDocument();
        expect(update).toHaveBeenCalledOnce();
    });

    it('requires typed confirmation, schedules removal, and ends the local session', async () => {
        useSessionStore.getState().authenticate(response);
        const schedule = vi
            .spyOn(authApi, 'scheduleAccountDeletion')
            .mockResolvedValue({
                purgeAt: '2026-10-15T09:00:00.000Z',
                scheduledAt: '2026-09-15T09:00:00.000Z',
                status: 'deletion_scheduled',
            });
        render(
            <AuthProvider>
                <ProfilePage />
            </AuthProvider>,
        );
        const user = userEvent.setup();
        await user.click(
            screen.getByRole('button', { name: 'Delete account' }),
        );
        expect(
            screen.getByRole('button', { name: 'Schedule account removal' }),
        ).toBeDisabled();
        await user.type(
            screen.getByRole('textbox', { name: 'Type DELETE to confirm' }),
            'DELETE',
        );
        await user.click(
            screen.getByRole('button', { name: 'Schedule account removal' }),
        );
        expect(schedule).toHaveBeenCalledOnce();
        expect(
            await screen.findByRole('heading', {
                name: 'Account removal scheduled',
            }),
        ).toBeInTheDocument();
        expect(useSessionStore.getState().status).toBe('signed-out');
    });
});
