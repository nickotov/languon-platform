import {
    RateLimitUnavailableError,
    type RateLimiter,
} from '../../authentication/application/ports/rate-limiter';
import {
    GenerationBurstUnavailableError,
    type GenerationBurstLimiter,
} from '../application/generation-burst-limiter';

/** Shared bounded Redis limiter; no local fallback when Redis is unavailable. */
export class RedisGenerationBurstLimiter implements GenerationBurstLimiter {
    constructor(private readonly limiter: RateLimiter) {}

    async consume(input: Parameters<GenerationBurstLimiter['consume']>[0]) {
        try {
            const result = await this.limiter.consume({
                subject: input.actorId,
                scope: `generation.${input.capability}`,
                limit: 10,
                windowMs: 60_000,
                ...(input.signal ? { signal: input.signal } : {}),
            });
            return { allowed: result.allowed };
        } catch (error) {
            if (error instanceof RateLimitUnavailableError)
                throw new GenerationBurstUnavailableError();
            throw error;
        }
    }
}
