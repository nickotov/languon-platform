import { randomUUID } from 'node:crypto';

import {
    createAuthenticationRedisClient,
    type AuthenticationRedisClient,
} from '../../../src/modules/authentication/infrastructure/rate-limit/bounded-redis-client';

const redisUrl = process.env.AUTH_TEST_REDIS_URL;
const confirmation = process.env.AUTH_TEST_REDIS_CONFIRM;
const allowDisposableRedisTests =
    process.env.ALLOW_DISPOSABLE_REDIS_TESTS === 'true';

function assertDisposableTarget(url: string): void {
    const parsed = new URL(url);
    const database = parsed.pathname.slice(1);
    const expectedConfirmation = `${parsed.hostname}:${parsed.port}/${database}`;
    const isLoopback =
        parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
    const port = Number(parsed.port);
    const databaseNumber = Number(database);

    if (
        parsed.protocol !== 'redis:' ||
        !isLoopback ||
        !Number.isSafeInteger(port) ||
        port < 1_024 ||
        port === 6_379 ||
        !Number.isSafeInteger(databaseNumber) ||
        databaseNumber < 1 ||
        databaseNumber > 15 ||
        confirmation !== expectedConfirmation
    ) {
        throw new Error(
            'Redis integration tests require a confirmed loopback, non-default port and database 1-15.',
        );
    }
}

export const redisIntegrationEnabled =
    allowDisposableRedisTests &&
    redisUrl !== undefined &&
    confirmation !== undefined;

export function createTestRedisClient(): AuthenticationRedisClient {
    if (!redisIntegrationEnabled || redisUrl === undefined) {
        throw new Error(
            'Set ALLOW_DISPOSABLE_REDIS_TESTS, AUTH_TEST_REDIS_URL, and AUTH_TEST_REDIS_CONFIRM.',
        );
    }
    assertDisposableTarget(redisUrl);

    return createAuthenticationRedisClient({
        commandTimeoutMs: 500,
        connectTimeoutMs: 500,
        maxConnectionRetries: 1,
        maxRetriesPerRequest: 1,
        url: redisUrl,
    });
}

export function uniqueAuthRedisNamespace(label: string): string {
    return `languon:auth:test:${label}:${randomUUID().replaceAll('-', '')}`;
}

export async function deleteNamespacedKeys(
    redis: AuthenticationRedisClient,
    namespace: string,
): Promise<void> {
    let cursor = '0';
    do {
        const [nextCursor, keys] = await redis.scan(
            cursor,
            'MATCH',
            `${namespace}:*`,
            'COUNT',
            100,
        );
        cursor = nextCursor;
        if (keys.length > 0) {
            await redis.unlink(...keys);
        }
    } while (cursor !== '0');
}
