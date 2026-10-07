import type { Locale as UiLocale } from '@/fsd/shared/i18n';
type LanguageCode = string;

/** Plural forms keyed by CLDR category; `other` is always required. */
export type Plural = Partial<Record<Intl.LDMLPluralRule, string>> & {
    other: string;
};
export type Msg = string | Plural;
/** One row per key in the order [en, es, fr, ru]. */
export type Row = readonly [Msg, Msg, Msg, Msg];

const INDEX: Record<UiLocale, number> = { en: 0, es: 1, fr: 2, ru: 3 };
const INTL: Record<UiLocale, string> = {
    en: 'en',
    es: 'es',
    fr: 'fr',
    ru: 'ru',
};

export type Vars = Record<string, string | number>;

/** Formats a row for the interface locale. `{n}` drives plural selection and is localized as a number. */
export function formatRow(row: Row, locale: UiLocale, vars: Vars = {}): string {
    let message = row[INDEX[locale]] ?? row[0];
    if (typeof message !== 'string') {
        const n = Number(vars.n ?? 0);
        const rule = new Intl.PluralRules(INTL[locale]).select(n);
        message = message[rule] ?? message.other;
    }
    return message.replace(/\{(\w+)\}/g, (match, key: string) => {
        const value = vars[key];
        if (value === undefined) return match;
        return typeof value === 'number' ? formatNumber(value, locale) : value;
    });
}

export function formatNumber(value: number, locale: UiLocale): string {
    return new Intl.NumberFormat(INTL[locale]).format(value);
}

export function formatDate(iso: string, locale: UiLocale): string {
    return new Intl.DateTimeFormat(INTL[locale], {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    }).format(new Date(iso));
}

/** Language name in the interface language (e.g. “французский” in Russian UI). */
export function languageLabel(code: LanguageCode, locale: UiLocale): string {
    try {
        const names = new Intl.DisplayNames([INTL[locale]], {
            type: 'language',
        });
        const name = names.of(code) ?? code;
        // Russian, Spanish and French language names are lower-case mid-sentence; English is capitalized.
        return locale === 'en'
            ? name.charAt(0).toUpperCase() + name.slice(1)
            : name.toLowerCase();
    } catch {
        return code.toUpperCase();
    }
}

export function makeTranslator<T extends Record<string, Row>>(table: T) {
    return (key: keyof T, locale: UiLocale, vars?: Vars) => {
        const row = table[key];
        // A missing row shows its key instead of crashing the screen.
        return row ? formatRow(row, locale, vars) : String(key);
    };
}
