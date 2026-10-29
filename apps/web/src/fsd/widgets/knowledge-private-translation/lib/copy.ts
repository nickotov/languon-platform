import type { Locale } from '@/fsd/shared/i18n';
const copy = {
    en: {
        title: 'Private translation',
        remove: 'Show original view',
        noTargets:
            'All supported languages already have a prepared translation.',
        notice: 'Only you can see this translation. AI actions use your credits; the original note stays unchanged.',
        language: 'Target language',
        generate: 'Translate privately',
        busy: 'Translating…',
        cancel: 'Cancel request',
        error: 'Translation could not be completed. Try again.',
        unavailable:
            'This learning material or its translation is unavailable.',
        loading: 'Loading your translations…',
        retry: 'Retry',
        private: 'Your private bilingual view',
    },
    ru: {
        title: 'Личный перевод',
        remove: 'Показать оригинал',
        noTargets: 'Для всех поддерживаемых языков уже есть готовый перевод.',
        notice: 'Этот перевод виден только вам. Действия ИИ используют ваши кредиты; исходная заметка не изменяется.',
        language: 'Язык перевода',
        generate: 'Перевести для себя',
        busy: 'Перевод…',
        cancel: 'Отменить запрос',
        error: 'Не удалось завершить перевод. Повторите попытку.',
        unavailable: 'Материал или его перевод недоступен.',
        loading: 'Загрузка ваших переводов…',
        retry: 'Повторить',
        private: 'Ваш личный двуязычный текст',
    },
    fr: {
        title: 'Traduction privée',
        remove: 'Afficher l’original',
        noTargets:
            'Toutes les langues prises en charge ont déjà une traduction préparée.',
        notice: 'Vous seul voyez cette traduction. Les actions IA utilisent vos crédits ; la note originale reste inchangée.',
        language: 'Langue cible',
        generate: 'Traduire en privé',
        busy: 'Traduction…',
        cancel: 'Annuler la demande',
        error: 'La traduction a échoué. Réessayez.',
        unavailable: 'Ce contenu ou sa traduction est indisponible.',
        loading: 'Chargement de vos traductions…',
        retry: 'Réessayer',
        private: 'Votre vue bilingue privée',
    },
    es: {
        title: 'Traducción privada',
        remove: 'Mostrar original',
        noTargets:
            'Todos los idiomas compatibles ya tienen una traducción preparada.',
        notice: 'Solo tú ves esta traducción. Las acciones de IA usan tus créditos; la nota original permanece igual.',
        language: 'Idioma de destino',
        generate: 'Traducir en privado',
        busy: 'Traduciendo…',
        cancel: 'Cancelar solicitud',
        error: 'No se pudo completar la traducción. Inténtalo de nuevo.',
        unavailable: 'Este material o su traducción no está disponible.',
        loading: 'Cargando tus traducciones…',
        retry: 'Reintentar',
        private: 'Tu vista bilingüe privada',
    },
};
export function privateTranslationCopy(locale: Locale) {
    return copy[locale];
}
