import type {
    SentenceNextRequest,
    SentenceCheckRequest,
    SentenceJob,
} from '@languon/contracts';
import type { SentenceCandidate } from '../../learning/domain/sentence-types';
import type { SentenceContext } from '../../learning/application/ports/sentence-practice-store';
import type { VocabularyPracticeActor } from './vocabulary-practice-store';
/** Transaction-bound admission shares the free next receipt and native financial commit. */
export interface KnowledgeSentencePaidAdmission {
    admitGeneration(
        source: VocabularyPracticeActor,
        input: SentenceNextRequest,
        context: SentenceContext,
        candidates: readonly SentenceCandidate[],
    ): Promise<SentenceJob>;
}
export interface KnowledgeSentencePaidOperations {
    enqueueCheck(
        source: VocabularyPracticeActor,
        exerciseId: string,
        input: SentenceCheckRequest,
        context: SentenceContext,
    ): Promise<SentenceJob>;
    getJob(
        source: VocabularyPracticeActor,
        jobId: string,
        context: SentenceContext,
    ): Promise<SentenceJob>;
    cancelJob(
        source: VocabularyPracticeActor,
        jobId: string,
        context: SentenceContext,
    ): Promise<SentenceJob>;
}
