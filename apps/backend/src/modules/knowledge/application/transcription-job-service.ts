import { SubmitKnowledgeTranscriptionRequestSchema } from '@languon/contracts';
import { z } from 'zod';
import type { RateLimiter } from '../../authentication/application/ports/rate-limiter';
import { KnowledgeDomainError } from '../domain/knowledge';
import type { KnowledgeRequestContext } from './knowledge-service';
import type { KnowledgeTranscriptionJobStore } from './transcription-job-store';

export class KnowledgeTranscriptionJobService {
    constructor(
        private readonly dependencies: {
            store: KnowledgeTranscriptionJobStore;
            authenticate(token: string): Promise<{ userId: string }>;
            rateLimiter: RateLimiter;
        },
    ) {}
    private async actor(token: string, context: KnowledgeRequestContext) {
        context.signal.throwIfAborted();
        const addressDecision = await this.dependencies.rateLimiter.consume({
            scope: 'knowledge-transcription-http',
            subject: context.clientAddress,
            limit: 120,
            windowMs: 60_000,
            signal: context.signal,
        });
        if (!addressDecision.allowed)
            throw new KnowledgeDomainError(
                'rate_limited',
                'Too many transcription requests. Try again shortly.',
            );
        const principal = await this.dependencies.authenticate(token);
        const decision = await this.dependencies.rateLimiter.consume({
            scope: 'knowledge-transcription',
            subject: principal.userId,
            limit: 60,
            windowMs: 60_000,
            signal: context.signal,
        });
        if (!decision.allowed)
            throw new KnowledgeDomainError(
                'rate_limited',
                'Too many transcription requests. Try again shortly.',
            );
        return principal.userId;
    }
    async submit(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
        candidate: unknown,
    ) {
        const input =
            SubmitKnowledgeTranscriptionRequestSchema.parse(candidate);
        if (z.uuid().parse(noteId) !== input.noteId)
            throw new KnowledgeDomainError(
                'invalid_request',
                'The requested note does not match the transcription.',
            );
        return this.dependencies.store.submit(
            await this.actor(token, context),
            input,
            context.signal,
        );
    }
    async read(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
        operationId: string,
    ) {
        return this.dependencies.store.read(
            await this.actor(token, context),
            z.uuid().parse(noteId),
            z.uuid().parse(operationId),
        );
    }
    async cancel(
        token: string,
        context: KnowledgeRequestContext,
        noteId: string,
        operationId: string,
    ) {
        return this.dependencies.store.cancel(
            await this.actor(token, context),
            z.uuid().parse(noteId),
            z.uuid().parse(operationId),
        );
    }
}
