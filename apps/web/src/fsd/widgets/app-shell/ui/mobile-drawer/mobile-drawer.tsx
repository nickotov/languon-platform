'use client';

import { useEffect, useRef } from 'react';

import { useI18n } from '@/fsd/shared/i18n';

import type { AppShellState } from '../../hooks/use-app-shell-state';
import { Sidebar } from '../sidebar/sidebar';
import styles from './mobile-drawer.module.css';

export function MobileDrawer({
    authenticated,
    pending,
    shell,
}: {
    authenticated: boolean;
    pending: boolean;
    shell: AppShellState;
}) {
    const { t } = useI18n();

    const dialogRef = useRef<HTMLDialogElement>(null);
    function cancelDrawer(event: React.SyntheticEvent<HTMLDialogElement>) {
        event.preventDefault();
        shell.closeDrawer();
    }
    function dismissBackdrop(event: React.MouseEvent<HTMLDialogElement>) {
        if (event.target === event.currentTarget) shell.closeDrawer();
    }
    function closeDrawer() {
        shell.closeDrawer();
    }
    function navigate() {
        shell.closeDrawer(false);
    }

    useEffect(() => {
        const dialog = dialogRef.current;

        if (!dialog) return;

        if (shell.drawerOpen && !dialog.open) dialog.showModal();

        if (!shell.drawerOpen && dialog.open) dialog.close();
    }, [shell.drawerOpen]);

    useEffect(() => {
        if (!shell.drawerOpen) return;

        const previousOverflow = document.body.style.overflow;

        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [shell.drawerOpen]);

    return (
        <dialog
            aria-label={t('shell.mainNavigation')}
            className={styles.dialog}
            id='mobile-navigation-drawer'
            onCancel={cancelDrawer}
            onClick={dismissBackdrop}
            ref={dialogRef}
        >
            {shell.drawerOpen ? (
                <div
                    aria-label={t('shell.sidebar')}
                    className={styles.panel}
                    role='region'
                >
                    <Sidebar
                        authenticated={authenticated}
                        pending={pending}
                        onClose={closeDrawer}
                        onNavigate={navigate}
                        shell={shell}
                        variant='drawer'
                    />
                </div>
            ) : null}
        </dialog>
    );
}
