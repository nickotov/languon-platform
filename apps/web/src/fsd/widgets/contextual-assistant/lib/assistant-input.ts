import type { CopiedAttachment } from '@languon/contracts';
import type { Locale } from '@/fsd/shared/i18n';

export function referenceLength(attachments: CopiedAttachment[]): number {
    return attachments.reduce(
        (total, attachment) =>
            total +
            Array.from(attachment.content).length +
            (attachment.kind === 'text-reference'
                ? Array.from(attachment.translation ?? '').length
                : 0),
        0,
    );
}

const copy = {
    en: {
        limit: 'You can attach up to 10 items. Remove one before adding another.',
        tooLarge:
            'This selection is too long to attach (80,000 characters maximum). Select a shorter passage. Nothing was shortened or attached.',
        identify:
            'Use the full earlier assistant answer in this conversation identified by the opening excerpt below. This is only an identifying excerpt, not the full answer:',
    },
    ru: {
        limit: 'Можно прикрепить не более 10 материалов. Удалите один, прежде чем добавить другой.',
        tooLarge:
            'Выделенный текст слишком длинный (не более 80 000 символов). Выберите более короткий отрывок. Текст не сокращён и не прикреплён.',
        identify:
            'Используй полный предыдущий ответ ассистента в этой беседе, начало которого приведено ниже. Это только отрывок для определения ответа, а не весь ответ:',
    },
    es: {
        limit: 'Puedes adjuntar hasta 10 elementos. Elimina uno antes de añadir otro.',
        tooLarge:
            'La selección es demasiado larga (máximo 80.000 caracteres). Selecciona un pasaje más corto. No se ha recortado ni adjuntado nada.',
        identify:
            'Usa la respuesta anterior completa del asistente en esta conversación identificada por el inicio mostrado abajo. Es solo un fragmento para identificarla, no la respuesta completa:',
    },
    fr: {
        limit: 'Vous pouvez joindre jusqu’à 10 éléments. Retirez-en un avant d’en ajouter un autre.',
        tooLarge:
            'La sélection est trop longue (80 000 caractères maximum). Sélectionnez un passage plus court. Rien n’a été raccourci ni joint.',
        identify:
            'Utilise la réponse précédente complète de l’assistant dans cette conversation, identifiée par le début ci-dessous. Il s’agit uniquement d’un extrait permettant de la retrouver, pas de la réponse complète :',
    },
};

export function appendAssistantAttachment(
    previous: CopiedAttachment[],
    attachment: CopiedAttachment,
    locale: Locale,
    referenceLimit?: number,
): { attachments: CopiedAttachment[]; error: string | null } {
    if (
        referenceLimit !== undefined &&
        referenceLength([...previous, attachment]) > referenceLimit
    )
        return {
            attachments: previous,
            error: `Reference text exceeds the ${referenceLimit.toLocaleString('en-US')}-character limit. Remove a reference or select a shorter passage.`,
        };
    if (referenceLimit === undefined && previous.length >= 10)
        return { attachments: previous, error: copy[locale].limit };
    if (Array.from(attachment.content).length > 80_000)
        return { attachments: previous, error: copy[locale].tooLarge };
    return { attachments: [...previous, attachment], error: null };
}

export function knowledgeProposalQuestion(
    question: string,
    explanation: string | undefined,
    locale: Locale,
): string {
    if (!explanation) return question;
    // Keep complete Unicode characters while bounding the identifying excerpt.
    const excerpt = Array.from(explanation).slice(0, 1000).join('');
    return `${question}\n\n${copy[locale].identify}\n\n${excerpt}`;
}
