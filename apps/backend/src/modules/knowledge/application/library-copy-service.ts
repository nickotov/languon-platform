import {
    CopyKnowledgeVocabularyRequestSchema,
    CopyKnowledgeTextRequestSchema,
    WorkbookLearningShareAccessSchema,
} from '@languon/contracts';
import type { RateLimiter } from '../../authentication/application/ports/rate-limiter';
import type { KnowledgeLibraryCopyStore } from './library-copy-store';
import type { KnowledgeRequestContext } from './knowledge-service';
import { KnowledgeDomainError } from '../domain/knowledge';

export class KnowledgeLibraryCopyService {
    constructor(
        private readonly dependencies: {
            store: KnowledgeLibraryCopyStore;
            authenticate(token: string): Promise<{ userId: string }>;
            rateLimiter: RateLimiter;
        },
    ) {}
    private async actor(token: string, context: KnowledgeRequestContext) {
        context.signal.throwIfAborted();
        for (const [scope, subject] of [
            ['knowledge-library-http', context.clientAddress],
        ] as const) {
            const limit = await this.dependencies.rateLimiter.consume({
                scope,
                subject,
                limit: 60,
                windowMs: 60_000,
                signal: context.signal,
            });
            if (!limit.allowed)
                throw new KnowledgeDomainError(
                    'rate_limited',
                    'Too many requests. Please try again shortly.',
                );
        }
        const principal = await this.dependencies.authenticate(token);
        const limit = await this.dependencies.rateLimiter.consume({
            scope: 'knowledge-library-owner',
            subject: principal.userId,
            limit: 60,
            windowMs: 60_000,
            signal: context.signal,
        });
        if (!limit.allowed)
            throw new KnowledgeDomainError(
                'rate_limited',
                'Too many requests. Please try again shortly.',
            );
        context.signal.throwIfAborted();
        return principal.userId;
    }
    private access(value: unknown) {
        return value === undefined
            ? undefined
            : WorkbookLearningShareAccessSchema.parse(value);
    }
    async vocabulary(
        token: string,
        context: KnowledgeRequestContext,
        input: unknown,
        preview: boolean,
        access?: unknown,
    ) {
        const actor = await this.actor(token, context);
        const request = CopyKnowledgeVocabularyRequestSchema.parse(input);
        const proof = this.access(access);
        return preview
            ? this.dependencies.store.previewVocabulary(
                  actor,
                  request,
                  context.signal,
                  proof,
              )
            : this.dependencies.store.copyVocabulary(
                  actor,
                  request,
                  context.signal,
                  proof,
              );
    }
    async text(
        token: string,
        context: KnowledgeRequestContext,
        input: unknown,
        preview: boolean,
        access?: unknown,
    ) {
        const actor = await this.actor(token, context);
        const request = CopyKnowledgeTextRequestSchema.parse(input);
        const proof = this.access(access);
        return preview
            ? this.dependencies.store.previewText(
                  actor,
                  request,
                  context.signal,
                  proof,
              )
            : this.dependencies.store.copyText(
                  actor,
                  request,
                  context.signal,
                  proof,
              );
    }
}
