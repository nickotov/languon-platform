import {
    KnowledgeNoteIdParamsSchema,
    WorkbookIdParamsSchema,
    RecordWorkbookLearningEventRequestSchema,
    SetWorkbookNoteCompletionRequestSchema,
    SubmitWorkbookAttemptRequestSchema,
    WorkbookLearningShareAccessSchema,
} from '@languon/contracts';
import type { RateLimiter } from '../../authentication/application/ports/rate-limiter';
import { KnowledgeDomainError } from '../domain/knowledge';
import type { KnowledgeRequestContext } from './knowledge-service';
import type { LearnerStore } from './learner-store';

export class LearnerService {
    constructor(
        private readonly dependencies: {
            store: LearnerStore;
            authenticate(token: string): Promise<{ userId: string }>;
            rateLimiter: RateLimiter;
        },
    ) {}
    private async actor(token: string, context: KnowledgeRequestContext) {
        context.signal.throwIfAborted();
        const ip = await this.dependencies.rateLimiter.consume({
            scope: 'workbook-learning-http',
            subject: context.clientAddress,
            limit: 180,
            windowMs: 60_000,
            signal: context.signal,
        });
        if (!ip.allowed)
            throw new KnowledgeDomainError(
                'rate_limited',
                'Too many requests. Please try again shortly.',
            );
        const principal = await this.dependencies.authenticate(token);
        const user = await this.dependencies.rateLimiter.consume({
            scope: 'workbook-learning-actor',
            subject: principal.userId,
            limit: 180,
            windowMs: 60_000,
            signal: context.signal,
        });
        if (!user.allowed)
            throw new KnowledgeDomainError(
                'rate_limited',
                'Too many requests. Please try again shortly.',
            );
        context.signal.throwIfAborted();
        return principal.userId;
    }
    private id(noteId: string) {
        return KnowledgeNoteIdParamsSchema.parse({ noteId }).noteId;
    }
    private access(access: unknown) {
        return access === undefined
            ? undefined
            : WorkbookLearningShareAccessSchema.parse(access);
    }
    async workbookProgress(
        token: string,
        context: KnowledgeRequestContext,
        workbookId: string,
        access?: unknown,
    ) {
        return this.dependencies.store.workbookProgress(
            await this.actor(token, context),
            WorkbookIdParamsSchema.parse({ workbookId }).workbookId,
            this.access(access),
        );
    }
    async read(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
        access?: unknown,
    ) {
        return this.dependencies.store.read(
            await this.actor(token, context),
            this.id(noteId),
            this.access(access),
        );
    }
    async attempt(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
        input: unknown,
        access?: unknown,
    ) {
        return this.dependencies.store.attempt(
            await this.actor(token, context),
            this.id(noteId),
            SubmitWorkbookAttemptRequestSchema.parse(input),
            this.access(access),
        );
    }
    async event(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
        input: unknown,
        access?: unknown,
    ) {
        return this.dependencies.store.event(
            await this.actor(token, context),
            this.id(noteId),
            RecordWorkbookLearningEventRequestSchema.parse(input),
            this.access(access),
        );
    }
    async complete(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
        input: unknown,
        access?: unknown,
    ) {
        return this.dependencies.store.complete(
            await this.actor(token, context),
            this.id(noteId),
            SetWorkbookNoteCompletionRequestSchema.parse(input),
            this.access(access),
        );
    }
}
