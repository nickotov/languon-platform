import type {
    ExerciseLearningBlock,
    KnowledgeExerciseEvaluationJob,
    RequestKnowledgeExerciseEvaluation,
    WorkbookAttemptAnswer,
    WorkbookLearningShareAccess,
} from '@languon/contracts';
import type { KnowledgeLearningSourceBinding } from '../learning-source-binding';

/** Server-resolved references and private answer; never accepted from a public caller. */
export interface KnowledgeExerciseEvaluationInput {
    noteId: string;
    noteOwnerId: string;
    attemptId: string;
    noteVersion: number;
    exerciseId: string;
    exerciseRevision: string;
    learningEpoch: number;
    semanticFingerprint: string;
    exercise: ExerciseLearningBlock;
    answer: WorkbookAttemptAnswer;
    sourcePassages: string;
    replyLanguage: NonNullable<
        RequestKnowledgeExerciseEvaluation['replyLanguage']
    >;
    grant: KnowledgeLearningSourceBinding['grant'];
}

export interface KnowledgeExerciseEvaluationStore {
    request(
        actorId: string,
        noteId: string,
        request: RequestKnowledgeExerciseEvaluation,
        context: { now: Date; signal: AbortSignal },
        access?: WorkbookLearningShareAccess,
    ): Promise<KnowledgeExerciseEvaluationJob>;
    get(
        actorId: string,
        noteId: string,
        operationId: string,
        context: { now: Date; signal: AbortSignal },
        access?: WorkbookLearningShareAccess,
    ): Promise<KnowledgeExerciseEvaluationJob>;
    cancel(
        actorId: string,
        noteId: string,
        operationId: string,
        context: { now: Date; signal: AbortSignal },
        access?: WorkbookLearningShareAccess,
    ): Promise<KnowledgeExerciseEvaluationJob>;
}
