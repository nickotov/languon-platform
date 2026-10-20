import {
    CreateKnowledgeNoteRequestSchema,
    DeleteKnowledgeNoteRequestSchema,
    KnowledgeNoteIdParamsSchema,
    ListKnowledgeQuerySchema,
    RestoreKnowledgeNoteRequestSchema,
    UpdateKnowledgeNoteRequestSchema,
    CreateKnowledgeWorkspaceDraftRequestSchema,
    UpdateKnowledgeWorkingRequestSchema,
    SaveKnowledgeWorkspaceRequestSchema,
    SaveKnowledgeCopyRequestSchema,
    CopySharedKnowledgeRequestSchema,
    ResolveKnowledgeWorkingRequestSchema,
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
    async listWorkspaces(
        token: string,
        context: KnowledgeRequestContext,
        query: ListKnowledgeQuery,
    ) {
        return this.dependencies.store.listWorkspaces(
            await this.owner(token, context),
            ListKnowledgeQuerySchema.parse(query),
        );
    }
    async getWorkspace(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
    ) {
        return this.dependencies.store.getWorkspace(
            await this.owner(token, context),
            this.noteId(noteId),
        );
    }
    async createDraft(
        token: string,
        context: KnowledgeRequestContext,
        input: unknown,
    ) {
        return this.dependencies.store.createDraft(
            await this.owner(token, context),
            CreateKnowledgeWorkspaceDraftRequestSchema.parse(input),
        );
    }
    async updateWorking(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
        input: unknown,
    ) {
        return this.dependencies.store.updateWorking(
            await this.owner(token, context),
            this.noteId(noteId),
            UpdateKnowledgeWorkingRequestSchema.parse(input),
        );
    }
    async resolveWorking(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
        input: unknown,
    ) {
        return this.dependencies.store.resolveWorking(
            await this.owner(token, context),
            this.noteId(noteId),
            ResolveKnowledgeWorkingRequestSchema.parse(input),
        );
    }
    async saveWorkspace(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
        input: unknown,
    ) {
        return this.dependencies.store.saveWorkspace(
            await this.owner(token, context),
            this.noteId(noteId),
            SaveKnowledgeWorkspaceRequestSchema.parse(input),
        );
    }
    async saveWorkspaceCopy(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
        input: unknown,
    ) {
        return this.dependencies.store.saveWorkspaceCopy(
            await this.owner(token, context),
            this.noteId(noteId),
            SaveKnowledgeCopyRequestSchema.parse(input),
        );
    }
    async getShare(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
    ) {
        return this.dependencies.store.getShare(
            await this.owner(token, context),
            this.noteId(noteId),
        );
    }
    async issueShare(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
    ) {
        return this.dependencies.store.issueShare(
            await this.owner(token, context),
            this.noteId(noteId),
        );
    }
    async revokeShare(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
    ) {
        return this.dependencies.store.revokeShare(
            await this.owner(token, context),
            this.noteId(noteId),
        );
    }
    async readShared(
        context: KnowledgeRequestContext,
        locator: string,
        key: string,
    ) {
        context.signal.throwIfAborted();
        const rate = await this.dependencies.rateLimiter.consume({
            scope: 'knowledge-shared',
            subject: context.clientAddress,
            limit: 60,
            windowMs: 60_000,
            signal: context.signal,
        });
        if (!rate.allowed)
            throw new KnowledgeDomainError(
                'rate_limited',
                'Too many requests. Please try again shortly.',
            );
        return this.dependencies.store.readShared(locator, key);
    }
    async copyShared(
        token: string,
        context: KnowledgeRequestContext,
        locator: string,
        key: string,
        input: unknown,
    ) {
        return this.dependencies.store.copyShared(
            await this.owner(token, context),
            locator,
            key,
            CopySharedKnowledgeRequestSchema.parse(input),
        );
    }
}
