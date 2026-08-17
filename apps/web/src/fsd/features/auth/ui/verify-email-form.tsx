'use client';

import { VerificationCodeSchema } from '@languon/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';

import { authApi } from '@/fsd/shared/api/auth-api';
import { useI18n, useLocaleSensitiveState } from '@/fsd/shared/i18n';
import { Button, Field, Input } from '@/fsd/shared/ui';
import { safeReturnPath } from '@/fsd/shared/lib/return-path';
import { useSessionStore } from '@/fsd/entities/session/model/session-store';

import { useAuth } from '../model/auth-provider';
import styles from './auth-ui.module.css';
import { localizedAuthError } from '../lib/auth-error-message';
import { FormMessage } from './auth-shell';

export function VerifyEmailForm({
    flowId,
    resendAvailableAt,
    returnTo,
}: {
    flowId?: string | undefined;
    resendAvailableAt?: string | undefined;
    returnTo?: string | undefined;
}) {
    const { href, t } = useI18n();
    const router = useRouter();
    const { authenticate, capabilities } = useAuth();
    const [activeFlowId, setActiveFlowId] = useState(flowId ?? '');
    const [error, setError] = useLocaleSensitiveState<string | null>(null);
    const [message, setMessage] = useLocaleSensitiveState<string | null>(null);
    const [pending, setPending] = useState<'resend' | 'verify' | null>(null);
    const [nextResendAt, setNextResendAt] = useState(() =>
        resendAvailableAt ? Date.parse(resendAvailableAt) : 0,
    );
    const [now, setNow] = useState(() => Date.now());
    const sessionStatus = useSessionStore((state) => state.status);

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1_000);
        return () => window.clearInterval(timer);
    }, []);

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (sessionStatus === 'bootstrapping') return;
        setError(null);
        setMessage(null);
        if (!activeFlowId) {
            setError(t('verify.incompleteFull'));
            return;
        }
        const code = new FormData(event.currentTarget).get('code');
        const parsed = VerificationCodeSchema.safeParse(code);
        if (!parsed.success) {
            setError(t('verify.invalidCode'));
            return;
        }

        setPending('verify');
        try {
            await authenticate(
                () =>
                    authApi.verifyEmail({
                        code: parsed.data,
                        flowId: activeFlowId,
                    }),
                (result) => result,
            );
            router.replace(href(safeReturnPath(returnTo)));
        } catch (caught) {
            setError(localizedAuthError(caught, t));
        } finally {
            setPending(null);
        }
    }

    async function resend() {
        if (sessionStatus === 'bootstrapping') return;
        if (!activeFlowId) return;
        setError(null);
        setMessage(null);
        setPending('resend');
        try {
            const response = await authApi.resendVerification({
                flowId: activeFlowId,
            });
            setActiveFlowId(response.verification.flowId);
            setNextResendAt(
                Date.parse(response.verification.resendAvailableAt),
            );
            const query = new URLSearchParams({
                flowId: response.verification.flowId,
                resendAvailableAt: response.verification.resendAvailableAt,
                returnTo: safeReturnPath(returnTo),
            });
            router.replace(href(`/verify-email?${query.toString()}`));
            setMessage(t('verify.resent'));
        } catch (caught) {
            setError(localizedAuthError(caught, t));
        } finally {
            setPending(null);
        }
    }

    if (capabilities && !capabilities.email.verification) {
        return (
            <FormMessage>
                {t('verify.unavailable')}{' '}
                <Link href={href('/login')}>{t('auth.returnToSignIn')}</Link>
            </FormMessage>
        );
    }

    const waitSeconds = Math.max(0, Math.ceil((nextResendAt - now) / 1_000));
    return (
        <>
            <p className={styles.intro}>{t('verify.intro')}</p>
            {!activeFlowId ? (
                <FormMessage>
                    {t('verify.incomplete')}{' '}
                    <Link href={href('/signup')}>{t('verify.startAgain')}</Link>
                </FormMessage>
            ) : null}
            {error ? <FormMessage>{error}</FormMessage> : null}
            {message ? (
                <FormMessage tone='success'>{message}</FormMessage>
            ) : null}
            <form
                aria-busy={pending === 'verify'}
                className={styles.form}
                onSubmit={submit}
            >
                <Field label={t('verify.code')} required>
                    <Input
                        autoComplete='one-time-code'
                        className={styles.code}
                        inputMode='numeric'
                        maxLength={4}
                        name='code'
                        pattern='[0-9]{4}'
                        required
                    />
                </Field>
                <Button
                    disabled={
                        pending !== null ||
                        sessionStatus === 'bootstrapping' ||
                        !activeFlowId
                    }
                    type='submit'
                >
                    {pending === 'verify'
                        ? t('verify.checking')
                        : t('verify.submit')}
                </Button>
            </form>
            <Button
                disabled={
                    pending !== null ||
                    sessionStatus === 'bootstrapping' ||
                    !activeFlowId ||
                    waitSeconds > 0
                }
                onClick={() => void resend()}
                type='button'
                variant='secondary'
            >
                {pending === 'resend'
                    ? t('verify.sending')
                    : waitSeconds > 0
                      ? t('verify.resendIn', { seconds: waitSeconds })
                      : t('verify.resend')}
            </Button>
        </>
    );
}
