import { describe, expect, it } from 'vitest';

import { DictionaryService } from '../../../../../src/modules/dictionaries/application/dictionary-service';
import { DictionaryGenerationNotAvailableError } from '../../../../../src/modules/dictionaries/application/dictionary-errors';
import { createDictionaryRoutes } from '../../../../../src/modules/dictionaries/interface/http/dictionary.routes';
import { AuthHttpPolicy } from '../../../../../src/modules/authentication/interface/http/auth-http-policy';

function application() {
    const service = new DictionaryService({
        authentication: {
            authenticate: async () => {
                throw new Error('must not authenticate');
            },
        },
        clock: { now: () => new Date() },
        cryptography: {
            fingerprint: () => 'share-rate-key',
            verifyShare: () => false,
        } as never,
        rateLimiter: { consume: async () => ({ allowed: true }) },
        store: { findSharedCandidate: async () => null } as never,
    });
    return createDictionaryRoutes({
        policy: new AuthHttpPolicy({
            allowedOrigins: ['http://localhost:3333'],
            appEnvironment: 'test',
            refreshTokenTtlSeconds: 3600,
        }),
        service,
    });
}

describe('dictionary HTTP routes', () => {
    it('serves the public catalog with private no-store and no-referrer policy', async () => {
        const response = await application().request('/languages');
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(response.headers.get('referrer-policy')).toBe('no-referrer');
        expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
        await expect(response.json()).resolves.toMatchObject({
            catalogVersion: 1,
            languages: expect.any(Array),
        });
    });

    it('rejects malformed bearer syntax with the stable authentication error', async () => {
        const correlationId = 'a6c09fe7-7b01-4c59-a85b-dfbd2dbd3324';
        const response = await application().request('/dictionaries', {
            headers: {
                Authorization: 'bearer not-a-jwt',
                'X-Correlation-ID': correlationId,
            },
        });
        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toEqual({
            error: {
                code: 'authentication_required',
                correlationId,
                message: 'Authentication is required.',
            },
        });
    });

    it('handles allowed preflight and rejects disallowed origins', async () => {
        const allowed = await application().request('/dictionaries', {
            method: 'OPTIONS',
            headers: { Origin: 'http://localhost:3333' },
        });
        expect(allowed.status).toBe(204);
        expect(allowed.headers.get('access-control-allow-origin')).toBe(
            'http://localhost:3333',
        );
        expect(allowed.headers.get('access-control-allow-headers')).toContain(
            'X-Languon-Share-Key',
        );

        const denied = await application().request('/dictionaries', {
            method: 'OPTIONS',
            headers: { Origin: 'https://attacker.invalid' },
        });
        expect(denied.status).toBe(400);
        expect(denied.headers.get('access-control-allow-origin')).toBeNull();
    });

    it('rejects missing share headers without revealing capability state', async () => {
        const response = await application().request(
            '/shared/dictionaries/abcdefghijklmnop',
        );
        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toMatchObject({
            error: { code: 'shared_dictionary_not_found' },
        });
    });

    it('accepts the browser create request header casing', async () => {
        const id = 'fe8a72dc-b875-49e1-ae4b-da74167dbafb';
        const timestamp = '2026-08-21T12:00:00.000Z';
        const createDictionary = async () => ({
            activeCardCount: 0,
            archivedAt: null,
            createdAt: timestamp,
            description: null,
            id,
            languagePairLocked: false,
            lifecycle: 'active' as const,
            name: 'Route dictionary',
            settings: {
                updatedAt: timestamp,
                version: 1,
                values: {
                    definitionEnabled: false,
                    definitionLanguage: 'source' as const,
                    exampleEnabled: true,
                    exampleLanguage: 'source' as const,
                    exampleTranslationEnabled: true,
                    transcriptionCustomLabel: null,
                    transcriptionEnabled: false,
                    transcriptionNotation: 'ipa' as const,
                },
            },
            settingsVersion: 1,
            sourceDictionaryId: null,
            sourceLanguage: 'en' as const,
            targetLanguage: 'fr' as const,
            updatedAt: timestamp,
            version: 1,
            visibility: 'private' as const,
        });
        const routes = createDictionaryRoutes({
            policy: new AuthHttpPolicy({
                allowedOrigins: ['http://localhost:3333'],
                appEnvironment: 'test',
                refreshTokenTtlSeconds: 3600,
            }),
            service: { createDictionary } as never,
        });
        const response = await routes.request('/dictionaries', {
            body: JSON.stringify({
                name: 'Route dictionary',
                sourceLanguage: 'en',
                targetLanguage: 'fr',
            }),
            headers: {
                Authorization: 'Bearer valid.token.value',
                'Content-Type': 'application/json',
                'Idempotency-Key': 'dictionary-route-idempotency-key',
                Origin: 'http://localhost:3333',
            },
            method: 'POST',
        });
        expect(response.status, await response.clone().text()).toBe(201);
    });

    it('rejects import content beyond the decoded one-mebibyte boundary before dispatch', async () => {
        const importDictionary = async () => {
            throw new Error('must not dispatch');
        };
        const routes = createDictionaryRoutes({
            policy: new AuthHttpPolicy({
                allowedOrigins: ['http://localhost:3333'],
                appEnvironment: 'test',
                refreshTokenTtlSeconds: 3600,
            }),
            service: { importDictionary } as never,
        });
        const response = await routes.request('/dictionary-imports', {
            body: JSON.stringify({
                content: 'a'.repeat(1_048_577),
                enrichment: { mode: 'none' },
                options: {
                    delimiter: 'tab',
                    hasHeader: false,
                    sourceColumnIndex: 0,
                    targetColumnIndex: 1,
                },
                target: {
                    description: null,
                    kind: 'new',
                    name: 'Imported',
                    sourceLanguage: 'en',
                    targetLanguage: 'es',
                },
            }),
            headers: {
                Authorization: 'Bearer valid.token.value',
                'Content-Type': 'application/json',
                'Idempotency-Key': 'dictionary-import-idempotency-key',
            },
            method: 'POST',
        });

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
            error: { code: 'invalid_request' },
        });
    });

    it('maps unavailable AI import enrichment to a stable service response', async () => {
        const routes = createDictionaryRoutes({
            policy: new AuthHttpPolicy({
                allowedOrigins: ['http://localhost:3333'],
                appEnvironment: 'test',
                refreshTokenTtlSeconds: 3600,
            }),
            service: {
                importDictionary: async () => {
                    throw new DictionaryGenerationNotAvailableError();
                },
            } as never,
        });
        const response = await routes.request('/dictionary-imports', {
            body: JSON.stringify({
                content: 'bank\tbanco',
                enrichment: {
                    instruction: null,
                    mode: 'ai',
                    selectedRowIndexes: [0],
                },
                options: {
                    delimiter: 'tab',
                    hasHeader: false,
                    sourceColumnIndex: 0,
                    targetColumnIndex: 1,
                },
                target: {
                    dictionaryId: 'fe8a72dc-b875-49e1-ae4b-da74167dbafb',
                    expectedDictionaryVersion: 1,
                    expectedSettingsVersion: 1,
                    kind: 'existing',
                },
            }),
            headers: {
                Authorization: 'Bearer valid.token.value',
                'Content-Type': 'application/json',
                'Idempotency-Key': 'dictionary-import-ai-unavailable-key',
            },
            method: 'POST',
        });

        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toMatchObject({
            error: { code: 'generation_not_available' },
        });
    });

    it('returns export bytes with fixed attachment security headers', async () => {
        const exportDictionary = async () => ({
            body: new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode('bank\tbanco'));
                    controller.close();
                },
            }),
            headers: {
                'cache-control': 'private, no-store' as const,
                'content-disposition':
                    'attachment; filename="dictionary-7ceab60b-7416-4296-91e4-0e4a1cd35dd2.txt"' as const,
                'content-type': 'text/plain; charset=utf-8' as const,
                'referrer-policy': 'no-referrer' as const,
                'x-content-type-options': 'nosniff' as const,
            },
        });
        const routes = createDictionaryRoutes({
            policy: new AuthHttpPolicy({
                allowedOrigins: ['http://localhost:3333'],
                appEnvironment: 'test',
                refreshTokenTtlSeconds: 3600,
            }),
            service: { exportDictionary } as never,
        });
        const response = await routes.request(
            '/dictionaries/7ceab60b-7416-4296-91e4-0e4a1cd35dd2/export?format=quizlet-text',
            {
                headers: {
                    Authorization: 'Bearer valid.token.value',
                    Origin: 'http://localhost:3333',
                },
            },
        );

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe(
            'text/plain; charset=utf-8',
        );
        expect(response.headers.get('content-disposition')).toBe(
            'attachment; filename="dictionary-7ceab60b-7416-4296-91e4-0e4a1cd35dd2.txt"',
        );
        expect(response.headers.get('x-content-type-options')).toBe('nosniff');
        expect(response.headers.get('access-control-expose-headers')).toBe(
            'Cache-Control, Content-Disposition, Content-Type, Referrer-Policy, X-Content-Type-Options',
        );
        const document = routes.getOpenAPIDocument({
            info: { title: 'Dictionary routes', version: '1' },
            openapi: '3.1.0',
        });
        expect(
            document.paths?.['/dictionaries/{dictionaryId}/export']?.get
                ?.responses?.['200'],
        ).toMatchObject({
            content: {
                'text/csv': {
                    schema: { format: 'binary', type: 'string' },
                },
                'text/plain': {
                    schema: { format: 'binary', type: 'string' },
                },
            },
            headers: expect.any(Object),
        });
        await expect(response.text()).resolves.toBe('bank\tbanco');
    });
});
