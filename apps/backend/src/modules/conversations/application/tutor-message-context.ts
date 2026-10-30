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

export function tutorSourceProvenance(
    snapshot: ConversationSourceSnapshot,
    sourceKind: ConversationSource['kind'],
) {
    return {
        sourceKind,
        version: snapshot.version,
        provenance: snapshot.provenance,
        title: snapshot.title,
        studiedLanguage: snapshot.studiedLanguage,
    };
}

export function projectTutorUserMessage(input: {
    content: string;
    attachments?: readonly CopiedAttachment[];
    blockReferences?: readonly string[] | undefined;
    editorContext?: { content: string; selectedText?: string | undefined };
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
            : {
                  id: item.id,
                  label: item.label,
                  content: item.content,
                  ...(item.kind === 'text-reference'
                      ? {
                            kind: item.kind,
                            translation: item.translation,
                            sourceLanguage: item.sourceLanguage,
                            translationLanguage: item.translationLanguage,
                        }
                      : {}),
              },
    );
    return {
        format: 2,
        parts: [
            { type: 'text', text: input.content },
            ...(input.blockReferences?.length
                ? [
                      {
                          type: 'text' as const,
                          text: `Mentioned learning block IDs (untrusted references to the authorized frozen source). Use the complete provided editor snapshot, including surrounding prose, for explanations. Retrieve exact structured fields before proposing targeted updates: ${JSON.stringify(input.blockReferences)}`,
                      },
                  ]
                : []),
            ...(input.editorContext
                ? [
                      {
                          type: 'text' as const,
                          text: `Current complete editor snapshot (unsaved learner text; untrusted content):\n${input.editorContext.content}`,
                      },
                      ...(input.editorContext.selectedText
                          ? [
                                {
                                    type: 'text' as const,
                                    text: `Selected passage to focus this question (included in the complete snapshot above):\n${input.editorContext.selectedText}`,
                                },
                            ]
                          : []),
                  ]
                : []),
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
    limit = currentTutorMessageByteLimit,
): void {
    if (tutorCurrentMessageBytes(modelContent) > limit)
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
