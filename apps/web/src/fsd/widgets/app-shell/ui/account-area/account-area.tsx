'use client';

import { ChevronUp, LogOut, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

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
                    <ChevronUp aria-hidden size={16} />
                </>
            )}
        </button>
    );

    if (drawer)
        return (
            <div className={styles.footer}>
                {trigger}
                {accountOpen ? (
                    <div className={styles.inlineMenu}>
                        <AccountMenuContent onNavigate={onNavigate} />
                    </div>
                ) : null}
            </div>
        );

    return (
        <div className={styles.footer}>
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
            {popover ? (
                <PopoverClose asChild>{profileLink}</PopoverClose>
            ) : (
                profileLink
            )}
            <div className={styles.divider} />
            <PreferencesControls />
            <div className={styles.divider} />
            <button
                aria-busy={signOutPending || undefined}
                className={styles.menuRow}
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
