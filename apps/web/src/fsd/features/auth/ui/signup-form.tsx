'use client';

import { SignUpRequestSchema } from '@languon/contracts';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

import { authApi, authErrorMessage } from '@/fsd/shared/api/auth-api';
import { safeReturnPath } from '@/fsd/shared/lib/return-path';
import { useSessionStore } from '@/fsd/entities/session/model/session-store';

import { useAuth } from '../model/auth-provider';
import { AuthLinks, FormMessage } from './auth-shell';
import { CapabilityState } from './capability-state';
import { PasswordField } from './password-field';

export function SignupForm({ returnTo }: { returnTo?: string | undefined }) {
    const router = useRouter();
    const { capabilities } = useAuth();
    const [error, setError] = useState<string | null>(null);
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
            setError(
                parsed.error.issues[0]?.message ??
                    'Check your account details.',
            );
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
            router.push(`/verify-email?${query.toString()}`);
        } catch (caught) {
            setError(authErrorMessage(caught));
        } finally {
            setPending(false);
        }
    }

    if (capabilities && !capabilities.email.signUp) {
        return (
            <>
                <FormMessage>
                    Email signup is not available in this environment. Try
                    signing in if you already have an account.
                </FormMessage>
                <AuthLinks mode='signup' />
            </>
        );
    }

    return (
        <>
            <p className='auth-intro'>
                Create your account, then confirm that the email belongs to you.
            </p>
            <CapabilityState />
            {error ? <FormMessage>{error}</FormMessage> : null}
            <form aria-busy={pending} className='auth-form' onSubmit={submit}>
                <label className='field'>
                    <span>Email</span>
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
                    label='Password'
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
                    {pending ? 'Creating account…' : 'Create account'}
                </button>
            </form>
            <AuthLinks mode='signup' />
        </>
    );
}
