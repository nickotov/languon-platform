import type {
    FrozenListeningScript,
    ListeningRecordingRequest,
} from '../listening-script';
import type { StopGenerationRunRequest } from '@languon/contracts';
import type {
    LearningContentProposalInput,
    ApplyGenerationPlanRevisionRequest,
    ContinueGenerationRunRequest,
    ConversationTurn,
    DiscardGenerationRunRequest,
    GenerationPlan,
    GenerationRunDetail,
    GenerationRunPreview,
    GenerationRunSummary,
    ResolveGenerationRunSourceRequest,
    ReviseGenerationRunRequest,
} from '@languon/contracts';
import type {
    ClaimedConversationTurn,
    ConversationAccess,
} from './conversation-store';
import type {
    GenerationAttemptEvent,
    GenerationArtifact,
    GenerationExecutionContext,
    GenerationSourceSnapshot,
} from './generation-run';

export interface GenerationRunStore {
    freezeListeningScript?(
        turn: ClaimedConversationTurn,
        request: ListeningRecordingRequest,
    ): Promise<FrozenListeningScript>;
    stopGenerationRun?(
        access: ConversationAccess,
        conversationId: string,
        runId: string,
        input: StopGenerationRunRequest,
    ): Promise<GenerationRunDetail>;
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
    recordGenerationAttempt?(
        turn: ClaimedConversationTurn,
        event: GenerationAttemptEvent,
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
    getGenerationRunPreview?(
        access: ConversationAccess,
        conversationId: string,
        runId: string,
    ): Promise<GenerationRunPreview>;
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
