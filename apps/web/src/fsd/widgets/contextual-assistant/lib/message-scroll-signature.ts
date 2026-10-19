import type { ConversationUIMessage } from '@/fsd/entities/conversation';

/** Inspect only the last message, never serialize retained source copies/history. */
export function messageScrollSignature(
    messages: ConversationUIMessage[],
    draftCount: number,
) {
    const last = messages.at(-1);
    const textLength = last?.parts.reduce(
        (length, part) =>
            length + (part.type === 'text' ? part.text.length : 0),
        0,
    );
    return `${messages.length}:${last?.id}:${textLength}:${last?.parts.length}:${last?.metadata?.status}:${draftCount}`;
}
