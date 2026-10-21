'use client';
import { Menu, Search } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { useSessionStore } from '@/fsd/entities/session';
import { useAuth } from '@/fsd/features/auth';
import {
    LibraryCreateDialog,
    useDictionaryNavigation,
} from '@/fsd/features/dictionary-library';
import { NewTextDialog } from '@/fsd/features/text-management';
import { useI18n } from '@/fsd/shared/i18n';
import { IconButton, Logo } from '@/fsd/shared/ui';
import { useAppShellState } from '../../hooks/use-app-shell-state';
import { useShellCreation } from '../../hooks/use-shell-creation';
import { ShellNavigationContext } from '../../model/navigation-context';
import { CommandPalette } from '../command-palette/command-palette';
import { MobileDrawer } from '../mobile-drawer/mobile-drawer';
import { Sidebar } from '../sidebar/sidebar';
import styles from './app-shell.module.css';

export function AppShell({ children }: { children: ReactNode }) {
    const { requestWithSession } = useAuth();
    const { href, t } = useI18n();
    const shell = useAppShellState();
    const navigation = useDictionaryNavigation(requestWithSession, false);
    const creation = useShellCreation(
        requestWithSession,
        navigation.openCreate,
    );
    const status = useSessionStore((state) => state.status);
    const userId = useSessionStore((state) => state.user?.id ?? null);
    const authenticated = status === 'authenticated' && userId !== null;
    const shellClassName = shell.railCollapsed
        ? `${styles.shell} ${styles.railShell}`
        : styles.shell;
    const variant = shell.railCollapsed ? 'rail' : 'expanded';
    const desktopShell = {
        ...shell,
        accountOpen: shell.accountOpen && !shell.drawerOpen,
    };
    function openDrawer() {
        shell.setDrawerOpen(true);
    }
    function openSearch() {
        if (authenticated) {
            shell.setDrawerOpen(false);
            shell.setPaletteOpen(true);
        }
    }
    function closeSearch() {
        shell.setPaletteOpen(false);
    }
    const context = {
        requestWithSession,
        openSearch,
        create: creation.create,
        creating: creation.creating,
    };
    useEffect(() => {
        function shortcut(event: KeyboardEvent) {
            if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
            if (event.key.toLowerCase() === 'k' && authenticated) {
                event.preventDefault();
                shell.setDrawerOpen(false);
                shell.setPaletteOpen((current) => !current);
            }
            if (event.key === '\\') {
                event.preventDefault();
                shell.toggleRail();
            }
        }
        window.addEventListener('keydown', shortcut);
        return () => window.removeEventListener('keydown', shortcut);
    }, [authenticated, shell]);
    return (
        <ShellNavigationContext.Provider value={context}>
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
                    <Logo href={href('/')} label={t('auth.brandHome')} />
                    {authenticated ? (
                        <IconButton
                            className={styles.mobileSearchButton}
                            icon={<Search />}
                            label={t('shell.search')}
                            onClick={openSearch}
                            showTooltip={false}
                            variant='ghost'
                        />
                    ) : null}
                </header>
                <MobileDrawer
                    authenticated={authenticated}
                    pending={status === 'bootstrapping'}
                    shell={shell}
                />
                <div className={styles.content} id='main-content' tabIndex={-1}>
                    {children}
                </div>
                {authenticated ? (
                    <>
                        <LibraryCreateDialog
                            key={`dictionary-${userId}`}
                            state={navigation}
                        />
                        <NewTextDialog
                            key={`text-${userId}`}
                            onClose={creation.closeText}
                            open={creation.textOpen}
                            requestWithSession={requestWithSession}
                        />
                        {shell.paletteOpen ? (
                            <CommandPalette
                                key={userId}
                                onClose={closeSearch}
                            />
                        ) : null}
                    </>
                ) : null}
            </div>
        </ShellNavigationContext.Provider>
    );
}
