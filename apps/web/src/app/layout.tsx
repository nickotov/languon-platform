import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import '@fontsource-variable/literata';
import '@fontsource-variable/manrope';

import { AuthProvider } from '@/fsd/features/auth';
import { I18nProvider } from '@/fsd/shared/i18n';
import { getRequestI18n } from '@/fsd/shared/i18n/server';
import { ThemeProvider } from '@/fsd/shared/theme';
import { getRequestTheme } from '@/fsd/shared/theme/server';
import { ToastHost } from '@/fsd/shared/ui';
import { SiteHeader } from '@/fsd/widgets/site-header';

import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
    const { t } = await getRequestI18n();
    return { description: t('meta.description'), title: 'Languon' };
}

export default async function RootLayout({
    children,
}: {
    children: ReactNode;
}) {
    const [{ locale, messages }, theme] = await Promise.all([
        getRequestI18n(),
        getRequestTheme(),
    ]);

    return (
        <html data-theme={theme} lang={locale}>
            <body>
                <I18nProvider locale={locale} messages={messages}>
                    <ThemeProvider preference={theme}>
                        <AuthProvider>
                            <SiteHeader />
                            {children}
                            <ToastHost
                                label={messages['toast.notifications']}
                            />
                        </AuthProvider>
                    </ThemeProvider>
                </I18nProvider>
            </body>
        </html>
    );
}
