import { describe, expect, it } from 'vitest';
import { fixture } from '../learning-test-fixture';
import { LearningAuthenticationRequiredError } from '../../../../../src/modules/learning/domain/errors';
import { InvalidAccessTokenError } from '../../../../../src/modules/authentication/application/ports/access-token';
import {
    DictionaryRateLimitError,
    DictionaryServiceUnavailableError,
    SharedDictionaryNotFoundError,
} from '../../../../../src/modules/dictionaries/application/dictionary-errors';
import { RateLimitUnavailableError } from '../../../../../src/modules/authentication/application/ports/rate-limiter';
import { RedisRateLimiter } from '../../../../../src/modules/authentication/infrastructure/rate-limit/redis-rate-limiter';
import { createAuthenticationRedisClient } from '../../../../../src/modules/authentication/infrastructure/rate-limit/bounded-redis-client';

const context = () => ({
    clientAddress: '127.0.0.1',
    signal: new AbortController().signal,
});
const shared = {
    kind: 'shared' as const,
    shareId: 'share',
    shareKey: 'secret',
};
const owner = {
    kind: 'owner' as const,
    dictionaryId: 'dictionary',
    accessToken: 'token',
};
const configuration = {
    front: ['targetExample' as const],
    back: ['sourceExample' as const],
};

describe('learning service admission and identity', () => {
    it('emits scopes accepted by the production Redis limiter validator', async () => {
        const f = fixture();
        await f.service.prepare(
            shared,
            { configuration, scope: { type: 'all' } },
            context(),
        );
        await f.service.prepare(
            owner,
            { configuration, scope: { type: 'all' } },
            context(),
        );
        await f.service.listEntries(shared, { limit: 25 }, context());
        await f.service.listEntries(owner, { limit: 25 }, context());
        await f.service.savePreferences(
            owner,
            { configuration, shuffle: true, expectedVersion: 0 },
            context(),
        );
        const redis = createAuthenticationRedisClient({
            url: 'redis://127.0.0.1:1',
        });
        const limiter = new RedisRateLimiter({
            redis,
            hmacSecret: 'test-secret-'.repeat(4),
        });
        const controller = new AbortController();
        const cancelled = new DOMException(
            'No network needed for scope validation',
            'AbortError',
        );
        controller.abort(cancelled);
        try {
            // The production validator runs before cancellation/transport. Invalid scopes
            // throw RangeError instead; this regression needs no Redis connection.
            for (const [request] of f.dependencies.rateLimiter.consume.mock
                .calls) {
                await expect(
                    limiter.consume({ ...request, signal: controller.signal }),
                ).rejects.toBe(cancelled);
            }
            expect(redis.status).toBe('wait');
        } finally {
            redis.disconnect();
        }
    });
    it('exposes disabled capabilities and does not touch auth or storage when disabled', async () => {
        const f = fixture(false);
        expect(f.service.capabilities()).toEqual({ flashcardsEnabled: false });
        await expect(
            f.service.prepare(
                owner,
                { configuration, scope: { type: 'all' } },
                context(),
            ),
        ).rejects.toBeInstanceOf(DictionaryServiceUnavailableError);
        expect(
            f.dependencies.authentication.authenticate,
        ).not.toHaveBeenCalled();
        expect(f.store.prepare).not.toHaveBeenCalled();
    });
    it('permits anonymous shared content, forwarding only verified digest', async () => {
        const f = fixture();
        f.store.items.mockResolvedValue({ items: [], unavailableEntryIds: [] });
        const c = context();
        const input = { configuration, entryIds: ['entry'] };
        await f.service.items(shared, input, c);
        expect(f.store.items).toHaveBeenCalledWith(
            {
                kind: 'shared',
                shareId: 'share',
                keyDigest: 'digest',
                learnerId: null,
            },
            input,
            c,
        );
        expect(
            f.dependencies.authentication.authenticate,
        ).not.toHaveBeenCalled();
    });
    it('never degrades a supplied invalid bearer to anonymous', async () => {
        const f = fixture();
        f.dependencies.authentication.authenticate.mockRejectedValue(
            new InvalidAccessTokenError(),
        );
        await expect(
            f.service.listEntries(
                { ...shared, accessToken: 'invalid' },
                { limit: 25 },
                context(),
            ),
        ).rejects.toBeInstanceOf(InvalidAccessTokenError);
        expect(
            f.dependencies.dictionaries.findSharedCandidate,
        ).not.toHaveBeenCalled();
        expect(f.store.listEntries).not.toHaveBeenCalled();
    });
    it('requires identity for private and personal operations', async () => {
        const f = fixture();
        await expect(
            f.service.progress(shared, context()),
        ).rejects.toBeInstanceOf(LearningAuthenticationRequiredError);
        await expect(
            f.service.listEntries(
                { kind: 'owner', dictionaryId: 'dictionary' },
                { limit: 25 },
                context(),
            ),
        ).rejects.toBeInstanceOf(LearningAuthenticationRequiredError);
        expect(f.store.progress).not.toHaveBeenCalled();
    });
    it('does not authorize a revoked capability', async () => {
        const f = fixture();
        f.dependencies.cryptography.verifyShare.mockReturnValue(false);
        await expect(
            f.service.prepare(
                shared,
                { configuration, scope: { type: 'all' } },
                context(),
            ),
        ).rejects.toBeInstanceOf(SharedDictionaryNotFoundError);
        expect(f.store.prepare).not.toHaveBeenCalled();
    });
    it('uses signed-in learner identity and distinct write admission, not shared read quota', async () => {
        const f = fixture();
        const input = {
            configuration,
            operationId: 'operation',
            sessionId: 'session',
            entryId: 'entry',
            expectedLearningVersion: 1,
            rating: 'known' as const,
            round: 1,
        };
        await f.service.recordAttempt(
            { ...shared, accessToken: 'token' },
            input,
            context(),
        );
        expect(f.store.recordAttempt.mock.calls[0]?.[0]).toEqual({
            kind: 'shared',
            shareId: 'share',
            keyDigest: 'digest',
            learnerId: 'learner',
        });
        expect(
            f.dependencies.rateLimiter.consume.mock.calls.map(
                ([call]) => call.scope,
            ),
        ).toEqual(['learning.public', 'learning.write.learner']);
    });
    it('fails closed when rate limiting is unavailable or denied', async () => {
        const f = fixture();
        f.dependencies.rateLimiter.consume.mockRejectedValueOnce(
            new RateLimitUnavailableError(),
        );
        await expect(
            f.service.getPreferences(owner, context()),
        ).rejects.toBeInstanceOf(DictionaryServiceUnavailableError);
        f.dependencies.rateLimiter.consume.mockResolvedValueOnce({
            allowed: false,
            limit: 180,
            remaining: 0,
            retryAfterSeconds: 10,
        });
        await expect(
            f.service.getPreferences(owner, context()),
        ).rejects.toBeInstanceOf(DictionaryRateLimitError);
        expect(f.store.getPreferences).not.toHaveBeenCalled();
    });
    it('honors cancellation before admission or database work', async () => {
        const f = fixture();
        const controller = new AbortController();
        controller.abort();
        await expect(
            f.service.progress(owner, {
                ...context(),
                signal: controller.signal,
            }),
        ).rejects.toThrow();
        expect(f.dependencies.rateLimiter.consume).not.toHaveBeenCalled();
    });
});
