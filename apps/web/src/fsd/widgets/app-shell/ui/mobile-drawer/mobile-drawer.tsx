'use client';

import { useEffect, useRef } from 'react';

import type { DictionaryNavigationState } from '@/fsd/features/dictionary-library';
import { useI18n } from '@/fsd/shared/i18n';

import type { AppShellState } from '../../hooks/use-app-shell-state';
import { Sidebar } from '../sidebar/sidebar';
import styles from './mobile-drawer.module.css';

export function MobileDrawer({
    navigation,
    shell,
}: {
    navigation: DictionaryNavigationState;
    shell: AppShellState;
}) {
    const { t } = useI18n();

    const dialogRef = useRef<HTMLDialogElement>(null);

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
            onCancel={(event) => {
                event.preventDefault();

                shell.closeDrawer();
            }}
            onClick={(event) => {
                if (event.target === event.currentTarget) shell.closeDrawer();
            }}
            ref={dialogRef}
        >
            {shell.drawerOpen ? (
                <div className={styles.panel}>
                    <Sidebar
                        navigation={navigation}
                        onClose={() => shell.closeDrawer()}
                        onNavigate={() => shell.closeDrawer(false)}
                        shell={shell}
                        variant='drawer'
                    />
                </div>
            ) : null}
        </dialog>
    );
}
