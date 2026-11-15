import type { Locale } from '@/fsd/shared/i18n';

const en = {
    preview: 'Preview exercise',
    search: 'Search exercises',
    empty: 'No matching exercises',
    categories: ['Vocabulary', 'Grammar', 'Reading', 'Writing'],
    notice: 'Local example · no AI or credits · answers and progress are not saved',
    source: 'Sample source material',
    reset: 'Reset example',
    feedback: 'Sample feedback',
    feedbackNotice:
        'This prepared feedback applies only to the displayed sample response, not to your own answer.',
    response: 'Sample response',
    showFeedback: 'Show sample feedback',
    close: 'Close exercise preview',
    checking: 'Checking',
};
const copy: Record<Locale, typeof en> = {
    en,
    ru: {
        preview: 'Посмотреть упражнение',
        search: 'Поиск упражнений',
        empty: 'Упражнения не найдены',
        categories: ['Лексика', 'Грамматика', 'Чтение', 'Письмо'],
        notice: 'Локальный пример · без ИИ и кредитов · ответы и прогресс не сохраняются',
        source: 'Материал примера',
        reset: 'Сбросить пример',
        feedback: 'Пример обратной связи',
        feedbackNotice:
            'Готовый разбор относится только к показанному примеру ответа, а не к вашему ответу.',
        response: 'Пример ответа',
        showFeedback: 'Показать пример разбора',
        close: 'Закрыть пример упражнения',
        checking: 'Проверка',
    },
    fr: {
        preview: 'Aperçu de l’exercice',
        search: 'Rechercher des exercices',
        empty: 'Aucun exercice trouvé',
        categories: ['Vocabulaire', 'Grammaire', 'Lecture', 'Écriture'],
        notice: 'Exemple local · sans IA ni crédits · réponses et progression non enregistrées',
        source: 'Source de l’exemple',
        reset: 'Réinitialiser l’exemple',
        feedback: 'Exemple de retour',
        feedbackNotice:
            'Ce retour préparé concerne uniquement la réponse affichée, pas votre propre réponse.',
        response: 'Exemple de réponse',
        showFeedback: 'Afficher le retour préparé',
        close: 'Fermer l’aperçu',
        checking: 'Vérification',
    },
    es: {
        preview: 'Vista previa del ejercicio',
        search: 'Buscar ejercicios',
        empty: 'No se encontraron ejercicios',
        categories: ['Vocabulario', 'Gramática', 'Lectura', 'Escritura'],
        notice: 'Ejemplo local · sin IA ni créditos · no se guardan respuestas ni progreso',
        source: 'Material del ejemplo',
        reset: 'Reiniciar ejemplo',
        feedback: 'Comentario de ejemplo',
        feedbackNotice:
            'Este comentario preparado se aplica solo a la respuesta mostrada, no a tu respuesta.',
        response: 'Respuesta de ejemplo',
        showFeedback: 'Mostrar comentario preparado',
        close: 'Cerrar vista previa',
        checking: 'Comprobación',
    },
};

export function exercisePreviewCopy(locale: Locale) {
    return copy[locale];
}
