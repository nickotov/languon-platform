'use client';

import { Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';

import { useAuth } from '@/fsd/features/auth';
import {
    LibraryCreateDialog,
    useDictionaryNavigation,
} from '@/fsd/features/dictionary-library';
import { useI18n } from '@/fsd/shared/i18n';
import { IconButton, Logo } from '@/fsd/shared/ui';

import { useAppShellState } from '../../hooks/use-app-shell-state';
import { MobileDrawer } from '../mobile-drawer/mobile-drawer';
import { Sidebar } from '../sidebar/sidebar';
import styles from './authenticated-app-shell.module.css';

export function AuthenticatedAppShell({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const { requestWithSession } = useAuth();
    const { href, t } = useI18n();
    const shell = useAppShellState();
    const navigation = useDictionaryNavigation(requestWithSession);
    const dictionaryId = pathname.startsWith('/dictionaries/')
        ? pathname.split('/')[2]
        : null;
    const currentDictionary = dictionaryId
        ? navigation.list.find((dictionary) => dictionary.id === dictionaryId)
        : null;
    const pageTitle = pathname.startsWith('/profile')
        ? t('profile.title')
        : (currentDictionary?.name ?? t('dictionary.library.title'));
    const shellClassName = shell.railCollapsed
        ? `${styles.shell} ${styles.railShell}`
        : styles.shell;

    useEffect(() => {
        const query = window.matchMedia('(min-width: 1024px)');
        const adaptToBreakpoint = () => {
            shell.setAccountOpen(false);
            if (query.matches) shell.setDrawerOpen(false);
        };
        query.addEventListener('change', adaptToBreakpoint);
        return () => query.removeEventListener('change', adaptToBreakpoint);
    }, [shell.setAccountOpen, shell.setDrawerOpen]);

    return (
        <div className={shellClassName}>
            <a className={styles.skipLink} href='#main-content'>
                {t('dictionary.skipToContent')}
            </a>
            <aside
                aria-label={t('shell.sidebar')}
                className={styles.desktopSidebar}
            >
                <Sidebar
                    navigation={navigation}
                    shell={shell}
                    variant={shell.railCollapsed ? 'rail' : 'expanded'}
                />
            </aside>
            <header className={styles.mobileTopBar}>
                <IconButton
                    aria-controls='mobile-navigation-drawer'
                    aria-expanded={shell.drawerOpen}
                    className={styles.mobileMenuButton}
                    icon={<Menu />}
                    label={t('shell.openNavigation')}
                    onClick={() => shell.setDrawerOpen(true)}
                    ref={shell.menuButtonRef}
                    showTooltip={false}
                    variant='ghost'
                />
                <span className={styles.mobileLogo}>
                    <Logo
                        href={href('/dictionaries')}
                        label={t('auth.brandHome')}
                        monogram
                    />
                </span>
                <span aria-hidden className={styles.mobileDivider} />
                <p title={pageTitle}>{pageTitle}</p>
            </header>
            <MobileDrawer navigation={navigation} shell={shell} />
            <div className={styles.content} id='main-content' tabIndex={-1}>
                {children}
            </div>
            <LibraryCreateDialog state={navigation} />
        </div>
    );
}
