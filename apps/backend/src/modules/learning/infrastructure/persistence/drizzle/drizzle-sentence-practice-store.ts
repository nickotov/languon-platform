import type {
    SentenceAttemptsQuery,
    SentenceCheckRequest,
    SentenceManualReviewsQuery,
    SentenceNextRequest,
    SentencePrepareRequest,
    SentenceProgressQuery,
    SentenceReferenceRevealRequest,
} from '@languon/contracts';
import type { LearningAccess } from '../../../application/ports/learning-store';
import type {
    SentenceContext,
    SentencePracticeStore,
} from '../../../application/ports/sentence-practice-store';
import {
    type SentenceDatabase,
    type SentenceTransaction,
} from './sentence-persistence-support';
import { sentencePracticePrepare } from './sentence-practice-admission';
import type { SentencePersistencePolicy } from './sentence-practice-context';
import { type SentencePracticePersistenceContext } from './sentence-practice-context';
import {
    sentencePracticeAttempts,
    sentencePracticeManualReviews,
    sentencePracticeProgress,
    sentencePracticeRevealReference,
} from './sentence-practice-history';
import {
    sentencePracticeCancelJob,
    sentencePracticeEnqueueCheck,
    sentencePracticeGetJob,
} from './sentence-practice-jobs';
import { sentencePracticeNext } from './sentence-practice-next';
import {
    sentencePracticeAdmitPreparationGeneration,
    sentencePracticePreparePreparationAction,
} from './sentence-preparation-admission';

export { type SentencePersistencePolicy } from './sentence-practice-context';

export class DrizzleSentencePracticeStore implements SentencePracticeStore {
    private readonly persistence: SentencePracticePersistenceContext;

    constructor(database: SentenceDatabase, policy: SentencePersistencePolicy) {
        this.persistence = { database, policy };
    }

    public async preparePreparationAction(
        tx: SentenceTransaction,
        access: LearningAccess,
        input: {
            actionId: string;
            operationId: string;
            fingerprint: string;
            inputPayload: unknown;
        },
        context: SentenceContext,
    ) {
        return sentencePracticePreparePreparationAction(
            this.persistence,
            tx,
            access,
            input,
            context,
        );
    }

    public async admitPreparationGeneration(
        tx: SentenceTransaction,
        _access: LearningAccess,
        input: {
            preparationId: string;
            batchId: string;
            coordinatorFence: bigint;
        },
        context: SentenceContext,
    ) {
        return sentencePracticeAdmitPreparationGeneration(
            this.persistence,
            tx,
            _access,
            input,
            context,
        );
    }

    async prepare(
        access: LearningAccess,
        input: SentencePrepareRequest,
        context: SentenceContext,
    ) {
        return sentencePracticePrepare(
            this.persistence,
            access,
            input,
            context,
        );
    }

    async next(
        access: LearningAccess,
        input: SentenceNextRequest,
        context: SentenceContext,
    ) {
        return sentencePracticeNext(this.persistence, access, input, context);
    }

    async getJob(
        access: LearningAccess,
        jobId: string,
        context: SentenceContext,
    ) {
        return sentencePracticeGetJob(this.persistence, access, jobId, context);
    }

    async cancelJob(
        access: LearningAccess,
        jobId: string,
        context: SentenceContext,
    ) {
        return sentencePracticeCancelJob(
            this.persistence,
            access,
            jobId,
            context,
        );
    }

    async enqueueCheck(
        access: LearningAccess,
        exerciseId: string,
        input: SentenceCheckRequest,
        context: SentenceContext,
    ) {
        return sentencePracticeEnqueueCheck(
            this.persistence,
            access,
            exerciseId,
            input,
            context,
        );
    }

    async attempts(
        access: LearningAccess,
        query: SentenceAttemptsQuery,
        context: SentenceContext,
    ) {
        return sentencePracticeAttempts(
            this.persistence,
            access,
            query,
            context,
        );
    }

    async revealReference(
        access: LearningAccess,
        exerciseId: string,
        input: SentenceReferenceRevealRequest,
        context: SentenceContext,
    ) {
        return sentencePracticeRevealReference(
            this.persistence,
            access,
            exerciseId,
            input,
            context,
        );
    }

    async manualReviews(
        access: LearningAccess,
        query: SentenceManualReviewsQuery,
        context: SentenceContext,
    ) {
        return sentencePracticeManualReviews(
            this.persistence,
            access,
            query,
            context,
        );
    }

    async progress(
        access: LearningAccess,
        query: SentenceProgressQuery,
        context: SentenceContext,
    ) {
        return sentencePracticeProgress(
            this.persistence,
            access,
            query,
            context,
        );
    }
}
