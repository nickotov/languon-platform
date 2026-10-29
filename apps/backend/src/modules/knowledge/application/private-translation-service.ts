import type { GenerationBurstLimiter } from '../../text-ai/application/generation-burst-limiter';
import { z } from 'zod';
import {
    RequestKnowledgeTranslationSchema,
    WorkbookLearningShareAccessSchema,
} from '@languon/contracts';
import type { RateLimiter } from '../../authentication/application/ports/rate-limiter';
import { KnowledgeDomainError } from '../domain/knowledge';
import type { KnowledgeRequestContext } from './knowledge-service';
import type { KnowledgePrivateTranslationStore } from './private-translation-store';

export class KnowledgePrivateTranslationService {
    constructor(
        private readonly dependencies: {
            store: KnowledgePrivateTranslationStore;
            authenticate(token: string): Promise<{ userId: string }>;
            rateLimiter: RateLimiter;
            burstLimiter: GenerationBurstLimiter;
        },
    ) {}
    private async source(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
        blockId: string,
        access?: unknown,
    ) {
        context.signal.throwIfAborted();
        const ip = await this.dependencies.rateLimiter.consume({
            scope: 'knowledge-private-translation-http',
            subject: context.clientAddress,
            limit: 180,
            windowMs: 60_000,
            signal: context.signal,
        });
        if (!ip.allowed)
            throw new KnowledgeDomainError(
                'rate_limited',
                'Too many requests. Try again shortly.',
            );
        const principal = await this.dependencies.authenticate(token);
        const actor = await this.dependencies.rateLimiter.consume({
            scope: 'knowledge-private-translation-actor',
            subject: principal.userId,
            limit: 120,
            windowMs: 60_000,
            signal: context.signal,
        });
        if (!actor.allowed)
            throw new KnowledgeDomainError(
                'rate_limited',
                'Too many requests. Try again shortly.',
            );
        const parsed =
            access === undefined
                ? undefined
                : WorkbookLearningShareAccessSchema.parse(access);
        return {
            actorId: principal.userId,
            noteId: z.uuid().parse(noteId),
            blockId: z.uuid().parse(blockId),
            ...(parsed ? { access: parsed } : {}),
        };
    }
    async list(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
        blockId: string,
        access?: unknown,
    ) {
        return this.dependencies.store.list(
            await this.source(token, context, noteId, blockId, access),
        );
    }
    async request(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
        blockId: string,
        input: unknown,
        access?: unknown,
    ) {
        const source = await this.source(
            token,
            context,
            noteId,
            blockId,
            access,
        );
        return this.dependencies.store.request(
            source,
            RequestKnowledgeTranslationSchema.parse(input),
            context.signal,
            async () => {
                const decision = await this.dependencies.burstLimiter.consume({
                    actorId: source.actorId,
                    capability: 'text-translation',
                    signal: context.signal,
                });
                if (!decision.allowed)
                    throw new KnowledgeDomainError(
                        'rate_limited',
                        'Too many translation requests. Try again shortly.',
                    );
            },
        );
    }
    async job(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
        blockId: string,
        jobId: string,
        access?: unknown,
    ) {
        return this.dependencies.store.job(
            await this.source(token, context, noteId, blockId, access),
            z.uuid().parse(jobId),
            context.signal,
        );
    }
    async cancel(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
        blockId: string,
        jobId: string,
        access?: unknown,
    ) {
        return this.dependencies.store.cancel(
            await this.source(token, context, noteId, blockId, access),
            z.uuid().parse(jobId),
            context.signal,
        );
    }
}
