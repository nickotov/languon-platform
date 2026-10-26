import type { SentenceFeedback, SentenceJobFailure } from '@languon/contracts';
import type { SentenceTokenUsage } from '../../../application/ports/sentence-ai-provider';
import type { SentenceContext } from '../../../application/ports/sentence-practice-store';
import type {
    ClaimedSentenceJob,
    SentenceLease,
    SentenceWorkerStore,
    SentenceWriteResult,
} from '../../../application/ports/sentence-worker-store';
import type { SentenceGeneratedContent } from '../../../domain/sentence-types';
import { type SentenceDatabase } from './sentence-persistence-support';
import { sentenceWorkerClaimNext } from './sentence-worker-claim';
import {
    sentenceWorkerCompleteCheck,
    sentenceWorkerCompleteGeneration,
} from './sentence-worker-completion';
import { type SentenceWorkerPersistenceContext } from './sentence-worker-context';
import {
    sentenceWorkerFail,
    sentenceWorkerHeartbeat,
    sentenceWorkerMarkDispatched,
    sentenceWorkerReleaseWorkerLeases,
} from './sentence-worker-lifecycle';

export class DrizzleSentenceWorkerStore implements SentenceWorkerStore {
    private readonly persistence: SentenceWorkerPersistenceContext;

    constructor(database: SentenceDatabase) {
        this.persistence = { database };
    }

    async claimNext(
        input: Parameters<SentenceWorkerStore['claimNext']>[0],
        context: SentenceContext,
    ): Promise<ClaimedSentenceJob | null> {
        return sentenceWorkerClaimNext(this.persistence, input, context);
    }

    async heartbeat(
        lease: SentenceLease,
        leaseMs: number,
        context: SentenceContext,
    ) {
        return sentenceWorkerHeartbeat(
            this.persistence,
            lease,
            leaseMs,
            context,
        );
    }

    async markDispatched(
        lease: SentenceLease,
        context: SentenceContext,
    ): Promise<'dispatch' | 'terminalized' | 'lost'> {
        return sentenceWorkerMarkDispatched(this.persistence, lease, context);
    }

    async completeGeneration(
        lease: SentenceLease,
        result: {
            content: SentenceGeneratedContent;
            usage?: SentenceTokenUsage;
        },
        context: SentenceContext,
    ) {
        return sentenceWorkerCompleteGeneration(
            this.persistence,
            lease,
            result,
            context,
        );
    }

    async completeCheck(
        lease: SentenceLease,
        result: { feedback: SentenceFeedback; usage?: SentenceTokenUsage },
        context: SentenceContext,
    ) {
        return sentenceWorkerCompleteCheck(
            this.persistence,
            lease,
            result,
            context,
        );
    }

    async fail(
        lease: SentenceLease,
        failure: {
            code: SentenceJobFailure;
            retryAt: Date | null;
            retryDisposition?: 'conclusive-provider-failure';
            usage?: SentenceTokenUsage;
        },
        context: SentenceContext,
    ): Promise<SentenceWriteResult> {
        return sentenceWorkerFail(this.persistence, lease, failure, context);
    }

    async releaseWorkerLeases(workerId: string, context: SentenceContext) {
        return sentenceWorkerReleaseWorkerLeases(
            this.persistence,
            workerId,
            context,
        );
    }
}
