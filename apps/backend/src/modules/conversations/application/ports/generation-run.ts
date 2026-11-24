import type {
    FrozenListeningScript,
    ListeningRecordingRequest,
} from '../listening-script';
import type { AudioLearningBlockSchema } from '@languon/contracts';
import type { z } from 'zod';
import type {
    ConversationActionQuote,
    GenerationFailure,
    GenerationPlan,
    KnowledgeBody,
    LearningBlock,
} from '@languon/contracts';

export const maximumAutomaticGenerationStages = 8;
export const generationValidationVersion = 'learning-content-v1';

/** One finite spending authorization, independent of individual worker stages. */
export interface GenerationAutomationAuthorization {
    authorizationId: string;
    revision: number;
    rootActionId: string;
    actionIds: string[];
    maximumCreditsMilli: string;
    maximumProviderCostMicros: number;
    authorizationFingerprint: string;
    expiresAt: string;
    stageCount: number;
    ready: boolean;
    recordingApproval?: { requestId: string; quote: ConversationActionQuote };
    dispatchRetryCount?: number;
    admissionRetry?: { count: number; retryAt: string } | undefined;
}

export interface GenerationAutomaticAdmission {
    recordingConsent?: { rootTurnId: string; remainingCreditsMilli: string };
    permitsListeningRecording?: true;
    expiresAt: string;
    maximumCreditsMilli: string;
    maximumProviderCostMicros: number;
    authorizationFingerprint: string;
}

/** Frozen, server-resolved evidence. References in a plan never grant read authority. */
export interface GenerationSourceSnapshot {
    sourceId: string;
    blocks: LearningBlock[];
    selection?:
        | {
              noteId: string;
              noteVersion: number;
              text: string;
              anchor?:
                  | { from: number; to: number; documentHash: string }
                  | undefined;
          }
        | undefined;
    proposalId?: string | undefined;
    providedText?: { materialId: string; text: string } | undefined;
}

export interface GenerationArtifact {
    id: string;
    revision: number;
    taskId: string;
    batchKey: string;
    taskComplete: boolean;
    body: KnowledgeBody;
    contentHash: string;
    requirementsHash: string;
    sourceHash: string;
    validationVersion: string;
}

export const generationUnitStrategies = [
    'initial',
    'repair',
    'fallback',
] as const;

export interface GenerationAttemptEvent {
    taskId: string;
    unitOrdinal: number;
    validationId: string;
    dependencyFingerprint: string;
    strategy: (typeof generationUnitStrategies)[number];
    schemaVersion: string;
    outcome: 'started' | 'rejected';
    diagnostic?: GenerationFailure | undefined;
}

export interface GenerationUnitAttempt extends Omit<
    GenerationAttemptEvent,
    'outcome'
> {
    outcome:
        | GenerationAttemptEvent['outcome']
        | 'accepted'
        | 'declined'
        | 'undispatched'
        | 'abandoned'
        | 'acknowledged';
    turnId: string;
    sourceHash: string;
    listeningScript?: FrozenListeningScript;
    recordedAt: string;
    concludedAt?: string;
}

export function acknowledgedGenerationAttempts(
    history: readonly GenerationUnitAttempt[],
    turnId: string,
): GenerationUnitAttempt[] {
    return history.map((attempt) =>
        attempt.turnId === turnId && attempt.outcome === 'started'
            ? {
                  ...attempt,
                  outcome: 'acknowledged',
                  diagnostic: { code: 'interrupted', taskId: attempt.taskId },
              }
            : attempt,
    );
}

export interface GenerationExecutionContext {
    awaitingRecordingAuthorization?: true;
    unitAttempts?: GenerationUnitAttempt[];
    runId: string;
    revision: number;
    plan: GenerationPlan;
    sources: GenerationSourceSnapshot[];
    artifacts: GenerationArtifact[];
    purpose: 'generation' | 'revision';
}

export interface GenerationRunCallbacks {
    materializeListeningRecording?(
        input: ListeningRecordingRequest,
    ): Promise<z.infer<typeof AudioLearningBlockSchema>>;
    generation?: GenerationExecutionContext;
    onGenerationStart?(
        plan: GenerationPlan,
        sources: GenerationSourceSnapshot[],
        validationIds?: string[],
    ): Promise<GenerationExecutionContext>;
    onGenerationCheckpoint?(
        artifacts: GenerationArtifact[],
        validationId: string,
    ): Promise<void>;
    onGenerationAttempt?(event: GenerationAttemptEvent): Promise<void>;
    onGenerationPause?(reason: 'budget'): Promise<void>;
    onGenerationRevision?(
        plan: GenerationPlan,
        validationIds?: string[],
    ): Promise<{ id: string }>;
}

/** Only the HTTP application creates this input after validating a run action. */
export interface GenerationAdmission {
    runId: string;
    expectedRevision: number;
    kind: 'generation' | 'revision';
    recordingAdmission?: true;
    acknowledgedUncertainTurnId?: string;
    sourceChoice?: 'keep-snapshot' | 'refresh';
    automatic?: {
        authorizationId: string;
        stageCount: number;
        retryCount: number;
    };
}
