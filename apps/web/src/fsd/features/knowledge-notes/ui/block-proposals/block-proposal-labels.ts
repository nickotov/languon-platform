import type { Locale } from '@/fsd/shared/i18n';
const values = {
    blockIdentity: ['Block', 'Блок', 'Bloque', 'Bloc'],
    update: [
        'Update block',
        'Обновить блок',
        'Actualizar bloque',
        'Mettre à jour le bloc',
    ],
    addAtCursor: [
        'Add at cursor',
        'Добавить у курсора',
        'Añadir en el cursor',
        'Ajouter au curseur',
    ],
    dismiss: ['Dismiss', 'Отклонить', 'Descartar', 'Ignorer'],
    dismissed: [
        'Proposal dismissed',
        'Предложение отклонено',
        'Propuesta descartada',
        'Proposition ignorée',
    ],
    restore: [
        'Show proposal',
        'Показать предложение',
        'Mostrar propuesta',
        'Afficher la proposition',
    ],
    blocks: ['blocks', 'блоков', 'bloques', 'blocs'],
    entries: ['entries', 'слов', 'entradas', 'entrées'],
    segments: ['segments', 'фрагментов', 'segmentos', 'segments'],
    sections: ['sections', 'разделов', 'secciones', 'sections'],
    questions: ['questions', 'вопросов', 'preguntas', 'questions'],
    sourceBasis: [
        'Source passages',
        'Исходные материалы',
        'Pasajes originales',
        'Passages sources',
    ],
    sourceBasisNote: [
        'These captured sources ground the questions. Adding a stale proposal separately also copies these sources independently.',
        'Вопросы основаны на этих материалах. При отдельном добавлении устаревшего предложения эти материалы тоже копируются независимо.',
        'Estas fuentes fundamentan las preguntas. Añadir una propuesta desactualizada por separado también copia estas fuentes.',
        'Ces sources fondent les questions. Ajouter séparément une proposition périmée copie également ces sources.',
    ],
    notInSheet: [
        'Not in sheet',
        'Не в документе',
        'Fuera de la nota',
        'Pas dans la note',
    ],
    appliedShort: ['Applied', 'Применено', 'Aplicado', 'Appliqué'],
    updates: [
        'Updates an existing block',
        'Обновляет существующий блок',
        'Actualiza un bloque existente',
        'Modifie un bloc existant',
    ],
    retry: ['Retry', 'Повторить', 'Reintentar', 'Réessayer'],
    review: ['Review', 'Просмотреть', 'Revisar', 'Vérifier'],
    reviewTitle: [
        'Review proposed content',
        'Просмотр предложенного материала',
        'Revisar contenido propuesto',
        'Vérifier le contenu proposé',
    ],
    reviewNote: [
        'Review prepared translations, answers and explanations before applying.',
        'Проверьте переводы, ответы и объяснения перед применением.',
        'Revisa las traducciones, respuestas y explicaciones antes de aplicar.',
        'Vérifiez les traductions, réponses et explications avant d’appliquer.',
    ],
    publicationNotice: [
        'Not published until you Save.',
        'Публикуется после сохранения.',
        'No se publica hasta guardar.',
        'Publié après enregistrement.',
    ],
    addSeparately: [
        'Add separately',
        'Добавить отдельно',
        'Añadir por separado',
        'Ajouter séparément',
    ],
    askAgain: ['Ask again', 'Запросить заново', 'Pedir de nuevo', 'Redemander'],
    showInSheet: [
        'Show in sheet',
        'Показать в документе',
        'Ver en la nota',
        'Voir dans la note',
    ],
    close: ['Close', 'Закрыть', 'Cerrar', 'Fermer'],
    expand: ['Expand', 'Развернуть', 'Ampliar', 'Agrandir'],
    collapse: ['Collapse', 'Свернуть', 'Contraer', 'Réduire'],
    title: [
        'Proposed learning blocks',
        'Предложенные учебные блоки',
        'Bloques de aprendizaje propuestos',
        'Blocs pédagogiques proposés',
    ],
    apply: [
        'Apply to working draft',
        'Применить к черновику',
        'Aplicar al borrador',
        'Appliquer au brouillon',
    ],
    applied: [
        'Added to your draft. Save the note to publish.',
        'Добавлено в черновик. Сохраните документ для публикации.',
        'Añadido al borrador. Guarda la nota para publicar.',
        'Ajouté au brouillon. Enregistrez la note pour publier.',
    ],
    stale: [
        'The document changed. Ask for a new proposal before applying.',
        'Документ изменился. Запросите новое предложение перед применением.',
        'El documento cambió. Solicita una propuesta nueva antes de aplicarla.',
        'Le document a changé. Demandez une nouvelle proposition avant de l’appliquer.',
    ],
    error: [
        'Unable to load or apply this proposal. Try again.',
        'Не удалось загрузить или применить предложение. Повторите.',
        'No se pudo cargar o aplicar la propuesta. Inténtalo de nuevo.',
        'Impossible de charger ou d’appliquer cette proposition. Réessayez.',
    ],
    refresh: [
        'Refresh proposals',
        'Обновить предложения',
        'Actualizar propuestas',
        'Actualiser les propositions',
    ],
};
export function blockProposalLabels(locale: Locale) {
    const index = { en: 0, ru: 1, es: 2, fr: 3 }[locale];
    return Object.fromEntries(
        Object.entries(values).map(([key, items]) => [key, items[index]]),
    ) as Record<keyof typeof values, string>;
}
