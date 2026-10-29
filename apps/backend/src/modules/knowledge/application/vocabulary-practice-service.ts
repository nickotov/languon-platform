import {
    KnowledgeVocabularyPracticeParamsSchema,
    WorkbookLearningShareAccessSchema,
    LearningEntriesQuerySchema,
    FlashcardPreferencesPutRequestSchema,
    FlashcardPrepareRequestSchema,
    FlashcardItemsRequestSchema,
    FlashcardAttemptRequestSchema,
    FlashcardUndoRequestSchema,
    LearningCapabilitiesResponseSchema,
} from '@languon/contracts';
import { z } from 'zod';
import type { RateLimiter } from '../../authentication/application/ports/rate-limiter';
import { KnowledgeDomainError } from '../domain/knowledge';
import { LearningUnavailableError } from '../../learning/domain/errors';
import type { KnowledgeRequestContext } from './knowledge-service';
import type { VocabularyPracticeStore } from './vocabulary-practice-store';
export interface VocabularyPracticeRequest {
    token: string;
    context: KnowledgeRequestContext;
    noteId: string;
    blockId: string;
    access?: unknown;
}
export class VocabularyPracticeService {
    constructor(
        private readonly dependencies: {
            store: VocabularyPracticeStore;
            authenticate(token: string): Promise<{ userId: string }>;
            rateLimiter: RateLimiter;
            enabled: boolean;
        },
    ) {}
    private async source(request: VocabularyPracticeRequest) {
        request.context.signal.throwIfAborted();
        if (!this.dependencies.enabled) throw new LearningUnavailableError();
        const address = await this.dependencies.rateLimiter.consume({
            scope: 'knowledge-vocabulary-http',
            subject: request.context.clientAddress,
            limit: 180,
            windowMs: 60_000,
            signal: request.context.signal,
        });
        if (!address.allowed)
            throw new KnowledgeDomainError(
                'rate_limited',
                'Too many requests.',
            );
        const actor = await this.dependencies.authenticate(request.token);
        const rate = await this.dependencies.rateLimiter.consume({
            scope: 'knowledge-vocabulary-actor',
            subject: actor.userId,
            limit: 180,
            windowMs: 60_000,
            signal: request.context.signal,
        });
        if (!rate.allowed)
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
        await this.dependencies.store.preferences(await this.source(request));
        return LearningCapabilitiesResponseSchema.parse({
            flashcardsEnabled: true,
        });
    }
    async entries(request: VocabularyPracticeRequest, input: unknown) {
        return this.dependencies.store.entries(
            await this.source(request),
            LearningEntriesQuerySchema.parse(input),
        );
    }
    async preferences(request: VocabularyPracticeRequest) {
        return this.dependencies.store.preferences(await this.source(request));
    }
    async savePreferences(request: VocabularyPracticeRequest, input: unknown) {
        return this.dependencies.store.savePreferences(
            await this.source(request),
            FlashcardPreferencesPutRequestSchema.parse(input),
        );
    }
    async prepare(request: VocabularyPracticeRequest, input: unknown) {
        return this.dependencies.store.prepare(
            await this.source(request),
            FlashcardPrepareRequestSchema.parse(input),
        );
    }
    async items(request: VocabularyPracticeRequest, input: unknown) {
        return this.dependencies.store.items(
            await this.source(request),
            FlashcardItemsRequestSchema.parse(input),
        );
    }
    async progress(request: VocabularyPracticeRequest) {
        return this.dependencies.store.progress(await this.source(request));
    }
    async rate(request: VocabularyPracticeRequest, input: unknown) {
        return this.dependencies.store.rate(
            await this.source(request),
            FlashcardAttemptRequestSchema.parse(input),
        );
    }
    async undo(
        request: VocabularyPracticeRequest,
        attemptId: string,
        input: unknown,
    ) {
        return this.dependencies.store.undo(
            await this.source(request),
            z.uuid().parse(attemptId),
            FlashcardUndoRequestSchema.parse(input),
        );
    }
}
