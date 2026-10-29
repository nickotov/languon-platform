import type { Locale } from '@/fsd/shared/i18n';
import {
    defaultAuthoringLabels,
    type BlockAuthoringLabels,
} from './block-labels';

// Small feature-owned vocabulary follows knowledgeProposalLabels, including forms.
const words: Record<string, [string, string, string]> = {
    Languages: ['Языки', 'Idiomas', 'Langues'],
    'Uses author credits': [
        'Использует кредиты автора',
        'Usa créditos del autor',
        'Utilise les crédits de l’auteur',
    ],
    'Edit vocabulary block': [
        'Редактирование словаря',
        'Editar bloque de vocabulario',
        'Modifier le bloc de vocabulaire',
    ],
    'Edit grammar block': [
        'Редактирование грамматики',
        'Editar bloque de gramática',
        'Modifier le bloc de grammaire',
    ],
    'Edit bilingual text block': [
        'Редактирование двуязычного текста',
        'Editar bloque de texto bilingüe',
        'Modifier le bloc de texte bilingue',
    ],
    'Edit audio block': [
        'Редактирование аудио',
        'Editar bloque de audio',
        'Modifier le bloc audio',
    ],
    'Edit video block': [
        'Редактирование видео',
        'Editar bloque de vídeo',
        'Modifier le bloc vidéo',
    ],
    'Edit exercises block': [
        'Редактирование упражнений',
        'Editar bloque de ejercicios',
        'Modifier le bloc d’exercices',
    ],

    'The original changed. Review every prepared translation before applying changes.':
        [
            'Оригинал изменён. Проверьте все подготовленные переводы перед применением изменений.',
            'El original ha cambiado. Revisa todas las traducciones preparadas antes de aplicar los cambios.',
            'L’original a changé. Vérifiez toutes les traductions préparées avant d’appliquer les modifications.',
        ],
    'Save to dictionary': [
        'Сохранить в словарь',
        'Guardar en diccionario',
        'Enregistrer dans un dictionnaire',
    ],
    'Save to Texts': [
        'Сохранить в Тексты',
        'Guardar en Textos',
        'Enregistrer dans Textes',
    ],
    Play: ['Воспроизвести', 'Reproducir', 'Lire'],
    Stop: ['Остановить', 'Detener', 'Arrêter'],
    Expand: ['Развернуть', 'Expandir', 'Déplier'],
    Collapse: ['Свернуть', 'Contraer', 'Replier'],
    Check: ['Проверить', 'Comprobar', 'Vérifier'],
    'No recording prepared': [
        'Запись не подготовлена',
        'Sin grabación preparada',
        'Aucun enregistrement préparé',
    ],
    'Prepared translations': [
        'Подготовленные переводы',
        'Traducciones preparadas',
        'Traductions préparées',
    ],
    'Not answered': ['Нет ответа', 'Sin responder', 'Sans réponse'],
    attempted: ['попыток', 'intentadas', 'tentées'],
    'The tutor uses only the transcript and description you provide — it does not watch videos.':
        [
            'Помощник использует только предоставленные расшифровку и описание — он не смотрит видео.',
            'El tutor utiliza solo la transcripción y descripción que proporcionas; no ve los vídeos.',
            'Le tuteur utilise uniquement la transcription et la description fournies ; il ne regarde pas les vidéos.',
        ],
    'No transcript has been prepared.': [
        'Расшифровка не подготовлена.',
        'No se ha preparado una transcripción.',
        'Aucune transcription préparée.',
    ],
    'Apply changes': [
        'Применить изменения',
        'Aplicar cambios',
        'Appliquer les modifications',
    ],
    'No recording yet. Add audio when you are ready.': [
        'Записи пока нет. Добавьте аудио, когда будете готовы.',
        'Todavía no hay grabación. Añade audio cuando quieras.',
        'Pas encore d’enregistrement. Ajoutez un audio quand vous le souhaitez.',
    ],
    Questions: ['Вопросы', 'Preguntas', 'Questions'],

    'Expand editor': [
        'Развернуть редактор',
        'Ampliar editor',
        'Agrandir l’éditeur',
    ],
    'Collapse editor': [
        'Свернуть редактор',
        'Reducir editor',
        'Réduire l’éditeur',
    ],
    Entry: ['Слово', 'Entrada', 'Entrée'],
    Item: ['Элемент', 'Elemento', 'Élément'],
    questions: ['вопросов', 'preguntas', 'questions'],
    'Expand all': ['Развернуть все', 'Expandir todo', 'Tout déplier'],
    'Collapse all': ['Свернуть все', 'Contraer todo', 'Tout replier'],
    'Show all translations': [
        'Показать все переводы',
        'Mostrar todas las traducciones',
        'Afficher toutes les traductions',
    ],
    'Hide all translations': [
        'Скрыть все переводы',
        'Ocultar todas las traducciones',
        'Masquer toutes les traductions',
    ],
    'Write here…': ['Напишите здесь…', 'Escribe aquí…', 'Écrivez ici…'],
    'Add question': [
        'Добавить вопрос',
        'Añadir pregunta',
        'Ajouter une question',
    ],
    'Author’s description': [
        'Описание автора',
        'Descripción del autor',
        'Description de l’auteur',
    ],
    'Discard changes?': [
        'Отменить изменения?',
        '¿Descartar cambios?',
        'Abandonner les modifications ?',
    ],
    'Your changes have not been applied to the sheet.': [
        'Изменения ещё не применены к листу.',
        'Los cambios no se han aplicado a la hoja.',
        'Les modifications n’ont pas été appliquées à la feuille.',
    ],
    'Keep editing': [
        'Продолжить редактирование',
        'Seguir editando',
        'Continuer à modifier',
    ],
    Discard: ['Отменить изменения', 'Descartar', 'Abandonner'],
    'Changes stay in this editor until you apply them.': [
        'Изменения останутся в редакторе, пока вы их не примените.',
        'Los cambios se quedan aquí hasta que los apliques.',
        'Les modifications restent ici jusqu’à leur application.',
    ],
    'No changes yet.': [
        'Пока нет изменений.',
        'Sin cambios todavía.',
        'Aucune modification.',
    ],
    'Check translation': [
        'Проверить перевод',
        'Comprobar traducción',
        'Vérifier la traduction',
    ],
    'Generate translation': [
        'Создать перевод',
        'Generar traducción',
        'Générer la traduction',
    ],
    'Checking with AI…': [
        'Проверяем с ИИ…',
        'Comprobando con IA…',
        'Vérification avec l’IA…',
    ],
    'AI checking failed. Your edits are kept.': [
        'Не удалось проверить с ИИ. Изменения сохранены.',
        'No se pudo comprobar con IA. Se conservan tus cambios.',
        'Échec de la vérification. Vos modifications sont conservées.',
    ],
    'Not enough credits. Your edits are kept.': [
        'Недостаточно кредитов. Изменения сохранены.',
        'Créditos insuficientes. Se conservan tus cambios.',
        'Crédits insuffisants. Vos modifications sont conservées.',
    ],
    'This field or its source changed. Check again before applying this suggestion.':
        [
            'Поле или источник изменились. Проверьте снова, прежде чем принять предложение.',
            'El campo o su origen ha cambiado. Vuelve a comprobarlo antes de aceptar.',
            'Le champ ou sa source a changé. Vérifiez à nouveau avant d’accepter.',
        ],
    'Check again': [
        'Проверить снова',
        'Volver a comprobar',
        'Vérifier à nouveau',
    ],
    Dismiss: ['Отклонить', 'Descartar', 'Ignorer'],
    'Looks correct': ['Всё верно', 'Parece correcto', 'Cela semble correct'],
    Current: ['Сейчас', 'Actual', 'Actuel'],
    Suggested: ['Предложение', 'Sugerencia', 'Suggestion'],
    Accept: ['Принять', 'Aceptar', 'Accepter'],

    'Block settings': [
        'Настройки блока',
        'Opciones del bloque',
        'Options du bloc',
    ],
    'Select or drag block': [
        'Выбрать или перетащить блок',
        'Seleccionar o arrastrar bloque',
        'Sélectionner ou déplacer le bloc',
    ],
    'Prepared translation': [
        'Подготовленный перевод',
        'Traducción preparada',
        'Traduction préparée',
    ],
    'Add translation': [
        'Добавить перевод',
        'Añadir traducción',
        'Ajouter une traduction',
    ],
    Definition: ['Определение', 'Definición', 'Définition'],
    'Hint source': [
        'Источник подсказки',
        'Fuente de la pista',
        'Source de l’indice',
    ],
    'Relevant passages for hints': [
        'Фрагменты для подсказок',
        'Fragmentos para las pistas',
        'Passages pour les indices',
    ],
    'No linked source': [
        'Без связанного источника',
        'Sin fuente vinculada',
        'Aucune source liée',
    ],
    'Upload audio (WAV or MP3, up to 5 MiB)': [
        'Загрузить аудио (WAV или MP3, до 5 МиБ)',
        'Subir audio (WAV o MP3, hasta 5 MiB)',
        'Importer un audio (WAV ou MP3, jusqu’à 5 Mio)',
    ],
    'Audio upload failed. Use a WAV or MP3 file up to 5 MiB and try again.': [
        'Не удалось загрузить аудио. Выберите WAV или MP3 до 5 МиБ и повторите.',
        'No se pudo subir el audio. Usa WAV o MP3 de hasta 5 MiB e inténtalo de nuevo.',
        'Échec de l’import audio. Utilisez un fichier WAV ou MP3 de 5 Mio maximum et réessayez.',
    ],
    Video: ['Видео', 'Vídeo', 'Vidéo'],
    Vocabulary: ['Словарь', 'Vocabulario', 'Vocabulaire'],
    'Bilingual text': ['Двуязычный текст', 'Texto bilingüe', 'Texte bilingue'],
    Audio: ['Аудио', 'Audio', 'Audio'],
    Grammar: ['Грамматика', 'Gramática', 'Grammaire'],
    Exercise: ['Упражнение', 'Ejercicio', 'Exercice'],
    'Show answer': [
        'Показать ответ',
        'Mostrar respuesta',
        'Afficher la réponse',
    ],
    'Hide answer': ['Скрыть ответ', 'Ocultar respuesta', 'Masquer la réponse'],
    'Try again': ['Попробовать снова', 'Reintentar', 'Réessayer'],
    'Your answer': ['Ваш ответ', 'Tu respuesta', 'Votre réponse'],
    'Check with AI': [
        'Проверить с ИИ',
        'Comprobar con IA',
        'Vérifier avec l’IA',
    ],
    Hint: ['Подсказка', 'Pista', 'Indice'],
    'Show transcript': [
        'Показать расшифровку',
        'Mostrar transcripción',
        'Afficher la transcription',
    ],
    'Hide transcript': [
        'Скрыть расшифровку',
        'Ocultar transcripción',
        'Masquer la transcription',
    ],
    'Replay passage': [
        'Повторить фрагмент',
        'Repetir fragmento',
        'Réécouter le passage',
    ],
    Original: ['Оригинал', 'Original', 'Original'],
    Bilingual: ['Двуязычный', 'Bilingüe', 'Bilingue'],
    'Translation language': [
        'Язык перевода',
        'Idioma de traducción',
        'Langue de traduction',
    ],
    'Open video source': [
        'Открыть источник видео',
        'Abrir fuente del vídeo',
        'Ouvrir la source vidéo',
    ],
    'Media is unavailable': [
        'Медиа недоступно',
        'Contenido multimedia no disponible',
        'Média indisponible',
    ],
    Rule: ['Правило', 'Regla', 'Règle'],
    'Formation / pattern': [
        'Образование / схема',
        'Formación / patrón',
        'Formation / structure',
    ],
    Examples: ['Примеры', 'Ejemplos', 'Exemples'],
    'Common mistakes': [
        'Типичные ошибки',
        'Errores frecuentes',
        'Erreurs fréquentes',
    ],
    Incorrect: ['Неверно', 'Incorrecto', 'Incorrect'],
    Correct: ['Верно', 'Correcto', 'Correct'],
    'Add block': ['Добавить блок', 'Añadir bloque', 'Ajouter un bloc'],
    Edit: ['Изменить', 'Editar', 'Modifier'],
    Duplicate: ['Дублировать', 'Duplicar', 'Dupliquer'],
    Delete: ['Удалить', 'Eliminar', 'Supprimer'],
    'Move up': ['Выше', 'Subir', 'Monter'],
    'Move down': ['Ниже', 'Bajar', 'Descendre'],
    'Learner preview': [
        'Предпросмотр ученика',
        'Vista del estudiante',
        'Aperçu apprenant',
    ],
    Cancel: ['Отмена', 'Cancelar', 'Annuler'],
    'Apply block': ['Применить блок', 'Aplicar bloque', 'Appliquer le bloc'],
    'Add row': ['Добавить строку', 'Añadir fila', 'Ajouter une ligne'],
    'Remove row': [
        'Убрать последнюю строку',
        'Quitar última fila',
        'Retirer la dernière ligne',
    ],
    'Copy block': ['Копировать блок', 'Copiar bloque', 'Copier le bloc'],
    'Check the required fields, languages and answer settings.': [
        'Проверьте обязательные поля, языки и настройки ответа.',
        'Comprueba los campos obligatorios, idiomas y respuestas.',
        'Vérifiez les champs requis, les langues et les réponses.',
    ],
    'Upload or generate audio before inserting an audio block.': [
        'Перед вставкой аудиоблока загрузите или создайте аудио.',
        'Sube o genera audio antes de insertar el bloque.',
        'Importez ou générez un audio avant d’insérer le bloc.',
    ],
    Title: ['Название', 'Título', 'Titre'],
    'Content language': [
        'Язык содержимого',
        'Idioma del contenido',
        'Langue du contenu',
    ],
    'YouTube link or HTTPS video URL': [
        'Ссылка YouTube или HTTPS-видео',
        'Enlace de YouTube o vídeo HTTPS',
        'Lien YouTube ou vidéo HTTPS',
    ],
    Example: ['Пример', 'Ejemplo', 'Exemple'],
    Translation: ['Перевод', 'Traducción', 'Traduction'],
    Why: ['Почему', 'Por qué', 'Pourquoi'],
    'Vocabulary entries': [
        'Словарные карточки',
        'Entradas de vocabulario',
        'Entrées de vocabulaire',
    ],
    'Word or phrase': [
        'Слово или фраза',
        'Palabra o frase',
        'Mot ou expression',
    ],
    Pronunciation: ['Произношение', 'Pronunciación', 'Prononciation'],
    'Example translation': [
        'Перевод примера',
        'Traducción del ejemplo',
        'Traduction de l’exemple',
    ],
    'Aligned passages': [
        'Сопоставленные фрагменты',
        'Fragmentos alineados',
        'Passages alignés',
    ],
    'Original passage': [
        'Исходный фрагмент',
        'Fragmento original',
        'Passage original',
    ],
    'Translated passage': [
        'Перевод фрагмента',
        'Fragmento traducido',
        'Passage traduit',
    ],
    'Speech source text': [
        'Текст озвучивания',
        'Texto para la voz',
        'Texte à vocaliser',
    ],
    'Transcript passages': [
        'Фрагменты расшифровки',
        'Fragmentos de transcripción',
        'Passages de transcription',
    ],
    Transcript: ['Расшифровка', 'Transcripción', 'Transcription'],
    'Start seconds (optional)': [
        'Начало, секунды (необязательно)',
        'Inicio en segundos (opcional)',
        'Début en secondes (facultatif)',
    ],
    'End seconds (optional)': [
        'Конец, секунды (необязательно)',
        'Fin en segundos (opcional)',
        'Fin en secondes (facultatif)',
    ],
    Question: ['Вопрос', 'Pregunta', 'Question'],
    'Reference answer': [
        'Образец ответа',
        'Respuesta de referencia',
        'Réponse de référence',
    ],
    'Why the answer is correct': [
        'Почему ответ верный',
        'Por qué es correcta',
        'Pourquoi cette réponse est correcte',
    ],
    'Evaluation guidance (optional)': [
        'Критерии проверки (необязательно)',
        'Criterios de evaluación (opcional)',
        'Critères d’évaluation (facultatif)',
    ],
    'Answer format': [
        'Формат ответа',
        'Formato de respuesta',
        'Format de réponse',
    ],
    'Free text': ['Свободный ответ', 'Texto libre', 'Texte libre'],
    'Multiple choice': ['Выбор ответа', 'Opción múltiple', 'Choix multiple'],
    'Fill in the blank': [
        'Заполнение пропусков',
        'Completar huecos',
        'Texte à trous',
    ],
    'Multiple-choice answers': [
        'Варианты ответа',
        'Opciones de respuesta',
        'Choix de réponse',
    ],
    Choice: ['Вариант', 'Opción', 'Choix'],
    'Correct choice number': [
        'Номер верного варианта',
        'Número de opción correcta',
        'Numéro du choix correct',
    ],
    'Gap text — enclose answers in [[answer|alternative]]': [
        'Текст с пропусками: [[ответ|вариант]]',
        'Texto con huecos: [[respuesta|alternativa]]',
        'Texte à trous : [[réponse|alternative]]',
    ],
    'Other accepted answers (one per line)': [
        'Другие верные ответы (по одному в строке)',
        'Otras respuestas válidas (una por línea)',
        'Autres réponses acceptées (une par ligne)',
    ],
};
export function localizedBlockLabels(locale: Locale): BlockAuthoringLabels {
    const index = { en: -1, ru: 0, es: 1, fr: 2 }[locale];
    function translate(label: string) {
        return index < 0 ? label : (words[label]?.[index] ?? label);
    }
    const view = Object.fromEntries(
        Object.entries(defaultAuthoringLabels.view)
            .filter(([key]) => key !== 'kinds' && key !== 'exerciseKinds')
            .map(([key, value]) => [key, translate(value as string)]),
    );
    const kinds = Object.fromEntries(
        Object.entries(defaultAuthoringLabels.view.kinds).map(
            ([key, value]) => [key, translate(value)],
        ),
    );
    const actions = Object.fromEntries(
        Object.entries(defaultAuthoringLabels)
            .filter(([key]) => !['view', 'field'].includes(key))
            .map(([key, value]) => [key, translate(value as string)]),
    );
    return {
        ...actions,
        field: translate,
        view: {
            ...view,
            kinds,
            exerciseKinds: Object.fromEntries(
                Object.entries(
                    defaultAuthoringLabels.view.exerciseKinds ?? {},
                ).map(([key, value]) => [key, translate(value)]),
            ),
        },
    } as BlockAuthoringLabels;
}
