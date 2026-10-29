import type {
    ChatPreferences,
    Conversation,
    ConversationDetail,
    ConversationEvent,
    ConversationSource,
    ConversationTurn,
    CreateConversationRequest,
    SubmitConversationTurnRequest,
    KnowledgeDraft,
    KnowledgeNoteContent,
    LearningBlockProposalInput,
    KnowledgeBlockProposal,
    KnowledgeWorkingBranch,
    PublishKnowledgeDraftRequest,
    KnowledgeNote,
    ConversationToolCall,
    UpdateConversationRequest,
} from '@languon/contracts';
import type {
    ConversationSourceSnapshot,
    SourceAuthority,
    SourceMaterial,
} from '../../domain/conversation';
import type { TutorMemoryPort, TutorMemoryMessage } from './tutor-runner';
export type ConversationAccess = { ownerId: string; shareKey?: string };
export type ClaimedConversationTurn = {
    id: string;
    conversationId: string;
    ownerId: string;
    leaseToken: string;
    authority: SourceAuthority;
    sourceSnapshot: ConversationSourceSnapshot;
    execution: Record<string, unknown>;
    portraitContext?: unknown;
    preferences: ChatPreferences;
    message: TutorMemoryMessage;
    conversationCreatedAt: string;
    source: ConversationSource;
};
export interface ConversationStore {
    listBlockProposals?(
        access: ConversationAccess,
        conversationId: string,
    ): Promise<{ proposals: KnowledgeBlockProposal[] }>;
    applyBlockProposal?(
        access: ConversationAccess,
        conversationId: string,
        proposalId: string,
        expectedBranchVersion: number,
        mode?: 'proposal' | 'add-separately',
    ): Promise<{
        proposal: KnowledgeBlockProposal;
        branch: KnowledgeWorkingBranch;
    }>;

    proposeBlocks?(
        turn: ClaimedConversationTurn,
        input: LearningBlockProposalInput,
    ): Promise<{ id: string }>;
    list(
        access: ConversationAccess,
        source: ConversationSource,
    ): Promise<Conversation[]>;
    create(
        access: ConversationAccess,
        input: CreateConversationRequest,
    ): Promise<Conversation>;
    detail(access: ConversationAccess, id: string): Promise<ConversationDetail>;
    update(
        access: ConversationAccess,
        id: string,
        changes: UpdateConversationRequest,
    ): Promise<Conversation>;
    delete(access: ConversationAccess, id: string): Promise<void>;
    submit(
        access: ConversationAccess,
        id: string,
        input: SubmitConversationTurnRequest,
    ): Promise<ConversationTurn>;
    stop(
        access: ConversationAccess,
        id: string,
        turnId: string,
    ): Promise<ConversationTurn>;
    events(
        access: ConversationAccess,
        id: string,
        after: number,
    ): Promise<ConversationEvent[]>;
    context(
        access: ConversationAccess,
        id: string,
        query: string,
    ): Promise<{ material: SourceMaterial[]; total: number }>;
    textReferences(
        access: ConversationAccess,
        conversationId: string,
        query: string,
    ): Promise<{
        references: {
            id: string;
            title: string;
            sourceLanguage: string;
            translationLanguage: string | null;
            hasTranslation: boolean;
        }[];
    }>;
    textReference(
        access: ConversationAccess,
        conversationId: string,
        textId: string,
    ): Promise<{
        reference: {
            id: string;
            title: string;
            content: string;
            sourceLanguage: string;
            translation: string | null;
            translationLanguage: string | null;
            hasTranslation: boolean;
        };
    }>;
    settings(
        ownerId: string,
        preferences?: ChatPreferences,
    ): Promise<ChatPreferences>;
    updateDraft(
        access: ConversationAccess,
        id: string,
        draftId: string,
        version: number,
        content: KnowledgeNoteContent,
    ): Promise<KnowledgeDraft>;
    discardDraft(
        access: ConversationAccess,
        id: string,
        draftId: string,
    ): Promise<void>;
    publishDraft(
        access: ConversationAccess,
        id: string,
        draftId: string,
        input: PublishKnowledgeDraftRequest,
    ): Promise<KnowledgeNote>;
    claim(): Promise<ClaimedConversationTurn | null>;
    heartbeat(turn: ClaimedConversationTurn): Promise<void>;
    append(turn: ClaimedConversationTurn, delta: string): Promise<void>;
    recordTool(
        turn: ClaimedConversationTurn,
        call: ConversationToolCall,
    ): Promise<void>;
    recordMaterial(
        turn: ClaimedConversationTurn,
        material: SourceMaterial[],
    ): Promise<void>;
    propose(
        turn: ClaimedConversationTurn,
        content: KnowledgeNoteContent,
        target?: { noteId: string; version: number },
    ): Promise<KnowledgeDraft>;
    finish(
        turn: ClaimedConversationTurn,
        status: 'succeeded' | 'failed' | 'cancelled',
        failureCode?: string,
    ): Promise<void>;
    memory(turn: ClaimedConversationTurn): TutorMemoryPort;
}
