import type {
    ConversationEditorTarget,
    ConversationSource,
} from '@languon/contracts';

export type ContextualAssistantProps = {
    source: ConversationSource;
    contextLabel?: string | undefined;
    shareKey?: string | undefined;
    currentDraft?: string | undefined;
    selectionRootId?: string | undefined;
    workspace?: WorkspaceAssistantProps | undefined;
};

export type WorkspaceEditorSnapshot = {
    /** Complete plain-text body at Send, including unsaved edits. */
    content: string;
    selectedPassage?: string | undefined;
    /** Stable editor-owned target identity, mapped through later edits. */
    targetId?: string | undefined;
    editorTarget: Omit<
        ConversationEditorTarget,
        'documentHash' | 'proposalMode'
    >;
};

export type WorkspaceProposalAction = 'insert' | 'append' | 'replace';

export type WorkspaceAssistantProps = {
    getSnapshot(): WorkspaceEditorSnapshot;
    /** Persist the working draft before creating a turn from the frozen snapshot. */
    beforeSend?(): Promise<void>;
    restoreTarget?(anchor: ConversationEditorTarget): Promise<string | null>;
    onSent?(): void;
    onAcceptProposal(
        text: string,
        action: WorkspaceProposalAction,
        targetId?: string,
    ): 'applied' | 'changed' | 'missing';
    onConflictProposal?(
        text: string,
        action: WorkspaceProposalAction,
        targetId?: string,
        anchor?: ConversationEditorTarget,
    ): void;
    editorLimit?: number | undefined;
    referenceLimit?: number | undefined;
};
