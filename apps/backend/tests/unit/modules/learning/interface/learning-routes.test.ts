import { describe, expect, it } from 'vitest';
import { fixture } from '../learning-test-fixture';
import { createLearningRoutes } from '../../../../../src/modules/learning/interface/http/learning.routes';
import { AuthHttpPolicy } from '../../../../../src/modules/authentication/interface/http/auth-http-policy';
import {
    LearningConflictError,
    LearningEntryUnavailableError,
    LearningUnavailableError,
} from '../../../../../src/modules/learning/domain/errors';
import { InvalidAccessTokenError } from '../../../../../src/modules/authentication/application/ports/access-token';

const dictionaryId = '00000000-0000-4000-8000-000000000001';
const prefix = `/learning/dictionaries/${dictionaryId}`;
const sharedPrefix = '/learning/shared-dictionaries/abcdefghijklmnop';
const authorization = 'Bearer valid.token.value';
const configuration = { front: ['targetExample'], back: ['sourceExample'] };
const policy = new AuthHttpPolicy({
    allowedOrigins: ['http://localhost:3333'],
    appEnvironment: 'test',
    refreshTokenTtlSeconds: 3600,
});
const application = (enabled = true) => {
    const f = fixture(enabled);
    return { ...f, app: createLearningRoutes({ policy, service: f.service }) };
};
const jsonHeaders = {
    Authorization: authorization,
    'Content-Type': 'application/json',
};

describe('learning HTTP routes', () => {
    it('leaves unrelated preflight to its owning router', async () => {
        const { app } = application();
        app.options('/users/*', (context) => {
            context.header('Access-Control-Allow-Methods', 'PATCH');
            return context.body(null, 204);
        });
        const response = await app.request('/users/me/profile', {
            method: 'OPTIONS',
            headers: { Origin: 'http://localhost:3333' },
        });
        expect(response.status).toBe(204);
        expect(response.headers.get('access-control-allow-methods')).toBe(
            'PATCH',
        );
    });
    it.each([prefix, sharedPrefix])(
        'distinguishes an unavailable entry from lost dictionary access for %s',
        async (routePrefix) => {
            const { app, store } = application();
            const headers = {
                ...jsonHeaders,
                'x-languon-share-key': 'a'.repeat(43),
            };
            const body = JSON.stringify({
                operationId: dictionaryId,
                sessionId: dictionaryId,
                entryId: dictionaryId,
                expectedLearningVersion: 1,
                round: 1,
                rating: 'known',
                configuration,
            });
            store.recordAttempt.mockRejectedValueOnce(
                new LearningEntryUnavailableError(),
            );
            const missing = await app.request(
                `${routePrefix}/flashcards/attempts`,
                { method: 'POST', headers, body },
            );
            expect(missing.status).toBe(404);
            expect(await missing.json()).toMatchObject({
                error: { code: 'entry_not_found' },
            });
            store.undo.mockRejectedValueOnce(
                new LearningEntryUnavailableError(),
            );
            const undo = await app.request(
                `${routePrefix}/flashcards/attempts/${dictionaryId}/undo`,
                {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ operationId: dictionaryId }),
                },
            );
            expect(undo.status).toBe(404);
            expect(await undo.json()).toMatchObject({
                error: { code: 'entry_not_found' },
            });
            store.recordAttempt.mockRejectedValueOnce(
                new LearningUnavailableError(),
            );
            const lost = await app.request(
                `${routePrefix}/flashcards/attempts`,
                { method: 'POST', headers, body },
            );
            expect(lost.status).toBe(404);
            expect(await lost.json()).toMatchObject({
                error: {
                    code:
                        routePrefix === prefix
                            ? 'dictionary_not_found'
                            : 'shared_dictionary_not_found',
                },
            });
        },
    );
    it('keeps invalid bearer failures as authentication errors, not entry or dictionary absence', async () => {
        const { app, dependencies, store } = application();
        dependencies.authentication.authenticate.mockRejectedValueOnce(
            new InvalidAccessTokenError(),
        );
        const response = await app.request(
            `${sharedPrefix}/flashcards/progress`,
            {
                headers: {
                    ...jsonHeaders,
                    'x-languon-share-key': 'a'.repeat(43),
                },
            },
        );
        expect(response.status).toBe(401);
        expect(await response.json()).toMatchObject({
            error: { code: 'authentication_required' },
        });
        expect(store.progress).not.toHaveBeenCalled();
    });
    it('returns a safe validation error for malformed JSON instead of an internal failure', async () => {
        const { app, store } = application();
        const result = await app.request(`${prefix}/flashcards/prepare`, {
            method: 'POST',
            headers: jsonHeaders,
            body: '{invalid json',
        });
        expect(result.status).toBe(400);
        expect(await result.json()).toMatchObject({
            error: { code: 'invalid_request' },
        });
        expect(store.prepare).not.toHaveBeenCalled();
    });
    it('keeps capabilities readable while operations are disabled', async () => {
        const { app } = application(false);
        const caps = await app.request('/learning/capabilities');
        expect(await caps.json()).toEqual({ flashcardsEnabled: false });
        const result = await app.request(`${prefix}/entries`, {
            headers: { Authorization: authorization },
        });
        expect(result.status).toBe(503);
        expect(await result.json()).toMatchObject({
            error: { code: 'service_unavailable' },
        });
        expect(result.headers.get('cache-control')).toBe('private, no-store');
        expect(result.headers.get('referrer-policy')).toBe('no-referrer');
    });
    it('requires bearer authentication for owner content and rejects malformed bearer on shared reads', async () => {
        const { app } = application();
        expect((await app.request(`${prefix}/entries`)).status).toBe(401);
        const result = await app.request(`${sharedPrefix}/entries`, {
            headers: {
                Authorization: 'Bearer invalid',
                'x-languon-share-key': 'a'.repeat(43),
            },
        });
        expect(result.status).toBe(401);
    });
    it('allows shared anonymous reads with bounded validated query', async () => {
        const { app, store } = application();
        store.listEntries.mockResolvedValue({ entries: [], nextCursor: null });
        const result = await app.request(`${sharedPrefix}/entries?limit=25`, {
            headers: { 'x-languon-share-key': 'a'.repeat(43) },
        });
        expect(result.status, await result.clone().text()).toBe(200);
        expect(store.listEntries.mock.calls[0]?.[0]).toMatchObject({
            learnerId: null,
        });
        expect(
            (
                await app.request(`${prefix}/entries?limit=26`, {
                    headers: { Authorization: authorization },
                })
            ).status,
        ).toBe(400);
    });
    it('rejects undeclared learner identity and invalid field configurations before dispatch', async () => {
        const { app, store } = application();
        const result = await app.request(`${prefix}/flashcards/prepare`, {
            method: 'POST',
            headers: jsonHeaders,
            body: JSON.stringify({
                configuration,
                scope: { type: 'all' },
                learnerId: 'someone-else',
            }),
        });
        expect(result.status).toBe(400);
        expect(store.prepare).not.toHaveBeenCalled();
        const duplicate = await app.request(`${prefix}/flashcards/prepare`, {
            method: 'POST',
            headers: jsonHeaders,
            body: JSON.stringify({
                configuration: {
                    front: ['source', 'source'],
                    back: ['translation'],
                },
                scope: { type: 'all' },
            }),
        });
        expect(duplicate.status).toBe(400);
    });
    it('acknowledges attempt and idempotent undo via documented routes', async () => {
        const { app, store } = application();
        const attemptId = '00000000-0000-4000-8000-000000000002';
        store.recordAttempt.mockResolvedValue({
            attemptId,
            entryId: dictionaryId,
            learningVersion: 1,
            rating: 'known',
        });
        const result = await app.request(`${prefix}/flashcards/attempts`, {
            method: 'POST',
            headers: jsonHeaders,
            body: JSON.stringify({
                operationId: dictionaryId,
                sessionId: dictionaryId,
                entryId: dictionaryId,
                expectedLearningVersion: 1,
                round: 1,
                rating: 'known',
                configuration,
            }),
        });
        expect(result.status, await result.clone().text()).toBe(200);
        store.undo.mockResolvedValue({
            attemptId,
            entryId: dictionaryId,
            learningVersion: 1,
            rating: null,
        });
        const undo = await app.request(
            `${prefix}/flashcards/attempts/${attemptId}/undo`,
            {
                method: 'POST',
                headers: jsonHeaders,
                body: JSON.stringify({ operationId: attemptId }),
            },
        );
        expect(undo.status).toBe(200);
        expect(store.undo.mock.calls[0]?.[1]).toBe(attemptId);
    });
    it('maps stale content and inaccessible dictionaries without exposing details', async () => {
        const { app, store } = application();
        store.progress.mockRejectedValueOnce(
            new LearningConflictError('stale_content'),
        );
        const stale = await app.request(`${prefix}/flashcards/progress`, {
            headers: jsonHeaders,
        });
        expect(stale.status).toBe(409);
        expect(await stale.json()).toMatchObject({
            error: { code: 'learning_version_conflict' },
        });
        store.progress.mockRejectedValueOnce(new LearningUnavailableError());
        expect(
            (
                await app.request(`${prefix}/flashcards/progress`, {
                    headers: jsonHeaders,
                })
            ).status,
        ).toBe(404);
    });
    it('documents all owner/shared endpoints and error responses', async () => {
        const { app } = application();
        const doc = await app.getOpenAPIDocument({
            info: { title: 'Learning', version: '1' },
            openapi: '3.0.0',
        });
        expect(Object.keys(doc.paths ?? {})).toHaveLength(15);
        expect(
            doc.paths?.[
                '/learning/shared-dictionaries/{shareId}/flashcards/attempts'
            ]?.post?.responses?.['409'],
        ).toBeDefined();
    });
    it('enforces origin policy in preflight and includes capability header', async () => {
        const { app } = application();
        const valid = await app.request(`${prefix}/entries`, {
            method: 'OPTIONS',
            headers: { Origin: 'http://localhost:3333' },
        });
        expect(valid.status).toBe(204);
        expect(valid.headers.get('access-control-allow-headers')).toContain(
            'X-Languon-Share-Key',
        );
        const invalid = await app.request(`${prefix}/entries`, {
            method: 'OPTIONS',
            headers: { Origin: 'https://evil.invalid' },
        });
        expect(invalid.status).toBe(400);
    });
});
