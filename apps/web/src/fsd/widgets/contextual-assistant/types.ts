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

export type WorkspaceProposalPreview = {
    original: string;
    current: string;
    before: string;
    after: string;
    end: string;
    changed: boolean;
};

export type WorkspaceAssistantProps = {
    request?:
        | {
              id: string;
              passage?: string;
              prompt?: string;
              autoSend?: boolean;
              targetId?: string;
          }
        | undefined;
    proposalRootId?: string | undefined;
    inlineProposalRootId?: string | undefined;
    getProposalPosition?(
        targetId?: string,
    ): { top: number; left: number; width: number } | null;
    editorCharacters?: number | undefined;
    getProposalPreview?(
        targetId?: string,
        anchor?: ConversationEditorTarget,
    ): WorkspaceProposalPreview | null;
    onShowTarget?(targetId?: string): void;
    getSnapshot(targetId?: string | null): WorkspaceEditorSnapshot;
    /** Persist the working draft before creating a turn from the frozen snapshot. */
    beforeSend?(): Promise<void>;
    restoreTarget?(anchor: ConversationEditorTarget): Promise<string | null>;
    onSent?(): void;
    onBusyChange?(busy: boolean): void;
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
