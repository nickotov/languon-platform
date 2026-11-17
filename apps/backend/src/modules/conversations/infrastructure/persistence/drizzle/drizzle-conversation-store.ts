import type { GenerationRunStore } from '../../../application/ports/generation-run-store';
import { createGenerationRunStore } from './generation-run-store';
import {
    conversationProposeDictionarySnippet,
    conversationReadDictionarySnippet,
    conversationListDictionarySnippets,
    conversationApplyDictionarySnippet,
} from './conversation-dictionary-snippets';
import { conversationReadContentProposal } from './conversation-proposal-readback';
import { conversationRecordResponseMetadata } from './conversation-response-metadata';
import {
    conversationProposeContent,
    conversationProposeContentBatch,
    conversationListContentProposals,
    conversationApplyContentProposal,
} from './conversation-content-proposals';
import {
    type ApplyDictionaryChatSnippetRequest,
    type DictionaryChatSnippetInput,
    type ChatPreferences,
    type ConversationResponseMetadata,
    type ConversationEvent,
    type ConversationSource,
    type ConversationToolCall,
    type CreateConversationRequest,
    type KnowledgeNoteContent,
    type LearningContentProposalInput,
    type PublishKnowledgeDraftRequest,
    type SubmitConversationTurnRequest,
    type UpdateConversationRequest,
} from '@languon/contracts';
import type {
    ClaimedConversationTurn,
    ConversationAccess,
    ConversationStore,
} from '../../../application/ports/conversation-store';
import type { TutorMemoryPort } from '../../../application/ports/tutor-runner';
import { type SourceMaterial } from '../../../domain/conversation';
import {
    conversationCreate,
    conversationDelete,
    conversationDetail,
    conversationList,
    conversationSettings,
    conversationUpdate,
} from './conversation-chat-queries';
import {
    conversationDiscardDraft,
    conversationPublishDraft,
    conversationUpdateDraft,
} from './conversation-draft-mutations';
import { conversationEvents } from './conversation-events';
import type {
    ConversationPersistenceDependencies,
    TurnRow,
} from './conversation-persistence-context';
import { type ConversationPersistenceContext } from './conversation-persistence-context';
import type { ConversationsTransaction } from './conversation-source';
import {
    conversationContext,
    conversationTextReference,
    conversationTextReferences,
} from './conversation-source-queries';
import { conversationSubmit } from './conversation-turn-admission';
import {
    conversationMaintainAccounting,
    conversationStop,
} from './conversation-turn-lifecycle';
import { conversationWithOperation } from './conversation-worker-authority';
import { conversationClaim } from './conversation-worker-claim';
import {
    conversationFinish,
    conversationMemory,
} from './conversation-worker-completion';
import {
    conversationAppend,
    conversationHeartbeat,
    conversationPropose,
    conversationRecordMaterial,
    conversationRecordTool,
} from './conversation-worker-output';

export { type ConversationPersistenceDependencies } from './conversation-persistence-context';

export class DrizzleConversationStore implements ConversationStore {
    private readonly persistence: ConversationPersistenceContext;
    readonly assertGenerationProposal: Required<GenerationRunStore>['assertGenerationProposal'];
    readonly linkGenerationProposal: Required<GenerationRunStore>['linkGenerationProposal'];
    readonly generationContext: Required<GenerationRunStore>['generationContext'];
    readonly startGeneration: Required<GenerationRunStore>['startGeneration'];
    readonly checkpointGeneration: Required<GenerationRunStore>['checkpointGeneration'];
    readonly pauseGeneration: Required<GenerationRunStore>['pauseGeneration'];
    readonly proposeGenerationRevision: Required<GenerationRunStore>['proposeGenerationRevision'];
    readonly listGenerationRuns: Required<GenerationRunStore>['listGenerationRuns'];
    readonly getGenerationRun: Required<GenerationRunStore>['getGenerationRun'];
    readonly continueGenerationRun: Required<GenerationRunStore>['continueGenerationRun'];
    readonly reviseGenerationRun: Required<GenerationRunStore>['reviseGenerationRun'];
    readonly applyGenerationRevision: Required<GenerationRunStore>['applyGenerationRevision'];
    readonly resolveGenerationSource: Required<GenerationRunStore>['resolveGenerationSource'];
    readonly discardGenerationRun: Required<GenerationRunStore>['discardGenerationRun'];

    constructor(dependencies: ConversationPersistenceDependencies) {
        this.persistence = {
            dependencies,
            now: dependencies.now ?? (() => new Date()),
        };

        const generation = createGenerationRunStore(this.persistence);
        this.assertGenerationProposal = generation.assertGenerationProposal;
        this.linkGenerationProposal = generation.linkGenerationProposal;
        this.generationContext = generation.generationContext;
        this.startGeneration = generation.startGeneration;
        this.checkpointGeneration = generation.checkpointGeneration;
        this.pauseGeneration = generation.pauseGeneration;
        this.proposeGenerationRevision = generation.proposeGenerationRevision;
        this.listGenerationRuns = generation.listGenerationRuns;
        this.getGenerationRun = generation.getGenerationRun;
        this.continueGenerationRun = generation.continueGenerationRun;
        this.reviseGenerationRun = generation.reviseGenerationRun;
        this.applyGenerationRevision = generation.applyGenerationRevision;
        this.resolveGenerationSource = generation.resolveGenerationSource;
        this.discardGenerationRun = generation.discardGenerationRun;
    }

    proposeDictionarySnippet(
        turn: ClaimedConversationTurn,
        input: DictionaryChatSnippetInput,
    ) {
        return conversationProposeDictionarySnippet(
            this.persistence,
            turn,
            input,
        );
    }

    readDictionarySnippet(turn: ClaimedConversationTurn, snippetId: string) {
        return conversationReadDictionarySnippet(
            this.persistence,
            turn,
            snippetId,
        );
    }

    listDictionarySnippets(access: ConversationAccess, conversationId: string) {
        return conversationListDictionarySnippets(
            this.persistence,
            access,
            conversationId,
        );
    }

    applyDictionarySnippet(
        access: ConversationAccess,
        conversationId: string,
        snippetId: string,
        input: ApplyDictionaryChatSnippetRequest,
    ) {
        return conversationApplyDictionarySnippet(
            this.persistence,
            access,
            conversationId,
            snippetId,
            input,
        );
    }

    proposeContent(
        turn: ClaimedConversationTurn,
        input: LearningContentProposalInput,
        signal?: AbortSignal,
        validationIds?: string[],
    ) {
        return conversationProposeContent(
            this.persistence,
            turn,
            input,
            signal,
            validationIds,
        );
    }

    proposeContentBatch(
        turn: ClaimedConversationTurn,
        inputs: LearningContentProposalInput[],
        signal?: AbortSignal,
        validationIds?: string[],
    ) {
        return conversationProposeContentBatch(
            this.persistence,
            turn,
            inputs,
            signal,
            validationIds,
        );
    }

    readContentProposal(turn: ClaimedConversationTurn, proposalId: string) {
        return conversationReadContentProposal(
            this.persistence,
            turn,
            proposalId,
        );
    }

    listContentProposals(access: ConversationAccess, conversationId: string) {
        return conversationListContentProposals(
            this.persistence,
            access,
            conversationId,
        );
    }

    applyContentProposal(
        access: ConversationAccess,
        conversationId: string,
        proposalId: string,
        expectedBranchVersion: number,
        mode?: 'proposal' | 'add-separately',
        insertionPosition?: number,
    ) {
        return conversationApplyContentProposal(
            this.persistence,
            access,
            conversationId,
            proposalId,
            expectedBranchVersion,
            mode,
            insertionPosition,
        );
    }

    async list(access: ConversationAccess, source: ConversationSource) {
        return conversationList(this.persistence, access, source);
    }

    async create(access: ConversationAccess, input: CreateConversationRequest) {
        return conversationCreate(this.persistence, access, input);
    }

    async detail(access: ConversationAccess, id: string) {
        return conversationDetail(this.persistence, access, id);
    }

    async update(
        access: ConversationAccess,
        id: string,
        changes: UpdateConversationRequest,
    ) {
        return conversationUpdate(this.persistence, access, id, changes);
    }

    async delete(access: ConversationAccess, id: string) {
        return conversationDelete(this.persistence, access, id);
    }

    async settings(ownerId: string, preferences?: ChatPreferences) {
        return conversationSettings(this.persistence, ownerId, preferences);
    }

    async submit(
        access: ConversationAccess,
        id: string,
        input: SubmitConversationTurnRequest,
    ) {
        return conversationSubmit(this.persistence, access, id, input);
    }

    async maintainAccounting() {
        return conversationMaintainAccounting(this.persistence);
    }

    async stop(access: ConversationAccess, id: string, turnId: string) {
        return conversationStop(this.persistence, access, id, turnId);
    }

    async context(access: ConversationAccess, id: string, query: string) {
        return conversationContext(this.persistence, access, id, query);
    }

    async textReferences(
        access: ConversationAccess,
        id: string,
        query: string,
    ) {
        return conversationTextReferences(this.persistence, access, id, query);
    }

    async textReference(
        access: ConversationAccess,
        id: string,
        textId: string,
    ) {
        return conversationTextReference(this.persistence, access, id, textId);
    }

    async events(
        access: ConversationAccess,
        id: string,
        after: number,
    ): Promise<ConversationEvent[]> {
        return conversationEvents(this.persistence, access, id, after);
    }

    async updateDraft(
        access: ConversationAccess,
        id: string,
        draftId: string,
        version: number,
        content: KnowledgeNoteContent,
    ) {
        return conversationUpdateDraft(
            this.persistence,
            access,
            id,
            draftId,
            version,
            content,
        );
    }

    async discardDraft(
        access: ConversationAccess,
        id: string,
        draftId: string,
    ) {
        return conversationDiscardDraft(this.persistence, access, id, draftId);
    }

    async publishDraft(
        access: ConversationAccess,
        id: string,
        draftId: string,
        input: PublishKnowledgeDraftRequest,
    ) {
        return conversationPublishDraft(
            this.persistence,
            access,
            id,
            draftId,
            input,
        );
    }

    async withOperation<T>(
        operation: ClaimedConversationTurn,
        run: (tx: ConversationsTransaction, row: TurnRow) => Promise<T>,
        allowCancelled = false,
    ) {
        return conversationWithOperation<T>(
            this.persistence,
            operation,
            run,
            allowCancelled,
        );
    }

    async claim() {
        return conversationClaim(this.persistence);
    }

    /** Development adapters can target an admitted turn without adopting another queued operation. */
    async claimForTurn(turnId: string, ownerId: string) {
        return conversationClaim(this.persistence, { turnId, ownerId });
    }

    async heartbeat(turn: ClaimedConversationTurn) {
        return conversationHeartbeat(this.persistence, turn);
    }

    async append(turn: ClaimedConversationTurn, delta: string) {
        return conversationAppend(this.persistence, turn, delta);
    }

    async recordMaterial(
        turn: ClaimedConversationTurn,
        material: SourceMaterial[],
    ) {
        return conversationRecordMaterial(this.persistence, turn, material);
    }

    async recordResponseMetadata(
        turn: ClaimedConversationTurn,
        metadata: ConversationResponseMetadata,
    ) {
        return conversationRecordResponseMetadata(
            this.persistence,
            turn,
            metadata,
        );
    }

    async recordTool(
        turn: ClaimedConversationTurn,
        input: ConversationToolCall,
    ) {
        return conversationRecordTool(this.persistence, turn, input);
    }

    async propose(
        turn: ClaimedConversationTurn,
        content: KnowledgeNoteContent,
        target?: { noteId: string; version: number },
    ) {
        return conversationPropose(this.persistence, turn, content, target);
    }

    async finish(
        turn: ClaimedConversationTurn,
        status: 'succeeded' | 'failed' | 'cancelled',
        failureCode?: string,
    ) {
        return conversationFinish(this.persistence, turn, status, failureCode);
    }

    memory(turn: ClaimedConversationTurn): TutorMemoryPort {
        return conversationMemory(this.persistence, turn);
    }
}
