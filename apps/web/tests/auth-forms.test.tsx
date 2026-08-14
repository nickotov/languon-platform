import type { AuthenticationSuccessResponse } from '@languon/contracts';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSessionStore } from '@/fsd/entities/session/model/session-store';
import { AuthProvider, useAuth } from '@/fsd/features/auth/model/auth-provider';
import { LoginForm } from '@/fsd/features/auth/ui/login-form';
import { PasswordField } from '@/fsd/features/auth/ui/password-field';
import { ResetPasswordForm } from '@/fsd/features/auth/ui/reset-password-form';
import { SecuritySettings } from '@/fsd/features/auth/ui/security-settings';
import { SignupForm } from '@/fsd/features/auth/ui/signup-form';
import { VerifyEmailForm } from '@/fsd/features/auth/ui/verify-email-form';
import { authApi } from '@/fsd/shared/api/auth-api';
import { I18nProvider, type Locale } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';
import { ru } from '@/fsd/shared/i18n/messages/ru';

import { render } from './render';

const replace = vi.fn();
const push = vi.fn();
const testCatalogs = { en, ru };

function LocaleSwitcherHarness({ children }: { children: ReactNode }) {
    const [locale, setLocale] = useState<Extract<Locale, 'en' | 'ru'>>('en');
    return (
        <I18nProvider locale={locale} messages={testCatalogs[locale]}>
            <button onClick={() => setLocale('ru')} type='button'>
                Switch test locale
            </button>
            {children}
        </I18nProvider>
    );
}

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push, replace }),
}));

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

describe('authentication forms', () => {
    beforeEach(() => {
        replace.mockReset();
        push.mockReset();
        useSessionStore.getState().signOut();
        vi.spyOn(authApi, 'refresh').mockRejectedValue(new Error('no cookie'));
        vi.spyOn(authApi, 'capabilities').mockResolvedValue({
            email: { passwordRecovery: true, signUp: true, verification: true },
            passkeys: { authentication: false, registration: false },
            passwordAuthentication: true,
        });
    });

    it('allows password paste, exposes autocomplete, and toggles visibility', async () => {
        const user = userEvent.setup();
        render(
            <PasswordField
                autoComplete='new-password'
                label='New password'
                name='password'
            />,
        );
        const input = screen.getByLabelText('New password');

        expect(input).toHaveAttribute('autocomplete', 'new-password');
        await user.click(input);
        await user.paste('a pasted secure phrase');
        expect(input).toHaveValue('a pasted secure phrase');
        await user.click(
            screen.getByRole('button', { name: 'Show new password' }),
        );
        expect(input).toHaveAttribute('type', 'text');
    });

    it('authenticates into memory and rejects an unsafe return path', async () => {
        const user = userEvent.setup();
        vi.spyOn(authApi, 'passwordLogin').mockResolvedValue(response);
        render(
            <AuthProvider>
                <LoginForm returnTo='//attacker.example' />
            </AuthProvider>,
        );

        await user.type(screen.getByLabelText('Email'), 'learner@example.com');
        await user.type(
            screen.getByLabelText('Password'),
            'a very secure password',
        );
        await user.click(screen.getByRole('button', { name: 'Sign in' }));

        await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
        expect(useSessionStore.getState().accessToken).toBe('aaa.bbb.ccc');
        expect(localStorage).toHaveLength(0);
        expect(sessionStorage).toHaveLength(0);
    });

    it('shows contract validation without calling the API', async () => {
        const user = userEvent.setup();
        const login = vi.spyOn(authApi, 'passwordLogin');
        render(
            <AuthProvider>
                <LoginForm />
            </AuthProvider>,
        );

        await screen.findByRole('link', { name: 'Forgot password?' });
        await user.type(screen.getByLabelText('Email'), 'a@b');
        await user.type(screen.getByLabelText('Password'), 'wrong');
        await user.click(screen.getByRole('button', { name: 'Sign in' }));

        expect(await screen.findByRole('alert')).toBeInTheDocument();
        expect(login).not.toHaveBeenCalled();
    });

    it('keeps signup discoverable and shows progress while retrying capabilities', async () => {
        const user = userEvent.setup();
        let resolveRetry:
            | ((
                  value: Awaited<ReturnType<typeof authApi.capabilities>>,
              ) => void)
            | undefined;
        const retry = new Promise<
            Awaited<ReturnType<typeof authApi.capabilities>>
        >((resolve) => {
            resolveRetry = resolve;
        });
        vi.mocked(authApi.capabilities)
            .mockRejectedValueOnce(new Error('backend unavailable'))
            .mockReturnValueOnce(retry);

        render(
            <AuthProvider>
                <LoginForm />
            </AuthProvider>,
        );

        expect(
            await screen.findByText(
                'Authentication options are temporarily unavailable.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Create an account' }),
        ).toHaveAttribute('href', '/signup');

        await user.click(screen.getByRole('button', { name: 'Retry' }));
        expect(
            await screen.findByText('Checking available sign-in methods…'),
        ).toBeInTheDocument();

        resolveRetry?.({
            email: { passwordRecovery: true, signUp: true, verification: true },
            passkeys: { authentication: false, registration: false },
            passwordAuthentication: true,
        });
        expect(
            await screen.findByRole('link', { name: 'Forgot password?' }),
        ).toBeInTheDocument();
    });

    it('keeps a capabilities failure retryable and retranslates it', async () => {
        const user = userEvent.setup();
        vi.mocked(authApi.capabilities).mockRejectedValue(
            new Error('backend unavailable'),
        );

        render(
            <LocaleSwitcherHarness>
                <AuthProvider>
                    <LoginForm />
                </AuthProvider>
            </LocaleSwitcherHarness>,
        );

        expect(
            await screen.findByText(
                'Authentication options are temporarily unavailable.',
            ),
        ).toBeInTheDocument();
        await user.click(
            screen.getByRole('button', { name: 'Switch test locale' }),
        );

        expect(
            await screen.findByText('Способы входа временно недоступны.'),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeEnabled();
        expect(
            screen.queryByText('Проверяем доступные способы входа…'),
        ).not.toBeInTheDocument();
    });

    it('starts a verification flow after signup', async () => {
        const user = userEvent.setup();
        vi.spyOn(authApi, 'signUp').mockResolvedValue({
            status: 'verification_pending',
            verification: {
                expiresAt: '2026-08-13T10:10:00.000Z',
                flowId: '10000000-0000-4000-8000-000000000003',
                resendAvailableAt: '2026-08-13T10:01:00.000Z',
            },
        });
        render(
            <AuthProvider>
                <SignupForm returnTo='/security' />
            </AuthProvider>,
        );

        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: 'Create account' }),
            ).toBeEnabled(),
        );
        await user.type(screen.getByLabelText('Email'), 'Learner@Example.com');
        await user.type(
            screen.getByLabelText('Password'),
            'a very secure password',
        );
        await user.click(
            screen.getByRole('button', { name: 'Create account' }),
        );

        await waitFor(() =>
            expect(push).toHaveBeenCalledWith(
                '/verify-email?flowId=10000000-0000-4000-8000-000000000003&resendAvailableAt=2026-08-13T10%3A01%3A00.000Z&returnTo=%2Fsecurity',
            ),
        );
    });

    it('accepts a verification code into memory and finishes the return journey', async () => {
        const user = userEvent.setup();
        vi.spyOn(authApi, 'verifyEmail').mockResolvedValue(response);
        render(
            <AuthProvider>
                <VerifyEmailForm
                    flowId='10000000-0000-4000-8000-000000000003'
                    returnTo='/security'
                />
            </AuthProvider>,
        );

        await user.type(screen.getByLabelText('Verification code'), '0000');
        await user.click(screen.getByRole('button', { name: 'Verify email' }));

        await waitFor(() => expect(replace).toHaveBeenCalledWith('/security'));
        expect(useSessionStore.getState().user?.primaryEmail).toBe(
            'learner@example.com',
        );
        expect(localStorage).toHaveLength(0);
    });

    it('keeps a replacement verification flow reload-safe after resend', async () => {
        const user = userEvent.setup();
        vi.spyOn(authApi, 'resendVerification').mockResolvedValue({
            status: 'verification_pending',
            verification: {
                expiresAt: '2099-08-13T10:20:00.000Z',
                flowId: '10000000-0000-4000-8000-000000000004',
                resendAvailableAt: '2099-08-13T10:11:00.000Z',
            },
        });
        render(
            <AuthProvider>
                <VerifyEmailForm
                    flowId='10000000-0000-4000-8000-000000000003'
                    returnTo='/security'
                />
            </AuthProvider>,
        );

        await user.click(
            screen.getByRole('button', { name: 'Send a new code' }),
        );

        await waitFor(() =>
            expect(replace).toHaveBeenCalledWith(
                '/verify-email?flowId=10000000-0000-4000-8000-000000000004&resendAvailableAt=2099-08-13T10%3A11%3A00.000Z&returnTo=%2Fsecurity',
            ),
        );
        expect(
            screen.getByRole('button', { name: /Send a new code in/ }),
        ).toBeDisabled();
    });

    it('clears local authentication and returns to login after password reset', async () => {
        const user = userEvent.setup();
        useSessionStore.getState().authenticate(response);
        vi.spyOn(authApi, 'resetPassword').mockResolvedValue({
            status: 'password_reset',
        });
        render(
            <AuthProvider>
                <ResetPasswordForm flowId='10000000-0000-4000-8000-000000000003' />
            </AuthProvider>,
        );

        await user.type(screen.getByLabelText('Recovery code'), '0000');
        await user.type(
            screen.getByLabelText('New password'),
            'a different secure password',
        );
        await user.click(
            screen.getByRole('button', { name: 'Change password' }),
        );

        await waitFor(() =>
            expect(replace).toHaveBeenCalledWith(
                '/login?passwordReset=complete',
            ),
        );
        expect(useSessionStore.getState().status).toBe('signed-out');
    });

    it('keeps local state when the server cannot confirm logout', async () => {
        const user = userEvent.setup();
        vi.mocked(authApi.refresh).mockResolvedValue(response);
        vi.spyOn(authApi, 'logout').mockRejectedValue(new Error('offline'));

        function LogoutProbe() {
            const { signOutHere } = useAuth();
            const [failed, setFailed] = useState(false);
            return (
                <>
                    <button
                        onClick={() =>
                            void signOutHere().catch(() => setFailed(true))
                        }
                        type='button'
                    >
                        Logout
                    </button>
                    {failed ? <span>failed</span> : null}
                </>
            );
        }

        render(
            <AuthProvider>
                <LogoutProbe />
            </AuthProvider>,
        );
        await waitFor(() =>
            expect(useSessionStore.getState().status).toBe('authenticated'),
        );
        await user.click(screen.getByRole('button', { name: 'Logout' }));

        expect(await screen.findByText('failed')).toBeInTheDocument();
        expect(useSessionStore.getState().status).toBe('authenticated');
    });

    it('prevents duplicate password-change submissions while pending', async () => {
        const user = userEvent.setup();
        vi.mocked(authApi.refresh).mockResolvedValue(response);
        vi.spyOn(authApi, 'listPasskeys').mockResolvedValue({ passkeys: [] });
        let resolveChange!: (value: AuthenticationSuccessResponse) => void;
        const change = vi.spyOn(authApi, 'changePassword').mockImplementation(
            () =>
                new Promise<AuthenticationSuccessResponse>((resolve) => {
                    resolveChange = resolve;
                }),
        );
        render(
            <AuthProvider>
                <SecuritySettings />
            </AuthProvider>,
        );
        await screen.findByRole('heading', { name: 'Change password' });
        expect(screen.getByLabelText('Email')).toHaveAttribute(
            'autocomplete',
            'username',
        );
        expect(screen.getByLabelText('Email')).toHaveValue(
            'learner@example.com',
        );
        await user.type(
            screen.getByLabelText('Current password'),
            'the current password',
        );
        await user.type(
            screen.getByLabelText('New password'),
            'a different secure password',
        );
        await user.click(
            screen.getByRole('button', { name: 'Change password' }),
        );

        const pendingButton = screen.getByRole('button', {
            name: 'Changing password…',
        });
        expect(pendingButton).toBeDisabled();
        expect(pendingButton.closest('form')).toHaveAttribute(
            'aria-busy',
            'true',
        );
        await user.click(pendingButton);
        expect(change).toHaveBeenCalledOnce();

        resolveChange(response);
        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: 'Change password' }),
            ).toBeEnabled(),
        );
    });
});
