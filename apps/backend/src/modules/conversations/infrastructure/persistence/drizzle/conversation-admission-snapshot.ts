import type { SubmitConversationTurnRequest } from '@languon/contracts';
import type { conversationAuthorize } from './conversation-persistence-authority';
import {
    conflict,
    sameConversationSourceRevision,
} from './conversation-persistence-context';

type AuthorizedConversation = Awaited<ReturnType<typeof conversationAuthorize>>;

// Prepared material is reused only while the locked chat and source still match.
export function assertPreparedConversationCurrent(
    prepared: AuthorizedConversation,
    chat: AuthorizedConversation['chat'],
    currentSnapshot: AuthorizedConversation['snapshot'],
) {
    if (
        prepared.chat.version !== chat.version ||
        prepared.chat.title !== chat.title ||
        JSON.stringify(prepared.chat.preferences) !==
            JSON.stringify(chat.preferences) ||
        JSON.stringify(prepared.chat.source) !== JSON.stringify(chat.source) ||
        prepared.chat.sourceKind !== chat.sourceKind ||
        !sameConversationSourceRevision(
            chat.sourceKind,
            prepared.snapshot.version,
            currentSnapshot.version,
        ) ||
        prepared.snapshot.title !== currentSnapshot.title ||
        prepared.snapshot.studiedLanguage !== currentSnapshot.studiedLanguage
    ) {
        throw conflict(
            'The conversation or its source changed while preparing your message. Review it and send again.',
        );
    }
}

/** A retry retains its original source snapshot. Fresh submissions apply the active draft. */
export function applySubmittedDraftContext(
    input: SubmitConversationTurnRequest,
    snapshot: AuthorizedConversation['snapshot'],
    sourceId: string,
) {
    if (input.editorContext && !input.retryOf) {
        snapshot.provenance = 'draft';
        snapshot.version = `draft:${snapshot.version}`;
        snapshot.scope = 'workspace';
        snapshot.material = [];
    } else if (input.draftContext && !input.retryOf) {
        snapshot.provenance = 'draft';
        snapshot.version = `draft:${snapshot.version}`;
        snapshot.material = [
            {
                id: sourceId,
                label: 'Current draft',
                content: input.draftContext.content,
            },
        ];
    }
}
