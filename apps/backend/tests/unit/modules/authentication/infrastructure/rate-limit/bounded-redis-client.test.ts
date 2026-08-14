import { afterEach, describe, expect, it } from 'vitest';

import {
    createAuthenticationRedisClient,
    deriveOpaqueRedisKey,
} from '../../../../../../src/modules/authentication/infrastructure/rate-limit/bounded-redis-client';

const hmacSecret = 'r'.repeat(32);

describe('bounded authentication Redis client', () => {
    const clients: ReturnType<typeof createAuthenticationRedisClient>[] = [];

    afterEach(() => {
        for (const client of clients) {
            client.disconnect(false);
        }
        clients.length = 0;
    });

    it('derives stable purpose-separated keys without exposing the binding', () => {
        const email = 'private.person@example.com';
        const first = deriveOpaqueRedisKey(
            'languon:auth:v1',
            'rate-limit',
            email,
            hmacSecret,
        );
        const repeated = deriveOpaqueRedisKey(
            'languon:auth:v1',
            'rate-limit',
            email,
            hmacSecret,
        );
        const otherPurpose = deriveOpaqueRedisKey(
            'languon:auth:v1',
            'webauthn-challenge',
            email,
            hmacSecret,
        );

        expect(first).toBe(repeated);
        expect(first).not.toBe(otherPurpose);
        expect(first).not.toContain(email);
        expect(first).toMatch(/^languon:auth:v1:rate-limit:[a-f0-9]{64}$/);
    });

    it('rejects weak key material and unbounded connection policies', () => {
        expect(() =>
            deriveOpaqueRedisKey(
                'languon:auth:v1',
                'rate-limit',
                'subject',
                'too-short',
            ),
        ).toThrow('at least 32 bytes');
        expect(() =>
            createAuthenticationRedisClient({
                maxRetriesPerRequest: 4,
                url: 'redis://127.0.0.1:1',
            }),
        ).toThrow('Redis request retries');
    });

    it('configures finite connection, command, and request retries', () => {
        const client = createAuthenticationRedisClient({
            commandTimeoutMs: 75,
            connectTimeoutMs: 80,
            maxConnectionRetries: 0,
            maxRetriesPerRequest: 0,
            url: 'redis://127.0.0.1:1',
        });
        clients.push(client);

        expect(client.options.commandTimeout).toBe(75);
        expect(client.options.connectTimeout).toBe(80);
        expect(client.options.enableOfflineQueue).toBe(false);
        expect(client.options.maxRetriesPerRequest).toBe(0);
        expect(client.options.retryStrategy?.(1)).toBeNull();
    });
});
