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
    PublishKnowledgeDraftRequest,
    KnowledgeNote,
    ConversationToolCall,
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
    preferences: ChatPreferences;
    message: TutorMemoryMessage;
    conversationCreatedAt: string;
    source: ConversationSource;
};
export interface ConversationStore {
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
        preferences: ChatPreferences,
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
