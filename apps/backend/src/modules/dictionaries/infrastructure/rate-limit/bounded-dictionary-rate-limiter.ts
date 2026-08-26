import {
    RateLimitUnavailableError,
    type RateLimiter,
} from '../../../authentication/application/ports/rate-limiter';
import { DictionaryServiceUnavailableError } from '../../application/dictionary-errors';
import type {
    DictionaryRateLimiter,
    DictionaryRateLimitResult,
} from '../../application/ports/dictionary-rate-limiter';

const policies = {
    'card-write': {
        limit: 60,
        scope: 'dictionary.card-write',
        windowMs: 60_000,
    },
    'fork-global': {
        limit: 60,
        scope: 'dictionary.fork.global',
        windowMs: 60_000,
    },
    'fork-owner': {
        limit: 3,
        scope: 'dictionary.fork.owner',
        windowMs: 60_000,
    },
    'generation-enqueue': {
        limit: 10,
        scope: 'dictionary.generation-enqueue',
        windowMs: 60_000,
    },
    'import-preview-global': {
        limit: 30,
        scope: 'dictionary.import-preview.global',
        windowMs: 60_000,
    },
    'import-preview-owner': {
        limit: 6,
        scope: 'dictionary.import-preview.owner',
        windowMs: 60_000,
    },
    owner: { limit: 300, scope: 'dictionary.owner', windowMs: 60_000 },
    public: { limit: 120, scope: 'dictionary.public', windowMs: 60_000 },
    'shared-read': {
        limit: 30,
        scope: 'dictionary.shared-read',
        windowMs: 60_000,
    },
} as const;

export class BoundedDictionaryRateLimiter implements DictionaryRateLimiter {
    public constructor(private readonly rateLimiter: RateLimiter) {}

    public async consume(input: {
        key: string;
        scope:
            | 'card-write'
            | 'fork-global'
            | 'fork-owner'
            | 'generation-enqueue'
            | 'import-preview-global'
            | 'import-preview-owner'
            | 'owner'
            | 'public'
            | 'shared-read';
        signal: AbortSignal;
    }): Promise<DictionaryRateLimitResult> {
        const policy = policies[input.scope];
        try {
            const decision = await this.rateLimiter.consume({
                ...policy,
                signal: input.signal,
                subject: input.key,
            });
            return {
                allowed: decision.allowed,
                retryAfterSeconds: decision.retryAfterSeconds,
            };
        } catch (error) {
            if (input.signal.aborted) throw error;
            if (error instanceof RateLimitUnavailableError) {
                throw new DictionaryServiceUnavailableError();
            }
            throw error;
        }
    }
}
