import { z } from 'zod';
import {
    RequestKnowledgeBlockFieldActionSchema,
    type KnowledgeBlockFieldActionJob,
} from '@languon/contracts';
import type { RateLimiter } from '../../authentication/application/ports/rate-limiter';
import type { GenerationBurstLimiter } from '../../text-ai/application/generation-burst-limiter';
import { KnowledgeDomainError } from '../domain/knowledge';
import type { KnowledgeRequestContext } from './knowledge-service';
import type { RequestKnowledgeBlockFieldAction } from '@languon/contracts';

interface FieldStore {
    request(
        ownerId: string,
        noteId: string,
        input: RequestKnowledgeBlockFieldAction,
        context: { signal: AbortSignal; now: Date },
    ): Promise<KnowledgeBlockFieldActionJob>;
    get(
        ownerId: string,
        noteId: string,
        jobId: string,
        context: { signal: AbortSignal; now: Date },
    ): Promise<KnowledgeBlockFieldActionJob>;
    cancel(
        ownerId: string,
        noteId: string,
        jobId: string,
        context: { signal: AbortSignal; now: Date },
    ): Promise<KnowledgeBlockFieldActionJob>;
}
export class KnowledgeBlockFieldService {
    constructor(
        private readonly dependencies: {
            store: FieldStore;
            authenticate(token: string): Promise<{ userId: string }>;
            rateLimiter: RateLimiter;
            burstLimiter: GenerationBurstLimiter;
            clock?: { now(): Date };
        },
    ) {}

    private async actor(token: string, context: KnowledgeRequestContext) {
        context.signal.throwIfAborted();
        const ip = await this.dependencies.rateLimiter.consume({
            scope: 'knowledge-block-field-http',
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
        const actor = await this.dependencies.authenticate(token);
        const limit = await this.dependencies.rateLimiter.consume({
            scope: 'knowledge-block-field-actor',
            subject: actor.userId,
            limit: 120,
            windowMs: 60_000,
            signal: context.signal,
        });
        if (!limit.allowed)
            throw new KnowledgeDomainError(
                'rate_limited',
                'Too many requests. Try again shortly.',
            );
        return actor.userId;
    }

    async request(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
        raw: unknown,
    ) {
        const ownerId = await this.actor(token, context);
        const input = RequestKnowledgeBlockFieldActionSchema.parse(raw);
        const burst = await this.dependencies.burstLimiter.consume({
            actorId: ownerId,
            capability: 'text-translation',
            signal: context.signal,
        });
        if (!burst.allowed)
            throw new KnowledgeDomainError(
                'rate_limited',
                'Too many AI requests. Try again shortly.',
            );
        return {
            job: await this.dependencies.store.request(
                ownerId,
                z.uuid().parse(noteId),
                input,
                {
                    signal: context.signal,
                    now: this.dependencies.clock?.now() ?? new Date(),
                },
            ),
        };
    }
    async get(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
        jobId: string,
    ) {
        return {
            job: await this.dependencies.store.get(
                await this.actor(token, context),
                z.uuid().parse(noteId),
                z.uuid().parse(jobId),
                {
                    signal: context.signal,
                    now: this.dependencies.clock?.now() ?? new Date(),
                },
            ),
        };
    }
    async cancel(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
        jobId: string,
    ) {
        return {
            job: await this.dependencies.store.cancel(
                await this.actor(token, context),
                z.uuid().parse(noteId),
                z.uuid().parse(jobId),
                {
                    signal: context.signal,
                    now: this.dependencies.clock?.now() ?? new Date(),
                },
            ),
        };
    }
}
