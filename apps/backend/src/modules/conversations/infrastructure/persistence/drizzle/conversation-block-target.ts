import { KnowledgeBodySchema, type LearningBlock } from '@languon/contracts';
import { learningBlockSourceMaterial } from '../../../application/learning-block-source-material';
import type {
    ConversationSource,
    SubmitConversationTurnRequest,
} from '@languon/contracts';
import {
    isReadOnlyKnowledgeSource,
    ConversationError,
    type ConversationSourceSnapshot,
} from '../../../domain/conversation';
import { and, eq } from 'drizzle-orm';
import { knowledgeWorkingBranchesTable as branches } from '../../../../knowledge/infrastructure/persistence/drizzle/schema';
import type { ConversationsTransaction } from './conversation-source';
import { conflict } from './conversation-persistence-context';

/** Explicit selected branch identity prevents proposals targeting another conflict alternative. */
export async function captureConversationBlockTarget(
    tx: ConversationsTransaction,
    noteId: string,
    branchId: string,
    expectedVersion?: number,
) {
    const [branch] = await tx
        .select({
            id: branches.id,
            version: branches.version,
            content: branches.content,
        })
        .from(branches)
        .where(and(eq(branches.id, branchId), eq(branches.noteId, noteId)))
        .for('share');

    if (
        !branch ||
        (expectedVersion !== undefined && branch.version !== expectedVersion)
    )
        throw conflict(
            'The selected working branch changed. Save your draft and try again.',
        );

    const body = KnowledgeBodySchema.parse(branch.content.body);
    const blocks = (body.document.content ?? []).flatMap(
        (node): LearningBlock[] =>
            node.type === 'learningBlock' && node.attrs?.block
                ? [node.attrs.block]
                : [],
    );

    return {
        branchId: branch.id,
        version: branch.version,
        material: learningBlockSourceMaterial(blocks),
    };
}

export function assertConversationEditorAuthority(
    source: ConversationSource,
    input: SubmitConversationTurnRequest,
) {
    const readOnly = isReadOnlyKnowledgeSource(source);
    if (readOnly && (input.editorContext || input.draftContext))
        throw new ConversationError(
            'invalid_editor_context',
            'Read-only conversations use saved content only.',
        );

    return readOnly;
}

export function assertConversationRetryAuthority(
    source: ConversationSource,
    snapshot: ConversationSourceSnapshot,
) {
    if (isReadOnlyKnowledgeSource(source) && snapshot.provenance !== 'saved')
        throw new ConversationError(
            'invalid_editor_context',
            'Read-only conversations cannot retry a private draft snapshot.',
        );
}
