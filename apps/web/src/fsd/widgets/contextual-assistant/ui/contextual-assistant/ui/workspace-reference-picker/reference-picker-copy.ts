const labels = {
    en: {
        search: 'Search your Texts',
        empty: 'No matching Texts',
        error: 'Could not load Texts',
        source: 'Source text',
        translation: 'Include translation',
        passage:
            'Select a shorter passage in the source, then use the selection button.',
        selectPassage: 'Use selected passage',
        fullText: 'Use full text',
        add: 'Attach to message',
        back: 'Back to Texts',
        close: 'Close references',
    },
    ru: {
        search: 'Поиск по вашим текстам',
        empty: 'Тексты не найдены',
        error: 'Не удалось загрузить тексты',
        source: 'Исходный текст',
        translation: 'Добавить перевод',
        passage:
            'Выделите короткий отрывок в источнике и нажмите кнопку выбора.',
        selectPassage: 'Использовать выделенный отрывок',
        fullText: 'Использовать полный текст',
        add: 'Прикрепить к сообщению',
        back: 'Назад к текстам',
        close: 'Закрыть материалы',
    },
    es: {
        search: 'Buscar en tus Textos',
        empty: 'No hay Textos coincidentes',
        error: 'No se pudieron cargar los Textos',
        source: 'Texto original',
        translation: 'Incluir traducción',
        passage:
            'Selecciona un pasaje más corto en el texto y usa el botón de selección.',
        selectPassage: 'Usar el pasaje seleccionado',
        fullText: 'Usar el texto completo',
        add: 'Adjuntar al mensaje',
        back: 'Volver a Textos',
        close: 'Cerrar referencias',
    },
    fr: {
        search: 'Rechercher dans vos Textes',
        empty: 'Aucun Texte trouvé',
        error: 'Impossible de charger les Textes',
        source: 'Texte source',
        translation: 'Inclure la traduction',
        passage:
            'Sélectionnez un passage plus court dans le texte puis utilisez le bouton.',
        selectPassage: 'Utiliser le passage sélectionné',
        fullText: 'Utiliser le texte entier',
        add: 'Joindre au message',
        back: 'Retour aux Textes',
        close: 'Fermer les références',
    },
};

export function referencePickerCopy(locale: keyof typeof labels) {
    return labels[locale];
}
