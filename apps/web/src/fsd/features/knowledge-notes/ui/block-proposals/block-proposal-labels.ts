import type { Locale } from '@/fsd/shared/i18n';
const values = {
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
