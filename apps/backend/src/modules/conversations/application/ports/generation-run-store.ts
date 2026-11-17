import type {
    LearningContentProposalInput,
    ApplyGenerationPlanRevisionRequest,
    ContinueGenerationRunRequest,
    ConversationTurn,
    DiscardGenerationRunRequest,
    GenerationPlan,
    GenerationRunDetail,
    GenerationRunSummary,
    ResolveGenerationRunSourceRequest,
    ReviseGenerationRunRequest,
} from '@languon/contracts';
import type {
    ClaimedConversationTurn,
    ConversationAccess,
} from './conversation-store';
import type {
    GenerationArtifact,
    GenerationExecutionContext,
    GenerationSourceSnapshot,
} from './generation-run';

export interface GenerationRunStore {
    assertGenerationProposal?(
        turn: ClaimedConversationTurn,
        input: LearningContentProposalInput,
    ): Promise<void>;
    linkGenerationProposal?(
        turn: ClaimedConversationTurn,
        proposalId: string,
    ): Promise<void>;
    generationContext?(
        turn: ClaimedConversationTurn,
    ): Promise<GenerationExecutionContext | undefined>;
    startGeneration?(
        turn: ClaimedConversationTurn,
        plan: GenerationPlan,
        sources: GenerationSourceSnapshot[],
        validationIds?: string[],
    ): Promise<GenerationExecutionContext>;
    checkpointGeneration?(
        turn: ClaimedConversationTurn,
        artifacts: GenerationArtifact[],
        validationId: string,
    ): Promise<void>;
    pauseGeneration?(turn: ClaimedConversationTurn): Promise<void>;
    proposeGenerationRevision?(
        turn: ClaimedConversationTurn,
        plan: GenerationPlan,
        validationIds?: string[],
    ): Promise<{ id: string }>;
    listGenerationRuns?(
        access: ConversationAccess,
        conversationId: string,
    ): Promise<{ runs: GenerationRunSummary[] }>;
    getGenerationRun?(
        access: ConversationAccess,
        conversationId: string,
        runId: string,
    ): Promise<GenerationRunDetail>;
    continueGenerationRun?(
        access: ConversationAccess,
        conversationId: string,
        runId: string,
        input: ContinueGenerationRunRequest,
    ): Promise<ConversationTurn>;
    reviseGenerationRun?(
        access: ConversationAccess,
        conversationId: string,
        runId: string,
        input: ReviseGenerationRunRequest,
    ): Promise<ConversationTurn>;
    applyGenerationRevision?(
        access: ConversationAccess,
        conversationId: string,
        runId: string,
        input: ApplyGenerationPlanRevisionRequest,
    ): Promise<GenerationRunDetail>;
    resolveGenerationSource?(
        access: ConversationAccess,
        conversationId: string,
        runId: string,
        input: ResolveGenerationRunSourceRequest,
    ): Promise<GenerationRunDetail>;
    discardGenerationRun?(
        access: ConversationAccess,
        conversationId: string,
        runId: string,
        input: DiscardGenerationRunRequest,
    ): Promise<GenerationRunDetail>;
}
