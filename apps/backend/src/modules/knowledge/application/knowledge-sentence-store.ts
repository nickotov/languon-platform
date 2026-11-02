import type {
    SentenceDirection,
    SentenceExercise,
    SentenceAttempt,
    SentenceFeedback,
} from '@languon/contracts';
import type {
    SentenceEntry,
    SentenceGeneratedContent,
    SentenceCheckInput,
} from '../../learning/domain/sentence-types';
export interface KnowledgeSentenceIdentity {
    actorId: string;
    noteId: string;
    blockId: string;
}
export interface KnowledgeSentenceSnapshot {
    exercise: SentenceExercise;
    referenceTranslation: string;
    entries: SentenceEntry[];
}
/** Transaction-bound adapter: the caller owns live source authority and atomic job settlement. */
export interface KnowledgeSentenceTransaction {
    loadExercise(
        source: KnowledgeSentenceIdentity,
        exerciseId: string,
    ): Promise<KnowledgeSentenceSnapshot>;
    publishGenerated(
        input: KnowledgeSentenceIdentity & {
            jobId: string;
            direction: SentenceDirection;
            sourceLanguage: SentenceExercise['sourceLanguage'];
            targetLanguage: SentenceExercise['targetLanguage'];
            generationPolicyVersion: 1 | 2;
            content: SentenceGeneratedContent;
            provenance: readonly SentenceEntry[];
            createdAt: Date;
        },
    ): Promise<SentenceExercise>;
    publishChecked(
        input: KnowledgeSentenceIdentity & {
            jobId: string;
            exerciseId: string;
            sessionId: string;
            request: SentenceCheckInput;
            feedback: SentenceFeedback;
            referenceRevealed: boolean;
            createdAt: Date;
        },
    ): Promise<SentenceAttempt>;
}
