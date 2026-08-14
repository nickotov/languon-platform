'use client';

import { SignUpRequestSchema } from '@languon/contracts';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { authApi } from '@/fsd/shared/api/auth-api';
import { useI18n, useLocaleSensitiveState } from '@/fsd/shared/i18n';
import { safeReturnPath } from '@/fsd/shared/lib/return-path';
import { useSessionStore } from '@/fsd/entities/session/model/session-store';

import { useAuth } from '../model/auth-provider';
import { localizedAuthError } from '../lib/auth-error-message';
import { AuthLinks, FormMessage } from './auth-shell';
import { CapabilityState } from './capability-state';
import { PasswordField } from './password-field';

export function SignupForm({ returnTo }: { returnTo?: string | undefined }) {
    const { href, t } = useI18n();
    const router = useRouter();
    const { capabilities } = useAuth();
    const [error, setError] = useLocaleSensitiveState<string | null>(null);
    const [pending, setPending] = useState(false);
    const sessionStatus = useSessionStore((state) => state.status);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (sessionStatus === 'bootstrapping') return;
        setError(null);
        const form = new FormData(event.currentTarget);
        const parsed = SignUpRequestSchema.safeParse({
            email: form.get('email'),
            password: form.get('password'),
        });
        if (!parsed.success) {
            setError(t('signup.invalid'));
            return;
        }

        setPending(true);
        try {
            const response = await authApi.signUp(parsed.data);
            const query = new URLSearchParams({
                flowId: response.verification.flowId,
                resendAvailableAt: response.verification.resendAvailableAt,
                returnTo: safeReturnPath(returnTo),
            });
            router.push(href(`/verify-email?${query.toString()}`));
        } catch (caught) {
            setError(localizedAuthError(caught, t));
        } finally {
            setPending(false);
        }
    }

    if (capabilities && !capabilities.email.signUp) {
        return (
            <>
                <FormMessage>{t('signup.unavailable')}</FormMessage>
                <AuthLinks mode='signup' />
            </>
        );
    }

    return (
        <>
            <p className='auth-intro'>{t('signup.intro')}</p>
            <CapabilityState />
            {error ? <FormMessage>{error}</FormMessage> : null}
            <form aria-busy={pending} className='auth-form' onSubmit={submit}>
                <label className='field'>
                    <span>{t('common.email')}</span>
                    <input
                        autoComplete='username'
                        inputMode='email'
                        name='email'
                        required
                        type='email'
                    />
                </label>
                <PasswordField
                    autoComplete='new-password'
                    label={t('common.password')}
                    name='password'
                />
                <button
                    className='primary-button'
                    disabled={
                        pending ||
                        !capabilities ||
                        sessionStatus === 'bootstrapping'
                    }
                    type='submit'
                >
                    {pending ? t('signup.pending') : t('signup.submit')}
                </button>
            </form>
            <AuthLinks mode='signup' />
        </>
    );
}
