'use client';

import { PasswordLoginRequestSchema } from '@languon/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';

import { authApi } from '@/fsd/shared/api/auth-api';
import { useI18n, useLocaleSensitiveState } from '@/fsd/shared/i18n';
import { safeReturnPath } from '@/fsd/shared/lib/return-path';
import { useSessionStore } from '@/fsd/entities/session/model/session-store';
import { Button, Field, Input } from '@/fsd/shared/ui';

import { getPasskey, supportsPasskeys } from '../lib/webauthn';
import { localizedAuthError } from '../lib/auth-error-message';
import { useAuth } from '../model/auth-provider';
import { AuthLinks, FormMessage } from './auth-shell';
import { CapabilityState } from './capability-state';
import { PasswordField } from './password-field';
import styles from './auth-ui.module.css';

export function LoginForm({
    passwordReset,
    returnTo,
}: {
    passwordReset?: string | undefined;
    returnTo?: string | undefined;
}) {
    const { href, t } = useI18n();
    const router = useRouter();
    const { authenticate, capabilities } = useAuth();
    const [error, setError] = useLocaleSensitiveState<string | null>(null);
    const [pending, setPending] = useState<'passkey' | 'password' | null>(null);
    const [passkeySupported, setPasskeySupported] = useState(false);
    const sessionStatus = useSessionStore((state) => state.status);
    const destination = safeReturnPath(returnTo);

    useEffect(() => setPasskeySupported(supportsPasskeys()), []);

    async function submitPassword(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (sessionStatus === 'bootstrapping') return;
        setError(null);
        const data = new FormData(event.currentTarget);
        const parsed = PasswordLoginRequestSchema.safeParse({
            email: data.get('email'),
            password: data.get('password'),
        });
        if (!parsed.success) {
            setError(t('login.invalid'));
            return;
        }

        setPending('password');
        try {
            const response = await authenticate(
                () => authApi.passwordLogin(parsed.data),
                (result) =>
                    result.status === 'authenticated' ? result : undefined,
            );
            if (response.status === 'email_verification_required') {
                const query = new URLSearchParams({
                    flowId: response.verification.flowId,
                    resendAvailableAt: response.verification.resendAvailableAt,
                    returnTo: destination,
                });
                router.push(href(`/verify-email?${query.toString()}`));
                return;
            }
            router.replace(href(destination));
        } catch (caught) {
            setError(localizedAuthError(caught, t));
        } finally {
            setPending(null);
        }
    }

    async function submitPasskey() {
        if (sessionStatus === 'bootstrapping') return;
        setError(null);
        setPending('passkey');
        try {
            await authenticate(
                async () => {
                    const ceremony =
                        await authApi.passkeyAuthenticationOptions();
                    const credential = await getPasskey(ceremony.options);
                    return authApi.verifyPasskeyAuthentication({
                        credential,
                        flowId: ceremony.flowId,
                    });
                },
                (result) => result,
            );
            router.replace(href(destination));
        } catch (caught) {
            setError(localizedAuthError(caught, t));
        } finally {
            setPending(null);
        }
    }

    return (
        <>
            <p className={styles.intro}>{t('login.intro')}</p>
            {passwordReset === 'complete' ? (
                <FormMessage tone='success'>
                    {t('login.passwordResetComplete')}
                </FormMessage>
            ) : null}
            <CapabilityState />
            {error ? <FormMessage>{error}</FormMessage> : null}
            <form
                aria-busy={pending === 'password'}
                className={styles.form}
                onSubmit={submitPassword}
            >
                <Field label={t('common.email')} required>
                    <Input
                        autoComplete='username'
                        inputMode='email'
                        name='email'
                        required
                        type='email'
                    />
                </Field>
                <PasswordField
                    autoComplete='current-password'
                    label={t('common.password')}
                    name='password'
                />
                {capabilities?.email.passwordRecovery ? (
                    <div className={styles.endRow}>
                        <Link href={href('/forgot-password')}>
                            {t('login.forgotPassword')}
                        </Link>
                    </div>
                ) : null}
                <Button
                    disabled={
                        pending !== null ||
                        sessionStatus === 'bootstrapping' ||
                        capabilities?.passwordAuthentication === false
                    }
                    type='submit'
                >
                    {pending === 'password'
                        ? t('login.pending')
                        : t('auth.signIn')}
                </Button>
            </form>
            {capabilities?.passkeys.authentication ? (
                <div className={styles.alternative}>
                    <span>{t('login.or')}</span>
                    <Button
                        disabled={
                            pending !== null ||
                            sessionStatus === 'bootstrapping' ||
                            !passkeySupported
                        }
                        onClick={() => void submitPasskey()}
                        type='button'
                        variant='secondary'
                    >
                        {pending === 'passkey'
                            ? t('login.passkeyPending')
                            : t('login.passkey')}
                    </Button>
                    {!passkeySupported ? (
                        <small>{t('passkey.unsupported')}</small>
                    ) : null}
                </div>
            ) : null}
            <AuthLinks
                mode='login'
                signupAvailable={capabilities?.email.signUp !== false}
            />
        </>
    );
}
