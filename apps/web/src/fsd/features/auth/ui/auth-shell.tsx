'use client';

import Link from 'next/link';
import { BookOpen, LineChart, Sparkles } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';

import { useI18n } from '@/fsd/shared/i18n';
import { preserveCapabilityReturnFragment } from '@/fsd/shared/lib/capability-return';
import { safeReturnPath } from '@/fsd/shared/lib/return-path';
import { InlineAlert } from '@/fsd/shared/ui';

import { useAuth } from '../model/auth-provider';
import styles from './auth-ui.module.css';

export function AuthShell({
    children,
    description,
    eyebrow,
    footer,
    title,
    variant = 'auth',
}: {
    children: ReactNode;
    description?: ReactNode;
    eyebrow: string;
    footer?: ReactNode;
    title: string;
    variant?: 'account' | 'auth';
}) {
    const { t } = useI18n();
    if (variant === 'account') {
        return (
            <main className={styles.accountLayout}>
                <section
                    className={styles.accountCard}
                    aria-labelledby='auth-title'
                >
                    <div className={styles.headingGroup}>
                        <p className={styles.eyebrow}>{eyebrow}</p>
                        <h1 className={styles.title} id='auth-title'>
                            {title}
                        </h1>
                    </div>
                    {children}
                </section>
            </main>
        );
    }

    return (
        <main className={styles.layout}>
            <aside className={styles.story}>
                <div className={styles.storyContent}>
                    <p className={styles.storyTitle}>{t('auth.storyTitle')}</p>
                    <ul className={styles.benefits}>
                        <li>
                            <span className={styles.benefitIcon}>
                                <Sparkles aria-hidden='true' />
                            </span>
                            <span>
                                <strong>{t('auth.storyBenefitLevel')}</strong>
                                <small>{t('auth.storyBenefitLevelBody')}</small>
                            </span>
                        </li>
                        <li>
                            <span className={styles.benefitIcon}>
                                <BookOpen aria-hidden='true' />
                            </span>
                            <span>
                                <strong>{t('auth.storyBenefitContext')}</strong>
                                <small>
                                    {t('auth.storyBenefitContextBody')}
                                </small>
                            </span>
                        </li>
                        <li>
                            <span className={styles.benefitIcon}>
                                <LineChart aria-hidden='true' />
                            </span>
                            <span>
                                <strong>
                                    {t('auth.storyBenefitProgress')}
                                </strong>
                                <small>
                                    {t('auth.storyBenefitProgressBody')}
                                </small>
                            </span>
                        </li>
                    </ul>
                </div>
                <p className={styles.proof}>{t('auth.storyProof')}</p>
            </aside>
            <section className={styles.formPanel}>
                <div className={styles.authMain}>
                    <section
                        className={styles.authSection}
                        aria-labelledby='auth-title'
                    >
                        <div className={styles.card}>
                            <header className={styles.headingGroup}>
                                <p className={styles.eyebrow}>{eyebrow}</p>
                                <h1 className={styles.title} id='auth-title'>
                                    {title}
                                </h1>
                                {description ? (
                                    <p className={styles.description}>
                                        {description}
                                    </p>
                                ) : null}
                            </header>
                            {children}
                        </div>
                        {footer ? (
                            <div className={styles.authFooter}>{footer}</div>
                        ) : null}
                    </section>
                </div>
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
}: {
    mode: 'login' | 'signup';
    returnTo?: string | undefined;
}) {
    const { href, t } = useI18n();
    const { capabilities } = useAuth();
    const destination = safeReturnPath(returnTo);
    const path = mode === 'login' ? '/signup' : '/login';
    const target =
        destination === '/'
            ? path
            : `${path}?${new URLSearchParams({ returnTo: destination }).toString()}`;
    if (mode === 'login' && capabilities?.email.signUp === false) return null;
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
