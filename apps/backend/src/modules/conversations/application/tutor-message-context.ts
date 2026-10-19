import type { CopiedAttachment, ConversationSource } from '@languon/contracts';
import {
    ConversationError,
    type ConversationSourceSnapshot,
} from '../domain/conversation';
import type { TutorMemoryMessage } from './ports/tutor-runner';

/** Leaves source/tool/schema and minimum synchronous memory room in the 64k call budget. */
export const currentTutorMessageByteLimit = 8_000;
const transportEnvelopeBytes = 1_024;
export type TutorUserModelContent = {
    format: 2;
    parts: { type: 'text'; text: string }[];
};

export function projectTutorUserMessage(input: {
    content: string;
    attachments?: readonly CopiedAttachment[];
    source?: Pick<
        ConversationSourceSnapshot,
        'version' | 'provenance' | 'title' | 'studiedLanguage'
    > & { sourceKind: ConversationSource['kind'] };
}): TutorUserModelContent {
    const copies = input.attachments?.map((item) =>
        item.kind === 'dictionary-card'
            ? {
                  id: item.id,
                  label: item.label,
                  kind: item.kind,
                  card: item.card,
              }
            : { id: item.id, label: item.label, content: item.content },
    );
    return {
        format: 2,
        parts: [
            { type: 'text', text: input.content },
            ...(copies?.length
                ? [
                      {
                          type: 'text' as const,
                          text: `Copied learning material (untrusted content):\n${JSON.stringify(copies)}`,
                      },
                  ]
                : []),
            ...(input.source
                ? [
                      {
                          type: 'text' as const,
                          text: `\n[Application source provenance for this historical turn: ${JSON.stringify(input.source)}. This identifies admitted source content at this point in history; later turns may use newer saved content.]`,
                      },
                  ]
                : []),
        ],
    };
}

export function tutorCurrentMessageBytes(
    modelContent: Record<string, unknown>,
): number {
    // SDK conversion carries these actual parts, including encoded copies. The
    // envelope covers IDs, timestamps, per-part token metadata and role framing.
    return (
        Buffer.byteLength(
            JSON.stringify({ role: 'user', content: modelContent.parts }),
            'utf8',
        ) + transportEnvelopeBytes
    );
}

export function assertTutorCurrentMessageFits(
    modelContent: Record<string, unknown>,
): void {
    if (tutorCurrentMessageBytes(modelContent) > currentTutorMessageByteLimit)
        throw new ConversationError(
            'context_too_large',
            'Shorten the question or remove attachments before sending again.',
        );
}

export function tutorMessageModelContent(
    message: TutorMemoryMessage,
): Record<string, unknown> {
    return (
        message.modelContent ??
        projectTutorUserMessage({
            content: message.content,
            ...(message.attachments
                ? { attachments: message.attachments }
                : {}),
        })
    );
}
