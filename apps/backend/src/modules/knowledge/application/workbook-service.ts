import {
    CopyWorkbookRequestSchema,
    CreateWorkbookRequestSchema,
    SetWorkbookNotesRequestSchema,
    UpdateWorkbookRequestSchema,
    WorkbookIdParamsSchema,
    WorkbookShareKeySchema,
    WorkbookShareLocatorSchema,
    WorkbookVersionSchema,
} from '@languon/contracts';
import type { RateLimiter } from '../../authentication/application/ports/rate-limiter';
import { KnowledgeDomainError } from '../domain/knowledge';
import type { KnowledgeRequestContext } from './knowledge-service';
import type { WorkbookStore } from './workbook-store';

export class WorkbookService {
    constructor(
        private readonly dependencies: {
            store: WorkbookStore;
            authenticate(token: string): Promise<{ userId: string }>;
            rateLimiter: RateLimiter;
        },
    ) {}
    private async rate(
        context: KnowledgeRequestContext,
        scope: string,
        subject: string,
        limit: number,
    ) {
        context.signal.throwIfAborted();
        const result = await this.dependencies.rateLimiter.consume({
            scope,
            subject,
            limit,
            windowMs: 60_000,
            signal: context.signal,
        });
        if (!result.allowed)
            throw new KnowledgeDomainError(
                'rate_limited',
                'Too many requests. Please try again shortly.',
            );
    }
    private async owner(token: string, context: KnowledgeRequestContext) {
        await this.rate(context, 'workbook-http', context.clientAddress, 180);
        const principal = await this.dependencies.authenticate(token);
        await this.rate(context, 'workbook-owner', principal.userId, 180);
        return principal.userId;
    }
    private id(workbookId: string) {
        return WorkbookIdParamsSchema.parse({ workbookId }).workbookId;
    }
    async list(token: string, context: KnowledgeRequestContext) {
        return this.dependencies.store.list(await this.owner(token, context));
    }
    async create(
        token: string,
        context: KnowledgeRequestContext,
        input: unknown,
    ) {
        return this.dependencies.store.create(
            await this.owner(token, context),
            CreateWorkbookRequestSchema.parse(input),
        );
    }
    async get(token: string, context: KnowledgeRequestContext, id: string) {
        return this.dependencies.store.get(
            await this.owner(token, context),
            this.id(id),
        );
    }
    async update(
        token: string,
        context: KnowledgeRequestContext,
        id: string,
        input: unknown,
    ) {
        return this.dependencies.store.update(
            await this.owner(token, context),
            this.id(id),
            UpdateWorkbookRequestSchema.parse(input),
        );
    }
    async setNotes(
        token: string,
        context: KnowledgeRequestContext,
        id: string,
        input: unknown,
    ) {
        return this.dependencies.store.setNotes(
            await this.owner(token, context),
            this.id(id),
            SetWorkbookNotesRequestSchema.parse(input),
        );
    }
    async delete(
        token: string,
        context: KnowledgeRequestContext,
        id: string,
        input: unknown,
    ) {
        return this.dependencies.store.delete(
            await this.owner(token, context),
            this.id(id),
            WorkbookVersionSchema.parse(input).expectedVersion,
        );
    }
    async issueShare(
        token: string,
        context: KnowledgeRequestContext,
        id: string,
        input: unknown,
    ) {
        return this.dependencies.store.issueShare(
            await this.owner(token, context),
            this.id(id),
            WorkbookVersionSchema.parse(input).expectedVersion,
        );
    }
    async revokeShare(
        token: string,
        context: KnowledgeRequestContext,
        id: string,
        input: unknown,
    ) {
        return this.dependencies.store.revokeShare(
            await this.owner(token, context),
            this.id(id),
            WorkbookVersionSchema.parse(input).expectedVersion,
        );
    }
    async readShared(
        context: KnowledgeRequestContext,
        locator: string,
        key: string,
    ) {
        await this.rate(context, 'workbook-shared', context.clientAddress, 60);
        return this.dependencies.store.readShared(
            WorkbookShareLocatorSchema.parse(locator),
            WorkbookShareKeySchema.parse(key),
        );
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
            WorkbookShareLocatorSchema.parse(locator),
            WorkbookShareKeySchema.parse(key),
            CopyWorkbookRequestSchema.parse(input),
        );
    }
    async copy(
        token: string,
        context: KnowledgeRequestContext,
        id: string,
        input: unknown,
    ) {
        const candidate = CopyWorkbookRequestSchema.extend({
            expectedVersion: WorkbookVersionSchema.shape.expectedVersion,
        }).parse(input);
        return this.dependencies.store.copy(
            await this.owner(token, context),
            this.id(id),
            candidate,
        );
    }
}
