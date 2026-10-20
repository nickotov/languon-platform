import type { Locale } from '@/fsd/shared/i18n';

const copy = {
    en: {
        label: 'Mode',
        retrySettings: 'Retry settings',
        auto: 'Auto',
        explain: 'Explain',
        correct: 'Correct',
        practice: 'Practice',
    },
    ru: {
        label: 'Режим',
        retrySettings: 'Повторить сохранение настроек',
        auto: 'Авто',
        explain: 'Объяснение',
        correct: 'Проверка',
        practice: 'Практика',
    },
    es: {
        label: 'Modo',
        retrySettings: 'Reintentar ajustes',
        auto: 'Automático',
        explain: 'Explicar',
        correct: 'Corregir',
        practice: 'Practicar',
    },
    fr: {
        label: 'Mode',
        retrySettings: 'Réessayer les réglages',
        auto: 'Auto',
        explain: 'Expliquer',
        correct: 'Corriger',
        practice: 'Pratiquer',
    },
};
export function tutorModeCopy(locale: Locale) {
    return copy[locale];
}
