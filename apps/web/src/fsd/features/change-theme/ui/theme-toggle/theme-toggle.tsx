'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
    themeCookieName,
    useTheme,
} from '@/fsd/shared/theme';
import { useI18n } from '@/fsd/shared/i18n';
import { IconButton } from '@/fsd/shared/ui';

export function ThemeToggle() {
    const { preference, setPreference } = useTheme();
    const { t } = useI18n();
    const [systemDark, setSystemDark] = useState(false);

    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return;
        const query = window.matchMedia('(prefers-color-scheme: dark)');
        const update = () => setSystemDark(query.matches);
        update();
        query.addEventListener('change', update);
        return () => query.removeEventListener('change', update);
    }, []);

    const dark = preference === 'dark' || (preference === 'system' && systemDark);
    const label = dark ? t('theme.switchToLight') : t('theme.switchToDark');

    return (
        <IconButton
            data-testid='theme-toggle'
            icon={dark ? <Sun /> : <Moon />}
            label={label}
            onClick={() => {
                const next = dark ? 'light' : 'dark';
                setPreference(next);
                document.cookie = `${themeCookieName}=${next}; Max-Age=31536000; Path=/; SameSite=Lax`;
            }}
            tooltipPlacement='bottom'
            variant='ghost'
        />
    );
}
