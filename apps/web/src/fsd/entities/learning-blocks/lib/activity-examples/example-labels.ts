import type { LearningBlockLabels } from '../../types';
import type { Locale } from '@/fsd/shared/i18n';

const kindLabels = {
    en: ['Exercise', 'Vocabulary', 'Grammar', 'Text', 'Audio', 'Video'],
    ru: ['Упражнение', 'Лексика', 'Грамматика', 'Текст', 'Аудио', 'Видео'],
    fr: ['Exercice', 'Vocabulaire', 'Grammaire', 'Texte', 'Audio', 'Vidéo'],
    es: ['Ejercicio', 'Vocabulario', 'Gramática', 'Texto', 'Audio', 'Vídeo'],
} as const;

const copy = {
    en: [
        'Show answer',
        'Hide answer',
        'Try again',
        'Your answer',
        'Sample feedback',
        'Hint',
        'Incorrect',
        'Correct',
        'Check answer',
        'Not answered',
        'attempted',
    ],
    ru: [
        'Показать ответ',
        'Скрыть ответ',
        'Попробовать снова',
        'Ваш ответ',
        'Пример обратной связи',
        'Подсказка',
        'Неверно',
        'Верно',
        'Проверить ответ',
        'Нет ответа',
        'попытка',
    ],
    fr: [
        'Afficher la réponse',
        'Masquer la réponse',
        'Réessayer',
        'Votre réponse',
        'Exemple de retour',
        'Indice',
        'Incorrect',
        'Correct',
        'Vérifier la réponse',
        'Sans réponse',
        'tenté',
    ],
    es: [
        'Mostrar respuesta',
        'Ocultar respuesta',
        'Reintentar',
        'Tu respuesta',
        'Comentario de ejemplo',
        'Pista',
        'Incorrecto',
        'Correcto',
        'Comprobar respuesta',
        'Sin respuesta',
        'intentado',
    ],
} as const;

export function exerciseExampleLabels(locale: Locale): LearningBlockLabels {
    const text = copy[locale];
    const kinds = kindLabels[locale];

    return {
        locale,
        kinds: {
            exercise: kinds[0],
            vocabulary: kinds[1],
            grammar: kinds[2],
            'bilingual-text': kinds[3],
            audio: kinds[4],
            video: kinds[5],
        },
        showAnswer: text[0],
        hideAnswer: text[1],
        retry: text[2],
        answer: text[3],
        checkWithAi: text[4],
        hint: text[5],
        incorrect: text[6],
        correct: text[7],
        check: text[8],
        notAnswered: text[9],
        attempted: text[10],
        showTranscript: '',
        hideTranscript: '',
        replay: '',
        original: '',
        bilingual: '',
        translationLanguage: '',
        mediaUnavailable: '',
        openVideoSource: '',
        rule: '',
        pattern: '',
        examples: '',
        commonMistakes: '',
    };
}
