import { describe, expect, it, vi } from 'vitest';

import { AuthHttpPolicy } from '../../../../../src/modules/authentication/interface/http/auth-http-policy';
import { DictionaryGenerationService } from '../../../../../src/modules/dictionaries/application/dictionary-generation-service';
import { dictionaryPastedTermsGenerationFormat } from '../../../../../src/modules/dictionaries/domain/generation';
import { createDictionaryGenerationRoutes } from '../../../../../src/modules/dictionaries/interface/http/dictionary-generation.routes';

describe('dictionary generation HTTP routes', () => {
    it('validates and dispatches cardless authoring enqueue', async () => {
        const enqueueCardAuthoring = vi.fn(async () => ({
            cancellationRequested: false,
            completedAt: null,
            createdAt: '2026-08-26T12:00:00.000Z',
            dictionaryId: '2db8e37d-48e9-41ae-af84-4f6cbbc56e57',
            expectedDictionaryVersion: 1,
            expectedSettingsVersion: 1,
            expiresAt: null,
            failure: null,
            format: 'card-authoring:v1' as const,
            id: '225238a3-da7f-4f73-8305-3c012296b757',
            kind: 'card-authoring' as const,
            outcome: null,
            progress: { percent: 0, stage: 'queued' as const },
            proposal: null,
            sourceLanguage: 'en' as const,
            state: 'queued' as const,
            targetLanguage: 'fr' as const,
            updatedAt: '2026-08-26T12:00:00.000Z',
        }));
        const routes = createDictionaryGenerationRoutes({
            policy: new AuthHttpPolicy({
                allowedOrigins: ['http://localhost:3333'],
                appEnvironment: 'test',
                refreshTokenTtlSeconds: 3_600,
            }),
            service: { enqueueCardAuthoring } as never,
        });
        const response = await routes.request(
            '/dictionaries/2db8e37d-48e9-41ae-af84-4f6cbbc56e57/card-authoring-generations',
            {
                body: JSON.stringify({
                    draft: {
                        overrides: {
                            definitionEnabled: null,
                            definitionLanguage: null,
                            exampleEnabled: null,
                            exampleLanguage: null,
                            exampleTranslationEnabled: null,
                            transcriptionCustomLabel: null,
                            transcriptionEnabled: null,
                            transcriptionNotation: null,
                        },
                        values: {
                            definition: null,
                            example: null,
                            exampleTranslation: null,
                            transcription: null,
                            translation: null,
                        },
                    },
                    expectedDictionaryVersion: 1,
                    expectedSettingsVersion: 1,
                    scope: { kind: 'all' },
                    source: 'hello',
                }),
                headers: {
                    Authorization: 'Bearer valid.token.value',
                    'Content-Type': 'application/json',
                    'Idempotency-Key': 'authoring-route-idempotency-key',
                },
                method: 'POST',
            },
        );
        expect(response.status, await response.clone().text()).toBe(202);
        expect(enqueueCardAuthoring).toHaveBeenCalledWith(
            'valid.token.value',
            'authoring-route-idempotency-key',
            '2db8e37d-48e9-41ae-af84-4f6cbbc56e57',
            expect.objectContaining({ source: 'hello' }),
            expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
    });

    it('validates and dispatches dictionary-scoped pasted-term enqueue', async () => {
        const enqueuePastedTerms = vi.fn(async () => ({
            cancellationRequested: false,
            completedAt: null,
            createdAt: '2026-08-25T12:00:00.000Z',
            dictionaryId: '2db8e37d-48e9-41ae-af84-4f6cbbc56e57',
            expectedDictionaryVersion: 1,
            expectedSettingsVersion: 1,
            expiresAt: null,
            failure: null,
            format: 'pasted-terms:v1' as const,
            id: '225238a3-da7f-4f73-8305-3c012296b757',
            kind: 'pasted-terms' as const,
            outcome: null,
            progress: { percent: 0, stage: 'queued' as const },
            proposal: null,
            sourceLanguage: 'en' as const,
            state: 'queued' as const,
            targetLanguage: 'fr' as const,
            updatedAt: '2026-08-25T12:00:00.000Z',
        }));
        const routes = createDictionaryGenerationRoutes({
            policy: new AuthHttpPolicy({
                allowedOrigins: ['http://localhost:3333'],
                appEnvironment: 'test',
                refreshTokenTtlSeconds: 3_600,
            }),
            service: { enqueuePastedTerms } as never,
        });

        const response = await routes.request(
            '/dictionaries/2db8e37d-48e9-41ae-af84-4f6cbbc56e57/batch-generations',
            {
                body: JSON.stringify({
                    context: 'Art vocabulary',
                    expectedDictionaryVersion: 1,
                    expectedSettingsVersion: 1,
                    text: 'canvas\npaint',
                }),
                headers: {
                    Authorization: 'Bearer valid.token.value',
                    'Content-Type': 'application/json',
                    'Idempotency-Key': 'batch-route-idempotency-key',
                },
                method: 'POST',
            },
        );

        expect(response.status, await response.clone().text()).toBe(202);
        expect(enqueuePastedTerms).toHaveBeenCalledWith(
            'valid.token.value',
            'batch-route-idempotency-key',
            '2db8e37d-48e9-41ae-af84-4f6cbbc56e57',
            {
                context: 'Art vocabulary',
                expectedDictionaryVersion: 1,
                expectedSettingsVersion: 1,
                text: 'canvas\npaint',
            },
            expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
    });

    it('rejects domain-bounded pasted rows before persistence dispatch', async () => {
        const enqueuePastedTerms = vi.fn();
        const service = new DictionaryGenerationService({
            authentication: {
                authenticate: async () => ({
                    sessionId: 'session-id',
                    userId: 'owner-id',
                }),
            },
            capabilities: {
                acceptableFormats: [dictionaryPastedTermsGenerationFormat],
                cancellableFormats: [dictionaryPastedTermsGenerationFormat],
                discardableFormats: [dictionaryPastedTermsGenerationFormat],
                enqueuedFormats: [dictionaryPastedTermsGenerationFormat],
                readableFormats: [dictionaryPastedTermsGenerationFormat],
            },
            clock: { now: () => new Date('2026-08-25T12:00:00.000Z') },
            cryptography: { fingerprint: () => 'fingerprint' } as never,
            rateLimiter: { consume: async () => ({ allowed: true }) },
            store: { enqueuePastedTerms } as never,
        });
        const routes = createDictionaryGenerationRoutes({
            policy: new AuthHttpPolicy({
                allowedOrigins: ['http://localhost:3333'],
                appEnvironment: 'test',
                refreshTokenTtlSeconds: 3_600,
            }),
            service,
        });
        const request = (text: string) =>
            routes.request(
                '/dictionaries/2db8e37d-48e9-41ae-af84-4f6cbbc56e57/batch-generations',
                {
                    body: JSON.stringify({
                        context: null,
                        expectedDictionaryVersion: 1,
                        expectedSettingsVersion: 1,
                        text,
                    }),
                    headers: {
                        Authorization: 'Bearer valid.token.value',
                        'Content-Type': 'application/json',
                        'Idempotency-Key': 'batch-route-idempotency-key',
                    },
                    method: 'POST',
                },
            );

        const tooManyRows = await request(
            Array.from({ length: 101 }, () => 'a').join('\n'),
        );
        const rowTooLong = await request('a'.repeat(201));
        expect(tooManyRows.status).toBe(400);
        expect(rowTooLong.status).toBe(400);
        await expect(tooManyRows.json()).resolves.toMatchObject({
            error: { code: 'invalid_request' },
        });
        await expect(rowTooLong.json()).resolves.toMatchObject({
            error: { code: 'invalid_request' },
        });
        expect(enqueuePastedTerms).not.toHaveBeenCalled();
    });

    it('dispatches document failure retry to a pasted successor', async () => {
        const retryDocumentTerms = vi.fn(async () => ({
            cancellationRequested: false,
            completedAt: null,
            createdAt: '2026-08-26T12:00:00.000Z',
            dictionaryId: '2db8e37d-48e9-41ae-af84-4f6cbbc56e57',
            expectedDictionaryVersion: 2,
            expectedSettingsVersion: 1,
            expiresAt: null,
            failure: null,
            format: 'pasted-terms:v1' as const,
            id: '225238a3-da7f-4f73-8305-3c012296b757',
            kind: 'pasted-terms' as const,
            outcome: null,
            progress: { percent: 0, stage: 'queued' as const },
            proposal: null,
            sourceLanguage: 'en' as const,
            state: 'queued' as const,
            targetLanguage: 'fr' as const,
            updatedAt: '2026-08-26T12:00:00.000Z',
        }));
        const routes = createDictionaryGenerationRoutes({
            policy: new AuthHttpPolicy({
                allowedOrigins: ['http://localhost:3333'],
                appEnvironment: 'test',
                refreshTokenTtlSeconds: 3_600,
            }),
            service: { retryDocumentTerms } as never,
        });

        const response = await routes.request(
            '/dictionary-generation-jobs/30000000-0000-4000-8000-000000000001/retry-document-terms',
            {
                body: JSON.stringify({
                    expectedDictionaryVersion: 2,
                    expectedSettingsVersion: 1,
                    rowIndexes: [3, 1],
                }),
                headers: {
                    Authorization: 'Bearer valid.token.value',
                    'Content-Type': 'application/json',
                    'Idempotency-Key': 'document-retry-idempotency-key',
                },
                method: 'POST',
            },
        );

        expect(response.status, await response.clone().text()).toBe(202);
        expect(retryDocumentTerms).toHaveBeenCalledWith(
            'valid.token.value',
            'document-retry-idempotency-key',
            '30000000-0000-4000-8000-000000000001',
            {
                expectedDictionaryVersion: 2,
                expectedSettingsVersion: 1,
                rowIndexes: [3, 1],
            },
            expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
    });
});
