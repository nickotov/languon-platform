import type { Preview } from '@storybook/nextjs-vite';
import { useEffect, type ReactNode } from 'react';

import '@fontsource-variable/manrope';
import { I18nProvider } from '../src/fsd/shared/i18n';
import { en } from '../src/fsd/shared/i18n/messages/en';
import { ru } from '../src/fsd/shared/i18n/messages/ru';

import '../src/app/globals.css';
import styles from './preview.module.css';

function ThemeCanvas({
    children,
    theme,
}: {
    children: ReactNode;
    theme: string;
}) {
    useEffect(() => {
        document.documentElement.dataset.theme = theme;
    }, [theme]);

    return <div className={styles.canvas}>{children}</div>;
}

const preview: Preview = {
    decorators: [
        (Story, context) => {
            const locale = context.globals.locale === 'ru' ? 'ru' : 'en';
            const theme = context.globals.theme ?? 'light';

            return (
                <I18nProvider
                    locale={locale}
                    messages={locale === 'ru' ? ru : en}
                >
                    <ThemeCanvas theme={theme}>
                        <Story />
                    </ThemeCanvas>
                </I18nProvider>
            );
        },
    ],
    initialGlobals: { locale: 'en', theme: 'light' },
    globalTypes: {
        locale: {
            toolbar: {
                items: [
                    { value: 'en', title: 'English' },
                    { value: 'ru', title: 'Русский' },
                ],
            },
        },
        theme: {
            toolbar: { items: ['light', 'dark', 'system'] },
        },
    },
    parameters: {
        a11y: { test: 'error' },
        viewport: {
            options: {
                phone: {
                    name: 'Phone',
                    styles: { width: '375px', height: '812px' },
                },
            },
        },
    },
};

export default preview;
