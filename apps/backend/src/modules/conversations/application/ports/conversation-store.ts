import type { GeneratedReading, TutorProposalReadback } from './tutor-runner';
import type { LessonCopy } from '@languon/contracts';
import type { GenerationFailureDiagnostic } from '../generation-failure';
import type {
    ApplyDictionaryChatSnippetRequest,
    ApplyDictionaryChatSnippetResponse,
    DictionaryChatSnippet,
    DictionaryChatSnippetInput,
    ChatPreferences,
    ConversationResponseMetadata,
    Conversation,
    ConversationDetail,
    ConversationEvent,
    ConversationSource,
    ConversationTurn,
    CreateConversationRequest,
    SubmitConversationTurnRequest,
    KnowledgeDraft,
    KnowledgeNoteContent,
    LearningContentProposalInput,
    KnowledgeContentProposal,
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
import type { GenerationRunStore } from './generation-run-store';
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
export interface ConversationStore extends GenerationRunStore {
    proposeDictionarySnippet?(
        turn: ClaimedConversationTurn,
        input: DictionaryChatSnippetInput,
    ): Promise<{ id: string }>;
    readDictionarySnippet?(
        turn: ClaimedConversationTurn,
        snippetId: string,
    ): Promise<DictionaryChatSnippet>;
    listDictionarySnippets?(
        access: ConversationAccess,
        conversationId: string,
    ): Promise<{ snippets: DictionaryChatSnippet[] }>;
    applyDictionarySnippet?(
        access: ConversationAccess,
        conversationId: string,
        snippetId: string,
        input: ApplyDictionaryChatSnippetRequest,
    ): Promise<ApplyDictionaryChatSnippetResponse>;
    readGeneratedReadings?(
        turn: ClaimedConversationTurn,
    ): Promise<GeneratedReading[]>;
    readContentProposal?(
        turn: ClaimedConversationTurn,
        proposalId: string,
    ): Promise<TutorProposalReadback>;
    listContentProposals?(
        access: ConversationAccess,
        conversationId: string,
        proposalId?: string,
    ): Promise<{ proposals: KnowledgeContentProposal[] }>;
    applyContentProposal?(
        access: ConversationAccess,
        conversationId: string,
        proposalId: string,
        expectedBranchVersion: number,
        mode?: 'proposal' | 'add-separately' | 'insert-lesson',
        insertionPosition?: number,
        lessonCopy?: LessonCopy,
    ): Promise<{
        proposal: KnowledgeContentProposal;
        branch: KnowledgeWorkingBranch;
    }>;

    proposeContent?(
        turn: ClaimedConversationTurn,
        input: LearningContentProposalInput,
        signal?: AbortSignal,
        validationIds?: string[],
    ): Promise<{ id: string }>;
    proposeContentBatch?(
        turn: ClaimedConversationTurn,
        inputs: LearningContentProposalInput[],
        signal?: AbortSignal,
        validationIds?: string[],
    ): Promise<{ id: string }[]>;
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
    recordResponseMetadata?(
        turn: ClaimedConversationTurn,
        metadata: ConversationResponseMetadata,
    ): Promise<void>;
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
        failure?: GenerationFailureDiagnostic,
    ): Promise<void>;
    memory(turn: ClaimedConversationTurn): TutorMemoryPort;
}
