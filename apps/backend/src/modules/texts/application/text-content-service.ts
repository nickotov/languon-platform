import type {
    CreateTextFolderRequest,
    UpdateTextFolderRequest,
    CreateTextRequest,
    SaveTextRequest,
} from '@languon/contracts';
import type { RateLimiter } from '../../authentication/application/ports/rate-limiter';
import type {
    TextContentStore,
    TextPage,
    TextShareAccess,
} from './ports/text-content-store';
import { TextDomainError } from '../domain/text';
export interface TextRequestContext {
    signal: AbortSignal;
    clientAddress: string;
}
export interface TextContentDependencies {
    store: TextContentStore;
    authenticate: (token: string) => Promise<{ userId: string }>;
    rateLimiter: RateLimiter;
}
export class TextContentService {
    constructor(private readonly dependencies: TextContentDependencies) {}
    private async rate(
        subject: string,
        context: TextRequestContext,
        anonymous = false,
    ) {
        context.signal.throwIfAborted();
        const decision = await this.dependencies.rateLimiter.consume({
            scope: anonymous ? 'texts-public' : 'texts-content',
            subject,
            limit: anonymous ? 120 : 180,
            windowMs: 60000,
            signal: context.signal,
        });
        if (!decision.allowed)
            throw new TextDomainError(
                'rate_limited',
                'Too many requests. Please try again shortly.',
            );
    }
    private async owner(token: string, context: TextRequestContext) {
        await this.rate(context.clientAddress, context, true);
        const principal = await this.dependencies.authenticate(token);
        await this.rate(principal.userId, context);
        return principal.userId;
    }
    async listFolders(
        token: string,
        context: TextRequestContext,
        page: TextPage,
    ) {
        return this.dependencies.store.listFolders(
            await this.owner(token, context),
            page,
        );
    }
    async createFolder(
        token: string,
        context: TextRequestContext,
        request: CreateTextFolderRequest,
    ) {
        return this.dependencies.store.createFolder(
            await this.owner(token, context),
            request,
        );
    }
    async updateFolder(
        token: string,
        context: TextRequestContext,
        id: string,
        request: UpdateTextFolderRequest,
    ) {
        return this.dependencies.store.updateFolder(
            await this.owner(token, context),
            id,
            request,
        );
    }
    async folderLifecycle(
        token: string,
        context: TextRequestContext,
        id: string,
        version: number,
        lifecycle: 'active' | 'archived',
    ) {
        return this.dependencies.store.folderLifecycle(
            await this.owner(token, context),
            id,
            version,
            lifecycle,
        );
    }
    async listTexts(
        token: string,
        context: TextRequestContext,
        id: string,
        page: TextPage,
    ) {
        return this.dependencies.store.listTexts(
            await this.owner(token, context),
            id,
            page,
        );
    }
    async createText(
        token: string,
        context: TextRequestContext,
        request: CreateTextRequest,
    ) {
        return this.dependencies.store.createText(
            await this.owner(token, context),
            request,
        );
    }
    async getText(token: string, context: TextRequestContext, id: string) {
        return this.dependencies.store.getText(
            await this.owner(token, context),
            id,
        );
    }
    async saveText(
        token: string,
        context: TextRequestContext,
        id: string,
        request: SaveTextRequest,
    ) {
        return this.dependencies.store.saveText(
            await this.owner(token, context),
            id,
            request,
        );
    }
    async textLifecycle(
        token: string,
        context: TextRequestContext,
        id: string,
        version: number,
        lifecycle: 'active' | 'archived',
    ) {
        return this.dependencies.store.textLifecycle(
            await this.owner(token, context),
            id,
            version,
            lifecycle,
        );
    }
    async issueShare(
        token: string,
        context: TextRequestContext,
        kind: 'text' | 'folder',
        id: string,
        version: number,
    ) {
        return this.dependencies.store.issueShare(
            await this.owner(token, context),
            kind,
            id,
            version,
        );
    }
    async revokeShare(
        token: string,
        context: TextRequestContext,
        kind: 'text' | 'folder',
        id: string,
        version: number,
    ) {
        return this.dependencies.store.revokeShare(
            await this.owner(token, context),
            kind,
            id,
            version,
        );
    }
    async readShared(
        context: TextRequestContext,
        access: TextShareAccess,
        page: TextPage,
    ) {
        await this.rate(context.clientAddress, context, true);
        return this.dependencies.store.readShared(access, page);
    }
    async copyShared(
        token: string,
        context: TextRequestContext,
        access: TextShareAccess,
        request: {
            destinationFolderId?: string;
            sourceTextId?: string;
            name?: string;
            idempotencyKey: string;
            expectedVersion?: number;
        },
    ) {
        return this.dependencies.store.copyShared(
            await this.owner(token, context),
            access,
            request,
        );
    }
}
