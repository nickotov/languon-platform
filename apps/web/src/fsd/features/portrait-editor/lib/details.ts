import type { PortraitItems } from '@languon/contracts';
import type { Locale } from '@/fsd/shared/i18n';
import {
    AGE_RANGES,
    TONES,
    LENGTHS,
    WORDINGS,
    ORDERS,
    LEVELS,
    MIXING,
} from './options';
import { labels, copy } from './copy';
import { languageLabel } from './items';
export function portraitDetails(items: PortraitItems, locale: Locale) {
    const text = labels[locale];
    const term = (
        options: { value: string; label: Record<Locale, string> }[],
        value: string | undefined,
    ) =>
        options.find((option) => option.value === value)?.label[locale] ??
        value ??
        '';
    const languages = items.languages
        .map((item) =>
            [
                languageLabel(item.language, locale),
                term(LEVELS, item.level),
                item.learning ? text.learning : '',
                item.clarification ?? '',
            ]
                .filter(Boolean)
                .join(' · '),
        )
        .join('; ');
    const explanation = [
        items.explanationLanguages
            .map((code) => languageLabel(code, locale))
            .join(', '),
    ];
    if (items.mixedLanguageFrequency)
        explanation.push(term(MIXING, items.mixedLanguageFrequency));
    else if (items.mixedLanguage !== undefined)
        explanation.push(
            items.mixedLanguage
                ? copy(
                      locale,
                      'Mixed languages welcome',
                      'Можно смешивать языки',
                      'Mélange de langues bienvenu',
                      'Se pueden mezclar idiomas',
                  )
                : copy(
                      locale,
                      'Keep one language',
                      'Лучше один язык',
                      'Une seule langue',
                      'Un solo idioma',
                  ),
        );
    if (items.mixingNote) explanation.push(`“${items.mixingNote}”`);
    return [
        { key: 'languages', term: text.languages, value: languages },
        {
            key: 'explanation',
            term: text.explanation,
            value: explanation.filter(Boolean).join(' · '),
        },
        { key: 'goals', term: text.goals, value: items.goals.join(', ') },
        {
            key: 'style',
            term: text.style,
            value: [
                term(TONES, items.tone),
                term(LENGTHS, items.detail),
                term(WORDINGS, items.wording),
                term(ORDERS, items.approach),
            ]
                .filter(Boolean)
                .join(' · '),
        },
        {
            key: 'accommodations',
            term: text.accommodations,
            value: items.accommodations.join(', '),
        },
        { key: 'hobbies', term: text.hobbies, value: items.hobbies.join(', ') },
        {
            key: 'notes',
            term: copy(
                locale,
                'Confirmed notes',
                'Подтверждённые заметки',
                'Notes confirmées',
                'Notas confirmadas',
            ),
            value: (items.notes ?? []).map((note) => note.text).join('; '),
        },
        {
            key: 'ageRange',
            term: text.age,
            value: term(AGE_RANGES, items.ageRange),
        },
    ];
}
export function portraitDiff(
    before: PortraitItems,
    after: PortraitItems,
    locale: Locale,
) {
    const prior = portraitDetails(before, locale);
    return portraitDetails(after, locale).flatMap((row, index) => {
        const previous = prior[index]!.value;
        if (row.value === previous) return [];
        let kind: 'added' | 'removed' | 'changed' = 'changed';
        if (!previous) kind = 'added';
        if (!row.value) kind = 'removed';
        return [
            { ...row, kind, before: previous, text: row.value || previous },
        ];
    });
}
