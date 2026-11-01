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
