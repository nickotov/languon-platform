import type {
    GenerationPlan,
    KnowledgeBody,
    LearningBlock,
} from '@languon/contracts';

export const generationValidationVersion = 'learning-content-v1';

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

export interface GenerationExecutionContext {
    runId: string;
    revision: number;
    plan: GenerationPlan;
    sources: GenerationSourceSnapshot[];
    artifacts: GenerationArtifact[];
    purpose: 'generation' | 'revision';
}

export interface GenerationRunCallbacks {
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
    sourceChoice?: 'keep-snapshot' | 'refresh';
}
