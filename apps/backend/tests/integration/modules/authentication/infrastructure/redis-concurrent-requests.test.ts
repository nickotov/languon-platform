import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { RateLimitUnavailableError } from '../../../../../src/modules/authentication/application/ports/rate-limiter';
import {
    createAuthenticationRedisClient,
    deriveOpaqueRedisKey,
    type AuthenticationRedisClient,
} from '../../../../../src/modules/authentication/infrastructure/rate-limit/bounded-redis-client';
import { RedisRateLimiter } from '../../../../../src/modules/authentication/infrastructure/rate-limit/redis-rate-limiter';
import { ConversationService } from '../../../../../src/modules/conversations/application/conversation-service';
import {
    createTestRedisClient,
    deleteNamespacedKeys,
    redisIntegrationEnabled,
    uniqueAuthRedisNamespace,
} from '../../../support/test-redis';

const secret = 'disposable-concurrent-lease-hmac-secret-32-bytes';
function latch() {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
        release = resolve;
    });
    return { promise, release };
}
describe.runIf(redisIntegrationEnabled)(
    'shared Redis concurrent request leases',
    () => {
        let first: AuthenticationRedisClient, second: AuthenticationRedisClient;
        const namespaces = new Set<string>();
        beforeAll(async () => {
            first = createTestRedisClient();
            second = createTestRedisClient();
            await Promise.all([first.connect(), second.connect()]);
        });
        afterAll(async () => {
            for (const namespace of namespaces)
                await deleteNamespacedKeys(first, namespace);
            await Promise.all([first.quit(), second.quit()]);
        });
        function fixtures(label: string) {
            const namespace = uniqueAuthRedisNamespace(label);
            namespaces.add(namespace);
            const options = { namespace, hmacSecret: secret };
            const request = {
                scope: 'contextual-assistant-streams',
                subject: 'private-actor-binding',
                limit: 8,
                ttlMs: 300_000,
            };
            return {
                namespace,
                request,
                key: deriveOpaqueRedisKey(
                    namespace,
                    'concurrent-request',
                    `${request.scope}\0${request.subject}`,
                    secret,
                ),
                left: new RedisRateLimiter({ ...options, redis: first }),
                right: new RedisRateLimiter({ ...options, redis: second }),
            };
        }
        it('atomically enforces eight across two replica clients and isolates actors with opaque keys', async () => {
            const { left, right, request, namespace, key } =
                fixtures('shared-cap');
            const serviceLeft = new ConversationService(
                {} as never,
                async () => ({ userId: request.subject }),
                left,
                left,
            );
            const serviceRight = new ConversationService(
                {} as never,
                async () => ({ userId: request.subject }),
                right,
                right,
            );
            const decisions = await Promise.allSettled(
                Array.from({ length: 9 }, (_, index) =>
                    (index % 2 ? serviceLeft : serviceRight).admitStream(
                        { ownerId: request.subject },
                        new AbortController().signal,
                    ),
                ),
            );
            const leases = decisions.flatMap((decision) =>
                decision.status === 'fulfilled' ? [decision.value] : [],
            );
            expect(leases).toHaveLength(8);
            expect(
                decisions.find((decision) => decision.status === 'rejected'),
            ).toMatchObject({ reason: { code: 'capacity_unavailable' } });
            expect(await first.zcard(key)).toBe(8);
            expect(await first.pttl(key)).toBeGreaterThan(240_000);
            expect(await first.pttl(key)).toBeLessThanOrEqual(300_000);
            const other = await serviceRight.admitStream(
                { ownerId: 'different-private-actor' },
                new AbortController().signal,
            );
            expect(other).not.toBeNull();
            const keys = await first.keys(`${namespace}:*`);
            expect(
                keys.filter((value) => value.includes(':concurrent-request:')),
            ).toHaveLength(2);
            expect(
                keys.every(
                    (value) =>
                        !value.includes(request.subject) &&
                        !value.includes('different-private-actor'),
                ),
            ).toBe(true);
            const existing = leases.find(Boolean)!;
            await Promise.all([existing.release(), existing.release()]);
            const replacement = await right.acquireLease(request);
            expect(replacement).not.toBeNull();
            await existing.release();
            expect(await left.acquireLease(request)).toBeNull();
            expect(await first.zcard(key)).toBe(8);
            await Promise.all([
                ...leases
                    .filter((lease) => lease !== null)
                    .map((lease) => lease.release()),
                replacement!.release(),
                other!.release(),
            ]);
        });
        it('expires an abandoned lease and prevents its stale release from erasing a replacement', async () => {
            const { left, right, request, key } = fixtures('crash-ttl');
            const short = { ...request, limit: 1, ttlMs: 1000 };
            const abandoned = (await left.acquireLease(short))!;
            expect(await right.acquireLease(short)).toBeNull();
            expect(await first.pttl(key)).toBeGreaterThan(0);
            await new Promise((resolve) => setTimeout(resolve, 1100));
            const replacement = await right.acquireLease(short);
            expect(replacement).not.toBeNull();
            await abandoned.release();
            expect(await first.zcard(key)).toBe(1);
            expect(await left.acquireLease(short)).toBeNull();
            await replacement!.release();
            expect(await left.acquireLease(short)).not.toBeNull();
        });
        it('cleans its token when abort happens after Redis admission commits but before its reply arrives', async () => {
            const { left, request, key } = fixtures('committed-abort');
            const committed = latch(),
                deliver = latch();
            const original = first.eval.bind(first);
            const instrumented = vi
                .spyOn(first, 'eval')
                .mockImplementation(
                    async (
                        ...arguments_: Parameters<
                            AuthenticationRedisClient['eval']
                        >
                    ) => {
                        const result = await original(...arguments_);
                        if (
                            String(arguments_[0]).includes(
                                'now + tonumber(ARGV[2])',
                            )
                        ) {
                            committed.release();
                            await deliver.promise;
                        }
                        return result;
                    },
                );
            const controller = new AbortController();
            try {
                const pending = left.acquireLease({
                    ...request,
                    signal: controller.signal,
                });
                const rejected = expect(pending).rejects.toMatchObject({
                    name: 'AbortError',
                });
                await committed.promise;
                expect(await first.zcard(key)).toBe(1);
                controller.abort();
                await rejected;
                expect(await first.zcard(key)).toBe(0);
            } finally {
                deliver.release();
                instrumented.mockRestore();
            }
        });
        it('executes token-scoped release with the canonical restricted production ACL commands', async () => {
            const policy = await readFile(
                new URL(
                    '../../../../../../../infra/deploy/redis.production.acl.example',
                    import.meta.url,
                ),
                'utf8',
            );
            const appPolicy = policy
                .split('\n')
                .find((line) => line.startsWith('user languon_app '))!
                .split(/\s+/u);
            const permissions = appPolicy.filter(
                (value) => value.startsWith('+') || value.startsWith('~'),
            );
            const user = `lease-test-${randomUUID().replaceAll('-', '')}`,
                password = randomUUID();
            const namespace = `languon:auth:v1:lease-acl-${randomUUID().replaceAll('-', '')}`;
            const url = new URL(process.env.AUTH_TEST_REDIS_URL!);
            url.pathname = '/0';
            const cleanup = createAuthenticationRedisClient({
                url: url.toString(),
            });
            url.username = user;
            url.password = password;
            const restricted = createAuthenticationRedisClient({
                url: url.toString(),
            });
            await first.acl(
                'SETUSER',
                user,
                'on',
                `>${password}`,
                ...permissions,
            );
            try {
                await Promise.all([cleanup.connect(), restricted.connect()]);
                const limiter = new RedisRateLimiter({
                    redis: restricted,
                    namespace,
                    hmacSecret: secret,
                });
                const request = {
                    scope: 'stream-acl-test',
                    subject: 'synthetic-actor',
                    limit: 1,
                    ttlMs: 300_000,
                };
                const lease = await limiter.acquireLease(request);
                expect(lease).not.toBeNull();
                expect(await limiter.acquireLease(request)).toBeNull();
                await lease!.release();
                const replacement = await limiter.acquireLease(request);
                expect(replacement).not.toBeNull();
                await replacement!.release();
                await expect(restricted.flushall()).rejects.toThrow(/NOPERM/);
            } finally {
                await deleteNamespacedKeys(cleanup, namespace);
                restricted.disconnect(false);
                cleanup.disconnect(false);
                await first.acl('DELUSER', user);
            }
        });
        it('does not admit when Redis is unavailable or the caller is already aborted', async () => {
            const unavailable = createAuthenticationRedisClient({
                url: 'redis://127.0.0.1:1/4',
                connectTimeoutMs: 50,
                commandTimeoutMs: 50,
                maxConnectionRetries: 0,
            });
            const { left, request, key } = fixtures('unavailable');
            try {
                const limiter = new RedisRateLimiter({
                    redis: unavailable,
                    hmacSecret: secret,
                    requestTimeoutMs: 100,
                });
                await expect(
                    limiter.acquireLease(request),
                ).rejects.toBeInstanceOf(RateLimitUnavailableError);
            } finally {
                unavailable.disconnect(false);
            }
            const controller = new AbortController();
            controller.abort();
            await expect(
                left.acquireLease({ ...request, signal: controller.signal }),
            ).rejects.toMatchObject({ name: 'AbortError' });
            expect(await first.zcard(key)).toBe(0);
        });
    },
);
