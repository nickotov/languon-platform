import type {
    PortraitInterviewerOutput,
    PortraitItems,
} from '@languon/contracts';
import {
    interviewText,
    type InterviewLocale,
    type InterviewTopic,
} from './interview-copy';
const rows: Partial<Record<InterviewTopic, string[][]>> = {
    goals: [
        ['Travel', 'Путешествия', 'Voyages', 'Viajes'],
        ['Work', 'Работа', 'Travail', 'Trabajo'],
        ['Exams', 'Экзамены', 'Examens', 'Exámenes'],
        [
            'Everyday conversation',
            'Повседневное общение',
            'Conversation quotidienne',
            'Conversación cotidiana',
        ],
    ],
    accommodations: [
        ['Short steps', 'Короткие шаги', 'Étapes courtes', 'Pasos cortos'],
        [
            'Frequent recaps',
            'Частые повторения',
            'Récapitulations fréquentes',
            'Repasos frecuentes',
        ],
        ['Examples', 'Примеры', 'Exemples', 'Ejemplos'],
        ['Reminders', 'Напоминания', 'Rappels', 'Recordatorios'],
    ],
    hobbies: [
        ['Music', 'Музыка', 'Musique', 'Música'],
        ['Travel', 'Путешествия', 'Voyages', 'Viajes'],
        ['Films', 'Кино', 'Films', 'Películas'],
        ['Books', 'Книги', 'Livres', 'Libros'],
        ['Sport', 'Спорт', 'Sport', 'Deporte'],
        ['Games', 'Игры', 'Jeux', 'Juegos'],
    ],
    age: [
        ['Under 18', 'До 18', 'Moins de 18 ans', 'Menos de 18'],
        ['18–34', '18–34', '18–34', '18–34'],
        ['35–54', '35–54', '35–54', '35–54'],
        ['55+', '55+', '55+', '55+'],
        [
            'Prefer not to say',
            'Предпочитаю не указывать',
            'Je préfère ne pas répondre',
            'Prefiero no decirlo',
        ],
    ],
};
const titles: Partial<Record<InterviewTopic, string[]>> = {
    languages: [
        'Which languages do you know, and which are you learning now?',
        'Какие языки вы знаете и какие изучаете сейчас ?',
        'Quelles langues connaissez-vous et lesquelles apprenez-vous ?',
        '¿Qué idiomas conoces y cuáles estás aprendiendo?',
    ],
    'explanation-languages': [
        'Which languages feel comfortable for explanations?',
        'На каких языках вам удобны объяснения?',
        'Dans quelles langues les explications vous conviennent-elles ?',
        '¿En qué idiomas te resultan cómodas las explicaciones?',
    ],
    goals: [
        'What are you learning for?',
        'Для чего вы изучаете язык?',
        'Pourquoi apprenez-vous ?',
        '¿Para qué estás aprendiendo?',
    ],
    style: [
        'How would you like explanations to feel?',
        'Какими должны быть объяснения?',
        'Comment aimeriez-vous les explications ?',
        '¿Cómo te gustaría que fueran las explicaciones?',
    ],
    accommodations: [
        'Is there anything that makes learning easier for you?',
        'Что облегчает вам учёбу?',
        'Qu’est-ce qui facilite votre apprentissage ?',
        '¿Hay algo que te facilite aprender?',
    ],
    hobbies: [
        'Any hobbies or interests we could use for examples?',
        'Есть ли хобби или интересы для примеров?',
        'Des loisirs ou centres d’intérêt pour les exemples ?',
        '¿Algún pasatiempo o interés para los ejemplos?',
    ],
    age: [
        'Would you like to share a broad age range?',
        'Хотите указать примерный возраст?',
        'Souhaitez-vous indiquer une tranche d’âge ?',
        '¿Quieres compartir un rango de edad?',
    ],
};
export function localInterviewQuestion(
    topic: InterviewTopic,
    locale: InterviewLocale,
): PortraitInterviewerOutput {
    const index = ['en', 'ru', 'fr', 'es'].indexOf(locale);
    const names = new Intl.DisplayNames([locale], { type: 'language' });
    const languageTopic =
        topic === 'languages' || topic === 'explanation-languages';
    const options = languageTopic
        ? ['en', 'es', 'fr', 'ru', 'de', 'it', 'pt', 'ja'].map((code) => ({
              id: code,
              label: names.of(code) ?? code,
          }))
        : (rows[topic] ?? []).map((labels, i) => ({
              id: `choice-${i}`,
              label: labels[index]!,
          }));
    return {
        topic,
        locale,
        message: titles[topic]?.[index] ?? interviewText(locale, topic),
        multiSelect: topic !== 'age',
        options,
    };
}
export function countInterviewItems(items: PortraitItems) {
    return (
        items.languages.length +
        items.explanationLanguages.length +
        items.goals.length +
        items.accommodations.length +
        items.hobbies.length +
        (items.notes?.length ?? 0) +
        (items.mixingNote ? 1 : 0) +
        [
            items.mixedLanguage ?? items.mixedLanguageFrequency,
            items.tone,
            items.detail,
            items.wording,
            items.approach,
            items.ageRange,
        ].filter((value) => value !== undefined).length
    );
}

const help: Partial<Record<InterviewTopic, string[]>> = {
    languages: [
        'Describe each in your own words — this isn’t a test.',
        'Опишите своими словами — это не тест.',
        'Décrivez-les avec vos mots — ce n’est pas un test.',
        'Descríbelos con tus palabras: no es un examen.',
    ],
    'explanation-languages': [
        'This can differ from the languages you’re learning and from the app’s interface language.',
        'Они могут отличаться от изучаемых языков и языка интерфейса.',
        'Elles peuvent différer des langues étudiées et de la langue de l’application.',
        'Puede ser distinto de los idiomas que aprendes y del idioma de la app.',
    ],
    goals: [
        'Pick any that fit, or add your own.',
        'Выберите подходящее или добавьте своё.',
        'Choisissez ce qui convient ou ajoutez le vôtre.',
        'Elige los que encajen o añade el tuyo.',
    ],
    style: [
        'Each choice is separate — friendly doesn’t have to mean simple, and academic doesn’t have to mean long.',
        'Каждый выбор отдельный: дружелюбно не значит упрощённо.',
        'Chaque choix est indépendant : amical ne veut pas dire simple.',
        'Cada opción es independiente: cercano no significa sencillo.',
    ],
    accommodations: [
        'Share practical preferences. You don’t need to explain why.',
        'Поделитесь практичными предпочтениями. Объяснять причины не нужно.',
        'Partagez des préférences pratiques, sans avoir à vous justifier.',
        'Comparte preferencias prácticas. No hace falta explicar por qué.',
    ],
    hobbies: [
        'Optional. Helps examples feel relevant.',
        'Необязательно. Помогает подобрать интересные вам примеры.',
        'Facultatif. Aide à choisir des exemples pertinents.',
        'Opcional. Ayuda a elegir ejemplos relevantes.',
    ],
    age: [
        'Optional. It only helps choose relevant examples and life context — never difficulty, maturity, or tone.',
        'Необязательно. Помогает только подбирать уместные примеры — не сложность и не тон.',
        'Facultatif. Sert uniquement à choisir des exemples pertinents, jamais la difficulté ni le ton.',
        'Opcional. Solo ayuda a elegir ejemplos relevantes, nunca la dificultad ni el tono.',
    ],
};
export function interviewQuestionHelp(
    topic: InterviewTopic,
    locale: InterviewLocale,
) {
    return help[topic]?.[['en', 'ru', 'fr', 'es'].indexOf(locale)] ?? '';
}

const placeholders: Partial<Record<InterviewTopic, string[]>> = {
    languages: [
        'e.g., I read comfortably but struggle to speak.',
        'Например: читаю свободно, но мне трудно говорить.',
        'Ex. : je lis facilement mais j’ai du mal à parler.',
        'Ej.: leo con comodidad, pero me cuesta hablar.',
    ],
    'explanation-languages': [
        'e.g., Mostly English, with short Spanish examples.',
        'Например: в основном по-английски, с короткими примерами на испанском.',
        'Ex. : surtout en anglais, avec de courts exemples espagnols.',
        'Ej.: sobre todo en inglés, con ejemplos breves en español.',
    ],
    goals: [
        'e.g., Workplace conversation',
        'Например: общение на работе',
        'Ex. : conversations au travail',
        'Ej.: conversaciones en el trabajo',
    ],
    style: [
        'e.g., Light humour is welcome.',
        'Например: лёгкий юмор приветствуется.',
        'Ex. : une touche d’humour est bienvenue.',
        'Ej.: un poco de humor es bienvenido.',
    ],
    accommodations: [
        'e.g., A quick check question after each new rule',
        'Например: короткий проверочный вопрос после каждого нового правила',
        'Ex. : une question de vérification après chaque règle',
        'Ej.: una pregunta de comprobación tras cada regla',
    ],
    hobbies: [
        'e.g., Board games',
        'Например: настольные игры',
        'Ex. : jeux de société',
        'Ej.: juegos de mesa',
    ],
};
export function interviewAnswerPlaceholder(
    topic: InterviewTopic,
    locale: InterviewLocale,
) {
    return (
        placeholders[topic]?.[['en', 'ru', 'fr', 'es'].indexOf(locale)] ?? ''
    );
}
