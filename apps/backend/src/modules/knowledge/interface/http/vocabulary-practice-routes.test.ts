import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { VocabularyPracticeService } from '../../application/vocabulary-practice-service';
import type { VocabularyPracticeStore } from '../../application/vocabulary-practice-store';
import { KnowledgeDomainError } from '../../domain/knowledge';
import { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import { createVocabularyPracticeRoutes } from './vocabulary-practice-routes';
function fixture() {
    const actor = randomUUID();
    const noteId = randomUUID();
    const blockId = randomUUID();
    const store = {
        entries: vi.fn<VocabularyPracticeStore['entries']>(),
        preferences: vi.fn(async () => ({
            version: 0,
            shuffle: true,
            configuration: {
                front: ['source' as const],
                back: ['translation' as const],
            },
        })),
        savePreferences: vi.fn<VocabularyPracticeStore['savePreferences']>(),
        prepare: vi.fn<VocabularyPracticeStore['prepare']>(),
        items: vi.fn<VocabularyPracticeStore['items']>(),
        progress: vi.fn(async () => ({
            total: 0,
            known: 0,
            again: 0,
            unstudied: 0,
        })),
        rate: vi.fn<VocabularyPracticeStore['rate']>(),
        undo: vi.fn<VocabularyPracticeStore['undo']>(),
    } satisfies VocabularyPracticeStore;
    const service = new VocabularyPracticeService({
        store,
        enabled: true,
        authenticate: async () => ({ userId: actor }),
        rateLimiter: {
            linkSubject: vi.fn(async () => {}),
            consume: vi.fn(async () => ({
                allowed: true,
                limit: 180,
                remaining: 179,
                retryAfterSeconds: 0,
            })),
        },
    });
    const policy = new AuthHttpPolicy({
        allowedOrigins: ['http://localhost:3000'],
        appEnvironment: 'test',
        refreshTokenTtlSeconds: 3600,
    });
    return {
        actor,
        store,
        path: `/knowledge/${noteId}/vocabulary/${blockId}/learning`,
        app: createVocabularyPracticeRoutes({ service, policy }),
    };
}
const headers = {
    Authorization: 'Bearer synthetic.payload.signature',
    'Content-Type': 'application/json',
    Origin: 'http://localhost:3000',
};
describe('direct vocabulary HTTP authority', () => {
    it('requires account and derives actor server-side', async () => {
        const { app, path, store, actor } = fixture();
        expect((await app.request(path + '/progress')).status).toBe(401);
        expect(
            (await app.request(path + '/progress', { headers })).status,
        ).toBe(200);
        expect(store.progress).toHaveBeenCalledWith(
            expect.objectContaining({ actorId: actor }),
        );
    });
    it('validates complete share proof and does not accept actor supplied with attempts', async () => {
        const { app, path, store } = fixture();
        expect(
            (
                await app.request(path + '/progress', {
                    headers: { ...headers, 'X-Languon-Share-Kind': 'workbook' },
                })
            ).status,
        ).toBe(400);
        expect(store.progress).not.toHaveBeenCalled();
        const body = {
            operationId: randomUUID(),
            sessionId: randomUUID(),
            entryId: randomUUID(),
            expectedLearningVersion: 1,
            round: 1,
            rating: 'known',
            configuration: { front: ['source'], back: ['translation'] },
            actorId: randomUUID(),
        };
        expect(
            (
                await app.request(path + '/attempts', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body),
                })
            ).status,
        ).toBe(400);
        expect(store.rate).not.toHaveBeenCalled();
    });
    it('signals live source loss through the existing training access-loss contract', async () => {
        const { app, path, store } = fixture();
        store.progress.mockRejectedValue(
            new KnowledgeDomainError('knowledge_not_found', 'Unavailable'),
        );
        const response = await app.request(path + '/progress', { headers });
        expect(response.status).toBe(404);
        expect(await response.json()).toMatchObject({
            error: { code: 'source_not_found' },
        });
    });
    it('allows authenticated preference PUT and header-only shared authority in scoped CORS', async () => {
        const { app, path } = fixture();
        const response = await app.request(path + '/preferences', {
            method: 'OPTIONS',
            headers: {
                Origin: headers.Origin,
                'Access-Control-Request-Method': 'PUT',
                'Access-Control-Request-Headers':
                    'authorization,x-languon-share-kind,x-languon-share-locator',
            },
        });
        expect(response.status).toBe(204);
        expect(response.headers.get('Access-Control-Allow-Methods')).toContain(
            'PUT',
        );
        expect(response.headers.get('Access-Control-Allow-Headers')).toContain(
            'X-Languon-Share-Locator',
        );
    });
});
