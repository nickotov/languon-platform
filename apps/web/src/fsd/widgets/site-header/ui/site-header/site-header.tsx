'use client';

import { LanguageSwitcher } from '@/fsd/features/change-locale';
import { ThemeToggle } from '@/fsd/features/change-theme';
import { useI18n } from '@/fsd/shared/i18n';
import { Logo } from '@/fsd/shared/ui';

import styles from './site-header.module.css';

export function SiteHeader() {
    const { href, t } = useI18n();
    return (
        <header className={styles.header}>
            <div className={styles.inner}>
                <Logo
                    className={styles.brand}
                    href={href('/')}
                    label={t('auth.brandHome')}
                />
                <div className={styles.actions}>
                    <LanguageSwitcher compact />
                    <ThemeToggle />
                </div>
            </div>
        </header>
    );
}
