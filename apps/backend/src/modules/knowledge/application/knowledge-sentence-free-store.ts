import type {
    SentencePrepareRequest,
    SentencePrepareResponse,
    SentenceNextRequest,
    SentenceNextResponse,
    SentenceReferenceRevealRequest,
    SentenceReferenceRevealResponse,
    SentenceAttemptsQuery,
    SentenceAttemptsResponse,
    SentenceManualReviewsQuery,
    SentenceManualReviewsResponse,
    SentenceProgressQuery,
    SentenceProgressResponse,
} from '@languon/contracts';
import type { SentenceContext } from '../../learning/application/ports/sentence-practice-store';
import type { VocabularyPracticeActor } from './vocabulary-practice-store';
export interface KnowledgeSentenceFreeStore {
    authorize(source: VocabularyPracticeActor): Promise<void>;
    prepare(
        source: VocabularyPracticeActor,
        input: SentencePrepareRequest,
        context: SentenceContext,
    ): Promise<SentencePrepareResponse>;
    next(
        source: VocabularyPracticeActor,
        input: SentenceNextRequest,
        context: SentenceContext,
    ): Promise<SentenceNextResponse>;
    revealReference(
        source: VocabularyPracticeActor,
        exerciseId: string,
        input: SentenceReferenceRevealRequest,
        context: SentenceContext,
    ): Promise<SentenceReferenceRevealResponse>;
    attempts(
        source: VocabularyPracticeActor,
        query: SentenceAttemptsQuery,
        context: SentenceContext,
    ): Promise<SentenceAttemptsResponse>;
    manualReviews(
        source: VocabularyPracticeActor,
        query: SentenceManualReviewsQuery,
        context: SentenceContext,
    ): Promise<SentenceManualReviewsResponse>;
    progress(
        source: VocabularyPracticeActor,
        query: SentenceProgressQuery,
        context: SentenceContext,
    ): Promise<SentenceProgressResponse>;
}
