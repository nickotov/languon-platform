'use client';

import { Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { useSessionStore } from '@/fsd/entities/session';

import { useAuth } from '@/fsd/features/auth';
import {
    LibraryCreateDialog,
    useDictionaryNavigation,
} from '@/fsd/features/dictionary-library';
import { useI18n } from '@/fsd/shared/i18n';
import { IconButton, Logo } from '@/fsd/shared/ui';

import { useAppShellState } from '../../hooks/use-app-shell-state';
import { isRouteWithin } from '../../lib/is-route-within';
import { MobileDrawer } from '../mobile-drawer/mobile-drawer';
import { Sidebar } from '../sidebar/sidebar';
import styles from './app-shell.module.css';

export function AppShell({ children }: { children: ReactNode }) {
    const pathname = usePathname();

    const { requestWithSession } = useAuth();

    const { href, t } = useI18n();

    const shell = useAppShellState();

    const navigation = useDictionaryNavigation(requestWithSession);
    const status = useSessionStore((state) => state.status);
    const userId = useSessionStore((state) => state.user?.id ?? null);
    const authenticated = status === 'authenticated' && userId !== null;

    const dictionaryId = pathname.startsWith('/dictionaries/')
        ? pathname.split('/')[2]
        : null;

    const currentDictionary = dictionaryId
        ? navigation.list.find((dictionary) => dictionary.id === dictionaryId)
        : null;

    function resolvePageTitle() {
        if (pathname === '/') return 'Languon';
        if (isRouteWithin(pathname, '/texts'))
            return t('texts.manage.navigation');
        if (isRouteWithin(pathname, '/profile')) {
            return t('profile.title');
        }
        if (isRouteWithin(pathname, '/dictionaries'))
            return currentDictionary?.name ?? t('dictionary.library.title');
        if (pathname === '/login') return t('login.title');
        if (pathname === '/signup') return t('signup.title');
        if (pathname === '/verify-email') return t('verify.title');
        if (pathname === '/forgot-password') return t('forgot.title');
        if (pathname === '/reset-password') return t('reset.title');
        if (isRouteWithin(pathname, '/shared/dictionaries'))
            return t('shell.sharedDictionary');
        return 'Languon';
    }

    const pageTitle = resolvePageTitle();

    const shellClassName = shell.railCollapsed
        ? `${styles.shell} ${styles.railShell}`
        : styles.shell;
    const variant = shell.railCollapsed ? 'rail' : 'expanded';
    // Only the visible modal drawer may open its footer overlay. The desktop
    // sidebar remains mounted for stable layout but must not portal a duplicate.
    const desktopShell = {
        ...shell,
        accountOpen: shell.accountOpen && !shell.drawerOpen,
    };

    function openDrawer() {
        shell.setDrawerOpen(true);
    }

    useEffect(() => {
        shell.setAccountOpen(false);
        shell.setDrawerOpen(false);
    }, [status, userId, shell.setAccountOpen, shell.setDrawerOpen]);

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
                    authenticated={authenticated}
                    navigation={navigation}
                    pending={status === 'bootstrapping'}
                    shell={desktopShell}
                    variant={variant}
                />
            </aside>
            <header className={styles.mobileTopBar}>
                <IconButton
                    aria-controls='mobile-navigation-drawer'
                    aria-expanded={shell.drawerOpen}
                    className={styles.mobileMenuButton}
                    icon={<Menu />}
                    label={t('shell.openNavigation')}
                    onClick={openDrawer}
                    ref={shell.menuButtonRef}
                    showTooltip={false}
                    variant='ghost'
                />
                <span className={styles.mobileLogo}>
                    <Logo
                        href={href('/')}
                        label={t('auth.brandHome')}
                        monogram
                    />
                </span>
                <span aria-hidden className={styles.mobileDivider} />
                <p className={styles.mobileTitle} title={pageTitle}>
                    {pageTitle}
                </p>
            </header>
            <MobileDrawer
                authenticated={authenticated}
                navigation={navigation}
                pending={status === 'bootstrapping'}
                shell={shell}
            />
            <div className={styles.content} id='main-content' tabIndex={-1}>
                {children}
            </div>
            {authenticated ? (
                <LibraryCreateDialog key={userId} state={navigation} />
            ) : null}
        </div>
    );
}
