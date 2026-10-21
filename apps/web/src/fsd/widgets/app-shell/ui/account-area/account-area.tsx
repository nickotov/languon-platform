'use client';

import {
    ChevronsUpDown,
    LogOut,
    Settings,
    Sparkles,
    UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import { useSessionStore } from '@/fsd/entities/session';
import { useAuth } from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Avatar,
    Popover,
    PopoverClose,
    PopoverContent,
    PopoverTrigger,
    showToast,
} from '@/fsd/shared/ui';

import type { NavigationVariant } from '../../types';
import { PreferencesControls } from '../preferences-controls/preferences-controls';
import styles from './account-area.module.css';

type Props = {
    accountOpen: boolean;
    onAccountOpenChange(open: boolean): void;
    onNavigate?: (() => void) | undefined;
    variant: NavigationVariant;
};

export function AccountArea({
    accountOpen,
    onAccountOpenChange,
    onNavigate,
    variant,
}: Props) {
    const { t } = useI18n();

    const user = useSessionStore((state) => state.user);

    const rail = variant === 'rail';

    const drawer = variant === 'drawer';

    const handle = user?.handle ? `@${user.handle}` : t('profile.account');

    const email = user?.primaryEmail ?? '';

    const label = `${t('shell.accountMenu')}, ${handle}`;

    function toggleDrawerAccount() {
        onAccountOpenChange(!accountOpen);
    }

    const trigger = (
        <button
            aria-label={label}
            className={rail ? styles.railTrigger : styles.trigger}
            onClick={drawer ? toggleDrawerAccount : undefined}
            title={rail ? label : undefined}
            type='button'
        >
            <Avatar name={handle} size='sm' />
            {rail ? null : (
                <>
                    <span className={styles.identity}>
                        <strong className={styles.identityHandle}>
                            {handle}
                        </strong>
                        <span className={styles.identityDescription}>
                            {email || t('profile.learner')}
                        </span>
                    </span>
                    <ChevronsUpDown aria-hidden size={16} />
                </>
            )}
        </button>
    );

    if (drawer)
        return (
            <div className={rail ? styles.railFooter : styles.footer}>
                {trigger}
                {accountOpen ? (
                    <div className={styles.inlineMenu}>
                        <AccountMenuContent onNavigate={onNavigate} />
                    </div>
                ) : null}
            </div>
        );

    return (
        <div className={rail ? styles.railFooter : styles.footer}>
            <Popover open={accountOpen} onOpenChange={onAccountOpenChange}>
                <PopoverTrigger asChild>{trigger}</PopoverTrigger>
                <PopoverContent
                    align='start'
                    className={styles.popover}
                    side={rail ? 'right' : 'top'}
                    sideOffset={rail ? 12 : 8}
                >
                    <AccountMenuContent onNavigate={onNavigate} popover />
                </PopoverContent>
            </Popover>
        </div>
    );
}

function AccountMenuContent({
    onNavigate,
    popover = false,
}: {
    onNavigate?: (() => void) | undefined;
    popover?: boolean;
}) {
    const { href, t } = useI18n();

    const user = useSessionStore((state) => state.user);
    const identity = user?.handle ? `@${user.handle}` : t('profile.account');
    const { signOutHere } = useAuth();

    const [signOutPending, setSignOutPending] = useState(false);

    async function signOut() {
        setSignOutPending(true);

        try {
            await signOutHere();
        } catch {
            setSignOutPending(false);

            showToast({
                content: t('shell.signOutFailed'),
                dismissLabel: t('profile.dismiss'),
                tone: 'danger',
            });
        }
    }

    const profileLink = (
        <Link
            className={styles.menuRow}
            href={href('/profile')}
            {...(onNavigate ? { onClick: onNavigate } : {})}
        >
            <UserRound aria-hidden size={17} />
            {t('shell.profile')}
        </Link>
    );

    return (
        <div className={styles.menuContent}>
            <div className={styles.menuIdentity}>
                <Avatar name={identity} size='md' />
                <div className={styles.identity}>
                    <strong className={styles.identityHandle}>
                        {identity}
                    </strong>
                    <span className={styles.identityDescription}>
                        {user?.primaryEmail}
                    </span>
                </div>
            </div>
            {popover ? (
                <PopoverClose asChild>{profileLink}</PopoverClose>
            ) : (
                profileLink
            )}
            <AccountSettingsLink
                href={href('/profile')}
                icon={<Settings aria-hidden size={16} />}
                label={t('shell.settings')}
                onNavigate={onNavigate}
                popover={popover}
            />
            <AccountSettingsLink
                href={href('/profile#ai-preferences')}
                icon={<Sparkles aria-hidden size={16} />}
                label={t('shell.aiPreferences')}
                onNavigate={onNavigate}
                popover={popover}
            />
            <div className={styles.divider} />
            <PreferencesControls />
            <div className={styles.divider} />
            <button
                aria-busy={signOutPending || undefined}
                className={`${styles.menuRow} ${styles.signOut}`}
                disabled={signOutPending}
                onClick={signOut}
                type='button'
            >
                <LogOut aria-hidden size={17} />
                {t(signOutPending ? 'shell.signingOut' : 'shell.signOut')}
            </button>
        </div>
    );
}

function AccountSettingsLink({
    href,
    icon,
    label,
    onNavigate,
    popover,
}: {
    href: string;
    icon: ReactNode;
    label: string;
    onNavigate?: (() => void) | undefined;
    popover: boolean;
}) {
    const link = (
        <Link
            className={styles.menuRow}
            href={href}
            {...(onNavigate ? { onClick: onNavigate } : {})}
        >
            {icon}
            {label}
        </Link>
    );
    return popover ? <PopoverClose asChild>{link}</PopoverClose> : link;
}
