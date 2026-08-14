'use client';

import { ForgotPasswordRequestSchema } from '@languon/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { authApi } from '@/fsd/shared/api/auth-api';
import { useI18n, useLocaleSensitiveState } from '@/fsd/shared/i18n';

import { localizedAuthError } from '../lib/auth-error-message';
import { useAuth } from '../model/auth-provider';
import { FormMessage } from './auth-shell';
import { CapabilityState } from './capability-state';

export function ForgotPasswordForm() {
    const { href, t } = useI18n();
    const router = useRouter();
    const { capabilities } = useAuth();
    const [error, setError] = useLocaleSensitiveState<string | null>(null);
    const [pending, setPending] = useState(false);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        const parsed = ForgotPasswordRequestSchema.safeParse({
            email: new FormData(event.currentTarget).get('email'),
        });
        if (!parsed.success) {
            setError(t('forgot.invalidEmail'));
            return;
        }

        setPending(true);
        try {
            const response = await authApi.forgotPassword(parsed.data);
            router.push(
                href(
                    `/reset-password?flowId=${encodeURIComponent(response.recovery.flowId)}`,
                ),
            );
        } catch (caught) {
            setError(localizedAuthError(caught, t));
        } finally {
            setPending(false);
        }
    }

    if (capabilities && !capabilities.email.passwordRecovery) {
        return (
            <FormMessage>
                {t('forgot.unavailable')}{' '}
                <Link href={href('/login')}>{t('auth.returnToSignIn')}</Link>
            </FormMessage>
        );
    }

    return (
        <>
            <p className='auth-intro'>{t('forgot.intro')}</p>
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
                <button
                    className='primary-button'
                    disabled={pending || !capabilities}
                    type='submit'
                >
                    {pending ? t('forgot.pending') : t('forgot.submit')}
                </button>
            </form>
            <p className='auth-switch'>
                <Link href={href('/login')}>{t('forgot.back')}</Link>
            </p>
        </>
    );
}
