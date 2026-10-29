import {
    CopyKnowledgeBlocksRequestSchema,
    KnowledgeNoteIdParamsSchema,
} from '@languon/contracts';
import type { RateLimiter } from '../../authentication/application/ports/rate-limiter';
import type { KnowledgeRequestContext } from './knowledge-service';
import type { KnowledgeBlockCopyStore } from './block-copy-store';
import { KnowledgeDomainError } from '../domain/knowledge';
export class KnowledgeBlockCopyService {
    constructor(
        private readonly dependencies: {
            store: KnowledgeBlockCopyStore;
            authenticate(token: string): Promise<{ userId: string }>;
            rateLimiter: RateLimiter;
        },
    ) {}
    async copy(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
        input: unknown,
    ) {
        context.signal.throwIfAborted();
        const { userId } = await this.dependencies.authenticate(token);
        const rate = await this.dependencies.rateLimiter.consume({
            scope: 'knowledge-block-copy',
            subject: userId,
            limit: 60,
            windowMs: 60000,
            signal: context.signal,
        });
        if (!rate.allowed)
            throw new KnowledgeDomainError(
                'rate_limited',
                'Too many copy requests.',
            );
        return this.dependencies.store.copy(
            userId,
            KnowledgeNoteIdParamsSchema.parse({ noteId }).noteId,
            CopyKnowledgeBlocksRequestSchema.parse(input),
        );
    }
}
