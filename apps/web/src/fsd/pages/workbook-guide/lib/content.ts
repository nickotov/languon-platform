import {
    getExerciseActivity,
    type ExerciseActivityId,
} from '@languon/contracts';
export type GuideLocale = 'en' | 'ru' | 'fr' | 'es';
const copy = {
    en: {
        translationDirection:
            'Source language: English. Target language: French. Explanation language: English.',
        steps: [
            'Open Knowledge and create or open a note.',
            'Add your source text, vocabulary or grammar blocks.',
            'Select the relevant content, open the AI assistant and paste a recipe.',
            'Review the proposal and add the exercises to your note. Save exercises to a workbook for private practice.',
        ],
        titles: [
            'One specific exercise',
            'Let the assistant choose',
            'A varied practice set',
        ],
        specific:
            'Using the selected content, create one {id} exercise ({name}) for an A2 English learner. Use only this source. Include instructions, the answer or assessment rubric, and a brief explanation in English.',
        best: 'Using the selected content, choose the most suitable named exercise for an A2 English learner. Explain your choice and propose one exercise with an answer or assessment rubric. Use only this source.',
        mixed: 'Using the selected content, propose three different named exercises for an A2 English learner. Combine recall, understanding and language use where supported. Include answers or assessment rubrics and brief explanations. Do not invent missing source material.',
    },
    ru: {
        translationDirection:
            'Язык источника: английский. Язык перевода: французский. Язык объяснений: русский.',
        steps: [
            'Откройте «Знания» и создайте или откройте заметку.',
            'Добавьте исходный текст, словарные или грамматические блоки.',
            'Выделите нужный материал, откройте ИИ-ассистента и вставьте запрос.',
            'Проверьте предложение и добавьте упражнения в заметку. Сохраните их в рабочую тетрадь для личной практики.',
        ],
        titles: [
            'Конкретное упражнение',
            'Выбор ассистента',
            'Разнообразная практика',
        ],
        specific:
            'На основе выделенного материала создай одно упражнение {id} ({name}) для английского A2. Используй только этот источник. Добавь инструкцию, ответ или критерии проверки и краткое объяснение на русском.',
        best: 'На основе выделенного материала выбери наиболее подходящий тип именованного упражнения для английского A2. Объясни выбор и предложи одно упражнение с ответом или критериями проверки. Используй только этот источник.',
        mixed: 'На основе выделенного материала предложи три разных именованных упражнения для английского A2. Сочетай запоминание, понимание и использование языка, если источник позволяет. Добавь ответы или критерии проверки и краткие объяснения. Не выдумывай отсутствующий материал.',
    },
    fr: {
        translationDirection:
            'Langue source : anglais. Langue cible : français. Langue des explications : français.',
        steps: [
            'Ouvrez Connaissances et créez ou ouvrez une note.',
            'Ajoutez le texte source, les blocs de vocabulaire ou de grammaire.',
            'Sélectionnez le contenu utile, ouvrez l’assistant IA et collez une demande.',
            'Vérifiez la proposition et ajoutez les exercices à votre note. Enregistrez-les dans un cahier pour votre pratique personnelle.',
        ],
        titles: [
            'Un exercice précis',
            'Laisser choisir l’assistant',
            'Une pratique variée',
        ],
        specific:
            'À partir du contenu sélectionné, crée un exercice {id} ({name}) pour l’anglais A2. Utilise uniquement cette source. Ajoute une consigne, la réponse ou les critères d’évaluation et une brève explication en français.',
        best: 'À partir du contenu sélectionné, choisis l’activité nommée la plus adaptée pour l’anglais A2. Explique ton choix et propose un exercice avec sa réponse ou ses critères d’évaluation. Utilise uniquement cette source.',
        mixed: 'À partir du contenu sélectionné, propose trois activités nommées différentes pour l’anglais A2. Combine mémorisation, compréhension et utilisation selon la source. Ajoute les réponses ou critères et de brèves explications. N’invente pas de contenu source manquant.',
    },
    es: {
        translationDirection:
            'Idioma de origen: inglés. Idioma de destino: francés. Idioma de las explicaciones: español.',
        steps: [
            'Abre Conocimientos y crea o abre una nota.',
            'Añade el texto original y los bloques de vocabulario o gramática.',
            'Selecciona el contenido pertinente, abre el asistente de IA y pega una petición.',
            'Revisa la propuesta y añade los ejercicios a tu nota. Guárdalos en un cuaderno para practicar en privado.',
        ],
        titles: [
            'Un ejercicio concreto',
            'El asistente elige',
            'Una práctica variada',
        ],
        specific:
            'A partir del contenido seleccionado, crea un ejercicio {id} ({name}) para inglés A2. Usa solo esta fuente. Incluye instrucciones, la respuesta o los criterios de evaluación y una explicación breve en español.',
        best: 'A partir del contenido seleccionado, elige la actividad con nombre más adecuada para inglés A2. Explica tu elección y propón un ejercicio con su respuesta o criterios. Usa solo esta fuente.',
        mixed: 'A partir del contenido seleccionado, propón tres actividades con nombre diferentes para inglés A2. Combina recordar, comprender y usar el idioma cuando la fuente lo permita. Incluye respuestas o criterios y explicaciones breves. No inventes material que falte en la fuente.',
    },
} as const;

export function guideLocale(locale: string): GuideLocale {
    return locale === 'ru' || locale === 'fr' || locale === 'es'
        ? locale
        : 'en';
}

export function activityPrompt(
    locale: string,
    id: ExerciseActivityId,
    name: string,
) {
    const localized = copy[guideLocale(locale)];
    const prompt = localized.specific
        .replace('{id}', id)
        .replace('{name}', name);

    if (id === 'W01') {
        return `${prompt} ${localized.translationDirection}`;
    }

    return prompt;
}

export function guideCopy(locale: string) {
    const localized = copy[guideLocale(locale)];

    return {
        steps: localized.steps,
        recipes: [
            {
                id: 'specific',
                title: localized.titles[0],
                prompt: localized.specific
                    .replace('{id}', 'V02')
                    .replace(
                        '{name}',
                        getExerciseActivity('V02').locales[guideLocale(locale)]
                            .name,
                    ),
            },
            {
                id: 'best-fit',
                title: localized.titles[1],
                prompt: localized.best,
            },
            {
                id: 'mixed',
                title: localized.titles[2],
                prompt: localized.mixed,
            },
        ],
    };
}

export type GuideCopy = ReturnType<typeof guideCopy>;
