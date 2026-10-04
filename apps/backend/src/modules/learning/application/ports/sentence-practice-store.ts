import type {
    SentencePrepareRequest,
    SentencePrepareResponse,
    SentenceNextRequest,
    SentenceNextResponse,
    SentenceJob,
    SentenceCheckRequest,
    SentenceAttemptsQuery,
    SentenceAttemptsResponse,
    SentenceProgressQuery,
    SentenceProgressResponse,
    SentenceReferenceRevealRequest,
    SentenceReferenceRevealResponse,
    SentenceManualReviewsQuery,
    SentenceManualReviewsResponse,
} from '@languon/contracts';
import type { LearningAccess } from './learning-store';
export interface SentenceContext {
    now: Date;
    signal: AbortSignal;
}
export interface SentencePracticeStore {
    prepare(
        access: LearningAccess,
        input: SentencePrepareRequest,
        context: SentenceContext,
    ): Promise<SentencePrepareResponse>;
    next(
        access: LearningAccess,
        input: SentenceNextRequest,
        context: SentenceContext,
    ): Promise<SentenceNextResponse>;
    getJob(
        access: LearningAccess,
        jobId: string,
        context: SentenceContext,
    ): Promise<SentenceJob>;
    cancelJob(
        access: LearningAccess,
        jobId: string,
        context: SentenceContext,
    ): Promise<SentenceJob>;
    enqueueCheck(
        access: LearningAccess,
        exerciseId: string,
        input: SentenceCheckRequest,
        context: SentenceContext,
    ): Promise<SentenceJob>;
    attempts(
        access: LearningAccess,
        query: SentenceAttemptsQuery,
        context: SentenceContext,
    ): Promise<SentenceAttemptsResponse>;
    revealReference(
        access: LearningAccess,
        exerciseId: string,
        input: SentenceReferenceRevealRequest,
        context: SentenceContext,
    ): Promise<SentenceReferenceRevealResponse>;
    manualReviews(
        access: LearningAccess,
        query: SentenceManualReviewsQuery,
        context: SentenceContext,
    ): Promise<SentenceManualReviewsResponse>;
    progress(
        access: LearningAccess,
        query: SentenceProgressQuery,
        context: SentenceContext,
    ): Promise<SentenceProgressResponse>;
}
