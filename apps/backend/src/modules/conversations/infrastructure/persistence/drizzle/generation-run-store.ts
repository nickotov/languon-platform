import type { GenerationRunStore } from '../../../application/ports/generation-run-store';
import type { ConversationPersistenceContext } from './conversation-persistence-context';
import type {
    ClaimedConversationTurn,
    ConversationAccess,
} from '../../../application/ports/conversation-store';
import type { LearningContentProposalInput } from '@languon/contracts';
import type {
    GenerationArtifact,
    GenerationSourceSnapshot,
} from '../../../application/ports/generation-run';
import type {
    GenerationPlan,
    ContinueGenerationRunRequest,
    ReviseGenerationRunRequest,
    ApplyGenerationPlanRevisionRequest,
    ResolveGenerationRunSourceRequest,
    DiscardGenerationRunRequest,
} from '@languon/contracts';
import {
    conversationAssertGenerationProposal,
    conversationLinkGenerationProposal,
    conversationGenerationContext,
    conversationStartGeneration,
    conversationCheckpointGeneration,
    conversationPauseGeneration,
    conversationProposeGenerationRevision,
} from './generation-run-worker';
import {
    conversationListGenerationRuns,
    conversationGetGenerationRun,
    conversationContinueGenerationRun,
    conversationReviseGenerationRun,
} from './generation-run-queries';
import { conversationMutateGeneration } from './generation-run-mutations';

/** Cohesive run API/worker adapter sharing the canonical conversation transaction context. */
export function createGenerationRunStore(
    persistence: ConversationPersistenceContext,
): Required<GenerationRunStore> {
    return {
        assertGenerationProposal(
            turn: ClaimedConversationTurn,
            input: LearningContentProposalInput,
        ) {
            return conversationAssertGenerationProposal(
                persistence,
                turn,
                input,
            );
        },

        linkGenerationProposal(
            turn: ClaimedConversationTurn,
            proposalId: string,
        ) {
            return conversationLinkGenerationProposal(
                persistence,
                turn,
                proposalId,
            );
        },

        generationContext(turn: ClaimedConversationTurn) {
            return conversationGenerationContext(persistence, turn);
        },

        startGeneration(
            turn: ClaimedConversationTurn,
            plan: GenerationPlan,
            sources: GenerationSourceSnapshot[],
            validationIds?: string[],
        ) {
            return conversationStartGeneration(
                persistence,
                turn,
                plan,
                sources,
                validationIds,
            );
        },

        checkpointGeneration(
            turn: ClaimedConversationTurn,
            artifacts: GenerationArtifact[],
            validationId: string,
        ) {
            return conversationCheckpointGeneration(
                persistence,
                turn,
                artifacts,
                validationId,
            );
        },

        pauseGeneration(turn: ClaimedConversationTurn) {
            return conversationPauseGeneration(persistence, turn);
        },

        proposeGenerationRevision(
            turn: ClaimedConversationTurn,
            plan: GenerationPlan,
            validationIds?: string[],
        ) {
            return conversationProposeGenerationRevision(
                persistence,
                turn,
                plan,
                validationIds,
            );
        },

        listGenerationRuns(access: ConversationAccess, conversationId: string) {
            return conversationListGenerationRuns(
                persistence,
                access,
                conversationId,
            );
        },

        getGenerationRun(
            access: ConversationAccess,
            conversationId: string,
            runId: string,
        ) {
            return conversationGetGenerationRun(
                persistence,
                access,
                conversationId,
                runId,
            );
        },

        continueGenerationRun(
            access: ConversationAccess,
            conversationId: string,
            runId: string,
            input: ContinueGenerationRunRequest,
        ) {
            return conversationContinueGenerationRun(
                persistence,
                access,
                conversationId,
                runId,
                input,
            );
        },

        reviseGenerationRun(
            access: ConversationAccess,
            conversationId: string,
            runId: string,
            input: ReviseGenerationRunRequest,
        ) {
            return conversationReviseGenerationRun(
                persistence,
                access,
                conversationId,
                runId,
                input,
            );
        },

        applyGenerationRevision(
            access: ConversationAccess,
            conversationId: string,
            runId: string,
            input: ApplyGenerationPlanRevisionRequest,
        ) {
            return conversationMutateGeneration(
                persistence,
                access,
                conversationId,
                runId,
                { kind: 'apply', input },
            );
        },

        resolveGenerationSource(
            access: ConversationAccess,
            conversationId: string,
            runId: string,
            input: ResolveGenerationRunSourceRequest,
        ) {
            return conversationMutateGeneration(
                persistence,
                access,
                conversationId,
                runId,
                { kind: 'source', input },
            );
        },

        discardGenerationRun(
            access: ConversationAccess,
            conversationId: string,
            runId: string,
            input: DiscardGenerationRunRequest,
        ) {
            return conversationMutateGeneration(
                persistence,
                access,
                conversationId,
                runId,
                { kind: 'discard', input },
            );
        },
    };
}
