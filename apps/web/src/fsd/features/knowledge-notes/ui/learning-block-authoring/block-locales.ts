import type { Locale } from '@/fsd/shared/i18n';
import {
    defaultAuthoringLabels,
    type BlockAuthoringLabels,
} from './block-labels';

// Small feature-owned vocabulary follows knowledgeProposalLabels, including forms.
const words: Record<string, [string, string, string]> = {
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
            .filter(([key]) => key !== 'kinds')
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
        view: { ...view, kinds },
    } as BlockAuthoringLabels;
}
