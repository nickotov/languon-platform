'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useRef } from 'react';

import { useI18n } from '@/fsd/shared/i18n';

export function AuthShell({
    children,
    eyebrow,
    title,
}: {
    children: ReactNode;
    eyebrow: string;
    title: string;
}) {
    const { href, t } = useI18n();
    return (
        <main className='auth-layout'>
            <section className='auth-card' aria-labelledby='auth-title'>
                <Link
                    className='brand-link'
                    href={href('/')}
                    aria-label={t('auth.brandHome')}
                >
                    Languon
                </Link>
                <p className='eyebrow'>{eyebrow}</p>
                <h1 id='auth-title'>{title}</h1>
                {children}
            </section>
        </main>
    );
}

export function FormMessage({
    children,
    tone = 'error',
}: {
    children: ReactNode;
    tone?: 'error' | 'info' | 'success';
}) {
    const message = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (tone === 'error') message.current?.focus();
    }, [tone]);

    return (
        <div
            className={`form-message form-message--${tone}`}
            role={tone === 'error' ? 'alert' : 'status'}
            ref={message}
            tabIndex={-1}
        >
            {children}
        </div>
    );
}

export function AuthLinks({
    mode,
    signupAvailable = true,
}: {
    mode: 'login' | 'signup';
    signupAvailable?: boolean;
}) {
    const { href, t } = useI18n();
    if (mode === 'login' && !signupAvailable) return null;
    return (
        <p className='auth-switch'>
            {mode === 'login'
                ? `${t('auth.newToLanguon')} `
                : `${t('auth.alreadyAccount')} `}
            <Link href={href(mode === 'login' ? '/signup' : '/login')}>
                {mode === 'login' ? t('auth.createAccount') : t('auth.signIn')}
            </Link>
        </p>
    );
}
