'use client';

import { LoaderCircle, LogIn, Settings } from 'lucide-react';
import { useCallback } from 'react';

import { useI18n } from '@/fsd/shared/i18n';
import {
    ButtonLink,
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/fsd/shared/ui';

import { useGuestPreferencesPortal } from '../../hooks/use-guest-preferences-portal';
import type { NavigationVariant } from '../../types';
import { PreferencesControls } from '../preferences-controls/preferences-controls';
import styles from './guest-area.module.css';

export type GuestAreaProps = {
    accountOpen: boolean;
    onAccountOpenChange(open: boolean): void;
    onNavigate?: (() => void) | undefined;
    variant: NavigationVariant;
    pending?: boolean;
};

export function GuestArea({
    accountOpen,
    onAccountOpenChange,
    onNavigate,
    variant,
    pending = false,
}: GuestAreaProps) {
    const { href, t } = useI18n();
    const { portalContainer, setSettingsTrigger } = useGuestPreferencesPortal();
    const rail = variant === 'rail';
    const footerClassName = [styles.footer, rail ? styles.rail : undefined]
        .filter(Boolean)
        .join(' ');
    const settingsLabel = t('shell.settings');
    const signInLabel = t('home.signIn');
    const restoringLabel = t('home.restoring');
    const signInClassName = rail ? styles.railSignIn : styles.signIn;

    // The panel is newly mounted on open. Stable callback identity prevents
    // preference updates from pulling focus away from their active controls.
    const focusPreferences = useCallback((node: HTMLDivElement | null) => {
        node?.focus();
    }, []);

    function handleSignIn() {
        onNavigate?.();
    }

    return (
        <div className={footerClassName}>
            {pending ? (
                <div
                    aria-label={restoringLabel}
                    className={styles.pending}
                    role='status'
                >
                    <LoaderCircle aria-hidden size={18} />
                    {rail ? null : <span>{restoringLabel}</span>}
                </div>
            ) : (
                <ButtonLink
                    aria-label={signInLabel}
                    className={signInClassName}
                    href={href('/login')}
                    onClick={handleSignIn}
                    title={rail ? signInLabel : undefined}
                >
                    {rail ? <LogIn aria-hidden size={20} /> : signInLabel}
                </ButtonLink>
            )}
            <Popover open={accountOpen} onOpenChange={onAccountOpenChange}>
                <PopoverTrigger asChild ref={setSettingsTrigger}>
                    <button
                        aria-label={settingsLabel}
                        className={styles.settingsTrigger}
                        title={settingsLabel}
                        type='button'
                    >
                        <Settings aria-hidden size={20} />
                    </button>
                </PopoverTrigger>
                <PopoverContent
                    align='start'
                    aria-label={settingsLabel}
                    className={styles.popover}
                    portalContainer={portalContainer}
                    ref={focusPreferences}
                    side={rail ? 'right' : 'top'}
                    sideOffset={rail ? 12 : 8}
                    tabIndex={-1}
                >
                    <div className={styles.preferences}>
                        <PreferencesControls />
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
}
