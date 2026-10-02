import { randomUUID } from 'node:crypto';
// @user-flow-revision flashcard-training-backend sha256:4a4c05b26fc6dd4e
import {
    AuthenticationSuccessResponseSchema,
    DictionaryResponseSchema,
    DictionaryCardResponseSchema,
    FlashcardAttemptResponseSchema,
    FlashcardItemsResponseSchema,
    FlashcardPreferencesSchema,
    FlashcardPrepareResponseSchema,
    FlashcardProgressResponseSchema,
    FlashcardUndoResponseSchema,
    LearningErrorResponseSchema,
    SignUpResponseSchema,
} from '@languon/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../../../src/app';
import { loadEnvironment } from '../../../../src/config/environment';
import {
    createAuthenticationComposition,
    type AuthenticationComposition,
} from '../../../../src/modules/authentication/infrastructure/authentication-composition';
import { createDictionaryComposition } from '../../../../src/modules/dictionaries/infrastructure/dictionary-composition';
import { createLearningComposition } from '../../../../src/modules/learning/infrastructure/learning-composition';
import {
    createTestPostgresClient,
    getTestDatabaseUrl,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';
import {
    createTestRedisClient,
    deleteNamespacedKeys,
    redisIntegrationEnabled,
    uniqueAuthRedisNamespace,
} from '../../support/test-redis';

const run = describe.runIf(
    isDatabaseIntegrationEnabled() && redisIntegrationEnabled,
);
const origin = 'http://localhost:3333';
const dictionaryHmacSecret = 'learning-http-dictionary-secret-forty-bytes-cccc';
const configuration = { front: ['targetExample'], back: ['sourceExample'] };
// These exercise real Argon2 authentication, JWT, OpenAPI and PostgreSQL/Redis
// composition; allow cold infrastructure/CPU contention without weakening assertions.
const journeyTimeoutMs = 30_000;

run('real composed flashcard HTTP journeys', () => {
    let authentication: AuthenticationComposition;
    let app: ReturnType<typeof createApp>;
    let ownerToken: string;
    const namespace = uniqueAuthRedisNamespace('learning-journey');

    beforeAll(async () => {
        // Guard both disposable targets before any schema reset or Redis use.
        const redisGuard = createTestRedisClient();
        await redisGuard.connect();
        await redisGuard.quit();
        const database = createTestPostgresClient();
        await resetTestDatabase(database);
        await migrateTestDatabase(database);
        await database.end();
        authentication = await createAuthenticationComposition(
            loadEnvironment({
                APP_ENV: 'test',
                NODE_ENV: 'test',
                AUTH_ALLOWED_ORIGINS: origin,
                AUTH_CODE_HMAC_SECRET:
                    'learning-http-code-secret-forty-bytes-aaaaaaaa',
                AUTH_JWT_SECRET:
                    'learning-http-jwt-secret-forty-bytes-bbbbbbbb',
                DICTIONARY_HMAC_SECRET: dictionaryHmacSecret,
                AUTH_WEBAUTHN_RP_ID: 'localhost',
                AUTH_REDIS_NAMESPACE: namespace,
                DATABASE_URL: getTestDatabaseUrl(),
                REDIS_URL: process.env.AUTH_TEST_REDIS_URL,
            }),
        );
        const dependencies = {
            ...authentication.productDependencies,
            dictionaryHmacSecret,
            policy: authentication.options.policy,
        };
        app = createApp({
            authentication: authentication.options,
            dictionaries: createDictionaryComposition(dependencies).routes,
            learning: createLearningComposition({
                ...dependencies,
                enabled: true,
            }).routes,
        });
        ownerToken = await signup('learning-owner');
    });

    afterAll(async () => {
        await authentication?.close();
        const redis = createTestRedisClient();
        await redis.connect();
        await deleteNamespacedKeys(redis, namespace);
        await redis.quit();
    });

    async function request(
        path: string,
        options: {
            method?: string;
            body?: unknown;
            token?: string;
            shareKey?: string;
            idempotency?: boolean;
        } = {},
    ) {
        return app.request(path, {
            method: options.method ?? 'GET',
            ...(options.body === undefined
                ? {}
                : { body: JSON.stringify(options.body) }),
            headers: {
                Origin: origin,
                'Content-Type': 'application/json',
                ...(options.token
                    ? { Authorization: `Bearer ${options.token}` }
                    : {}),
                ...(options.shareKey
                    ? { 'X-Languon-Share-Key': options.shareKey }
                    : {}),
                ...(options.idempotency
                    ? { 'Idempotency-Key': randomUUID() }
                    : {}),
            },
        });
    }
    async function signup(label: string) {
        const signupResponse = await request('/auth/sign-up', {
            method: 'POST',
            body: {
                email: `${label}-${randomUUID()}@example.test`,
                password: 'A safe learning password 47!',
            },
        });
        expect(signupResponse.status).toBe(202);
        const flowId = SignUpResponseSchema.parse(await signupResponse.json())
            .verification.flowId;
        const verified = await request('/auth/email-verification/verify', {
            method: 'POST',
            body: { code: '0000', flowId },
        });
        expect(verified.status).toBe(200);
        return AuthenticationSuccessResponseSchema.parse(await verified.json())
            .accessToken;
    }
    async function dictionary() {
        const created = await request('/dictionaries', {
            method: 'POST',
            token: ownerToken,
            idempotency: true,
            body: {
                name: 'Learning journey dictionary',
                sourceLanguage: 'en',
                targetLanguage: 'fr',
            },
        });
        expect(created.status).toBe(201);
        const current = DictionaryResponseSchema.parse(
            await created.json(),
        ).dictionary;
        const card = await request(`/dictionaries/${current.id}/cards`, {
            method: 'POST',
            token: ownerToken,
            body: {
                expectedDictionaryVersion: current.version,
                expectedSettingsVersion: current.settings.version,
                values: { source: 'book', translation: 'livre' },
            },
        });
        expect(card.status).toBe(201);
        const body = (await card.json()) as {
            card: { id: string };
            dictionaryVersion: number;
        };
        return {
            id: current.id,
            entryId: body.card.id,
            version: body.dictionaryVersion,
        };
    }
    async function share(current: Awaited<ReturnType<typeof dictionary>>) {
        const rotated = await request(
            `/dictionaries/${current.id}/share-key/rotate`,
            {
                method: 'POST',
                token: ownerToken,
                body: { expectedDictionaryVersion: current.version },
            },
        );
        expect(rotated.status).toBe(200);
        return (await rotated.json()) as {
            capability: { shareId: string; shareKey: string };
            dictionary: { version: number };
        };
    }
    const attempt = (entryId: string, rating: 'known' | 'again' = 'known') => ({
        operationId: randomUUID(),
        sessionId: randomUUID(),
        entryId,
        expectedLearningVersion: 1,
        round: 1,
        rating,
        configuration,
    });

    // @user-flow flashcard-training-backend/owner-rates-replays-and-undo
    it(
        'owner saves preferences, prepares cards, rates retry-safely and undoes through real HTTP and auth',
        async () => {
            const openapi = await request('/openapi.json');
            expect(openapi.status).toBe(200);
            const document = (await openapi.json()) as {
                paths: Record<string, unknown>;
            };
            expect(
                document.paths[
                    '/learning/dictionaries/{dictionaryId}/flashcards/attempts'
                ],
            ).toBeDefined();
            const current = await dictionary();
            const prefix = `/learning/dictionaries/${current.id}`;
            const initial = await request(`${prefix}/flashcards/preferences`, {
                token: ownerToken,
            });
            expect(initial.status).toBe(200);
            expect(
                FlashcardPreferencesSchema.parse(await initial.json()).version,
            ).toBe(0);
            const preferenceBody = {
                configuration,
                shuffle: true,
                expectedVersion: 0,
            };
            const saved = await request(`${prefix}/flashcards/preferences`, {
                method: 'PUT',
                token: ownerToken,
                body: preferenceBody,
            });
            expect(saved.status).toBe(200);
            expect(
                FlashcardPreferencesSchema.parse(await saved.json()).version,
            ).toBe(1);
            expect(
                (
                    await request(`${prefix}/flashcards/preferences`, {
                        method: 'PUT',
                        token: ownerToken,
                        body: preferenceBody,
                    })
                ).status,
            ).toBe(409);
            const prepared = await request(`${prefix}/flashcards/prepare`, {
                method: 'POST',
                token: ownerToken,
                body: { configuration, scope: { type: 'all' } },
            });
            expect(prepared.status).toBe(200);
            expect(
                FlashcardPrepareResponseSchema.parse(await prepared.json()),
            ).toMatchObject({
                entryIds: [current.entryId],
                eligibleCount: 1,
                skippedCount: 0,
                fallbackCount: 1,
            });
            const items = await request(`${prefix}/flashcards/items`, {
                method: 'POST',
                token: ownerToken,
                body: { configuration, entryIds: [current.entryId] },
            });
            expect(items.status).toBe(200);
            expect(
                FlashcardItemsResponseSchema.parse(await items.json()).items[0]
                    ?.front[0],
            ).toMatchObject({ text: 'livre', fallback: true });
            const body = attempt(current.entryId);
            const rated = await request(`${prefix}/flashcards/attempts`, {
                method: 'POST',
                token: ownerToken,
                body,
            });
            expect(rated.status).toBe(200);
            const result = FlashcardAttemptResponseSchema.parse(
                await rated.json(),
            );
            const replay = await request(`${prefix}/flashcards/attempts`, {
                method: 'POST',
                token: ownerToken,
                body,
            });
            expect(replay.status).toBe(200);
            expect(
                FlashcardAttemptResponseSchema.parse(await replay.json()),
            ).toEqual(result);
            expect(
                (
                    await request(`${prefix}/flashcards/attempts`, {
                        method: 'POST',
                        token: ownerToken,
                        body: { ...body, rating: 'again' },
                    })
                ).status,
            ).toBe(409);
            const progress = await request(`${prefix}/flashcards/progress`, {
                token: ownerToken,
            });
            expect(
                FlashcardProgressResponseSchema.parse(await progress.json()),
            ).toEqual({ total: 1, known: 1, again: 0, unstudied: 0 });
            const undoBody = { operationId: randomUUID() };
            const undoPath = `${prefix}/flashcards/attempts/${result.attemptId}/undo`;
            const undone = await request(undoPath, {
                method: 'POST',
                token: ownerToken,
                body: undoBody,
            });
            expect(undone.status).toBe(200);
            expect(
                FlashcardUndoResponseSchema.parse(await undone.json()).rating,
            ).toBeNull();
            expect(
                (
                    await request(undoPath, {
                        method: 'POST',
                        token: ownerToken,
                        body: undoBody,
                    })
                ).status,
            ).toBe(200);
            const after = await request(`${prefix}/flashcards/progress`, {
                token: ownerToken,
            });
            expect(
                FlashcardProgressResponseSchema.parse(await after.json()),
            ).toEqual({ total: 1, known: 0, again: 0, unstudied: 1 });

            // The entry can disappear after its presentation was loaded. Keep
            // this failure distinguishable from losing the dictionary itself.
            const beforeArchive = await request(
                `${prefix}/flashcards/attempts`,
                {
                    method: 'POST',
                    token: ownerToken,
                    body: attempt(current.entryId),
                },
            );
            expect(beforeArchive.status).toBe(200);
            const latestAttempt = FlashcardAttemptResponseSchema.parse(
                await beforeArchive.json(),
            );
            const cardResponse = await request(
                `/dictionaries/${current.id}/cards/${current.entryId}`,
                { token: ownerToken },
            );
            expect(cardResponse.status).toBe(200);
            const card = DictionaryCardResponseSchema.parse(
                await cardResponse.json(),
            );
            const archived = await request(
                `/dictionaries/${current.id}/cards/${current.entryId}/archive`,
                {
                    method: 'POST',
                    token: ownerToken,
                    body: {
                        expectedDictionaryVersion: card.dictionaryVersion,
                        expectedCardVersion: card.card.version,
                    },
                },
            );
            expect(archived.status).toBe(200);
            const unavailableRequests = [
                {
                    path: `${prefix}/flashcards/attempts`,
                    body: attempt(current.entryId),
                },
                {
                    path: `${prefix}/flashcards/attempts/${latestAttempt.attemptId}/undo`,
                    body: { operationId: randomUUID() },
                },
            ];
            for (const unavailable of unavailableRequests) {
                const response = await request(unavailable.path, {
                    method: 'POST',
                    token: ownerToken,
                    body: unavailable.body,
                });
                expect(response.status).toBe(404);
                expect(
                    LearningErrorResponseSchema.parse(await response.json())
                        .error.code,
                ).toBe('entry_not_found');
            }
            expect(
                (await request(`${prefix}/entries`, { token: ownerToken }))
                    .status,
            ).toBe(200);
            const currentProgress = await request(
                `${prefix}/flashcards/progress`,
                { token: ownerToken },
            );
            expect(currentProgress.status).toBe(200);
            expect(
                FlashcardProgressResponseSchema.parse(
                    await currentProgress.json(),
                ),
            ).toEqual({ total: 0, known: 0, again: 0, unstudied: 0 });
        },
        journeyTimeoutMs,
    );

    // @user-flow flashcard-training-backend/shared-learners-save-independent-progress
    it(
        'shared signed-in learners save independent progress without changing owner progress',
        async () => {
            const current = await dictionary();
            const shared = await share(current);
            const prefix = `/learning/shared-dictionaries/${shared.capability.shareId}`;
            const first = await signup('learning-first');
            const second = await signup('learning-second');
            const firstPreferences = await request(
                `${prefix}/flashcards/preferences`,
                {
                    method: 'PUT',
                    token: first,
                    shareKey: shared.capability.shareKey,
                    body: {
                        configuration: {
                            front: ['translation'],
                            back: ['source'],
                        },
                        shuffle: false,
                        expectedVersion: 0,
                    },
                },
            );
            expect(firstPreferences.status).toBe(200);
            const secondPreferences = await request(
                `${prefix}/flashcards/preferences`,
                {
                    token: second,
                    shareKey: shared.capability.shareKey,
                },
            );
            expect(secondPreferences.status).toBe(200);
            expect(
                FlashcardPreferencesSchema.parse(
                    await secondPreferences.json(),
                ),
            ).toEqual({
                configuration,
                shuffle: true,
                version: 0,
            });
            for (const [token, rating] of [
                [first, 'known'],
                [second, 'again'],
            ] as const) {
                const rated = await request(`${prefix}/flashcards/attempts`, {
                    method: 'POST',
                    token,
                    shareKey: shared.capability.shareKey,
                    body: attempt(current.entryId, rating),
                });
                expect(rated.status).toBe(200);
                const progress = await request(
                    `${prefix}/flashcards/progress`,
                    {
                        token,
                        shareKey: shared.capability.shareKey,
                    },
                );
                expect(progress.status).toBe(200);
                expect(
                    FlashcardProgressResponseSchema.parse(
                        await progress.json(),
                    ),
                ).toMatchObject({
                    total: 1,
                    known: rating === 'known' ? 1 : 0,
                    again: rating === 'again' ? 1 : 0,
                });
            }
            const owner = await request(
                `/learning/dictionaries/${current.id}/flashcards/progress`,
                { token: ownerToken },
            );
            expect(
                FlashcardProgressResponseSchema.parse(await owner.json())
                    .unstudied,
            ).toBe(1);
        },
        journeyTimeoutMs,
    );

    // @user-flow flashcard-training-backend/shared-access-revocation-and-anonymous-no-writes
    it(
        'allows anonymous content only and rejects invalid bearer or revoked capability even on replay',
        async () => {
            const current = await dictionary();
            const shared = await share(current);
            const prefix = `/learning/shared-dictionaries/${shared.capability.shareId}`;
            const credentials = { shareKey: shared.capability.shareKey };
            const content = await request(`${prefix}/flashcards/prepare`, {
                ...credentials,
                method: 'POST',
                body: { configuration, scope: { type: 'all' } },
            });
            expect(content.status).toBe(200);
            expect(content.headers.get('cache-control')).toBe(
                'private, no-store',
            );
            expect(content.headers.get('referrer-policy')).toBe('no-referrer');
            for (const operation of [
                { path: 'preferences', method: 'GET' },
                { path: 'progress', method: 'GET' },
                {
                    path: 'attempts',
                    method: 'POST',
                    body: attempt(current.entryId),
                },
            ])
                expect(
                    (
                        await request(
                            `${prefix}/flashcards/${operation.path}`,
                            {
                                ...credentials,
                                ...operation,
                            },
                        )
                    ).status,
                ).toBe(401);
            expect(
                (
                    await request(`${prefix}/flashcards/items`, {
                        ...credentials,
                        method: 'POST',
                        token: 'invalid.token.value',
                        body: { configuration, entryIds: [current.entryId] },
                    })
                ).status,
            ).toBe(401);
            const anonymousAfter = await request(
                `/learning/dictionaries/${current.id}/flashcards/progress`,
                { token: ownerToken },
            );
            expect(
                FlashcardProgressResponseSchema.parse(
                    await anonymousAfter.json(),
                ),
            ).toEqual({ total: 1, known: 0, again: 0, unstudied: 1 });
            const body = attempt(current.entryId);
            expect(
                (
                    await request(`${prefix}/flashcards/attempts`, {
                        ...credentials,
                        method: 'POST',
                        token: ownerToken,
                        body,
                    })
                ).status,
            ).toBe(200);
            const rotated = await request(
                `/dictionaries/${current.id}/share-key/rotate`,
                {
                    method: 'POST',
                    token: ownerToken,
                    body: {
                        expectedDictionaryVersion: shared.dictionary.version,
                    },
                },
            );
            expect(rotated.status).toBe(200);
            expect(
                (
                    await request(`${prefix}/flashcards/attempts`, {
                        ...credentials,
                        method: 'POST',
                        token: ownerToken,
                        body,
                    })
                ).status,
            ).toBe(404);
            expect(
                (
                    await request(`${prefix}/flashcards/items`, {
                        ...credentials,
                        method: 'POST',
                        body: { configuration, entryIds: [current.entryId] },
                    })
                ).status,
            ).toBe(404);
        },
        journeyTimeoutMs,
    );
});
