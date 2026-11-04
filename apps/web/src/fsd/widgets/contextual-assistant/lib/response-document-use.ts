import type { ConversationMessage } from '@languon/contracts';

/** Historical chat replies are not document proposals without an explicit request. */
export function canUseResponseInDocument(
    message: ConversationMessage,
): boolean {
    if (message.role !== 'assistant' || message.status !== 'complete') {
        return false;
    }

    if (message.responseMetadata) {
        return message.responseMetadata.documentUse;
    }

    return Boolean(message.editorTarget?.proposalMode);
}
