import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AuthProvider } from '@/fsd/features/auth';
import { I18nProvider } from '@/fsd/shared/i18n';
import { getRequestI18n } from '@/fsd/shared/i18n/server';
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
    const { locale, messages } = await getRequestI18n();

    return (
        <html lang={locale}>
            <body>
                <I18nProvider locale={locale} messages={messages}>
                    <AuthProvider>
                        <SiteHeader />
                        {children}
                    </AuthProvider>
                </I18nProvider>
            </body>
        </html>
    );
}
