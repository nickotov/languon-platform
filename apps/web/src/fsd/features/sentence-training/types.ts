import type { ActionConsent } from '@/fsd/entities/ai-action';
import type { ReactNode } from 'react';
import type {
    SentencePreparation,
    SentencePreparationBatch,
    SentencePreparationStartRequest,
    SentencePreparationResponse,
    SentencePreparationCommandRequest,
    SentencePreparationBatchesQuery,
    SentencePreparationBatchesResponse,
    LearningEntriesQuery,
    LearningEntriesResponse,
    SentenceCapabilitiesResponse,
    SentencePrepareRequest,
    SentencePrepareResponse,
    SentenceNextRequest,
    SentenceNextResponse,
    SentenceJob,
    SentenceCheckRequest,
    SentenceAttempt,
    SentenceAttemptsQuery,
    SentenceAttemptsResponse,
    SentenceReferenceRevealRequest,
    SentenceReferenceRevealResponse,
    SentenceManualReviewsQuery,
    SentenceManualReviewsResponse,
    SentenceProgressResponse,
    SentenceDirection,
    SentenceExercise,
    SentenceManualReview,
    SentenceMode,
} from '@languon/contracts';
import type { ApiError } from './lib/api-error';

export type TrainingTarget =
    | { kind: 'owner'; dictionaryId: string }
    | { kind: 'shared'; shareId: string; shareKey: string };
export type { RequestWithSession } from '@/fsd/entities/dictionary';
export type Configuration = Omit<SentencePrepareRequest, 'replayExerciseIds'>;
export type EntryPreview = LearningEntriesResponse['entries'][number];
export type PresentationMode = 'dialog' | 'fullscreen';
export interface SentencePreparationApi {
    startPreparation(
        input: SentencePreparationStartRequest,
    ): Promise<SentencePreparationResponse>;
    getPreparation(id: string): Promise<SentencePreparationResponse>;
    preparedBatch(id: string): Promise<SentencePreparationBatch>;
    commandPreparation(
        id: string,
        input: SentencePreparationCommandRequest,
    ): Promise<SentencePreparationResponse>;
    preparationBatches(
        id: string,
        query: Partial<SentencePreparationBatchesQuery>,
    ): Promise<SentencePreparationBatchesResponse>;
}
export interface SentencePreparationController {
    continueWithBudget?(): Promise<void>;
    actionConsent?: ActionConsent;
    preparation: SentencePreparation | null;
    batches: SentencePreparationBatch[];
    busy: boolean;
    error: ApiError | null;
    uncertain: boolean;
    nextOffset: number | null;
    eligibleCount: number | null;
    explanationLanguage: Configuration['explanationLanguage'];
    loadEligibleCount(): Promise<void>;
    start(configuration: Configuration): Promise<void>;
    refresh(): Promise<void>;
    stop(): Promise<void>;
    resume(): Promise<void>;
    loadMore(): Promise<void>;
    clear(): void;
}
export interface SentenceApi extends Partial<SentencePreparationApi> {
    capabilities(): Promise<SentenceCapabilitiesResponse>;
    listEntries(
        input: Partial<LearningEntriesQuery>,
    ): Promise<LearningEntriesResponse>;
    prepare(input: SentencePrepareRequest): Promise<SentencePrepareResponse>;
    next(input: SentenceNextRequest): Promise<SentenceNextResponse>;
    getJob(jobId: string): Promise<SentenceJob>;
    cancelJob(jobId: string): Promise<SentenceJob>;
    check(
        exerciseId: string,
        input: SentenceCheckRequest,
    ): Promise<SentenceJob>;
    revealReference(
        exerciseId: string,
        input: SentenceReferenceRevealRequest,
    ): Promise<SentenceReferenceRevealResponse>;
    attempts(
        input: Partial<SentenceAttemptsQuery>,
    ): Promise<SentenceAttemptsResponse>;
    manualReviews(
        input: Partial<SentenceManualReviewsQuery>,
    ): Promise<SentenceManualReviewsResponse>;
    progress(direction: SentenceDirection): Promise<SentenceProgressResponse>;
}
export type SessionPhase =
    'idle' | 'loading' | 'exercise' | 'empty' | 'error' | 'completed';
export type ReferenceDifference =
    'unicode' | 'apostrophes' | 'case' | 'punctuation' | 'spaces';
export interface ReferenceComparison {
    kind: 'match' | 'different' | 'reference-only';
    answer: string;
    reference: string;
    normalizedAnswer: string;
    normalizedReference: string;
    ignored: ReferenceDifference[];
}
export interface SentenceRoundItem {
    exercise: SentenceExercise;
    answer: string;
    attempt: SentenceAttempt | null;
    reference: SentenceManualReview | null;
    comparison: ReferenceComparison | null;
    revealedHintIds: string[];
    skipped: boolean;
    outcome: 'pending' | 'ai-checked' | 'manual-reviewed' | 'skipped';
}
export interface SessionCounts {
    presented: number;
    checked: number;
    assisted: number;
    manuallyReviewed: number;
    skipped: number;
    ratings: SentenceProgressResponse['ratings'];
}
export interface SentenceSessionController {
    actionConsent?: ActionConsent;
    phase: SessionPhase;
    configuration: Configuration | null;
    sessionId: string | null;
    exercise: SentenceExercise | null;
    draft: string;
    submittedAnswer: string | null;
    acknowledgedAnswer: string | null;
    revealedHintIds: string[];
    job: SentenceJob | null;
    attempt: SentenceAttempt | null;
    reference: SentenceManualReview | null;
    comparison: ReferenceComparison | null;
    roundItems: SentenceRoundItem[];
    replaying: boolean;
    replayPosition: number | null;
    replayLoading: boolean;
    replayError: ApiError | null;
    referenceLoading: boolean;
    referenceUncertain: boolean;
    error: ApiError | null;
    referenceError: ApiError | null;
    progress: SentenceProgressResponse | null;
    progressLoading: boolean;
    progressError: ApiError | null;
    counts: SessionCounts;
    busy: boolean;
    uncertain: boolean;
    canRetry: boolean;
    emptyReason: 'no-eligible-entries' | 'review-exhausted' | null;
    visitedExerciseIds: string[];
    roundEntryCount: number;
    roundEligibleCount: number | null;
    roundComplete: boolean;
    start(configuration: Configuration): Promise<void>;
    changeMode(mode: SentenceMode): Promise<void>;
    restartReview(): Promise<void>;
    next(): Promise<void>;
    check(): Promise<void>;
    revealReference(): Promise<void>;
    recompare(): Promise<void>;
    skip(): Promise<void>;
    repeatExact(): Promise<void>;
    generateNew(): Promise<void>;
    retry(): Promise<void>;
    cancel(): Promise<void>;
    setDraft(value: string): void;
    toggleHint(hintId: string): void;
    reset(): void;
    retryProgress(): Promise<void>;
}
export interface SentenceSetupController {
    configuration: Configuration;
    setConfiguration(value: Configuration): void;
    entries: EntryPreview[];
    search: string;
    setSearch(value: string): void;
    selectedEntryIds: string[];
    setSelectedEntryIds(value: string[]): void;
    prepared: SentencePrepareResponse | null;
    loading: boolean;
    entriesLoading: boolean;
    error: ApiError | null;
    entriesError: ApiError | null;
    hasMore: boolean;
    loadMore(): Promise<void>;
    refresh(): void;
    invalidate(): void;
}
export interface SentenceHistoryController {
    attempts: SentenceAttempt[];
    reviews: SentenceManualReview[];
    loading: boolean;
    error: ApiError | null;
    hasMoreAttempts: boolean;
    hasMoreReviews: boolean;
    loadMoreAttempts(): Promise<void>;
    loadMoreReviews(): Promise<void>;
    refresh(): void;
    invalidate(): void;
}

export type SentenceAudioTarget = {
    kind: 'prompt' | 'reference' | 'checked-answer';
    id: string;
    sessionId?: string;
};
export type SentenceAudioRenderer = (content: SentenceAudioTarget) => ReactNode;
