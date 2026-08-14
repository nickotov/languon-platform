import { cookies, headers } from 'next/headers';

import { localeCookieName, preferredLocale, type Locale } from './config';
import type { Messages } from './messages/en';
import { createTranslator } from './translator';

const loaders: Record<Locale, () => Promise<Messages>> = {
    en: () => import('./messages/en').then(({ en }) => en),
    es: () => import('./messages/es').then(({ es }) => es),
    fr: () => import('./messages/fr').then(({ fr }) => fr),
    ru: () => import('./messages/ru').then(({ ru }) => ru),
};

export async function getMessages(locale: Locale): Promise<Messages> {
    return loaders[locale]();
}

export async function getRequestLocale(): Promise<Locale> {
    const [cookieStore, headerStore] = await Promise.all([
        cookies(),
        headers(),
    ]);
    return preferredLocale(
        cookieStore.get(localeCookieName)?.value,
        headerStore.get('accept-language'),
    );
}

export async function getServerI18n(locale: Locale) {
    const messages = await getMessages(locale);
    return { messages, t: createTranslator(messages) };
}

export async function getRequestI18n() {
    const locale = await getRequestLocale();
    return { locale, ...(await getServerI18n(locale)) };
}
