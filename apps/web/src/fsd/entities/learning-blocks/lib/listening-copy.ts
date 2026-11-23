const copy = {
    en: [
        'Hear the evidence',
        'Play excerpt',
        'Missing',
        'Replace',
        'Extra',
        'Gap',
    ],
    ru: [
        'Прослушать подтверждение',
        'Слушать фрагмент',
        'Пропущено',
        'Заменить',
        'Лишнее',
        'Пропуск',
    ],
    fr: [
        'Réécouter le passage utile',
        'Écouter l’extrait',
        'Manquant',
        'Remplacer',
        'En trop',
        'Blanc',
    ],
    es: [
        'Escuchar la evidencia',
        'Escuchar el fragmento',
        'Falta',
        'Sustituir',
        'Sobra',
        'Hueco',
    ],
} as const;

export function listeningCopy(locale: string | undefined) {
    return copy[
        locale === 'fr' || locale === 'ru' || locale === 'es' ? locale : 'en'
    ];
}
