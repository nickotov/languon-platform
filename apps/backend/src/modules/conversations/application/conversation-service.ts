import {
    RateLimitUnavailableError,
    type RateLimiter,
    type ConcurrentRequestLimiter,
    type ConcurrentRequestLease,
} from '../../authentication/application/ports/rate-limiter';
import { ConversationError } from '../domain/conversation';
import type {
    ConversationAccess,
    ConversationStore,
} from './ports/conversation-store';
export class ConversationService {
    constructor(
        public readonly store: ConversationStore,
        private readonly authenticate: (
            token: string,
        ) => Promise<{ userId: string }>,
        private readonly rateLimiter: RateLimiter,
        private readonly streamLimiter: ConcurrentRequestLimiter,
    ) {}
    async admitStream(
        actor: ConversationAccess,
        signal: AbortSignal,
    ): Promise<ConcurrentRequestLease> {
        signal.throwIfAborted();
        try {
            const decision = await this.rateLimiter.consume({
                scope: 'contextual-assistant-stream-admission',
                subject: actor.ownerId,
                limit: 12,
                windowMs: 60_000,
                signal,
            });
            if (!decision.allowed)
                throw new ConversationError(
                    'rate_limited',
                    'Too many conversation connections. Try again shortly.',
                );
            const lease = await this.streamLimiter.acquireLease({
                scope: 'contextual-assistant-streams',
                subject: actor.ownerId,
                limit: 8,
                ttlMs: 300_000,
                signal,
            });
            if (!lease)
                throw new ConversationError(
                    'capacity_unavailable',
                    'Too many conversations are open. Close another tab and try again.',
                );
            let released: Promise<void> | undefined;
            return {
                release: () =>
                    (released ??= lease.release().catch(() => {
                        /* Expiry safely reclaims the slot if bounded cleanup is unavailable. */
                    })),
            };
        } catch (error) {
            if (signal.aborted || error instanceof ConversationError)
                throw error;
            throw new ConversationError(
                'service_unavailable',
                'Conversation streaming is temporarily unavailable. Try again shortly.',
            );
        }
    }
    async access(
        token: string,
        signal: AbortSignal,
        shareKey?: string,
    ): Promise<ConversationAccess> {
        const actor = await this.revalidate(token, signal, shareKey);
        const decision = await this.rateLimiter
            .consume({
                scope: 'contextual-assistant',
                subject: actor.ownerId,
                limit: 240,
                windowMs: 60_000,
                signal,
            })
            .catch((error: unknown) => {
                if (error instanceof RateLimitUnavailableError)
                    throw new ConversationError(
                        'service_unavailable',
                        'Conversation request limits are temporarily unavailable. Try again shortly.',
                    );
                throw error;
            });
        if (!decision.allowed)
            throw new ConversationError(
                'rate_limited',
                'Too many requests. Try again shortly.',
            );
        return actor;
    }
    /** An existing stream rechecks the session without admitting another HTTP action. */
    async revalidate(
        token: string,
        signal: AbortSignal,
        shareKey?: string,
    ): Promise<ConversationAccess> {
        signal.throwIfAborted();
        const actor = await this.authenticate(token);
        signal.throwIfAborted();
        return { ownerId: actor.userId, ...(shareKey ? { shareKey } : {}) };
    }
}
