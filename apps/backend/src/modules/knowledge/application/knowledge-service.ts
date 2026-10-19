import {
    CreateKnowledgeNoteRequestSchema,
    DeleteKnowledgeNoteRequestSchema,
    KnowledgeNoteIdParamsSchema,
    ListKnowledgeQuerySchema,
    RestoreKnowledgeNoteRequestSchema,
    UpdateKnowledgeNoteRequestSchema,
    type CreateKnowledgeNoteRequest,
    type DeleteKnowledgeNoteRequest,
    type ListKnowledgeQuery,
    type RestoreKnowledgeNoteRequest,
    type UpdateKnowledgeNoteRequest,
} from '@languon/contracts';
import type { RateLimiter } from '../../authentication/application/ports/rate-limiter';
import { KnowledgeDomainError } from '../domain/knowledge';
import type { KnowledgeStore } from './knowledge-store';
export interface KnowledgeRequestContext {
    signal: AbortSignal;
    clientAddress: string;
}
export interface KnowledgeDependencies {
    store: KnowledgeStore;
    authenticate: (token: string) => Promise<{ userId: string }>;
    rateLimiter: RateLimiter;
}
export class KnowledgeService {
    constructor(private readonly dependencies: KnowledgeDependencies) {}
    private async owner(
        token: string,
        context: KnowledgeRequestContext,
    ): Promise<string> {
        context.signal.throwIfAborted();
        {
            const result = await this.dependencies.rateLimiter.consume({
                scope: 'knowledge-http',
                subject: context.clientAddress,
                limit: 180,
                windowMs: 60_000,
                signal: context.signal,
            });
            if (!result.allowed)
                throw new KnowledgeDomainError(
                    'rate_limited',
                    'Too many requests. Please try again shortly.',
                );
        }
        const principal = await this.dependencies.authenticate(token);
        const result = await this.dependencies.rateLimiter.consume({
            scope: 'knowledge-owner',
            subject: principal.userId,
            limit: 180,
            windowMs: 60_000,
            signal: context.signal,
        });
        if (!result.allowed)
            throw new KnowledgeDomainError(
                'rate_limited',
                'Too many requests. Please try again shortly.',
            );
        return principal.userId;
    }
    async list(
        token: string,
        context: KnowledgeRequestContext,
        query: ListKnowledgeQuery,
    ) {
        return this.dependencies.store.list(
            await this.owner(token, context),
            ListKnowledgeQuerySchema.parse(query),
        );
    }
    async get(token: string, context: KnowledgeRequestContext, noteId: string) {
        return this.dependencies.store.get(
            await this.owner(token, context),
            this.noteId(noteId),
        );
    }
    async create(
        token: string,
        context: KnowledgeRequestContext,
        input: CreateKnowledgeNoteRequest,
    ) {
        return this.dependencies.store.create(
            await this.owner(token, context),
            CreateKnowledgeNoteRequestSchema.parse(input),
        );
    }
    async update(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
        input: UpdateKnowledgeNoteRequest,
    ) {
        return this.dependencies.store.update(
            await this.owner(token, context),
            this.noteId(noteId),
            UpdateKnowledgeNoteRequestSchema.parse(input),
        );
    }
    async delete(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
        input: DeleteKnowledgeNoteRequest,
    ) {
        return this.dependencies.store.delete(
            await this.owner(token, context),
            this.noteId(noteId),
            DeleteKnowledgeNoteRequestSchema.parse(input),
        );
    }
    async revisions(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
    ) {
        return this.dependencies.store.revisions(
            await this.owner(token, context),
            this.noteId(noteId),
        );
    }
    async restore(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
        input: RestoreKnowledgeNoteRequest,
    ) {
        return this.dependencies.store.restore(
            await this.owner(token, context),
            this.noteId(noteId),
            RestoreKnowledgeNoteRequestSchema.parse(input),
        );
    }
    private noteId(noteId: string) {
        return KnowledgeNoteIdParamsSchema.parse({ noteId }).noteId;
    }
}
