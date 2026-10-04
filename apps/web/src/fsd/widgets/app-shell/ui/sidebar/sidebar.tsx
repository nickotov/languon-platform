'use client';

import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';

import type { DictionaryNavigationState } from '@/fsd/features/dictionary-library';
import { useI18n } from '@/fsd/shared/i18n';
import { IconButton, Logo } from '@/fsd/shared/ui';

import type { AppShellState } from '../../hooks/use-app-shell-state';
import type { NavigationVariant } from '../../types';
import { AccountArea } from '../account-area/account-area';
import { DictionariesNavigation } from './dictionaries-navigation';
import styles from './sidebar-common.module.css';

type Props = {
    navigation: DictionaryNavigationState;
    onClose?: (() => void) | undefined;
    onNavigate?: (() => void) | undefined;
    shell: AppShellState;
    variant: NavigationVariant;
};

export function Sidebar({
    navigation,
    onClose,
    onNavigate,
    shell,
    variant,
}: Props) {
    const { href, t } = useI18n();

    const rail = variant === 'rail';

    const drawer = variant === 'drawer';

    function resolveSidebarContent() {
        if (rail) {
            return null;
        }

        if (drawer) {
            return (
                <IconButton
                    className={styles.touchButton}
                    icon={<X />}
                    label={t('shell.closeNavigation')}
                    onClick={onClose}
                    showTooltip={false}
                    variant='ghost'
                />
            );
        }

        return (
            <IconButton
                icon={<PanelLeftClose />}
                label={t('shell.collapseSidebar')}
                onClick={shell.toggleRail}
                tooltipPlacement='bottom'
                variant='ghost'
            />
        );
    }

    const resolvedSidebarContent = resolveSidebarContent();

    return (
        <div className={styles.sidebarContent}>
            <div className={rail ? styles.railBrand : styles.brand}>
                <Logo
                    href={href('/dictionaries')}
                    label={t('auth.brandHome')}
                    monogram={rail}
                />
                {resolvedSidebarContent}
            </div>
            <nav
                aria-label={t('shell.mainNavigation')}
                className={rail ? styles.railNavigation : styles.navigation}
            >
                {rail ? (
                    <IconButton
                        className={styles.railControl}
                        icon={<PanelLeftOpen />}
                        label={t('shell.expandSidebar')}
                        onClick={shell.toggleRail}
                        tooltipPlacement='right'
                        variant='ghost'
                    />
                ) : null}
                <ul className={styles.navList}>
                    <DictionariesNavigation
                        navigation={navigation}
                        onNavigate={onNavigate}
                        shell={shell}
                        variant={variant}
                    />
                </ul>
            </nav>
            <AccountArea
                accountOpen={shell.accountOpen}
                onAccountOpenChange={shell.setAccountOpen}
                onNavigate={onNavigate}
                variant={variant}
            />
        </div>
    );
}
