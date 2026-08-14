'use client';

import { VerificationCodeSchema } from '@languon/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';

import { authApi, authErrorMessage } from '@/fsd/shared/api/auth-api';
import { safeReturnPath } from '@/fsd/shared/lib/return-path';
import { useSessionStore } from '@/fsd/entities/session/model/session-store';

import { useAuth } from '../model/auth-provider';
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
    const router = useRouter();
    const { authenticate, capabilities } = useAuth();
    const [activeFlowId, setActiveFlowId] = useState(flowId ?? '');
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
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
            setError(
                'This verification link is incomplete. Start signup again.',
            );
            return;
        }
        const code = new FormData(event.currentTarget).get('code');
        const parsed = VerificationCodeSchema.safeParse(code);
        if (!parsed.success) {
            setError('Enter the four-digit code from your email.');
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
            router.replace(safeReturnPath(returnTo));
        } catch (caught) {
            setError(authErrorMessage(caught));
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
            router.replace(`/verify-email?${query.toString()}`);
            setMessage(
                'If the address can receive verification email, a fresh code is on its way.',
            );
        } catch (caught) {
            setError(authErrorMessage(caught));
        } finally {
            setPending(null);
        }
    }

    if (capabilities && !capabilities.email.verification) {
        return (
            <FormMessage>
                Email verification is not available in this environment.{' '}
                <Link href='/login'>Return to sign in.</Link>
            </FormMessage>
        );
    }

    const waitSeconds = Math.max(0, Math.ceil((nextResendAt - now) / 1_000));
    return (
        <>
            <p className='auth-intro'>
                Enter the four-digit code we sent. Codes expire after ten
                minutes.
            </p>
            {!activeFlowId ? (
                <FormMessage>
                    This verification link is incomplete.{' '}
                    <Link href='/signup'>Start signup again.</Link>
                </FormMessage>
            ) : null}
            {error ? <FormMessage>{error}</FormMessage> : null}
            {message ? (
                <FormMessage tone='success'>{message}</FormMessage>
            ) : null}
            <form
                aria-busy={pending === 'verify'}
                className='auth-form'
                onSubmit={submit}
            >
                <label className='field'>
                    <span>Verification code</span>
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
                <button
                    className='primary-button'
                    disabled={
                        pending !== null ||
                        sessionStatus === 'bootstrapping' ||
                        !activeFlowId
                    }
                    type='submit'
                >
                    {pending === 'verify' ? 'Checking code…' : 'Verify email'}
                </button>
            </form>
            <button
                className='secondary-button'
                disabled={
                    pending !== null ||
                    sessionStatus === 'bootstrapping' ||
                    !activeFlowId ||
                    waitSeconds > 0
                }
                onClick={() => void resend()}
                type='button'
            >
                {pending === 'resend'
                    ? 'Sending…'
                    : waitSeconds > 0
                      ? `Send a new code in ${waitSeconds}s`
                      : 'Send a new code'}
            </button>
        </>
    );
}
