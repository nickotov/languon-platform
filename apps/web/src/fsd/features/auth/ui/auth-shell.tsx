'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useRef } from 'react';

import { useI18n } from '@/fsd/shared/i18n';
import { Card, InlineAlert } from '@/fsd/shared/ui';
import styles from './auth-ui.module.css';

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
        <main className={styles.layout}>
            <Card className={styles.card} aria-labelledby='auth-title'>
                <Link
                    className={styles.brand}
                    href={href('/')}
                    aria-label={t('auth.brandHome')}
                >
                    Languon
                </Link>
                <p className={styles.eyebrow}>{eyebrow}</p>
                <h1 className={styles.title} id='auth-title'>
                    {title}
                </h1>
                {children}
            </Card>
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
        <InlineAlert ref={message} tone={tone === 'error' ? 'danger' : tone}>
            {children}
        </InlineAlert>
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
        <p className={styles.switch}>
            {mode === 'login'
                ? `${t('auth.newToLanguon')} `
                : `${t('auth.alreadyAccount')} `}
            <Link href={href(mode === 'login' ? '/signup' : '/login')}>
                {mode === 'login' ? t('auth.createAccount') : t('auth.signIn')}
            </Link>
        </p>
    );
}
