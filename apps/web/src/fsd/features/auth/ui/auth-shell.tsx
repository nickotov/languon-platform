'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useRef } from 'react';

import { useI18n } from '@/fsd/shared/i18n';
import { preserveCapabilityReturnFragment } from '@/fsd/shared/lib/capability-return';
import { safeReturnPath } from '@/fsd/shared/lib/return-path';
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
    returnTo,
    signupAvailable = true,
}: {
    mode: 'login' | 'signup';
    returnTo?: string | undefined;
    signupAvailable?: boolean;
}) {
    const { href, t } = useI18n();
    const destination = safeReturnPath(returnTo);
    const path = mode === 'login' ? '/signup' : '/login';
    const target =
        destination === '/'
            ? path
            : `${path}?${new URLSearchParams({ returnTo: destination }).toString()}`;
    if (mode === 'login' && !signupAvailable) return null;
    return (
        <p className={styles.switch}>
            {mode === 'login'
                ? `${t('auth.newToLanguon')} `
                : `${t('auth.alreadyAccount')} `}
            <Link
                href={href(
                    preserveCapabilityReturnFragment(target, destination),
                )}
            >
                {mode === 'login' ? t('auth.createAccount') : t('auth.signIn')}
            </Link>
        </p>
    );
}
