import {
    getExerciseActivity,
    type ExerciseActivityId,
} from '@languon/contracts';
export type GuideLocale = 'en' | 'ru' | 'fr' | 'es';
const copy = {
    en: {
        media: {
            title: 'Add media to a Knowledge note',
            embeds: 'Choose Add block → Basic blocks → Image or Website. Paste a direct HTTPS image link or an HTTPS page URL. Select Load preview to see it in the note, then Expand for a larger view. If a website blocks previews, choose Open in new tab.',
            video: 'For YouTube, choose Add block → Learning blocks → Video and paste the video link.',
            listening:
                'To generate listening exercises, select an Audio block with a transcript and ask the assistant to create a dictation or comprehension question from it. For a new recording, describe the dialogue, language and level, and ask for both the recording and the exercises. Review the proposal, insert it and save the note.',
            example: 'Try a listening example and copy a prompt',
        },
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
        media: {
            title: 'Медиа в заметке «Знаний»',
            embeds: 'Выберите «Добавить блок» → «Основные блоки» → «Изображение» или «Сайт». Вставьте прямую HTTPS-ссылку на изображение или HTTPS-адрес страницы. Нажмите «Загрузить предпросмотр», а затем «Развернуть». Если сайт блокирует просмотр, выберите «Открыть в новой вкладке».',
            video: 'Для YouTube выберите «Добавить блок» → «Учебные блоки» → «Видео» и вставьте ссылку на ролик.',
            listening:
                'Чтобы создать упражнения на аудирование, выберите блок «Аудио» с расшифровкой и попросите ассистента составить по записи диктант или вопрос на понимание. Если нужна новая запись, опишите диалог, язык и уровень и попросите создать и запись, и упражнения. Проверьте предложение, вставьте его и сохраните заметку.',
            example: 'Открыть пример аудирования и скопировать запрос',
        },
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
        media: {
            title: 'Ajouter des médias à une note de connaissances',
            embeds: 'Choisissez « Ajouter un bloc » → « Blocs de base » → « Image » ou « Site web ». Collez le lien HTTPS direct de l’image ou l’adresse HTTPS de la page. Choisissez « Charger l’aperçu », puis « Agrandir ». Si le site bloque l’aperçu, choisissez « Ouvrir dans un nouvel onglet ».',
            video: 'Pour YouTube, choisissez « Ajouter un bloc » → « Blocs pédagogiques » → « Vidéo » et collez le lien de la vidéo.',
            listening:
                'Pour créer un exercice d’écoute, sélectionnez un bloc Audio avec sa transcription et demandez à l’assistant une dictée ou une question de compréhension sur cet enregistrement. Pour un nouvel enregistrement, précisez le dialogue, la langue et le niveau souhaités, puis demandez l’enregistrement et les exercices. Vérifiez la proposition, insérez-la et enregistrez la note.',
            example: 'Essayer un exercice d’écoute et copier une demande',
        },
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
        media: {
            title: 'Añadir contenido multimedia a una nota de Conocimientos',
            embeds: 'Elige «Añadir bloque» → «Bloques básicos» → «Imagen» o «Sitio web». Pega el enlace HTTPS directo de la imagen o la dirección HTTPS de la página. Elige «Cargar vista previa» y luego «Ampliar». Si el sitio bloquea la vista previa, elige «Abrir en otra pestaña».',
            video: 'Para YouTube, elige «Añadir bloque» → «Bloques de aprendizaje» → «Vídeo» y pega el enlace al vídeo.',
            listening:
                'Para generar un ejercicio de escucha, selecciona un bloque de Audio con transcripción y pide al asistente un dictado o una pregunta de comprensión sobre la grabación. Para crear una grabación nueva, describe el diálogo, el idioma y el nivel, y pide tanto la grabación como los ejercicios. Revisa la propuesta, insértala y guarda la nota.',
            example: 'Probar un ejercicio de escucha y copiar una petición',
        },
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

export function listeningRecipes(
    locale: GuideLocale,
    id: ExerciseActivityId,
    name: string,
) {
    const prompts = {
        en: [
            `Use the Audio block I selected to create one ${id} exercise (${name}). Reuse its recording and transcript.`,
            'Reuse my selected recording and choose one listening exercise that suits the dialogue and its timing.',
            'Create a short English A2 dialogue at a library with two speakers. Generate a recording and add a meaning question, a dictation and a listening gap using that recording.',
            'Select an Audio block with a transcript in Knowledge, or ask for a new dialogue and recording.',
            'Copy prompt',
        ],
        ru: [
            `Создай одно упражнение ${id} (${name}) по выбранному блоку «Аудио». Используй его запись и расшифровку.`,
            'Подбери одно упражнение на аудирование по выбранной записи с учётом содержания диалога и временных меток.',
            'Подготовь короткий диалог на английском A2 между двумя людьми в библиотеке. Создай запись, добавь вопрос на понимание, диктант и задание с пропуском по этой записи.',
            'В «Знаниях» выберите аудиоблок с расшифровкой или попросите создать диалог с новой записью.',
            'Копировать запрос',
        ],
        fr: [
            `Crée un exercice ${id} (${name}) à partir du bloc Audio sélectionné. Réutilise son enregistrement et sa transcription.`,
            'Choisis un exercice d’écoute adapté à mon enregistrement, au sens du dialogue et aux repères temporels.',
            'Crée un court dialogue de niveau A2 en anglais entre deux personnes dans une bibliothèque. Produis un enregistrement et utilise-le pour une question de compréhension, une dictée et un texte à trous.',
            'Dans Connaissances, sélectionnez un bloc Audio transcrit ou demandez un nouveau dialogue enregistré.',
            'Copier la demande',
        ],
        es: [
            `Crea un ejercicio ${id} (${name}) con el bloque Audio seleccionado. Reutiliza la grabación y su transcripción.`,
            'Elige un ejercicio de escucha adecuado para el diálogo y los tiempos de la grabación seleccionada.',
            'Crea un diálogo breve en inglés A2 entre dos personas en una biblioteca. Genera una grabación y úsala para una pregunta de comprensión, un dictado y un texto con huecos.',
            'En Conocimientos, selecciona un bloque Audio con transcripción o pide un nuevo diálogo grabado.',
            'Copiar petición',
        ],
    } as const;
    const [specific, best, mixed, prerequisite, action] = prompts[locale];

    return { specific, best, mixed, prerequisite, action };
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
        media: localized.media,
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
