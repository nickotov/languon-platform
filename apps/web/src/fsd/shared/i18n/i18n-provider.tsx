'use client';

import {
    createContext,
    type Dispatch,
    type ReactNode,
    type SetStateAction,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import type { Locale } from './config';
import type { Messages } from './messages/en';
import { createTranslator, type Translate } from './translator';

interface I18nContextValue {
    formatDate(value: Date | number | string): string;
    href(path: string): string;
    locale: Locale;
    t: Translate;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
    children,
    locale,
    messages,
}: {
    children: ReactNode;
    locale: Locale;
    messages: Messages;
}) {
    const t = useMemo(() => createTranslator(messages), [messages]);
    const href = useCallback((path: string) => path, []);
    const formatDate = useCallback(
        (value: Date | number | string) =>
            new Intl.DateTimeFormat(locale, {
                dateStyle: 'medium',
                timeStyle: 'short',
            }).format(typeof value === 'string' ? new Date(value) : value),
        [locale],
    );
    const context = useMemo(
        () => ({ formatDate, href, locale, t }),
        [formatDate, href, locale, t],
    );

    return (
        <I18nContext.Provider value={context}>{children}</I18nContext.Provider>
    );
}

export function useI18n(): I18nContextValue {
    const context = useContext(I18nContext);
    if (!context) throw new Error('useI18n must be used within I18nProvider');
    return context;
}

export function useLocaleSensitiveState<State>(
    resetValue: State,
): [State, Dispatch<SetStateAction<State>>] {
    const { locale } = useI18n();
    const currentLocale = useRef(locale);
    currentLocale.current = locale;
    const [state, setState] = useState(resetValue);

    useEffect(() => setState(resetValue), [locale, resetValue]);

    const setLocaleState = useCallback<Dispatch<SetStateAction<State>>>(
        (value) => {
            if (currentLocale.current !== locale) return;
            setState(value);
        },
        [locale],
    );

    return [state, setLocaleState];
}
