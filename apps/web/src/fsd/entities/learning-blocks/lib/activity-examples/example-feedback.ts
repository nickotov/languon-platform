import type { Locale } from '@/fsd/shared/i18n';

const feedback = {
    en: {
        correct:
            'The response completes the task and preserves the source meaning.',
        partial:
            'The main idea is present, but an important part of the task is missing.',
        unable: 'There is not enough relevant language to assess this response.',
        correction:
            'Include the requested details and use the target language.',
        labels: [
            'Successful response',
            'Response needing work',
            'Not enough to assess',
        ],
        incorrectLabel: 'Incorrect response',
        incorrectFeedback:
            'The response contradicts the passage: Maya walks to a library, not a bookshop, and does not go there to buy books.',
        incorrectCorrection:
            'Say that she walks because the bus is late, returns two books and borrows a story book.',
    },
    ru: {
        correct: 'Ответ выполняет задание и сохраняет смысл источника.',
        partial: 'Основная мысль есть, но важная часть задания пропущена.',
        unable: 'В ответе недостаточно подходящего текста для оценки.',
        correction: 'Добавьте запрошенные детали и используйте изучаемый язык.',
        labels: [
            'Удачный ответ',
            'Ответ для доработки',
            'Недостаточно для оценки',
        ],
        incorrectLabel: 'Неверный ответ',
        incorrectFeedback:
            'Ответ противоречит тексту: Майя идёт пешком в библиотеку, а не в книжный магазин, и не собирается покупать книги.',
        incorrectCorrection:
            'Укажите, что она идёт пешком из-за опоздания автобуса, возвращает две книги и берёт книгу с рассказом.',
    },
    fr: {
        correct:
            'La réponse accomplit la tâche et respecte le sens de la source.',
        partial:
            'L’idée principale est présente, mais une partie importante manque.',
        unable: 'Il n’y a pas assez de langue pertinente pour évaluer cette réponse.',
        correction: 'Ajoutez les détails demandés et utilisez la langue cible.',
        labels: [
            'Réponse réussie',
            'Réponse à améliorer',
            'Évaluation impossible',
        ],
        incorrectLabel: 'Réponse incorrecte',
        incorrectFeedback:
            'La réponse contredit le passage : Maya marche vers une bibliothèque, pas une librairie, et ne va pas acheter des livres.',
        incorrectCorrection:
            'Indiquez qu’elle marche car le bus est en retard, rend deux livres et emprunte un livre d’histoires.',
    },
    es: {
        correct:
            'La respuesta cumple la tarea y conserva el significado de la fuente.',
        partial:
            'La idea principal está presente, pero falta una parte importante.',
        unable: 'No hay suficiente lenguaje pertinente para evaluar esta respuesta.',
        correction:
            'Incluye los detalles solicitados y utiliza el idioma que estudias.',
        labels: [
            'Respuesta lograda',
            'Respuesta para mejorar',
            'No se puede evaluar',
        ],
        incorrectLabel: 'Respuesta incorrecta',
        incorrectFeedback:
            'La respuesta contradice el texto: Maya va andando a una biblioteca, no a una librería, y no va a comprar libros.',
        incorrectCorrection:
            'Indica que camina porque el autobús llega tarde, devuelve dos libros y toma prestado un libro de cuentos.',
    },
} as const;

export function exampleLocale(locale: string): Locale {
    return locale === 'ru' || locale === 'fr' || locale === 'es'
        ? locale
        : 'en';
}

export function exampleFeedback(locale: string) {
    return feedback[exampleLocale(locale)];
}
