'use client';

import { BookMarked, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useSessionStore } from '@/fsd/entities/session';
import { LanguageSwitcher } from '@/fsd/features/change-locale';
import { ThemeToggle } from '@/fsd/features/change-theme';
import { isLocale, useI18n } from '@/fsd/shared/i18n';
import { Logo, NavItem } from '@/fsd/shared/ui';

import styles from './site-header.module.css';

export function SiteHeader() {
    const { href, t } = useI18n();
    const handle = useSessionStore((state) =>
        state.status === 'authenticated' ? state.user?.handle : null,
    );
    const pathname = usePathname();
    const segments = pathname.split('/').filter(Boolean);
    const firstSegment = segments[0];
    const route =
        firstSegment && isLocale(firstSegment) ? segments[1] : firstSegment;

    const homeHref = href('/');
    const libraryHref = href('/dictionaries');
    const profileHref = href('/profile');
    const libraryLabel = t('home.dictionaries');
    const profileLabel = t('profile.title');
    const homeLabel = t('auth.brandHome');

    if (route === 'dictionaries') {
        return (
            <header className={styles.dictionaryShell}>
                <a className={styles.skipLink} href='#dictionary-content'>
                    {t('dictionary.skipToContent')}
                </a>
                <div className={styles.dictionaryBrand}>
                    <Link
                        href={libraryHref}
                        aria-label={homeLabel}
                        className={styles.dictionaryBrandLink}
                    >
                        <span className={styles.dictionaryBrandIcon}>
                            <BookMarked size={16} aria-hidden />
                        </span>
                        <span>Languon</span>
                    </Link>
                </div>
                <nav
                    aria-label={libraryLabel}
                    className={styles.dictionaryNavigation}
                >
                    <NavItem
                        active
                        aria-label={libraryLabel}
                        href={libraryHref}
                        icon={BookMarked}
                        label={libraryLabel}
                    />
                </nav>
                <div className={styles.dictionaryTools}>
                    {handle ? (
                        <Link
                            aria-label={profileLabel}
                            className={styles.dictionaryProfile}
                            href={profileHref}
                            title={profileLabel}
                        >
                            <UserRound aria-hidden size={18} />
                            <span>@{handle}</span>
                        </Link>
                    ) : null}
                    <p className={styles.languageLabel}>
                        {t('profile.interfaceLanguage')}
                    </p>
                    <div className={styles.dictionaryPreferences}>
                        <LanguageSwitcher compact />
                        <ThemeToggle />
                    </div>
                </div>
            </header>
        );
    }
    return (
        <header className={styles.header}>
            <div className={styles.inner}>
                <Logo
                    className={styles.brand}
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
