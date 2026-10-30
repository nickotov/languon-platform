import {
    ConversationError,
    type ConversationSourceSnapshot,
} from '../domain/conversation';
import type {
    CopiedAttachment,
    SubmitConversationTurnRequest,
} from '@languon/contracts';
import {
    projectTutorUserMessage,
    tutorSourceProvenance,
} from './tutor-message-context';

export function blockReferenceCatalog(snapshot: ConversationSourceSnapshot) {
    const material =
        snapshot.blockTarget?.material ?? snapshot.learningBlocks ?? [];
    return material.flatMap((item) => {
        try {
            const block = JSON.parse(item.content) as Record<string, unknown>;
            if (block.id !== item.id || typeof block.type !== 'string')
                return [];
            return [
                {
                    id: item.id,
                    type: block.type,
                    title:
                        typeof block.title === 'string'
                            ? block.title.slice(0, 200)
                            : item.label,
                },
            ];
        } catch {
            return [];
        }
    });
}

/** References identify server-frozen material; client content and foreign IDs grant no access. */
export function captureBlockReferences(
    snapshot: ConversationSourceSnapshot,
    ids: readonly string[],
    kind: string,
) {
    if (!ids.length) return;
    const available = new Set(
        blockReferenceCatalog(snapshot).map((block) => block.id),
    );
    if (
        kind !== 'knowledge' ||
        ids.length > 8 ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !available.has(id))
    )
        throw new ConversationError(
            'invalid_block_reference',
            'A mentioned block is no longer available in this source. Select it again.',
        );
    snapshot.blockReferences = [...ids];
}

export function assertReferencedProposalTarget(
    snapshot: ConversationSourceSnapshot,
    targetBlockId?: string,
) {
    if (
        targetBlockId &&
        snapshot.blockReferences?.length &&
        !snapshot.blockReferences.includes(targetBlockId)
    )
        throw new ConversationError(
            'invalid_block_reference',
            'An update must target a block explicitly mentioned in this question.',
        );
}

/** Prepare the single admitted projection after source authorization and retry selection. */
export function prepareReferencedTutorMessage(input: {
    snapshot: ConversationSourceSnapshot;
    sourceKind: Parameters<typeof tutorSourceProvenance>[1];
    request: SubmitConversationTurnRequest;
    content: string;
    attachments: CopiedAttachment[];
}) {
    if (!input.request.retryOf)
        captureBlockReferences(
            input.snapshot,
            input.request.blockReferences ?? [],
            input.sourceKind,
        );
    return projectTutorUserMessage({
        content: input.content,
        attachments: input.attachments,
        blockReferences: input.snapshot.blockReferences,
        ...(input.request.editorContext && !input.request.retryOf
            ? { editorContext: input.request.editorContext }
            : {}),
        source: tutorSourceProvenance(input.snapshot, input.sourceKind),
    });
}
