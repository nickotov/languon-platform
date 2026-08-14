import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
    RateLimitUnavailableError,
    type RateLimitRequest,
} from '../../../../../src/modules/authentication/application/ports/rate-limiter';
import {
    WebAuthnChallengeAlreadyExistsError,
    WebAuthnChallengeStoreUnavailableError,
    type StoredWebAuthnChallenge,
} from '../../../../../src/modules/authentication/application/ports/webauthn-challenge-store';
import {
    createAuthenticationRedisClient,
    deriveOpaqueRedisKey,
    type AuthenticationRedisClient,
} from '../../../../../src/modules/authentication/infrastructure/rate-limit/bounded-redis-client';
import { RedisRateLimiter } from '../../../../../src/modules/authentication/infrastructure/rate-limit/redis-rate-limiter';
import {
    RedisWebAuthnChallengeStore,
    WEBAUTHN_CHALLENGE_TTL_MS,
} from '../../../../../src/modules/authentication/infrastructure/passkeys/redis-webauthn-challenge-store';
import {
    createTestRedisClient,
    deleteNamespacedKeys,
    redisIntegrationEnabled,
    uniqueAuthRedisNamespace,
} from '../../../support/test-redis';

const describeIfRedis = redisIntegrationEnabled ? describe : describe.skip;
const hmacSecret = 'integration-rate-limit-secret-32-bytes';

describeIfRedis('Redis authentication controls', () => {
    let redis: AuthenticationRedisClient;
    const namespaces = new Set<string>();

    beforeAll(async () => {
        redis = createTestRedisClient();
        await redis.connect();
    });

    afterAll(async () => {
        for (const namespace of namespaces) {
            await deleteNamespacedKeys(redis, namespace);
        }
        await redis.quit();
    });

    function namespace(label: string): string {
        const value = uniqueAuthRedisNamespace(label);
        namespaces.add(value);
        return value;
    }

    function limiter(label: string): {
        namespace: string;
        rateLimiter: RedisRateLimiter;
    } {
        const value = namespace(label);
        return {
            namespace: value,
            rateLimiter: new RedisRateLimiter({
                hmacSecret,
                namespace: value,
                redis,
            }),
        };
    }

    it('atomically enforces the threshold while retaining the rolling history', async () => {
        const { namespace: keyNamespace, rateLimiter } = limiter('threshold');
        const request: RateLimitRequest = {
            limit: 3,
            scope: 'password-login-account',
            subject: 'sensitive.user@example.com',
            windowMs: 10_000,
        };

        const decisions = [];
        for (let attempt = 0; attempt < 4; attempt += 1) {
            decisions.push(await rateLimiter.consume(request));
        }

        expect(decisions.map((decision) => decision.allowed)).toEqual([
            true,
            true,
            true,
            false,
        ]);
        expect(decisions.at(-1)).toMatchObject({
            limit: 3,
            remaining: 0,
            retryAfterSeconds: 10,
        });

        const keys = await redis.keys(`${keyNamespace}:*`);
        expect(keys).toHaveLength(1);
        expect(keys[0]).not.toContain(request.subject);
        const ttlBefore = await redis.pttl(keys[0] as string);
        await new Promise((resolve) => setTimeout(resolve, 25));
        await rateLimiter.consume(request);
        const ttlAfter = await redis.pttl(keys[0] as string);
        expect(ttlBefore).toBeGreaterThan(9_000);
        expect(ttlAfter).toBeGreaterThan(9_000);
    });

    it('allows exactly the configured number under concurrency', async () => {
        const { rateLimiter } = limiter('concurrency');
        const decisions = await Promise.all(
            Array.from({ length: 25 }, () =>
                rateLimiter.consume({
                    limit: 7,
                    scope: 'signup-client-address',
                    subject: '192.0.2.25',
                    windowMs: 30_000,
                }),
            ),
        );

        expect(decisions.filter(({ allowed }) => allowed)).toHaveLength(7);
        expect(decisions.filter(({ allowed }) => !allowed)).toHaveLength(18);
    });

    it('uses a true rolling window instead of resetting every fixed interval', async () => {
        const { rateLimiter } = limiter('rolling-window');
        const request: RateLimitRequest = {
            limit: 2,
            scope: 'verification.email-send.account',
            subject: 'rolling@example.com',
            windowMs: 500,
        };

        await expect(rateLimiter.consume(request)).resolves.toMatchObject({
            allowed: true,
        });
        await new Promise((resolve) => setTimeout(resolve, 350));
        await expect(rateLimiter.consume(request)).resolves.toMatchObject({
            allowed: true,
        });
        await new Promise((resolve) => setTimeout(resolve, 220));

        await expect(rateLimiter.consume(request)).resolves.toMatchObject({
            allowed: true,
            remaining: 0,
        });
        await expect(rateLimiter.consume(request)).resolves.toMatchObject({
            allowed: false,
            remaining: 0,
        });
    });

    it('links opaque flow subjects to the same rolling account limit', async () => {
        const { rateLimiter } = limiter('linked-subject');
        const account = 'private@example.com';
        const scope = 'verification.email_send.account';
        const flowId = '3f8859f1-f669-43ce-9f69-863c03a89e75';
        await rateLimiter.consume({
            limit: 2,
            scope,
            subject: account,
            windowMs: 5_000,
        });
        await rateLimiter.linkSubject({
            alias: flowId,
            scope,
            subject: account,
            ttlMs: 5_000,
        });

        await expect(
            rateLimiter.consume({
                limit: 2,
                resolveSubjectAlias: true,
                scope,
                subject: flowId,
                windowMs: 5_000,
            }),
        ).resolves.toMatchObject({ allowed: true, remaining: 0 });
        await expect(
            rateLimiter.consume({
                limit: 2,
                resolveSubjectAlias: true,
                scope,
                subject: flowId,
                windowMs: 5_000,
            }),
        ).resolves.toMatchObject({ allowed: false, remaining: 0 });
    });

    it('stores a challenge for five minutes without overwriting an active flow', async () => {
        const keyNamespace = namespace('challenge-ttl');
        const store = new RedisWebAuthnChallengeStore({
            hmacSecret,
            namespace: keyNamespace,
            redis,
        });
        const challenge: StoredWebAuthnChallenge = {
            challenge: 'server-generated-webauthn-challenge',
            id: 'opaque-flow-id',
            purpose: 'registration',
            userId: 'user-id',
        };

        await store.issue(challenge);
        await expect(store.issue(challenge)).rejects.toBeInstanceOf(
            WebAuthnChallengeAlreadyExistsError,
        );

        const key = deriveOpaqueRedisKey(
            keyNamespace,
            'webauthn-challenge',
            challenge.id,
            hmacSecret,
        );
        const ttl = await redis.pttl(key);
        expect(ttl).toBeGreaterThan(WEBAUTHN_CHALLENGE_TTL_MS - 2_000);
        expect(ttl).toBeLessThanOrEqual(WEBAUTHN_CHALLENGE_TTL_MS);
        expect(key).not.toContain(challenge.id);
        expect(await store.consume(challenge.id)).toEqual(challenge);
        expect(await store.consume(challenge.id)).toBeNull();
    });

    it('allows only one concurrent consumer of a WebAuthn challenge', async () => {
        const store = new RedisWebAuthnChallengeStore({
            hmacSecret,
            namespace: namespace('challenge-concurrency'),
            redis,
        });
        const challenge: StoredWebAuthnChallenge = {
            challenge: 'single-use-challenge',
            id: 'concurrent-flow-id',
            purpose: 'authentication',
            userId: null,
        };
        await store.issue(challenge);

        const results = await Promise.all(
            Array.from({ length: 20 }, () => store.consume(challenge.id)),
        );
        expect(results.filter((value) => value !== null)).toEqual([challenge]);
    });
});

describe('Redis authentication control outage behavior', () => {
    it('fails the limiter closed within a bounded deadline', async () => {
        const redis = createAuthenticationRedisClient({
            commandTimeoutMs: 50,
            connectTimeoutMs: 50,
            maxConnectionRetries: 0,
            maxRetriesPerRequest: 0,
            url: 'redis://127.0.0.1:1/15',
        });
        const limiter = new RedisRateLimiter({
            hmacSecret,
            redis,
            requestTimeoutMs: 150,
        });
        const startedAt = performance.now();

        await expect(
            limiter.consume({
                limit: 5,
                scope: 'password-login-account',
                subject: 'unknown@example.com',
                windowMs: 60_000,
            }),
        ).rejects.toBeInstanceOf(RateLimitUnavailableError);
        expect(performance.now() - startedAt).toBeLessThan(1_000);
        redis.disconnect(false);
    });

    it('fails challenge issue and consume closed within a bounded deadline', async () => {
        const redis = createAuthenticationRedisClient({
            commandTimeoutMs: 50,
            connectTimeoutMs: 50,
            maxConnectionRetries: 0,
            maxRetriesPerRequest: 0,
            url: 'redis://127.0.0.1:1/15',
        });
        const store = new RedisWebAuthnChallengeStore({
            hmacSecret,
            redis,
            requestTimeoutMs: 150,
        });
        const challenge: StoredWebAuthnChallenge = {
            challenge: 'unavailable-challenge',
            id: 'unavailable-flow',
            purpose: 'authentication',
            userId: null,
        };
        const startedAt = performance.now();

        await expect(store.issue(challenge)).rejects.toBeInstanceOf(
            WebAuthnChallengeStoreUnavailableError,
        );
        await expect(store.consume(challenge.id)).rejects.toBeInstanceOf(
            WebAuthnChallengeStoreUnavailableError,
        );
        expect(performance.now() - startedAt).toBeLessThan(1_000);
        redis.disconnect(false);
    });
});
