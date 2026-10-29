import { z } from 'zod';
import {
    RequestKnowledgeExerciseEvaluationSchema,
    type KnowledgeExerciseEvaluationJob,
    WorkbookLearningShareAccessSchema,
    type WorkbookLearningShareAccess,
} from '@languon/contracts';
import type { RateLimiter } from '../../authentication/application/ports/rate-limiter';
import type { GenerationBurstLimiter } from '../../text-ai/application/generation-burst-limiter';
import { KnowledgeDomainError } from '../domain/knowledge';
import type { KnowledgeRequestContext } from './knowledge-service';
import type { RequestKnowledgeExerciseEvaluation } from '@languon/contracts';

interface EvaluationStore {
    request(
        ownerId: string,
        noteId: string,
        input: RequestKnowledgeExerciseEvaluation,
        context: { signal: AbortSignal; now: Date },
        access?: WorkbookLearningShareAccess,
    ): Promise<KnowledgeExerciseEvaluationJob>;
    get(
        ownerId: string,
        noteId: string,
        jobId: string,
        context: { signal: AbortSignal; now: Date },
        access?: WorkbookLearningShareAccess,
    ): Promise<KnowledgeExerciseEvaluationJob>;
    cancel(
        ownerId: string,
        noteId: string,
        jobId: string,
        context: { signal: AbortSignal; now: Date },
        access?: WorkbookLearningShareAccess,
    ): Promise<KnowledgeExerciseEvaluationJob>;
}
export class KnowledgeExerciseEvaluationService {
    constructor(
        private readonly dependencies: {
            store: EvaluationStore;
            authenticate(token: string): Promise<{ userId: string }>;
            rateLimiter: RateLimiter;
            burstLimiter: GenerationBurstLimiter;
            clock?: { now(): Date };
        },
    ) {}

    private async actor(token: string, context: KnowledgeRequestContext) {
        context.signal.throwIfAborted();
        const ip = await this.dependencies.rateLimiter.consume({
            scope: 'knowledge-exercise-evaluation-http',
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
            scope: 'knowledge-exercise-evaluation-actor',
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
        access?: unknown,
    ) {
        const ownerId = await this.actor(token, context);
        const input = RequestKnowledgeExerciseEvaluationSchema.parse(raw);
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
                access === undefined
                    ? undefined
                    : WorkbookLearningShareAccessSchema.parse(access),
            ),
        };
    }
    async get(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
        jobId: string,
        access?: unknown,
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
                access === undefined
                    ? undefined
                    : WorkbookLearningShareAccessSchema.parse(access),
            ),
        };
    }
    async cancel(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
        jobId: string,
        access?: unknown,
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
                access === undefined
                    ? undefined
                    : WorkbookLearningShareAccessSchema.parse(access),
            ),
        };
    }
}
