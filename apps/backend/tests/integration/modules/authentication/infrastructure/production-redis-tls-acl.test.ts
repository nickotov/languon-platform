import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AuthenticationRedisClient } from '../../../../../src/modules/authentication/infrastructure/rate-limit/bounded-redis-client';
import { createAuthenticationRedisClient } from '../../../../../src/modules/authentication/infrastructure/rate-limit/bounded-redis-client';
import { RedisRateLimiter } from '../../../../../src/modules/authentication/infrastructure/rate-limit/redis-rate-limiter';

const enabled = process.env.ALLOW_PRODUCTION_REDIS_TLS_TESTS === 'true';
const describeIfEnabled = enabled ? describe : describe.skip;

describeIfEnabled('production Redis TLS and ACL contract', () => {
    let redis: AuthenticationRedisClient;

    beforeAll(async () => {
        const url = process.env.AUTH_TEST_PRODUCTION_REDIS_URL;
        if (!url || new URL(url).protocol !== 'rediss:') {
            throw new Error('A disposable rediss:// test URL is required.');
        }
        redis = createAuthenticationRedisClient({ url });
        await redis.connect();
    });

    afterAll(async () => {
        await redis.quit();
    });

    it('executes the real rolling-window Lua script as the restricted user', async () => {
        const limiter = new RedisRateLimiter({
            hmacSecret: 'production-acl-integration-secret-32-bytes',
            namespace: 'languon:auth:v1:production-acl-test',
            redis,
        });
        const request = {
            limit: 1,
            scope: 'password-login-account',
            subject: 'synthetic@example.invalid',
            windowMs: 10_000,
        };

        await expect(limiter.consume(request)).resolves.toMatchObject({
            allowed: true,
            remaining: 0,
        });
        await expect(limiter.consume(request)).resolves.toMatchObject({
            allowed: false,
            remaining: 0,
        });
        await expect(redis.flushall()).rejects.toThrow(/NOPERM/);
    });
});
