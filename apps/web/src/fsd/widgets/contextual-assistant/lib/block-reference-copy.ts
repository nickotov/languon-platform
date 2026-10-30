import type { Locale } from '@/fsd/shared/i18n';
const copy = {
    en: {
        blocks: 'Blocks in this note',
        texts: 'Your Texts',
        search: 'Search note blocks',
        empty: 'No matching blocks',
        done: 'Done',
        remove: 'Remove block reference',
        missing: 'Block removed from note',
        limit: 'Mention up to 8 blocks per message. Remove one before adding another.',
        add: 'Add block to chat',
    },
    ru: {
        blocks: 'Блоки этой заметки',
        texts: 'Ваши тексты',
        search: 'Поиск блоков заметки',
        empty: 'Блоки не найдены',
        done: 'Готово',
        remove: 'Убрать ссылку на блок',
        missing: 'Блок удалён из заметки',
        limit: 'В сообщении можно указать до 8 блоков. Уберите один, чтобы добавить другой.',
        add: 'Добавить блок в чат',
    },
    es: {
        blocks: 'Bloques de esta nota',
        texts: 'Tus Textos',
        search: 'Buscar bloques de la nota',
        empty: 'No hay bloques coincidentes',
        done: 'Listo',
        remove: 'Quitar referencia al bloque',
        missing: 'Bloque eliminado de la nota',
        limit: 'Puedes mencionar hasta 8 bloques por mensaje. Quita uno antes de añadir otro.',
        add: 'Añadir bloque al chat',
    },
    fr: {
        blocks: 'Blocs de cette note',
        texts: 'Vos Textes',
        search: 'Rechercher des blocs',
        empty: 'Aucun bloc correspondant',
        done: 'Terminé',
        remove: 'Retirer la référence au bloc',
        missing: 'Bloc supprimé de la note',
        limit: 'Vous pouvez mentionner 8 blocs par message. Retirez-en un avant d’en ajouter un autre.',
        add: 'Ajouter le bloc au chat',
    },
};
export function blockReferenceCopy(locale: Locale) {
    return copy[locale];
}
