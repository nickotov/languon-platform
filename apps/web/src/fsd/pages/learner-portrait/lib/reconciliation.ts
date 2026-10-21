import type { PortraitItems } from '@languon/contracts';

export type PortraitField = keyof PortraitItems;
export type PortraitConflictChoice = 'saved' | 'draft';
export type PortraitConflictChoices = Partial<
    Record<PortraitField, PortraitConflictChoice>
>;

export function changedPortraitFields(
    latest: PortraitItems,
    draft: PortraitItems,
): PortraitField[] {
    const keys = new Set([
        ...Object.keys(latest),
        ...Object.keys(draft),
    ]) as Set<PortraitField>;
    return [...keys].filter(
        (key) => JSON.stringify(latest[key]) !== JSON.stringify(draft[key]),
    );
}

export function reconcilePortraitItems(
    latest: PortraitItems,
    draft: PortraitItems,
    choices: PortraitConflictChoices,
): PortraitItems | null {
    const changed = changedPortraitFields(latest, draft);
    if (changed.some((field) => !choices[field])) return null;
    const result = { ...draft };
    for (const field of changed) {
        if (choices[field] !== 'saved') continue;
        if (latest[field] === undefined) delete result[field];
        else Object.assign(result, { [field]: latest[field] });
    }
    return result;
}

const fields = {
    en: {
        mixedLanguageFrequency: 'Mixed-language frequency',
        mixingNote: 'Language-mixing preference',
        notes: 'Confirmed notes',
        languages: 'Languages',
        explanationLanguages: 'Explanation languages',
        mixedLanguage: 'Mixed-language explanations',
        goals: 'Goals',
        tone: 'Tone',
        detail: 'Detail',
        wording: 'Wording',
        approach: 'Approach',
        accommodations: 'What helps you learn',
        hobbies: 'Interests',
        ageRange: 'Age range',
    },
    ru: {
        mixedLanguageFrequency: 'Частота смешения языков',
        mixingNote: 'Предпочтения смешения языков',
        notes: 'Подтверждённые заметки',
        languages: 'Языки',
        explanationLanguages: 'Языки объяснений',
        mixedLanguage: 'Смешанные языки объяснений',
        goals: 'Цели',
        tone: 'Тон',
        detail: 'Подробность',
        wording: 'Формулировки',
        approach: 'Подход',
        accommodations: 'Что помогает учиться',
        hobbies: 'Интересы',
        ageRange: 'Возрастная группа',
    },
    fr: {
        mixedLanguageFrequency: 'Fréquence du mélange de langues',
        mixingNote: 'Préférence de mélange de langues',
        notes: 'Notes confirmées',
        languages: 'Langues',
        explanationLanguages: 'Langues d’explication',
        mixedLanguage: 'Explications multilingues',
        goals: 'Objectifs',
        tone: 'Ton',
        detail: 'Détail',
        wording: 'Formulation',
        approach: 'Approche',
        accommodations: 'Aides à l’apprentissage',
        hobbies: 'Centres d’intérêt',
        ageRange: 'Tranche d’âge',
    },
    es: {
        mixedLanguageFrequency: 'Frecuencia de mezcla de idiomas',
        mixingNote: 'Preferencia de mezcla de idiomas',
        notes: 'Notas confirmadas',
        languages: 'Idiomas',
        explanationLanguages: 'Idiomas de explicación',
        mixedLanguage: 'Explicaciones multilingües',
        goals: 'Objetivos',
        tone: 'Tono',
        detail: 'Detalle',
        wording: 'Vocabulario',
        approach: 'Enfoque',
        accommodations: 'Apoyos al aprendizaje',
        hobbies: 'Intereses',
        ageRange: 'Rango de edad',
    },
};
export function portraitFieldLabel(
    locale: keyof typeof fields,
    field: PortraitField,
) {
    return fields[locale][field];
}
