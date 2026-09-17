import type { AuthenticationSuccessResponse } from '@languon/contracts';
import { render as renderWithProviders, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { useSyncExternalStore } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSessionStore } from '@/fsd/entities/session/model/session-store';
import { AuthProvider } from '@/fsd/features/auth';
import { ProfilePage } from '@/fsd/pages/profile';
import { AuthApiError, authApi } from '@/fsd/shared/api/auth-api';
import { I18nProvider } from '@/fsd/shared/i18n';
import { en, type Messages } from '@/fsd/shared/i18n/messages/en';
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
        // A refresh racing a handle save must reflect the current server-side
        // identity, not replay a stale fixture with handle: null.
        vi.spyOn(authApi, 'refresh').mockImplementation(async () => ({
            ...response,
            user: useSessionStore.getState().user ?? response.user,
        }));
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
        expect(screen.getByRole('combobox', { name: 'Interface language' })).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: 'Full name' })).toBeDisabled();

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
        expect(screen.getByRole('heading', { name: 'Sign-in methods' })).toBeInTheDocument();
        for (const provider of ['Google', 'Yandex', 'Apple']) {
            expect(screen.getByRole('heading', { name: new RegExp(`^${provider}`) })).toBeInTheDocument();
        }
        expect(screen.getAllByRole('button', { name: 'Connect' })).toHaveLength(3);
        for (const button of screen.getAllByRole('button', { name: 'Connect' })) expect(button).toBeDisabled();
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

    it('renders Account labels, removal copy, and Security when a serialized catalog is incomplete', async () => {
        useSessionStore.getState().authenticate(response);
        const messages = Object.fromEntries(
            Object.entries(en).filter(([key]) => ![
                'profile.fullName',
                'profile.interfaceLanguage',
                'profile.learningLanguage',
                'profile.timeZone',
                'profile.handleLabel',
                'profile.deleteConfirmLabel',
                'profile.deleteAcknowledge',
                'security.revokePasskeyDescription',
            ].includes(key)),
        ) as Messages;
        renderWithProviders(
            <I18nProvider locale='en' messages={messages}>
                <AuthProvider><ProfilePage /></AuthProvider>
            </I18nProvider>,
        );
        const user = userEvent.setup();
        expect(screen.getByRole('textbox', { name: 'Full name' })).toBeDisabled();
        expect(screen.getByRole('combobox', { name: 'Interface language' })).toBeVisible();
        expect(screen.getByRole('combobox', { name: 'Learning language & level' })).toBeDisabled();
        expect(screen.getByRole('combobox', { name: 'Time zone' })).toBeDisabled();
        expect(screen.getByRole('textbox', { name: 'Username' })).toBeVisible();

        await user.click(screen.getByRole('button', { name: 'Delete account' }));
        expect(screen.getByRole('textbox', { name: 'Type DELETE to confirm' })).toBeVisible();
        expect(screen.getByRole('checkbox', { name: 'I understand access ends now and purge follows.' })).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Keep my account' }));
        await user.click(screen.getByRole('tab', { name: /Security/ }));
        expect(screen.getByRole('heading', { name: 'Passkeys' })).toBeVisible();
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
            screen.getByRole('textbox', { name: 'Username' }),
            'Learner_42',
        );
        await user.click(screen.getByRole('button', { name: 'Save username' }));
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
        const field = screen.getByRole('textbox', { name: 'Username' });
        await user.type(field, 'claimed');
        await user.click(screen.getByRole('button', { name: 'Save username' }));
        expect(await screen.findByText(/username is taken/i)).toBeInTheDocument();
        expect(field).toHaveValue('claimed');
        expect(useSessionStore.getState().user?.handle).toBeNull();
        await user.clear(field);
        await user.type(field, 'x');
        await user.click(screen.getByRole('button', { name: 'Save username' }));
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
        expect(screen.getByRole('button', { name: 'Schedule account removal' })).toBeDisabled();
        await user.click(screen.getByRole('checkbox', { name: /access ends now/i }));
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

    it('keeps a failed passkey rename editable and revokes only after dialog confirmation', async () => {
        window.history.replaceState(null, '', '/profile?tab=security');
        useSessionStore.getState().authenticate(response);
        const passkey = {
            createdAt: '2026-09-14T09:00:00.000Z',
            id: '10000000-0000-4000-8000-000000000003',
            lastUsedAt: null,
            name: 'Laptop',
        };
        vi.spyOn(authApi, 'listPasskeys').mockResolvedValue({ passkeys: [passkey] });
        vi.spyOn(authApi, 'renamePasskey').mockRejectedValue(
            new AuthApiError(503, { code: 'service_unavailable', message: 'Try later' }),
        );
        const revoke = vi.spyOn(authApi, 'revokePasskey').mockResolvedValue({ status: 'passkey_revoked' });
        const user = userEvent.setup();
        render(<AuthProvider><ProfilePage /></AuthProvider>);

        await user.click(await screen.findByRole('button', { name: 'Rename Laptop' }));
        const name = screen.getByRole('textbox', { name: 'New passkey name' });
        await user.clear(name);
        await user.type(name, 'Study laptop');
        await user.click(screen.getByRole('dialog', { name: 'Rename passkey' }).querySelector('button[type="submit"]')!);
        expect(await screen.findByRole('textbox', { name: 'New passkey name' })).toHaveValue('Study laptop');
        expect(await screen.findByRole('alert')).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Cancel', exact: true }));

        await user.click(screen.getByRole('button', { name: 'Revoke Laptop' }));
        expect(screen.getByRole('alertdialog', { name: 'Revoke this passkey?' })).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Keep passkey' }));
        expect(revoke).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'Revoke Laptop' }));
        await user.click(screen.getByRole('button', { name: 'Revoke passkey' }));
        expect(revoke).toHaveBeenCalledWith(passkey.id, expect.any(String));
        expect(await screen.findByText('Passkey removed.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Revoke Laptop' })).not.toBeInTheDocument();
    });
});
