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

export function LanguageSwitcher({
    compact = false,
    form = false,
}: {
    compact?: boolean;
    form?: boolean;
}) {
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

    const choices = locales.map((supportedLocale) => ({
        label: t(`language.option.${supportedLocale}`),
        value: supportedLocale,
    }));

    if (form)
        return (
            <Select
                disabled={pending}
                label={t('profile.interfaceLanguage')}
                onChange={changeLanguage}
                options={choices}
                value={locale}
            />
        );

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
                {choices.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                        {choice.label}
                    </option>
                ))}
            </Select>
        </label>
    );
}
