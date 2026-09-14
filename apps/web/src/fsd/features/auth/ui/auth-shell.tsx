'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useRef } from 'react';

import { useI18n } from '@/fsd/shared/i18n';
import { preserveCapabilityReturnFragment } from '@/fsd/shared/lib/capability-return';
import { safeReturnPath } from '@/fsd/shared/lib/return-path';
import { Card, InlineAlert, Logo } from '@/fsd/shared/ui';
import styles from './auth-ui.module.css';

export function AuthShell({
    children,
    eyebrow,
    title,
    variant = 'auth',
}: {
    children: ReactNode;
    eyebrow: string;
    title: string;
    variant?: 'account' | 'auth';
}) {
    const { href, t } = useI18n();
    if (variant === 'account') {
        return (
            <main className={styles.accountLayout}>
                <Card
                    className={styles.accountCard}
                    aria-labelledby='auth-title'
                >
                    <Logo href={href('/')} label={t('auth.brandHome')} />
                    <div className={styles.headingGroup}>
                        <p className={styles.eyebrow}>{eyebrow}</p>
                        <h1 className={styles.title} id='auth-title'>
                            {title}
                        </h1>
                    </div>
                    {children}
                </Card>
            </main>
        );
    }

    return (
        <main className={styles.layout}>
            <aside className={styles.story}>
                <Logo href={href('/')} label={t('auth.brandHome')} />
                <div className={styles.storyContent}>
                    <p className={styles.storyEyebrow}>
                        {t('auth.storyEyebrow')}
                    </p>
                    <p className={styles.storyTitle}>
                        {t('auth.storyTitle')}
                    </p>
                    <ul className={styles.benefits}>
                        <li>{t('auth.storyBenefitLevel')}</li>
                        <li>{t('auth.storyBenefitContext')}</li>
                        <li>{t('auth.storyBenefitProgress')}</li>
                    </ul>
                </div>
            </aside>
            <section className={styles.formPanel}>
                <Logo
                    className={styles.mobileLogo}
                    href={href('/')}
                    label={t('auth.brandHome')}
                    monogram
                />
                <Card className={styles.card} aria-labelledby='auth-title'>
                    <div className={styles.headingGroup}>
                        <p className={styles.eyebrow}>{eyebrow}</p>
                        <h1 className={styles.title} id='auth-title'>
                            {title}
                        </h1>
                    </div>
                    {children}
                </Card>
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
