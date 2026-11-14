import type { Locale } from '@/fsd/shared/i18n';

const en = {
    title: 'Workbook guide',
    chapter: 'Exercises',
    translationTarget: 'English source → French response',
    intro: 'Turn material you care about into practice that makes sense.',
    chapterIntro:
        'Try 19 exercise formats, see how checking works, and copy a recipe for your own material.',
    notice: 'Local examples · no AI calls or credits · answers and progress are not saved',
    workflow: 'From material to practice',
    explore: 'Explore exercises',
    formats: '19 interactive formats · English A2 sample material',
    distinction:
        'This guide explains the service. Your saved workbooks contain your own material and practice.',
    recipes: 'Ask for the practice you need',
    activity: 'Activity',
    source: 'Sample source material',
    copySource: 'Copy source',
    why: 'When this helps',
    reset: 'Reset example',
    sample: 'Show sample feedback',
    sampleTitle: 'Sample feedback',
    sampleNotice:
        'This prepared feedback belongs only to the sample response below. Your typed answer is not assessed here.',
    sampleResponse: 'Sample response',
    prompt: 'Prompt recipe',
    copy: 'Copy prompt and source',
    copied: 'Copied',
    copyFailed: 'Copy is unavailable. Select and copy the text below.',
    next: 'Use this with your own material',
    handoff:
        'Open Knowledge, add or open a note, then ask the tutor using your material and a recipe. Review the proposed changes, insert the exercises you want, and save the note.',
    openKnowledge: 'Open Knowledge',
    prerequisite:
        'Start with a note containing source text, vocabulary, or a grammar explanation.',
    expected:
        'Expect a proposal to review. Check the questions, answers and source grounding before inserting and saving.',
    rubric: 'Practice writing here. Compare a sample response below; there is no AI check in this guide.',
    hybrid: 'Local prepared-answer check. Other valid answers may need AI review in your own workbook.',
    prepared: 'Local check against a prepared answer.',
    categories: ['Vocabulary', 'Grammar', 'Reading', 'Writing'],
};

export type GuideUiCopy = typeof en;
const translations: Record<Locale, GuideUiCopy> = {
    en,
    ru: {
        title: 'Руководство по тетради',
        chapter: 'Упражнения',
        translationTarget: 'Источник на английском → ответ на французском',
        intro: 'Превращайте интересные вам материалы в осмысленную практику.',
        chapterIntro:
            'Попробуйте 19 форматов, узнайте о проверке и скопируйте запрос для своего материала.',
        notice: 'Локальные примеры · без ИИ и кредитов · ответы и прогресс не сохраняются',
        workflow: 'От материала к практике',
        explore: 'Изучить упражнения',
        formats: '19 интерактивных форматов · примеры на английском A2',
        distinction:
            'Это руководство объясняет сервис. В сохранённых тетрадях находятся ваши материалы и практика.',
        recipes: 'Попросите нужную практику',
        activity: 'Упражнение',
        source: 'Учебный материал примера',
        copySource: 'Копировать материал',
        why: 'Когда это полезно',
        reset: 'Начать пример заново',
        sample: 'Показать пример обратной связи',
        sampleTitle: 'Пример обратной связи',
        sampleNotice:
            'Готовая обратная связь относится только к ответу ниже. Введённый вами ответ здесь не оценивается.',
        sampleResponse: 'Пример ответа',
        prompt: 'Шаблон запроса',
        copy: 'Копировать запрос и материал',
        copied: 'Скопировано',
        copyFailed: 'Копирование недоступно. Выделите и скопируйте текст ниже.',
        next: 'Попробуйте со своим материалом',
        handoff:
            'Откройте «Знания», создайте или откройте заметку и попросите тьютора о практике по вашему материалу. Проверьте предложение, вставьте нужные упражнения и сохраните заметку.',
        openKnowledge: 'Открыть знания',
        prerequisite:
            'Начните с заметки, содержащей текст, словарь или объяснение грамматики.',
        expected:
            'Вы получите предложение для проверки. Проверьте вопросы, ответы и связь с источником перед вставкой и сохранением.',
        rubric: 'Попрактикуйтесь в письме. Сравните с примером ниже: ИИ-проверка в руководстве не выполняется.',
        hybrid: 'Локальная проверка по готовому ответу. Другие верные варианты могут потребовать ИИ-проверки в вашей тетради.',
        prepared: 'Локальная проверка по готовому ответу.',
        categories: ['Лексика', 'Грамматика', 'Чтение', 'Письмо'],
    },
    fr: {
        title: 'Guide du cahier',
        chapter: 'Exercices',
        translationTarget: 'Source en anglais → réponse en français',
        intro: 'Transformez vos contenus préférés en pratique utile.',
        chapterIntro:
            'Essayez 19 formats, découvrez la correction et copiez une recette pour vos contenus.',
        notice: 'Exemples locaux · aucun appel IA ni crédit · réponses et progression non enregistrées',
        workflow: 'Du contenu à la pratique',
        explore: 'Explorer les exercices',
        formats: '19 formats interactifs · exemples en anglais A2',
        distinction:
            'Ce guide explique le service. Vos cahiers enregistrés contiennent vos contenus et votre pratique.',
        recipes: 'Demandez la pratique adaptée',
        activity: 'Activité',
        source: 'Contenu source de l’exemple',
        copySource: 'Copier le contenu',
        why: 'Quand l’utiliser',
        reset: 'Recommencer l’exemple',
        sample: 'Afficher un exemple de retour',
        sampleTitle: 'Exemple de retour',
        sampleNotice:
            'Ce retour préparé concerne uniquement la réponse ci-dessous. Votre propre réponse n’est pas évaluée ici.',
        sampleResponse: 'Exemple de réponse',
        prompt: 'Recette de demande',
        copy: 'Copier la demande et le contenu',
        copied: 'Copié',
        copyFailed:
            'Copie indisponible. Sélectionnez et copiez le texte ci-dessous.',
        next: 'Essayez avec votre contenu',
        handoff:
            'Ouvrez Connaissances, ajoutez ou ouvrez une note, puis demandez au tuteur des exercices avec votre contenu et une recette. Vérifiez la proposition, insérez les exercices souhaités et enregistrez la note.',
        openKnowledge: 'Ouvrir Connaissances',
        prerequisite:
            'Commencez par une note contenant un texte, du vocabulaire ou une explication grammaticale.',
        expected:
            'Une proposition à vérifier. Contrôlez questions, réponses et liens avec la source avant d’insérer et d’enregistrer.',
        rubric: 'Écrivez ici et comparez avec une réponse exemple ci-dessous. Ce guide ne fait aucune correction IA.',
        hybrid: 'Correction locale par réponse préparée. D’autres réponses valides peuvent nécessiter une vérification IA dans votre cahier.',
        prepared: 'Correction locale par réponse préparée.',
        categories: ['Vocabulaire', 'Grammaire', 'Lecture', 'Écriture'],
    },
    es: {
        title: 'Guía del cuaderno',
        chapter: 'Ejercicios',
        translationTarget: 'Fuente en inglés → respuesta en francés',
        intro: 'Convierte el contenido que te interesa en práctica útil.',
        chapterIntro:
            'Prueba 19 formatos, descubre la corrección y copia una receta para tu contenido.',
        notice: 'Ejemplos locales · sin llamadas de IA ni créditos · no se guardan respuestas ni progreso',
        workflow: 'Del contenido a la práctica',
        explore: 'Explorar ejercicios',
        formats: '19 formatos interactivos · ejemplos en inglés A2',
        distinction:
            'Esta guía explica el servicio. Tus cuadernos guardados contienen tu material y tu práctica.',
        recipes: 'Pide la práctica que necesitas',
        activity: 'Actividad',
        source: 'Material de ejemplo',
        copySource: 'Copiar material',
        why: 'Cuándo usarlo',
        reset: 'Reiniciar ejemplo',
        sample: 'Mostrar comentario de ejemplo',
        sampleTitle: 'Comentario de ejemplo',
        sampleNotice:
            'Este comentario preparado corresponde solo a la respuesta de abajo. Tu respuesta no se evalúa aquí.',
        sampleResponse: 'Respuesta de ejemplo',
        prompt: 'Receta de solicitud',
        copy: 'Copiar solicitud y material',
        copied: 'Copiado',
        copyFailed: 'No se puede copiar. Selecciona y copia el texto de abajo.',
        next: 'Pruébalo con tu material',
        handoff:
            'Abre Conocimientos, añade o abre una nota y pide ejercicios al tutor con tu material y una receta. Revisa la propuesta, inserta los ejercicios que quieras y guarda la nota.',
        openKnowledge: 'Abrir Conocimientos',
        prerequisite:
            'Empieza con una nota con texto, vocabulario o una explicación gramatical.',
        expected:
            'Recibirás una propuesta para revisar. Comprueba preguntas, respuestas y relación con la fuente antes de insertar y guardar.',
        rubric: 'Practica escribiendo y compara con una respuesta de ejemplo abajo. Esta guía no realiza corrección con IA.',
        hybrid: 'Corrección local con respuesta preparada. Otras respuestas válidas pueden necesitar revisión de IA en tu cuaderno.',
        prepared: 'Corrección local con respuesta preparada.',
        categories: ['Vocabulario', 'Gramática', 'Lectura', 'Escritura'],
    },
};

export function guideUiCopy(locale: Locale): GuideUiCopy {
    return translations[locale];
}
