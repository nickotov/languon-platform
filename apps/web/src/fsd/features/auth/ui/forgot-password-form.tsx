'use client';

import { ForgotPasswordRequestSchema } from '@languon/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { authApi } from '@/fsd/shared/api/auth-api';
import { useI18n, useLocaleSensitiveState } from '@/fsd/shared/i18n';
import { Button, Field, Input } from '@/fsd/shared/ui';

import { localizedAuthError } from '../lib/auth-error-message';
import { useAuth } from '../model/auth-provider';
import { FormMessage } from './auth-shell';
import { CapabilityState } from './capability-state';
import styles from './auth-ui.module.css';

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
            <p className={styles.intro}>{t('forgot.intro')}</p>
            <CapabilityState />
            {error ? <FormMessage>{error}</FormMessage> : null}
            <form aria-busy={pending} className={styles.form} onSubmit={submit}>
                <Field label={t('common.email')} required>
                    <Input
                        autoComplete='username'
                        inputMode='email'
                        name='email'
                        required
                        type='email'
                    />
                </Field>
                <Button disabled={pending || !capabilities} type='submit'>
                    {pending ? t('forgot.pending') : t('forgot.submit')}
                </Button>
            </form>
            <p className={styles.switch}>
                <Link href={href('/login')}>{t('forgot.back')}</Link>
            </p>
        </>
    );
}
