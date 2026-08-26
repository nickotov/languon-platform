import type {
    DictionaryAuthorship,
    DictionaryCard,
    DictionaryLanguageRole,
    LanguageCatalogEntry,
} from '@languon/contracts';

import type { Locale } from '@/fsd/shared/i18n';

export function languageLabel(
    languages: readonly LanguageCatalogEntry[],
    tag: string,
    locale: Locale,
): string {
    const language = languages.find((entry) => entry.tag === tag);
    return language
        ? `${language.displayNames[locale]} (${language.tag})`
        : tag;
}

export function languageForRole(
    role: DictionaryLanguageRole,
    sourceLanguage: string,
    targetLanguage: string,
): string {
    return role === 'source' ? sourceLanguage : targetLanguage;
}

export function languageDirection(
    languages: readonly LanguageCatalogEntry[],
    tag: string,
): 'ltr' | 'rtl' {
    return languages.find((entry) => entry.tag === tag)?.direction ?? 'ltr';
}

export function activeOptionalFields(card: DictionaryCard) {
    return [
        card.effectiveSettings.transcriptionEnabled
            ? ['transcription', card.values.transcription]
            : null,
        card.effectiveSettings.definitionEnabled
            ? ['definition', card.values.definition]
            : null,
        card.effectiveSettings.exampleEnabled
            ? ['example', card.values.example]
            : null,
        card.effectiveSettings.exampleTranslationEnabled
            ? ['exampleTranslation', card.values.exampleTranslation]
            : null,
    ].filter(
        (field): field is [string, string] =>
            field !== null && field[1] !== null && field[1] !== '',
    );
}

export function authorshipMessageKey(authorship: DictionaryAuthorship) {
    return `dictionary.authorship.${authorship}` as const;
}
