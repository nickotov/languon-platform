import type { Locale } from '@/fsd/shared/i18n';
const values = {
    saveVocabulary: [
        'Save to dictionary',
        'Сохранить в словарь',
        'Guardar en diccionario',
        'Enregistrer dans un dictionnaire',
    ],
    saveText: [
        'Save to Texts',
        'Сохранить в Тексты',
        'Guardar en Textos',
        'Enregistrer dans Textes',
    ],
    insert: [
        'Insert from library',
        'Вставить из библиотеки',
        'Insertar desde biblioteca',
        'Insérer depuis la bibliothèque',
    ],
    dictionary: ['Dictionary', 'Словарь', 'Diccionario', 'Dictionnaire'],
    text: ['Text', 'Текст', 'Texto', 'Texte'],
    destination: ['Destination', 'Куда сохранить', 'Destino', 'Destination'],
    fresh: ['Create new', 'Создать новый', 'Crear nuevo', 'Créer un élément'],
    existing: [
        'Extend existing',
        'Дополнить существующий',
        'Ampliar existente',
        'Compléter un élément',
    ],
    name: ['Name', 'Название', 'Nombre', 'Nom'],
    preview: ['Preview', 'Предпросмотр', 'Vista previa', 'Aperçu'],
    commit: [
        'Save independent copy',
        'Сохранить независимую копию',
        'Guardar copia independiente',
        'Enregistrer une copie indépendante',
    ],
    cancel: ['Cancel', 'Отмена', 'Cancelar', 'Annuler'],
    select: [
        'Select an item',
        'Выберите элемент',
        'Selecciona un elemento',
        'Sélectionnez un élément',
    ],
    more: ['Load more', 'Загрузить ещё', 'Cargar más', 'Charger plus'],
    folder: [
        'Text folder',
        'Папка текстов',
        'Carpeta de textos',
        'Dossier de textes',
    ],
    independent: [
        'Standalone texts',
        'Отдельные тексты',
        'Textos independientes',
        'Textes indépendants',
    ],
    error: [
        'Unable to complete this action. Check your selection and preview again.',
        'Не удалось выполнить действие. Проверьте выбор и повторите предпросмотр.',
        'No se pudo completar. Revisa la selección y vuelve a previsualizar.',
        'Impossible de terminer. Vérifiez la sélection et relancez l’aperçu.',
    ],
    saved: [
        'Independent copy saved.',
        'Независимая копия сохранена.',
        'Copia independiente guardada.',
        'Copie indépendante enregistrée.',
    ],
    selected: [
        'Select entries',
        'Выберите карточки',
        'Seleccionar entradas',
        'Sélectionner des entrées',
    ],
    language: [
        'Translation language',
        'Язык перевода',
        'Idioma de traducción',
        'Langue de traduction',
    ],
    prepared: [
        'Prepared content only. No AI generation is required.',
        'Сохраняется готовое содержимое. Генерация ИИ не требуется.',
        'Solo contenido preparado. No requiere generación de IA.',
        'Contenu préparé uniquement. Aucune génération par IA.',
    ],
    empty: [
        'No available items.',
        'Нет доступных элементов.',
        'No hay elementos disponibles.',
        'Aucun élément disponible.',
    ],
    insertSelected: [
        'Insert selected content',
        'Вставить выбранное содержимое',
        'Insertar contenido seleccionado',
        'Insérer le contenu sélectionné',
    ],
};
export type LibraryLabels = { [Key in keyof typeof values]: string };
export function libraryLabels(locale: Locale): LibraryLabels {
    const index = { en: 0, ru: 1, es: 2, fr: 3 }[locale];
    return Object.fromEntries(
        Object.entries(values).map(([key, words]) => [key, words[index]]),
    ) as LibraryLabels;
}
