'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';

import { LanguageSwitcher } from '@/fsd/features/change-locale';
import { useI18n } from '@/fsd/shared/i18n';
import {
    themeCookieName,
    type ThemePreference,
    useTheme,
} from '@/fsd/shared/theme';

import styles from './preferences-controls.module.css';

export function PreferencesControls() {
    const { t } = useI18n();
    const { preference, setPreference } = useTheme();

    function selectTheme(next: ThemePreference) {
        setPreference(next);
        document.cookie = `${themeCookieName}=${next}; Max-Age=31536000; Path=/; SameSite=Lax`;
    }

    function selectSystem() {
        selectTheme('system');
    }

    function selectLight() {
        selectTheme('light');
    }

    function selectDark() {
        selectTheme('dark');
    }

    return (
        <>
            <LanguageSwitcher form />
            <fieldset className={styles.themeFieldset}>
                <legend className={styles.themeLegend}>
                    {t('theme.label')}
                </legend>
                <div className={styles.themeOptions}>
                    <ThemeOption
                        checked={preference === 'system'}
                        icon={<Monitor aria-hidden size={15} />}
                        label={t('theme.option.system')}
                        onSelect={selectSystem}
                    />
                    <ThemeOption
                        checked={preference === 'light'}
                        icon={<Sun aria-hidden size={15} />}
                        label={t('theme.option.light')}
                        onSelect={selectLight}
                    />
                    <ThemeOption
                        checked={preference === 'dark'}
                        icon={<Moon aria-hidden size={15} />}
                        label={t('theme.option.dark')}
                        onSelect={selectDark}
                    />
                </div>
            </fieldset>
        </>
    );
}

function ThemeOption({
    checked,
    icon,
    label,
    onSelect,
}: {
    checked: boolean;
    icon: ReactNode;
    label: string;
    onSelect(): void;
}) {
    return (
        <button
            aria-pressed={checked}
            className={styles.themeOption}
            onClick={onSelect}
            type='button'
        >
            {icon}
            <span className={styles.themeLabel}>{label}</span>
        </button>
    );
}
