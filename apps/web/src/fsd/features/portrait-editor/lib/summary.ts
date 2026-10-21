import {
    portraitSerializedByteLength,
    PORTRAIT_SUMMARY_MAX_BYTES,
    type PortraitItems,
} from '@languon/contracts';

type Locale = 'en' | 'ru' | 'fr' | 'es';
const labels = {
    en: {
        languages: 'Your languages',
        learning: 'learning',
        explanations: 'You prefer explanations in',
        mixed: 'Mixed-language explanations',
        mixingNote: 'Your mixed-language preference',
        note: 'Your confirmed learning note',
        sometimes: 'sometimes helpful',
        yes: 'welcome',
        no: 'not preferred',
        goals: 'Your learning goals',
        tone: 'Your preferred tone',
        detail: 'Explanation detail',
        wording: 'Wording',
        approach: 'Explanation approach',
        accommodations: 'What helps you learn',
        hobbies: 'Your interests',
        age: 'Your age range for relevant examples',
    },
    ru: {
        languages: 'Ваши языки',
        learning: 'изучаете',
        explanations: 'Вы предпочитаете объяснения на языках',
        mixed: 'Объяснения на нескольких языках',
        mixingNote: 'Ваше пожелание об объяснениях на нескольких языках',
        note: 'Ваше подтверждённое учебное пожелание',
        sometimes: 'иногда полезны',
        yes: 'подходят',
        no: 'не предпочитаете',
        goals: 'Ваши учебные цели',
        tone: 'Предпочитаемый тон',
        detail: 'Подробность объяснений',
        wording: 'Стиль изложения',
        approach: 'Подход к объяснениям',
        accommodations: 'Что помогает вам учиться',
        hobbies: 'Ваши интересы',
        age: 'Возрастная группа для подходящих примеров',
    },
    fr: {
        languages: 'Vos langues',
        learning: 'en apprentissage',
        explanations: 'Vous préférez les explications en',
        mixed: 'Explications multilingues',
        mixingNote: 'Votre préférence pour les explications multilingues',
        note: 'Votre besoin d’apprentissage confirmé',
        sometimes: 'parfois utiles',
        yes: 'bienvenues',
        no: 'non préférées',
        goals: 'Vos objectifs',
        tone: 'Votre ton préféré',
        detail: 'Détail des explications',
        wording: 'Vocabulaire',
        approach: 'Approche des explications',
        accommodations: 'Ce qui vous aide à apprendre',
        hobbies: 'Vos centres d’intérêt',
        age: 'Votre tranche d’âge pour des exemples pertinents',
    },
    es: {
        languages: 'Tus idiomas',
        learning: 'en aprendizaje',
        explanations: 'Prefieres explicaciones en',
        mixed: 'Explicaciones multilingües',
        mixingNote: 'Tu preferencia sobre explicaciones multilingües',
        note: 'Tu preferencia de aprendizaje confirmada',
        sometimes: 'a veces útiles',
        yes: 'bienvenidas',
        no: 'no preferidas',
        goals: 'Tus objetivos',
        tone: 'Tu tono preferido',
        detail: 'Detalle de las explicaciones',
        wording: 'Vocabulario',
        approach: 'Enfoque de las explicaciones',
        accommodations: 'Lo que te ayuda a aprender',
        hobbies: 'Tus intereses',
        age: 'Tu rango de edad para ejemplos relevantes',
    },
} as const;
const terms: Record<Locale, Record<string, string>> = {
    en: {
        'just-starting': 'just starting',
        basic: 'basic',
        intermediate: 'intermediate',
        advanced: 'advanced',
        fluent: 'fluent',
        native: 'native',
        unsure: 'unsure',
        friendly: 'friendly',
        balanced: 'balanced',
        formal: 'formal',
        concise: 'concise',
        detailed: 'detailed',
        simple: 'simple',
        academic: 'academic',
        'examples-first': 'examples first',
        'theory-first': 'theory first',
        'under-18': 'under 18',
    },
    ru: {
        'just-starting': 'начальный этап',
        basic: 'базовый',
        intermediate: 'средний',
        advanced: 'продвинутый',
        fluent: 'свободный',
        native: 'родной',
        unsure: 'не уверены',
        friendly: 'дружелюбный',
        balanced: 'сбалансированный',
        formal: 'формальный',
        concise: 'кратко',
        detailed: 'подробно',
        simple: 'простой',
        academic: 'академический',
        'examples-first': 'сначала примеры',
        'theory-first': 'сначала теория',
        'under-18': 'до 18',
    },
    fr: {
        'just-starting': 'débutant',
        basic: 'élémentaire',
        intermediate: 'intermédiaire',
        advanced: 'avancé',
        fluent: 'courant',
        native: 'langue maternelle',
        unsure: 'incertain',
        friendly: 'amical',
        balanced: 'équilibré',
        formal: 'formel',
        concise: 'concis',
        detailed: 'détaillé',
        simple: 'simple',
        academic: 'académique',
        'examples-first': 'exemples d’abord',
        'theory-first': 'théorie d’abord',
        'under-18': 'moins de 18 ans',
    },
    es: {
        'just-starting': 'principiante',
        basic: 'básico',
        intermediate: 'intermedio',
        advanced: 'avanzado',
        fluent: 'fluido',
        native: 'nativo',
        unsure: 'sin precisar',
        friendly: 'amistoso',
        balanced: 'equilibrado',
        formal: 'formal',
        concise: 'conciso',
        detailed: 'detallado',
        simple: 'sencillo',
        academic: 'académico',
        'examples-first': 'primero ejemplos',
        'theory-first': 'primero teoría',
        'under-18': 'menor de 18 años',
    },
};
/** Derived only from confirmed fields; never adds model-authored assertions. */
export function previewPortraitSummary(
    items: PortraitItems,
    locale: Locale,
): string {
    const text = labels[locale];
    const term = (value: string) => terms[locale][value] ?? value;
    const names = new Intl.DisplayNames([locale], { type: 'language' });
    const languageName = (language: string) => {
        try {
            return names.of(language) ?? language;
        } catch {
            return language;
        }
    };
    const sentences: string[] = [];
    const add = (label: string, value: string | undefined) => {
        if (value) sentences.push(`${label}: ${value}.`);
    };
    // Prioritize useful accommodations/goals before optional background. Each
    // candidate is a complete assertion; omitted facts remain in editable items.
    add(text.goals, items.goals[0]);
    add(text.accommodations, items.accommodations[0]);
    add(text.note, items.notes?.[0]?.text);
    add(
        text.explanations,
        items.explanationLanguages.map(languageName).join(', '),
    );
    const addLanguage = (item: PortraitItems['languages'][number]) =>
        add(
            text.languages,
            `${languageName(item.language)}${item.level ? ` (${term(item.level)})` : ''}${item.learning ? ` — ${text.learning}` : ''}${item.clarification ? `: ${item.clarification}` : ''}`,
        );
    items.languages.slice(0, 3).forEach(addLanguage);
    if (items.mixedLanguageFrequency !== undefined)
        add(
            text.mixed,
            items.mixedLanguageFrequency === 'sometimes'
                ? text.sometimes
                : items.mixedLanguageFrequency === 'helpful'
                  ? text.yes
                  : text.no,
        );
    else if (items.mixedLanguage !== undefined)
        add(text.mixed, items.mixedLanguage ? text.yes : text.no);
    add(text.mixingNote, items.mixingNote);
    add(text.tone, items.tone && term(items.tone));
    add(text.detail, items.detail && term(items.detail));
    add(text.wording, items.wording && term(items.wording));
    add(text.approach, items.approach && term(items.approach));
    items.goals.slice(1).forEach((value) => add(text.goals, value));
    items.accommodations
        .slice(1)
        .forEach((value) => add(text.accommodations, value));
    items.languages.slice(3).forEach(addLanguage);
    items.notes?.slice(1).forEach((note) => add(text.note, note.text));
    items.hobbies.forEach((value) => add(text.hobbies, value));
    if (items.ageRange !== 'prefer-not-to-say')
        add(text.age, items.ageRange && term(items.ageRange));
    const overflow = {
        en: 'More confirmed details are available in your editable portrait.',
        ru: 'Другие подтверждённые сведения доступны в редактируемом портрете.',
        fr: 'D’autres informations confirmées figurent dans votre portrait modifiable.',
        es: 'Hay más detalles confirmados en tu retrato editable.',
    }[locale];
    const wordCount = (value: string) =>
        value.trim().split(/\s+/u).filter(Boolean).length;
    const complete = sentences.join(' ');
    if (
        wordCount(complete) <= 180 &&
        portraitSerializedByteLength(complete) <= PORTRAIT_SUMMARY_MAX_BYTES
    )
        return complete;
    const selected: string[] = [];
    for (const sentence of sentences) {
        const candidate = [...selected, sentence, overflow].join(' ');
        if (
            wordCount(candidate) <= 180 &&
            portraitSerializedByteLength(candidate) <=
                PORTRAIT_SUMMARY_MAX_BYTES
        )
            selected.push(sentence);
    }
    return [...selected, overflow].join(' ');
}
