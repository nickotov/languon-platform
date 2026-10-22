import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { RedisRateLimiter } from '../../../../src/modules/authentication/infrastructure/rate-limit/redis-rate-limiter';
import {
    createAuthenticationRedisClient,
    type AuthenticationRedisClient,
} from '../../../../src/modules/authentication/infrastructure/rate-limit/bounded-redis-client';
import { RedisGenerationBurstLimiter } from '../../../../src/modules/text-ai/infrastructure/generation-burst-limiter';
import { TextsJobService } from '../../../../src/modules/texts/application/texts-job-service';
import type { TextsJobStore } from '../../../../src/modules/texts/application/ports/texts-job-store';
import { createTextsJobRoutes } from '../../../../src/modules/texts/interface/http/texts-job.routes';
import { SpeechService } from '../../../../src/modules/speech/application/speech-service';
import type {
    AudioObjectStorage,
    SpeechStore,
} from '../../../../src/modules/speech/application/ports';
import { createSpeechRoutes } from '../../../../src/modules/speech/interface/http/speech.routes';
import { AuthHttpPolicy } from '../../../../src/modules/authentication/interface/http/auth-http-policy';
import {
    createTestRedisClient,
    deleteNamespacedKeys,
    redisIntegrationEnabled,
    uniqueAuthRedisNamespace,
} from '../../support/test-redis';

const policy = new AuthHttpPolicy({
    allowedOrigins: ['http://localhost:3333'],
    appEnvironment: 'test',
    refreshTokenTtlSeconds: 3600,
});
const secret = 'disposable-generation-burst-secret-32-bytes';
describe.runIf(redisIntegrationEnabled)(
    'real Redis protects generation database admission',
    () => {
        let redis: AuthenticationRedisClient;
        const namespaces = new Set<string>();
        beforeAll(async () => {
            redis = createTestRedisClient();
            await redis.connect();
        });
        afterAll(async () => {
            for (const namespace of namespaces)
                await deleteNamespacedKeys(redis, namespace);
            await redis.quit();
        });
        function limiter() {
            const namespace = uniqueAuthRedisNamespace('generation-burst');
            namespaces.add(namespace);
            return new RedisGenerationBurstLimiter(
                new RedisRateLimiter({ redis, namespace, hmacSecret: secret }),
            );
        }
        function apps(burstLimiter: RedisGenerationBurstLimiter) {
            const enqueue = vi.fn(async () => ({ state: 'queued' }));
            const resolve = vi.fn(async () => ({
                text: 'hello',
                language: 'en',
                revision: '1',
            }));
            const prepare = vi.fn(async () => ({ state: 'queued' }));
            const confirm = vi.fn(async () => ({ state: 'queued' }));
            return {
                enqueue,
                resolve,
                prepare,
                confirm,
                text: createTextsJobRoutes({
                    policy,
                    service: new TextsJobService({
                        burstLimiter,
                        enabled: true,
                        clock: { now: () => new Date() },
                        authenticate: async () => ({ userId: 'actor' }),
                        store: { enqueue } as unknown as TextsJobStore,
                    }),
                }),
                speech: createSpeechRoutes({
                    policy,
                    authenticate: async () => 'actor',
                    service: new SpeechService({
                        burstLimiter,
                        resolver: { resolve },
                        store: { prepare, confirm } as unknown as SpeechStore,
                        storage: {} as AudioObjectStorage,
                    }),
                }),
            };
        }
        const source = () => ({
            kind: 'dictionary-field',
            access: { kind: 'owner', dictionaryId: randomUUID() },
            cardId: randomUUID(),
            field: 'source',
        });
        function request(body: unknown) {
            return {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer header.payload.signature',
                },
                body: JSON.stringify(body),
            };
        }
        it.each(['text', 'prepare', 'confirm'] as const)(
            'admits only ten of 100 concurrent %s POSTs before resolver/store work',
            async (capability) => {
                const f = apps(limiter());
                const responses = await Promise.all(
                    Array.from({ length: 100 }, () =>
                        capability === 'text'
                            ? f.text.request(
                                  '/texts/ai/detection',
                                  request({
                                      folderId: randomUUID(),
                                      sourceText: 'Hello.',
                                      operationId: randomUUID(),
                                  }),
                              )
                            : f.speech.request(
                                  `/speech/${capability}`,
                                  request(
                                      capability === 'prepare'
                                          ? {
                                                source: source(),
                                                operationId: randomUUID(),
                                            }
                                          : {
                                                quoteId: randomUUID(),
                                                operationId: randomUUID(),
                                            },
                                  ),
                              ),
                    ),
                );
                expect(responses.filter((r) => r.status === 429)).toHaveLength(
                    90,
                );
                expect(
                    responses.filter((r) => r.status >= 200 && r.status < 300),
                ).toHaveLength(10);
                expect(
                    capability === 'text'
                        ? f.enqueue
                        : capability === 'prepare'
                          ? f.prepare
                          : f.confirm,
                ).toHaveBeenCalledTimes(10);
                expect(f.resolve).toHaveBeenCalledTimes(
                    capability === 'prepare' ? 10 : 0,
                );
            },
        );
        it('isolates account and capability limits and never keys by caller operation id', async () => {
            const burst = limiter();
            for (let index = 0; index < 10; index++)
                expect(
                    await burst.consume({
                        actorId: 'first',
                        capability: 'text-detection',
                    }),
                ).toEqual({ allowed: true });
            expect(
                await burst.consume({
                    actorId: 'first',
                    capability: 'text-detection',
                }),
            ).toEqual({ allowed: false });
            for (const capability of [
                'text-translation',
                'speech-prepare',
                'speech-confirm',
            ] as const)
                expect(
                    await burst.consume({ actorId: 'first', capability }),
                ).toEqual({ allowed: true });
            expect(
                await burst.consume({
                    actorId: 'second',
                    capability: 'text-detection',
                }),
            ).toEqual({ allowed: true });
        });
        it('fails closed before all generation store/resolver work with an unavailable Redis endpoint', async () => {
            const unavailable = createAuthenticationRedisClient({
                url: 'redis://127.0.0.1:1/4',
                commandTimeoutMs: 50,
                connectTimeoutMs: 50,
                maxConnectionRetries: 0,
            });
            try {
                const f = apps(
                    new RedisGenerationBurstLimiter(
                        new RedisRateLimiter({
                            redis: unavailable,
                            hmacSecret: secret,
                            requestTimeoutMs: 100,
                        }),
                    ),
                );
                expect(
                    (
                        await f.text.request(
                            '/texts/ai/detection',
                            request({
                                folderId: randomUUID(),
                                sourceText: 'Hello.',
                                operationId: randomUUID(),
                            }),
                        )
                    ).status,
                ).toBe(503);
                expect(
                    (
                        await f.speech.request(
                            '/speech/prepare',
                            request({
                                source: source(),
                                operationId: randomUUID(),
                            }),
                        )
                    ).status,
                ).toBe(503);
                expect(
                    (
                        await f.speech.request(
                            '/speech/confirm',
                            request({
                                quoteId: randomUUID(),
                                operationId: randomUUID(),
                            }),
                        )
                    ).status,
                ).toBe(503);
                expect(f.enqueue).not.toHaveBeenCalled();
                expect(f.resolve).not.toHaveBeenCalled();
                expect(f.prepare).not.toHaveBeenCalled();
                expect(f.confirm).not.toHaveBeenCalled();
            } finally {
                unavailable.disconnect(false);
            }
        });
    },
);
