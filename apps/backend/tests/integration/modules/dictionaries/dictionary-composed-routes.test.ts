import { randomUUID } from 'node:crypto';

import {
    createDrizzleDatabase,
    type PostgresClient,
    type PostgresJsDatabase,
} from '@languon/database';
import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';

import { databaseSchema } from '../../../../src/infrastructure/database/schema';
import { AuthHttpPolicy } from '../../../../src/modules/authentication/interface/http/auth-http-policy';
import { AccessTokenClaims } from '../../../../src/modules/authentication/domain/access-token-claims';
import { createDictionaryComposition } from '../../../../src/modules/dictionaries/infrastructure/dictionary-composition';
import type { DictionaryDocumentUploadStorage } from '../../../../src/modules/dictionaries/application/ports/dictionary-document-upload-storage';
import { usersTable } from '../../../../src/modules/users/infrastructure/persistence/drizzle/schema';
import { dictionaryGenerationFormat } from '../../../../src/modules/dictionaries/domain/generation';
import { dictionaryDocumentGenerationFormat } from '../../../../src/modules/dictionaries/domain/document-ingestion';
import {
    dictionaryDocumentExtractionsTable,
    dictionaryDocumentObjectVersionsTable,
    dictionaryDocumentUploadsTable,
} from '../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/schema';
import {
    createTestPostgresClient,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';

const run = describe.runIf(isDatabaseIntegrationEnabled());

run('composed dictionary routes', () => {
    let client: PostgresClient;
    let database: PostgresJsDatabase<typeof databaseSchema>;
    let ownerId: string;
    let authenticatedOwnerId: string;

    beforeAll(async () => {
        client = createTestPostgresClient();
        database = createDrizzleDatabase(client, databaseSchema);
        await resetTestDatabase(client);
        await migrateTestDatabase(client);
    });

    beforeEach(async () => {
        await database.delete(usersTable);
        ownerId = randomUUID();
        authenticatedOwnerId = ownerId;
        await database
            .insert(usersTable)
            .values({ id: ownerId, status: 'active' });
    });

    afterAll(async () => client.end());

    afterEach(async () => {
        await database.delete(dictionaryDocumentExtractionsTable);
        await database.delete(dictionaryDocumentObjectVersionsTable);
        await database.delete(dictionaryDocumentUploadsTable);
    });

    function composition(
        overrides: Partial<
            Parameters<typeof createDictionaryComposition>[0]
        > = {},
    ) {
        let entropyByte = 0;
        return createDictionaryComposition({
            accessTokens: {
                sign: async () => 'unused',
                verify: async () =>
                    AccessTokenClaims.issue({
                        audience: 'test',
                        expiresAt: new Date(Date.now() + 60_000),
                        issuedAt: new Date(),
                        issuer: 'test',
                        sessionId: randomUUID(),
                        tokenId: randomUUID(),
                        userId: authenticatedOwnerId,
                    }),
            },
            authentication: {
                requireActiveSession: async () => ({
                    account: {} as never,
                    session: {} as never,
                }),
            },
            clock: { now: () => new Date('2026-08-21T12:00:00.000Z') },
            database,
            entropy: {
                randomBytes: (length) =>
                    new Uint8Array(length).fill((entropyByte += 1)),
            },
            dictionaryHmacSecret:
                'dictionary-route-integration-secret-longer-than-thirty-two-bytes',
            ids: { generate: randomUUID },
            generation: {
                acceptableFormats: [dictionaryGenerationFormat],
                cancellableFormats: [dictionaryGenerationFormat],
                discardableFormats: [dictionaryGenerationFormat],
                enqueuedFormats: [dictionaryGenerationFormat],
                readableFormats: [dictionaryGenerationFormat],
            },
            policy: new AuthHttpPolicy({
                allowedOrigins: ['http://localhost:3333'],
                appEnvironment: 'test',
                refreshTokenTtlSeconds: 3600,
            }),
            rateLimiter: {
                consume: async (request) => ({
                    allowed: true,
                    limit: request.limit,
                    remaining: request.limit - 1,
                    retryAfterSeconds: 1,
                }),
                linkSubject: async () => undefined,
            },
            ...overrides,
        });
    }

    it('mounts document completion across lifecycle-only rollback while disabling new authorization', async () => {
        const headers = {
            Authorization: 'Bearer valid.token.value',
            'Content-Type': 'application/json',
            Origin: 'http://localhost:3333',
        };
        const checksumSha256 = 'a'.repeat(64);
        const storageVersionId = 'version-after-put';
        let putCompleted = false;
        const storage: DictionaryDocumentUploadStorage = {
            authorizeCreate: async () => ({
                method: 'PUT',
                requiredHeaders: { 'content-type': 'text/plain' },
                url: 'https://uploads.example.test/exact',
            }),
            inspectVersions: async (_input) => {
                if (!putCompleted) throw new Error('PUT has not completed.');
                return {
                    detectedFormat: 'txt',
                    observedVersionId: storageVersionId,
                    versions: [
                        {
                            checksumSha256,
                            contentType: 'text/plain',
                            isCurrent: true,
                            kind: 'data',
                            sizeBytes: 12,
                            versionId: storageVersionId,
                        },
                    ],
                };
            },
        };
        const documentLifecycle = {
            acceptableFormats: [dictionaryDocumentGenerationFormat],
            cancellableFormats: [dictionaryDocumentGenerationFormat],
            discardableFormats: [dictionaryDocumentGenerationFormat],
            readableFormats: [dictionaryDocumentGenerationFormat],
        };
        const activated = composition({
            documentUploadAuthorizationEnabled: true,
            documentUploadStorage: storage,
            generation: {
                ...documentLifecycle,
                documentOcrAvailable: false,
                enqueuedFormats: [dictionaryDocumentGenerationFormat],
            },
        });
        const created = await activated.routes.request('/dictionaries', {
            body: JSON.stringify({
                name: 'Document rollback dictionary',
                sourceLanguage: 'en',
                targetLanguage: 'fr',
            }),
            headers: {
                ...headers,
                'Idempotency-Key': `dictionary-route-${randomUUID()}`,
            },
            method: 'POST',
        });
        const createdBody = (await created.json()) as {
            dictionary: {
                id: string;
                settings: { version: number };
                version: number;
            };
        };
        const uploadRequest = {
            expectedDictionaryVersion: createdBody.dictionary.version,
            expectedSettingsVersion: createdBody.dictionary.settings.version,
            instruction: null,
            mediaType: 'text/plain',
            sha256: checksumSha256,
            sizeBytes: 12,
        };
        const authorized = await activated.routes.request(
            `/dictionaries/${createdBody.dictionary.id}/document-uploads`,
            {
                body: JSON.stringify(uploadRequest),
                headers: {
                    ...headers,
                    'Idempotency-Key': `document-route-${randomUUID()}`,
                },
                method: 'POST',
            },
        );
        expect(authorized.status).toBe(202);
        const authorizedBody = (await authorized.json()) as {
            upload: { id: string; method: string };
        };
        expect(authorizedBody.upload.method).toBe('PUT');
        putCompleted = true;

        const lifecycleOnly = composition({
            documentUploadAuthorizationEnabled: false,
            documentUploadStorage: storage,
            generation: {
                ...documentLifecycle,
                documentOcrAvailable: false,
                enqueuedFormats: [],
            },
        });
        const unavailable = await lifecycleOnly.routes.request(
            `/dictionaries/${createdBody.dictionary.id}/document-uploads`,
            {
                body: JSON.stringify(uploadRequest),
                headers: {
                    ...headers,
                    'Idempotency-Key': `document-route-${randomUUID()}`,
                },
                method: 'POST',
            },
        );
        expect(unavailable.status).toBe(503);
        await expect(unavailable.json()).resolves.toMatchObject({
            error: { code: 'generation_not_available' },
        });

        const completed = await lifecycleOnly.routes.request(
            `/dictionary-document-uploads/${authorizedBody.upload.id}/complete`,
            {
                body: JSON.stringify({ versionId: storageVersionId }),
                headers,
                method: 'POST',
            },
        );
        const completedBody = await completed.clone().json();
        expect(completed.status, JSON.stringify(completedBody)).toBe(200);
        await expect(completed.json()).resolves.toMatchObject({
            job: { state: 'queued' },
        });
    });

    it('enqueues, discovers, reads, and cooperatively cancels a persisted generation job', async () => {
        const dictionaryComposition = composition();
        const headers = {
            Authorization: 'Bearer valid.token.value',
            'Content-Type': 'application/json',
            Origin: 'http://localhost:3333',
        };
        const capabilities = await dictionaryComposition.routes.request(
            '/dictionary-generation-capabilities',
            { headers },
        );
        expect(capabilities.status).toBe(200);
        await expect(capabilities.json()).resolves.toEqual({
            documentOcr: { available: false },
            documentTermsGeneration: { available: false },
            importPairsGeneration: { available: false },
            pastedTermsGeneration: { available: false },
            singleCardGeneration: { available: true },
        });
        const created = await dictionaryComposition.routes.request(
            '/dictionaries',
            {
                body: JSON.stringify({
                    name: 'Generation route dictionary',
                    sourceLanguage: 'en',
                    targetLanguage: 'fr',
                }),
                headers: {
                    ...headers,
                    'Idempotency-Key': `dictionary-route-${randomUUID()}`,
                },
                method: 'POST',
            },
        );
        const dictionary = (await created.json()) as {
            dictionary: {
                id: string;
                settings: { version: number };
                version: number;
            };
        };
        const cardResponse = await dictionaryComposition.routes.request(
            `/dictionaries/${dictionary.dictionary.id}/cards`,
            {
                body: JSON.stringify({
                    expectedDictionaryVersion: dictionary.dictionary.version,
                    expectedSettingsVersion:
                        dictionary.dictionary.settings.version,
                    values: { source: 'hello', translation: 'bonjour' },
                }),
                headers,
                method: 'POST',
            },
        );
        const card = (await cardResponse.json()) as {
            card: { id: string; version: number };
            dictionaryVersion: number;
        };
        const enqueued = await dictionaryComposition.routes.request(
            `/dictionaries/${dictionary.dictionary.id}/cards/${card.card.id}/generations`,
            {
                body: JSON.stringify({
                    expectedCardVersion: card.card.version,
                    expectedDictionaryVersion: card.dictionaryVersion,
                    expectedSettingsVersion:
                        dictionary.dictionary.settings.version,
                    instruction: 'Improve articles',
                }),
                headers: {
                    ...headers,
                    'Idempotency-Key': `generation-route-${randomUUID()}`,
                },
                method: 'POST',
            },
        );
        expect(enqueued.status).toBe(202);
        const enqueuedBody = (await enqueued.json()) as {
            job: { id: string; state: string };
        };
        expect(enqueuedBody.job.state).toBe('queued');

        const latest = await dictionaryComposition.routes.request(
            `/dictionaries/${dictionary.dictionary.id}/cards/${card.card.id}/generations/latest`,
            { headers },
        );
        await expect(latest.json()).resolves.toMatchObject({
            job: { id: enqueuedBody.job.id, state: 'queued' },
        });
        const cancelled = await dictionaryComposition.routes.request(
            `/dictionary-generation-jobs/${enqueuedBody.job.id}/cancel`,
            { body: '{}', headers, method: 'POST' },
        );
        expect(cancelled.status).toBe(200);
        await expect(cancelled.json()).resolves.toMatchObject({
            job: {
                cancellationRequested: true,
                id: enqueuedBody.job.id,
                state: 'cancelled',
            },
        });
    });

    it('runs owner create/read through composed auth, rate-limit, HTTP, application, and PostgreSQL boundaries', async () => {
        const dictionaryComposition = composition();
        const headers = {
            Authorization: 'Bearer valid.token.value',
            'Content-Type': 'application/json',
            'Idempotency-Key': `dictionary-route-${randomUUID()}`,
            Origin: 'http://localhost:3333',
        };
        const created = await dictionaryComposition.routes.request(
            '/dictionaries',
            {
                body: JSON.stringify({
                    name: 'Route dictionary',
                    sourceLanguage: 'en',
                    targetLanguage: 'fr',
                }),
                headers,
                method: 'POST',
            },
        );
        const createdPayload: unknown = await created.clone().json();
        expect(created.status, JSON.stringify(createdPayload)).toBe(201);
        expect(created.headers.get('access-control-allow-origin')).toBe(
            'http://localhost:3333',
        );
        expect(created.headers.get('cache-control')).toBe('private, no-store');
        const createdBody = (await created.json()) as {
            dictionary: {
                id: string;
                languagePairLocked: boolean;
                version: number;
            };
        };
        expect(createdBody.dictionary.languagePairLocked).toBe(false);

        const read = await dictionaryComposition.routes.request(
            `/dictionaries/${createdBody.dictionary.id}`,
            { headers },
        );
        expect(read.status).toBe(200);
        await expect(read.json()).resolves.toMatchObject({
            dictionary: {
                id: createdBody.dictionary.id,
                name: 'Route dictionary',
                visibility: 'private',
            },
        });
        const maximumOrder = Array.from(
            { length: 10_000 },
            (_, index) =>
                `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        );
        const boundedLargeRequest = await dictionaryComposition.routes.request(
            `/dictionaries/${createdBody.dictionary.id}/cards/reorder`,
            {
                body: JSON.stringify({
                    expectedDictionaryVersion: createdBody.dictionary.version,
                    orderedCardIds: maximumOrder,
                }),
                headers,
                method: 'POST',
            },
        );
        expect(boundedLargeRequest.status).toBe(400);
    });

    it('enforces the complete non-enumerating share and retry-safe fork lifecycle', async () => {
        const dictionaryComposition = composition();
        const ownerHeaders = {
            Authorization: 'Bearer valid.token.value',
            'Content-Type': 'application/json',
            Origin: 'http://localhost:3333',
        };
        const created = await dictionaryComposition.routes.request(
            '/dictionaries',
            {
                body: JSON.stringify({
                    name: 'Shared route dictionary',
                    sourceLanguage: 'en',
                    targetLanguage: 'fr',
                }),
                headers: {
                    ...ownerHeaders,
                    'Idempotency-Key': `dictionary-route-${randomUUID()}`,
                },
                method: 'POST',
            },
        );
        const createdBody = (await created.json()) as {
            dictionary: {
                id: string;
                settings: { version: number };
                version: number;
            };
        };
        const card = await dictionaryComposition.routes.request(
            `/dictionaries/${createdBody.dictionary.id}/cards`,
            {
                body: JSON.stringify({
                    expectedDictionaryVersion: createdBody.dictionary.version,
                    expectedSettingsVersion:
                        createdBody.dictionary.settings.version,
                    values: {
                        source: '<script>alert(1)</script>',
                        translation: 'texte sûr',
                    },
                }),
                headers: ownerHeaders,
                method: 'POST',
            },
        );
        expect(card.status).toBe(201);
        const cardBody = (await card.json()) as { dictionaryVersion: number };
        const rotated = await dictionaryComposition.routes.request(
            `/dictionaries/${createdBody.dictionary.id}/share-key/rotate`,
            {
                body: JSON.stringify({
                    expectedDictionaryVersion: cardBody.dictionaryVersion,
                }),
                headers: ownerHeaders,
                method: 'POST',
            },
        );
        expect(rotated.status).toBe(200);
        const rotatedBody = (await rotated.json()) as {
            capability: { shareId: string; shareKey: string };
            dictionary: { version: number };
        };
        const sharedPath = `/shared/dictionaries/${rotatedBody.capability.shareId}`;
        const shared = await dictionaryComposition.routes.request(sharedPath, {
            headers: {
                'X-Languon-Share-Key': rotatedBody.capability.shareKey,
            },
        });
        expect(shared.status).toBe(200);
        expect(shared.headers.get('cache-control')).toBe('private, no-store');
        expect(shared.headers.get('referrer-policy')).toBe('no-referrer');
        expect(shared.headers.get('x-robots-tag')).toBe('noindex, nofollow');
        const sharedPayload = await shared.json();
        expect(sharedPayload).toMatchObject({
            dictionary: {
                cards: [
                    {
                        values: {
                            source: '<script>alert(1)</script>',
                            translation: 'texte sûr',
                        },
                    },
                ],
                visibility: 'unlisted',
            },
            nextCursor: null,
        });
        expect(JSON.stringify(sharedPayload)).not.toContain('ownerId');

        const missing = await dictionaryComposition.routes.request(sharedPath);
        const wrong = await dictionaryComposition.routes.request(sharedPath, {
            headers: { 'X-Languon-Share-Key': 'w'.repeat(43) },
        });
        expect(missing.status).toBe(404);
        expect(wrong.status).toBe(404);
        const missingBody = (await missing.json()) as {
            error: { code: string; message: string };
        };
        const wrongBody = (await wrong.json()) as {
            error: { code: string; message: string };
        };
        expect({
            code: missingBody.error.code,
            message: missingBody.error.message,
        }).toEqual({
            code: wrongBody.error.code,
            message: wrongBody.error.message,
        });

        const readerId = randomUUID();
        await database
            .insert(usersTable)
            .values({ id: readerId, status: 'active' });
        authenticatedOwnerId = readerId;
        const forkKey = `dictionary-fork-${randomUUID()}`;
        const fork = async (body: Record<string, unknown>) =>
            dictionaryComposition.routes.request(`${sharedPath}/fork`, {
                body: JSON.stringify(body),
                headers: {
                    ...ownerHeaders,
                    'Idempotency-Key': forkKey,
                    'X-Languon-Share-Key': rotatedBody.capability.shareKey,
                },
                method: 'POST',
            });
        const firstFork = await fork({ name: 'Private route copy' });
        const replayFork = await fork({ name: 'Private route copy' });
        expect(firstFork.status).toBe(201);
        expect(replayFork.status).toBe(201);
        const firstForkBody = (await firstFork.json()) as {
            dictionary: { id: string; visibility: string };
        };
        const replayForkBody = (await replayFork.json()) as {
            dictionary: { id: string };
        };
        expect(replayForkBody.dictionary.id).toBe(firstForkBody.dictionary.id);
        expect(firstForkBody.dictionary.visibility).toBe('private');
        expect((await fork({ name: 'Different payload' })).status).toBe(409);

        authenticatedOwnerId = ownerId;
        const rerotated = await dictionaryComposition.routes.request(
            `/dictionaries/${createdBody.dictionary.id}/share-key/rotate`,
            {
                body: JSON.stringify({
                    expectedDictionaryVersion: rotatedBody.dictionary.version,
                }),
                headers: ownerHeaders,
                method: 'POST',
            },
        );
        expect(rerotated.status).toBe(200);
        authenticatedOwnerId = readerId;
        const replayAfterRotation = await fork({ name: 'Private route copy' });
        expect(replayAfterRotation.status).toBe(201);
        expect(
            (
                (await replayAfterRotation.json()) as {
                    dictionary: { id: string };
                }
            ).dictionary.id,
        ).toBe(firstForkBody.dictionary.id);
        expect((await fork({ name: 'Different payload' })).status).toBe(409);
        authenticatedOwnerId = ownerId;
        expect(
            (
                await dictionaryComposition.routes.request(sharedPath, {
                    headers: {
                        'X-Languon-Share-Key': rotatedBody.capability.shareKey,
                    },
                })
            ).status,
        ).toBe(404);
        const rerotatedBody = (await rerotated.json()) as {
            capability: { shareId: string; shareKey: string };
            dictionary: { version: number };
        };
        const archived = await dictionaryComposition.routes.request(
            `/dictionaries/${createdBody.dictionary.id}/archive`,
            {
                body: JSON.stringify({
                    expectedDictionaryVersion: rerotatedBody.dictionary.version,
                }),
                headers: ownerHeaders,
                method: 'POST',
            },
        );
        expect(archived.status).toBe(200);
        authenticatedOwnerId = readerId;
        const replayAfterArchive = await fork({ name: 'Private route copy' });
        expect(replayAfterArchive.status).toBe(201);
        expect(
            (
                (await replayAfterArchive.json()) as {
                    dictionary: { id: string };
                }
            ).dictionary.id,
        ).toBe(firstForkBody.dictionary.id);
        authenticatedOwnerId = ownerId;
        expect(
            (
                await dictionaryComposition.routes.request(
                    `/shared/dictionaries/${rerotatedBody.capability.shareId}`,
                    {
                        headers: {
                            'X-Languon-Share-Key':
                                rerotatedBody.capability.shareKey,
                        },
                    },
                )
            ).status,
        ).toBe(404);
    });
});
