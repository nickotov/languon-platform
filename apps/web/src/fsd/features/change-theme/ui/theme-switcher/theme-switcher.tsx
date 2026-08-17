'use client';
import type { ChangeEvent } from 'react';
import { Select } from '@/fsd/shared/ui';
import {
    themeCookieName,
    themePreferences,
    type ThemePreference,
    useTheme,
} from '@/fsd/shared/theme';
import { useI18n } from '@/fsd/shared/i18n';
import styles from './theme-switcher.module.css';
export function ThemeSwitcher() {
    const { preference, setPreference } = useTheme();
    const { t } = useI18n();
    function change(event: ChangeEvent<HTMLSelectElement>) {
        const next = event.currentTarget.value as ThemePreference;
        setPreference(next);
        document.cookie = `${themeCookieName}=${next}; Max-Age=31536000; Path=/; SameSite=Lax`;
    }
    return (
        <label className={styles.field}>
            <span className={styles.label}>{t('theme.label')}</span>
            <Select
                aria-label={t('theme.label')}
                onChange={change}
                value={preference}
            >
                {themePreferences.map((theme) => (
                    <option key={theme} value={theme}>
                        {t(`theme.option.${theme}`)}
                    </option>
                ))}
            </Select>
        </label>
    );
}
