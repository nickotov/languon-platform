'use client';

import { ResetPasswordRequestSchema } from '@languon/contracts';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { authApi } from '@/fsd/shared/api/auth-api';
import { useI18n, useLocaleSensitiveState } from '@/fsd/shared/i18n';
import { Button, Field, Input } from '@/fsd/shared/ui';

import { localizedAuthError } from '../lib/auth-error-message';
import { FormMessage } from './auth-shell';
import { PasswordField } from './password-field';
import { useAuth } from '../model/auth-provider';
import styles from './auth-ui.module.css';

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
        return <FormMessage tone='success'>{t('reset.complete')}</FormMessage>;
    }

    return (
        <>
            {!flowId ? (
                <FormMessage>{t('reset.incomplete')}</FormMessage>
            ) : null}
            {error ? <FormMessage>{error}</FormMessage> : null}
            <form aria-busy={pending} className={styles.form} onSubmit={submit}>
                <Field label={t('reset.code')} required>
                    <Input
                        autoComplete='one-time-code'
                        className={styles.code}
                        controlSize='large'
                        inputMode='numeric'
                        maxLength={4}
                        name='code'
                        pattern='[0-9]{4}'
                        required
                    />
                </Field>
                <PasswordField
                    autoComplete='new-password'
                    label={t('common.newPassword')}
                    name='newPassword'
                />
                <Button
                    disabled={pending || !flowId}
                    loading={pending}
                    size='large'
                    type='submit'
                >
                    {pending ? t('reset.pending') : t('reset.submit')}
                </Button>
            </form>
        </>
    );
}
