'use client';

import { ResetPasswordRequestSchema } from '@languon/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { authApi } from '@/fsd/shared/api/auth-api';
import { useI18n, useLocaleSensitiveState } from '@/fsd/shared/i18n';

import { localizedAuthError } from '../lib/auth-error-message';
import { FormMessage } from './auth-shell';
import { PasswordField } from './password-field';
import { useAuth } from '../model/auth-provider';

export function ResetPasswordForm({ flowId }: { flowId?: string | undefined }) {
    const { href, t } = useI18n();
    const router = useRouter();
    const { clearLocalSession } = useAuth();
    const [error, setError] = useLocaleSensitiveState<string | null>(null);
    const [pending, setPending] = useState(false);
    const [complete, setComplete] = useState(false);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        const data = new FormData(event.currentTarget);
        const parsed = ResetPasswordRequestSchema.safeParse({
            code: data.get('code'),
            flowId,
            newPassword: data.get('newPassword'),
        });
        if (!parsed.success) {
            setError(t('reset.invalid'));
            return;
        }

        setPending(true);
        try {
            await authApi.resetPassword(parsed.data);
            clearLocalSession();
            setComplete(true);
            router.replace(href('/login?passwordReset=complete'));
        } catch (caught) {
            setError(localizedAuthError(caught, t));
        } finally {
            setPending(false);
        }
    }

    if (complete) {
        return (
            <FormMessage tone='success'>
                {t('reset.complete')}{' '}
                <Link href={href('/login')}>{t('reset.signInNew')}</Link>
            </FormMessage>
        );
    }

    return (
        <>
            <p className='auth-intro'>{t('reset.intro')}</p>
            {!flowId ? (
                <FormMessage>
                    {t('reset.incomplete')}{' '}
                    <Link href={href('/forgot-password')}>
                        {t('reset.requestNew')}
                    </Link>
                </FormMessage>
            ) : null}
            {error ? <FormMessage>{error}</FormMessage> : null}
            <form aria-busy={pending} className='auth-form' onSubmit={submit}>
                <label className='field'>
                    <span>{t('reset.code')}</span>
                    <input
                        autoComplete='one-time-code'
                        className='code-input'
                        inputMode='numeric'
                        maxLength={4}
                        name='code'
                        pattern='[0-9]{4}'
                        required
                    />
                </label>
                <PasswordField
                    autoComplete='new-password'
                    label={t('common.newPassword')}
                    name='newPassword'
                />
                <button
                    className='primary-button'
                    disabled={pending || !flowId}
                    type='submit'
                >
                    {pending ? t('reset.pending') : t('reset.submit')}
                </button>
            </form>
        </>
    );
}
