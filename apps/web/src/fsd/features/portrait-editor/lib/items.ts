import type { PortraitItems } from '@languon/contracts';
import type { Locale } from '@/fsd/shared/i18n';
export function emptyPortraitItems(): PortraitItems {
    return {
        languages: [],
        explanationLanguages: [],
        goals: [],
        accommodations: [],
        hobbies: [],
    };
}
export function hasMeaningfulPortraitItems(items: PortraitItems): boolean {
    return (
        items.languages.length > 0 ||
        items.explanationLanguages.length > 0 ||
        items.goals.some((v) => v.trim()) ||
        items.accommodations.some((v) => v.trim()) ||
        items.hobbies.some((v) => v.trim()) ||
        items.mixedLanguage !== undefined ||
        items.mixedLanguageFrequency !== undefined ||
        Boolean(items.mixingNote?.trim()) ||
        Boolean(items.notes?.some((note) => note.text.trim())) ||
        Boolean(
            items.tone ||
            items.detail ||
            items.wording ||
            items.approach ||
            (items.ageRange && items.ageRange !== 'prefer-not-to-say'),
        )
    );
}
export function languageLabel(code: string, locale: Locale) {
    try {
        return (
            new Intl.DisplayNames([locale], { type: 'language' }).of(code) ??
            code
        );
    } catch {
        return code;
    }
}
export function toggleItem(values: string[], value: string) {
    return values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value];
}

/** Resolve typed language names to contract tags without assessing proficiency. */
export function resolvePortraitLanguage(
    input: string,
    locale: Locale,
): string | undefined {
    const value = input.trim();
    if (!value) return undefined;
    if (
        /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})*$/.test(value) &&
        value.length <= 35
    )
        return value.toLowerCase();
    const normalized = value.toLocaleLowerCase(locale);
    const names = new Intl.DisplayNames([locale], { type: 'language' });
    const english = new Intl.DisplayNames(['en'], { type: 'language' });
    for (let first = 97; first <= 122; first += 1)
        for (let second = 97; second <= 122; second += 1) {
            const code = String.fromCharCode(first, second);
            const localized = names.of(code);
            const fallback = english.of(code);
            if (
                localized?.toLocaleLowerCase(locale) === normalized ||
                fallback?.toLowerCase() === normalized
            )
                return code;
        }
    return undefined;
}
