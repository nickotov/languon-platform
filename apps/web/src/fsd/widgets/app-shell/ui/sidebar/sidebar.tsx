'use client';
import { House, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/fsd/shared/i18n';
import { IconButton, Logo, Tooltip } from '@/fsd/shared/ui';
import { useModifierKeyLabel } from '../../hooks/use-modifier-key-label';
import type { AppShellState } from '../../hooks/use-app-shell-state';
import { navigationSections } from '../../lib/navigation-sections';
import { useShellNavigation } from '../../model/navigation-context';
import type { NavigationVariant } from '../../types';
import { AccountArea } from '../account-area/account-area';
import { CreateMenu } from '../create-menu/create-menu';
import { GuestArea } from '../guest-area/guest-area';
import { RailFlyout } from '../rail-flyout/rail-flyout';
import { ResourceSection } from '../resource-section/resource-section';
import styles from './sidebar-common.module.css';

type Props = {
    authenticated: boolean;
    pending: boolean;
    onClose?: (() => void) | undefined;
    onNavigate?: (() => void) | undefined;
    shell: AppShellState;
    variant: NavigationVariant;
};
export function Sidebar({
    authenticated,
    pending,
    onClose,
    onNavigate,
    shell,
    variant,
}: Props) {
    const { href, t } = useI18n();
    const { openSearch } = useShellNavigation();
    const pathname = usePathname();
    const modifier = useModifierKeyLabel();
    const rail = variant === 'rail';
    const touch = variant === 'drawer';
    const brandClass = rail ? styles.railBrand : styles.brand;
    const toolsClass = rail ? styles.railTools : styles.tools;
    const searchClass = touch
        ? `${styles.search} ${styles.touchSearch}`
        : styles.search;
    const homeClass = [
        styles.home,
        pathname === '/' ? styles.homeActive : '',
        rail ? styles.railHome : '',
        touch ? styles.touchHome : '',
    ]
        .filter(Boolean)
        .join(' ');
    const homeLink = (
        <Link
            aria-current={pathname === '/' ? 'page' : undefined}
            aria-label={rail ? t('shell.home') : undefined}
            className={homeClass}
            href={href('/')}
            {...(onNavigate ? { onClick: onNavigate } : {})}
        >
            <House aria-hidden size={rail ? 20 : 18} strokeWidth={1.75} />
            {rail ? null : t('shell.home')}
        </Link>
    );
    return (
        <div className={styles.sidebarContent}>
            <div className={brandClass}>
                <Logo
                    className={rail ? styles.railLogo : undefined}
                    href={href('/')}
                    label={t('auth.brandHome')}
                    monogram={rail}
                />
                {rail ? null : (
                    <IconButton
                        className={touch ? styles.touchButton : styles.collapse}
                        size='compact'
                        icon={touch ? <X /> : <PanelLeftClose />}
                        label={t(
                            touch
                                ? 'shell.closeNavigation'
                                : 'shell.collapseSidebar',
                        )}
                        onClick={touch ? onClose : shell.toggleRail}
                        tooltipPlacement='bottom'
                        variant='ghost'
                    />
                )}
            </div>
            {authenticated ? (
                <div className={toolsClass}>
                    {rail ? (
                        <IconButton
                            className={styles.railControl}
                            icon={<Search size={20} />}
                            label={t('shell.search')}
                            onClick={openSearch}
                            tooltipPlacement='right'
                            variant='ghost'
                        />
                    ) : (
                        <button
                            aria-keyshortcuts='Meta+K Control+K'
                            className={searchClass}
                            onClick={openSearch}
                            type='button'
                        >
                            <Search aria-hidden size={16} />
                            <span>{t('shell.search')}</span>
                            {!touch ? (
                                <span aria-hidden className={styles.shortcut}>
                                    <kbd>{modifier}</kbd>
                                    <kbd>K</kbd>
                                </span>
                            ) : null}
                        </button>
                    )}
                    <CreateMenu rail={rail} touch={touch} />
                </div>
            ) : null}
            <nav
                aria-label={t('shell.mainNavigation')}
                className={rail ? styles.railNavigation : styles.navigation}
            >
                {authenticated ? (
                    <>
                        {rail ? (
                            <div className={styles.railHomeSlot}>
                                <Tooltip
                                    content={t('shell.home')}
                                    placement='right'
                                >
                                    {homeLink}
                                </Tooltip>
                            </div>
                        ) : (
                            homeLink
                        )}
                        <div
                            className={
                                rail ? styles.railDivider : styles.groupHeading
                            }
                        >
                            {rail ? null : t('shell.library')}
                        </div>
                        <ul className={styles.navList}>
                            {navigationSections.map((section) =>
                                rail ? (
                                    <RailFlyout
                                        key={section.kind}
                                        section={section}
                                    />
                                ) : (
                                    <ResourceSection
                                        key={section.kind}
                                        onNavigate={onNavigate}
                                        section={section}
                                        shell={shell}
                                        touch={touch}
                                    />
                                ),
                            )}
                        </ul>
                    </>
                ) : null}
            </nav>
            <div className={rail ? styles.railFooter : undefined}>
                {rail ? (
                    <IconButton
                        className={`${styles.expand} ${styles.railControl}`}
                        icon={<PanelLeftOpen />}
                        label={t('shell.expandSidebar')}
                        onClick={shell.toggleRail}
                        tooltipPlacement='right'
                        variant='ghost'
                    />
                ) : null}
                {authenticated ? (
                    <AccountArea
                        accountOpen={shell.accountOpen}
                        onAccountOpenChange={shell.setAccountOpen}
                        onNavigate={onNavigate}
                        variant={variant}
                    />
                ) : (
                    <GuestArea
                        accountOpen={shell.accountOpen}
                        onAccountOpenChange={shell.setAccountOpen}
                        onNavigate={onNavigate}
                        pending={pending}
                        variant={variant}
                    />
                )}
            </div>
        </div>
    );
}
