export const LANGUAGE_CATALOG_VERSION = 1 as const;

export const INTERFACE_LOCALES = Object.freeze([
    'en',
    'es',
    'fr',
    'ru',
] as const);

export type InterfaceLocale = (typeof INTERFACE_LOCALES)[number];
export type LanguageDirection = 'ltr' | 'rtl';

export const SUPPORTED_LANGUAGE_TAGS = Object.freeze([
    'ar',
    'de',
    'en',
    'es',
    'fr',
    'he',
    'hi',
    'it',
    'ja',
    'ko',
    'pl',
    'pt',
    'ru',
    'tr',
    'uk',
    'zh-Hans',
] as const);

export type LanguageTag = (typeof SUPPORTED_LANGUAGE_TAGS)[number];

export interface LanguageDisplayNames {
    readonly en: string;
    readonly es: string;
    readonly fr: string;
    readonly ru: string;
}

export interface LanguageCatalogEntry {
    readonly tag: LanguageTag;
    readonly direction: LanguageDirection;
    readonly displayNames: LanguageDisplayNames;
}

function entry(
    tag: LanguageTag,
    direction: LanguageDirection,
    displayNames: LanguageDisplayNames,
): LanguageCatalogEntry {
    return Object.freeze({
        tag,
        direction,
        displayNames: Object.freeze(displayNames),
    });
}

export const LANGUAGE_CATALOG: readonly LanguageCatalogEntry[] = Object.freeze([
    entry('ar', 'rtl', {
        en: 'Arabic',
        es: 'Árabe',
        fr: 'Arabe',
        ru: 'Арабский',
    }),
    entry('de', 'ltr', {
        en: 'German',
        es: 'Alemán',
        fr: 'Allemand',
        ru: 'Немецкий',
    }),
    entry('en', 'ltr', {
        en: 'English',
        es: 'Inglés',
        fr: 'Anglais',
        ru: 'Английский',
    }),
    entry('es', 'ltr', {
        en: 'Spanish',
        es: 'Español',
        fr: 'Espagnol',
        ru: 'Испанский',
    }),
    entry('fr', 'ltr', {
        en: 'French',
        es: 'Francés',
        fr: 'Français',
        ru: 'Французский',
    }),
    entry('he', 'rtl', {
        en: 'Hebrew',
        es: 'Hebreo',
        fr: 'Hébreu',
        ru: 'Иврит',
    }),
    entry('hi', 'ltr', {
        en: 'Hindi',
        es: 'Hindi',
        fr: 'Hindi',
        ru: 'Хинди',
    }),
    entry('it', 'ltr', {
        en: 'Italian',
        es: 'Italiano',
        fr: 'Italien',
        ru: 'Итальянский',
    }),
    entry('ja', 'ltr', {
        en: 'Japanese',
        es: 'Japonés',
        fr: 'Japonais',
        ru: 'Японский',
    }),
    entry('ko', 'ltr', {
        en: 'Korean',
        es: 'Coreano',
        fr: 'Coréen',
        ru: 'Корейский',
    }),
    entry('pl', 'ltr', {
        en: 'Polish',
        es: 'Polaco',
        fr: 'Polonais',
        ru: 'Польский',
    }),
    entry('pt', 'ltr', {
        en: 'Portuguese',
        es: 'Portugués',
        fr: 'Portugais',
        ru: 'Португальский',
    }),
    entry('ru', 'ltr', {
        en: 'Russian',
        es: 'Ruso',
        fr: 'Russe',
        ru: 'Русский',
    }),
    entry('tr', 'ltr', {
        en: 'Turkish',
        es: 'Turco',
        fr: 'Turc',
        ru: 'Турецкий',
    }),
    entry('uk', 'ltr', {
        en: 'Ukrainian',
        es: 'Ucraniano',
        fr: 'Ukrainien',
        ru: 'Украинский',
    }),
    entry('zh-Hans', 'ltr', {
        en: 'Chinese (Simplified)',
        es: 'Chino (simplificado)',
        fr: 'Chinois (simplifié)',
        ru: 'Китайский (упрощённый)',
    }),
]);

const CATALOG_BY_TAG = new Map(
    LANGUAGE_CATALOG.map((language) => [language.tag, language]),
);

export function isLanguageTag(value: unknown): value is LanguageTag {
    return (
        typeof value === 'string' && CATALOG_BY_TAG.has(value as LanguageTag)
    );
}

export function canonicalizeLanguageTag(value: string): LanguageTag | null {
    let canonical: string | undefined;

    try {
        [canonical] = Intl.getCanonicalLocales(value);
    } catch {
        return null;
    }

    return canonical !== undefined && isLanguageTag(canonical)
        ? canonical
        : null;
}

export function getLanguage(value: string): LanguageCatalogEntry | undefined {
    const tag = canonicalizeLanguageTag(value);

    return tag === null ? undefined : CATALOG_BY_TAG.get(tag);
}

export function getLanguageDisplayName(
    value: string,
    locale: InterfaceLocale,
): string | undefined {
    return getLanguage(value)?.displayNames[locale];
}
