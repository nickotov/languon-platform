import type { ConversationSource } from '@languon/contracts';

export type ContextualAssistantProps = {
    source: ConversationSource;
    contextLabel?: string | undefined;
    shareKey?: string | undefined;
    currentDraft?: string | undefined;
    selectionRootId?: string | undefined;
};
