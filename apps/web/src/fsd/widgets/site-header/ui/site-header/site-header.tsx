'use client';

import Link from 'next/link';

import { useSessionStore } from '@/fsd/entities/session';
import { LanguageSwitcher } from '@/fsd/features/change-locale';
import { ThemeToggle } from '@/fsd/features/change-theme';
import { useI18n } from '@/fsd/shared/i18n';
import { Logo } from '@/fsd/shared/ui';

import styles from './site-header.module.css';

export function SiteHeader() {
    const { href, t } = useI18n();

    const handle = useSessionStore((state) =>
        state.status === 'authenticated' ? state.user?.handle : null,
    );

    const homeHref = href('/');

    const profileHref = href('/profile');

    const homeLabel = t('auth.brandHome');

    return (
        <header className={styles.header}>
            <div className={styles.inner}>
                <Logo
                    wordmarkClassName={styles.wordmark}
                    href={homeHref}
                    label={homeLabel}
                />
                <div className={styles.actions}>
                    {handle ? (
                        <Link className={styles.handle} href={profileHref}>
                            @{handle}
                        </Link>
                    ) : null}
                    <LanguageSwitcher compact />
                    <ThemeToggle />
                </div>
            </div>
        </header>
    );
}
