'use client';

import { useRouter } from 'next/navigation';
import { type ChangeEvent, useTransition } from 'react';

import {
    isLocale,
    localeCookieName,
    locales,
    useI18n,
} from '@/fsd/shared/i18n';
import { Select } from '@/fsd/shared/ui';

import styles from './language-switcher.module.css';

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
    const router = useRouter();
    const { locale, t } = useI18n();
    const [pending, startTransition] = useTransition();

    function changeLanguage(event: ChangeEvent<HTMLSelectElement>) {
        const nextLocale = event.currentTarget.value;
        if (!isLocale(nextLocale) || nextLocale === locale) return;

        document.cookie = `${localeCookieName}=${nextLocale}; Max-Age=31536000; Path=/; SameSite=Lax`;
        startTransition(() => {
            router.refresh();
        });
    }

    return (
        <label
            className={[styles.field, compact ? styles.compact : undefined]
                .filter(Boolean)
                .join(' ')}
        >
            <span className={styles.label}>{t('language.label')}</span>
            <Select
                aria-label={t('language.label')}
                className={styles.select}
                disabled={pending}
                onChange={changeLanguage}
                value={locale}
            >
                {locales.map((supportedLocale) => (
                    <option key={supportedLocale} value={supportedLocale}>
                        {t(`language.option.${supportedLocale}`)}
                    </option>
                ))}
            </Select>
        </label>
    );
}
