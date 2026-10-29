import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { KnowledgeSentenceService } from '../../application/knowledge-sentence-free-service';
import type { KnowledgeSentenceFreeStore } from '../../application/knowledge-sentence-free-store';
import type { KnowledgeSentencePaidOperations } from '../../application/knowledge-sentence-paid';
import { KnowledgeDomainError } from '../../domain/knowledge';
import { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import { createKnowledgeSentenceRoutes } from './knowledge-sentence-free-routes';
function fixture() {
    const actor = randomUUID(),
        noteId = randomUUID(),
        blockId = randomUUID();
    const store = {
        authorize: vi.fn(async () => {}),
        prepare: vi.fn<KnowledgeSentenceFreeStore['prepare']>(),
        next: vi.fn<KnowledgeSentenceFreeStore['next']>(),
        revealReference: vi.fn<KnowledgeSentenceFreeStore['revealReference']>(),
        attempts: vi.fn(async () => ({ attempts: [], nextCursor: null })),
        manualReviews: vi.fn(async () => ({ reviews: [], nextCursor: null })),
        progress: vi.fn<KnowledgeSentenceFreeStore['progress']>(),
    } satisfies KnowledgeSentenceFreeStore;
    const paid = {
        enqueueCheck: vi.fn<KnowledgeSentencePaidOperations['enqueueCheck']>(),
        getJob: vi.fn<KnowledgeSentencePaidOperations['getJob']>(),
        cancelJob: vi.fn<KnowledgeSentencePaidOperations['cancelJob']>(),
    };
    const service = new KnowledgeSentenceService({
        store,
        paid,
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
        paid,
        path: `/knowledge/${noteId}/vocabulary/${blockId}/sentences`,
        app: createKnowledgeSentenceRoutes({ service, policy }),
    };
}
const headers = {
    Authorization: 'Bearer synthetic.payload.signature',
    'Content-Type': 'application/json',
    Origin: 'http://localhost:3000',
};
describe('knowledge sentence HTTP authority', () => {
    it('requires account and derives private actor from authenticated identity', async () => {
        const { app, path, actor, store } = fixture();
        expect((await app.request(path + '/reviews')).status).toBe(401);
        const response = await app.request(path + '/reviews', { headers });
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(store.manualReviews).toHaveBeenCalledWith(
            expect.objectContaining({ actorId: actor }),
            { limit: 25 },
            expect.anything(),
        );
    });
    it('rejects caller-selected actor and partial share credentials before effects', async () => {
        const { app, path, store } = fixture();
        expect(
            (
                await app.request(path + '/reviews', {
                    headers: { ...headers, 'X-Languon-Share-Kind': 'workbook' },
                })
            ).status,
        ).toBe(400);
        expect(
            (
                await app.request(path + '/prepare', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        direction: 'source-to-target',
                        mode: 'saved-first',
                        scope: { type: 'all' },
                        actorId: randomUUID(),
                    }),
                })
            ).status,
        ).toBe(400);
        expect(store.prepare).not.toHaveBeenCalled();
        expect(store.manualReviews).not.toHaveBeenCalled();
    });
    it('returns unavailable source after revoked access and preserves header-only grant', async () => {
        const { app, path, store } = fixture();
        store.manualReviews.mockRejectedValue(
            new KnowledgeDomainError('knowledge_not_found', 'Unavailable'),
        );
        expect((await app.request(path + '/reviews', { headers })).status).toBe(
            404,
        );
    });
    it('preflights bearer and complete share header transport', async () => {
        const { app, path } = fixture();
        const response = await app.request(path + '/next', {
            method: 'OPTIONS',
            headers: {
                Origin: headers.Origin,
                'Access-Control-Request-Method': 'POST',
            },
        });
        expect(response.status).toBe(204);
        expect(response.headers.get('access-control-allow-headers')).toContain(
            'X-Languon-Share-Key',
        );
    });
});
