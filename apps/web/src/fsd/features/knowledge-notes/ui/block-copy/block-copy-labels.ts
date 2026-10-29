import type { Locale } from '@/fsd/shared/i18n';
const values = {
    done: ['Done', 'Готово', 'Listo', 'Terminé'],
    title: [
        'Copy blocks to a note',
        'Копировать блоки в документ',
        'Copiar bloques a una nota',
        'Copier des blocs dans une note',
    ],
    select: [
        'Select blocks (up to 50)',
        'Выберите блоки (до 50)',
        'Selecciona bloques (hasta 50)',
        'Sélectionnez les blocs (50 maximum)',
    ],
    destination: [
        'Destination note',
        'Документ назначения',
        'Nota de destino',
        'Note de destination',
    ],
    branch: [
        'Destination working draft',
        'Черновик назначения',
        'Borrador de destino',
        'Brouillon de destination',
    ],
    choose: [
        'Choose a note',
        'Выберите документ',
        'Elige una nota',
        'Choisissez une note',
    ],
    draft: ['Draft', 'Черновик', 'Borrador', 'Brouillon'],
    version: ['version', 'версия', 'versión', 'version'],
    more: [
        'Load more notes',
        'Загрузить ещё документы',
        'Cargar más notas',
        'Charger plus de notes',
    ],
    preview: [
        'Preview copy',
        'Предпросмотр копирования',
        'Vista previa de la copia',
        'Aperçu de la copie',
    ],
    apply: [
        'Copy into working draft',
        'Копировать в черновик',
        'Copiar al borrador',
        'Copier dans le brouillon',
    ],
    cancel: ['Cancel', 'Отмена', 'Cancelar', 'Annuler'],
    copied: [
        'Copied independently into the destination draft. Save that note to publish.',
        'Независимая копия добавлена в черновик. Сохраните документ для публикации.',
        'Copia independiente añadida al borrador de destino. Guarda esa nota para publicar.',
        'Copie indépendante ajoutée au brouillon de destination. Enregistrez cette note pour publier.',
    ],
    error: [
        'The source or destination changed, or copying is unavailable. Preview again or retry the same copy.',
        'Источник или назначение изменились либо копирование недоступно. Повторите предпросмотр или ту же операцию.',
        'El origen o destino cambió, o no se puede copiar. Vuelve a previsualizar o reintenta la misma copia.',
        'La source ou la destination a changé, ou la copie est indisponible. Relancez l’aperçu ou réessayez la même copie.',
    ],
    selectedCount: [
        'Selected blocks',
        'Выбранные блоки',
        'Bloques seleccionados',
        'Blocs sélectionnés',
    ],
    dependencies: [
        'Linked source blocks included',
        'Добавленные связанные источники',
        'Fuentes vinculadas incluidas',
        'Sources liées incluses',
    ],
    media: [
        'Uploaded audio assets copied independently',
        'Независимые копии загруженного аудио',
        'Archivos de audio copiados de forma independiente',
        'Audios importés copiés indépendamment',
    ],
};
export function blockCopyLabels(locale: Locale) {
    const index = { en: 0, ru: 1, es: 2, fr: 3 }[locale];
    return Object.fromEntries(
        Object.entries(values).map(([key, labels]) => [key, labels[index]]),
    ) as Record<keyof typeof values, string>;
}
export type BlockCopyLabels = ReturnType<typeof blockCopyLabels>;
