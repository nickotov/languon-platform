import { z } from 'zod';
import {
    KnowledgeVocabularyPracticeParamsSchema,
    WorkbookLearningShareAccessSchema,
    SentencePrepareRequestSchema,
    SentenceNextRequestSchema,
    SentenceCheckRequestSchema,
    SentenceReferenceRevealRequestSchema,
    SentenceAttemptsQuerySchema,
    SentenceManualReviewsQuerySchema,
    SentenceProgressQuerySchema,
} from '@languon/contracts';
import type { RateLimiter } from '../../authentication/application/ports/rate-limiter';
import { KnowledgeDomainError } from '../domain/knowledge';
import { LearningUnavailableError } from '../../learning/domain/errors';
import type { VocabularyPracticeRequest } from './vocabulary-practice-service';
import type { KnowledgeSentenceFreeStore } from './knowledge-sentence-free-store';
import type { KnowledgeSentencePaidOperations } from './knowledge-sentence-paid';

export class KnowledgeSentenceService {
    constructor(
        private readonly dependencies: {
            store: KnowledgeSentenceFreeStore;
            paid: KnowledgeSentencePaidOperations;
            authenticate(token: string): Promise<{ userId: string }>;
            rateLimiter: RateLimiter;
            enabled: boolean;
            now?: () => Date;
        },
    ) {}
    private context(request: VocabularyPracticeRequest) {
        return {
            signal: request.context.signal,
            now: this.dependencies.now?.() ?? new Date(),
        };
    }
    private async source(request: VocabularyPracticeRequest) {
        request.context.signal.throwIfAborted();
        if (!this.dependencies.enabled) throw new LearningUnavailableError();
        const rate = await this.dependencies.rateLimiter.consume({
            scope: 'knowledge-sentence-http',
            subject: request.context.clientAddress,
            limit: 180,
            windowMs: 60_000,
            signal: request.context.signal,
        });
        if (!rate.allowed)
            throw new KnowledgeDomainError(
                'rate_limited',
                'Too many requests.',
            );
        const actor = await this.dependencies.authenticate(request.token);
        const actorRate = await this.dependencies.rateLimiter.consume({
            scope: 'knowledge-sentence-actor',
            subject: actor.userId,
            limit: 180,
            windowMs: 60_000,
            signal: request.context.signal,
        });
        if (!actorRate.allowed)
            throw new KnowledgeDomainError(
                'rate_limited',
                'Too many requests.',
            );
        request.context.signal.throwIfAborted();
        return {
            actorId: actor.userId,
            ...KnowledgeVocabularyPracticeParamsSchema.parse({
                noteId: request.noteId,
                blockId: request.blockId,
            }),
            access:
                request.access === undefined
                    ? undefined
                    : WorkbookLearningShareAccessSchema.parse(request.access),
        };
    }
    async capabilities(request: VocabularyPracticeRequest) {
        await this.dependencies.store.authorize(await this.source(request));
        return { sentencesEnabled: true };
    }
    async prepare(request: VocabularyPracticeRequest, input: unknown) {
        return this.dependencies.store.prepare(
            await this.source(request),
            SentencePrepareRequestSchema.parse(input),
            this.context(request),
        );
    }
    async next(request: VocabularyPracticeRequest, input: unknown) {
        return this.dependencies.store.next(
            await this.source(request),
            SentenceNextRequestSchema.parse(input),
            this.context(request),
        );
    }
    async revealReference(
        request: VocabularyPracticeRequest,
        exerciseId: string,
        input: unknown,
    ) {
        return this.dependencies.store.revealReference(
            await this.source(request),
            z.uuid().parse(exerciseId),
            SentenceReferenceRevealRequestSchema.parse(input),
            this.context(request),
        );
    }
    async attempts(request: VocabularyPracticeRequest, input: unknown) {
        return this.dependencies.store.attempts(
            await this.source(request),
            SentenceAttemptsQuerySchema.parse(input),
            this.context(request),
        );
    }
    async manualReviews(request: VocabularyPracticeRequest, input: unknown) {
        return this.dependencies.store.manualReviews(
            await this.source(request),
            SentenceManualReviewsQuerySchema.parse(input),
            this.context(request),
        );
    }
    async progress(request: VocabularyPracticeRequest, input: unknown) {
        return this.dependencies.store.progress(
            await this.source(request),
            SentenceProgressQuerySchema.parse(input),
            this.context(request),
        );
    }
    async enqueueCheck(
        request: VocabularyPracticeRequest,
        exerciseId: string,
        input: unknown,
    ) {
        return this.dependencies.paid.enqueueCheck(
            await this.source(request),
            z.uuid().parse(exerciseId),
            SentenceCheckRequestSchema.parse(input),
            this.context(request),
        );
    }
    async getJob(request: VocabularyPracticeRequest, jobId: string) {
        return this.dependencies.paid.getJob(
            await this.source(request),
            z.uuid().parse(jobId),
            this.context(request),
        );
    }
    async cancelJob(request: VocabularyPracticeRequest, jobId: string) {
        return this.dependencies.paid.cancelJob(
            await this.source(request),
            z.uuid().parse(jobId),
            this.context(request),
        );
    }
}
