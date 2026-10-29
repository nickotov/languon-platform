import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { KnowledgePrivateTranslationService } from '../../application/private-translation-service';
import type { KnowledgePrivateTranslationStore } from '../../application/private-translation-store';
import { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import { KnowledgeDomainError } from '../../domain/knowledge';
import { createKnowledgePrivateTranslationRoutes } from './private-translation-routes';
const headers = {
    Authorization: 'Bearer synthetic.payload.signature',
    Origin: 'http://localhost:3000',
    'Content-Type': 'application/json',
};
function fixture() {
    const actorId = randomUUID(),
        noteId = randomUUID(),
        blockId = randomUUID();
    const store = {
        list: vi.fn(async () => ({ translations: [] })),
        request: vi.fn<KnowledgePrivateTranslationStore['request']>(),
        job: vi.fn<KnowledgePrivateTranslationStore['job']>(),
        cancel: vi.fn<KnowledgePrivateTranslationStore['cancel']>(),
    };
    const service = new KnowledgePrivateTranslationService({
        store,
        authenticate: async () => ({ userId: actorId }),
        rateLimiter: {
            linkSubject: async () => {},
            consume: async () => ({
                allowed: true,
                limit: 180,
                remaining: 179,
                retryAfterSeconds: 0,
            }),
        },
        burstLimiter: { consume: vi.fn(async () => ({ allowed: true })) },
    } as ConstructorParameters<typeof KnowledgePrivateTranslationService>[0]);
    return {
        actorId,
        noteId,
        blockId,
        store,
        app: createKnowledgePrivateTranslationRoutes({
            service,
            policy: new AuthHttpPolicy({
                allowedOrigins: ['http://localhost:3000'],
                appEnvironment: 'test',
                refreshTokenTtlSeconds: 3600,
            }),
        }),
        path: `/knowledge/${noteId}/blocks/${blockId}/private-translations`,
    };
}
describe('private knowledge translation HTTP authority', () => {
    it('requires authentication and forwards verified actor plus complete header grant', async () => {
        const f = fixture();
        expect((await f.app.request(f.path)).status).toBe(401);
        const locator = 'a'.repeat(32),
            key = 'b'.repeat(43);
        const result = await f.app.request(f.path, {
            headers: {
                ...headers,
                'X-Languon-Share-Kind': 'note',
                'X-Languon-Share-Locator': locator,
                'X-Languon-Share-Key': key,
            },
        });
        expect(result.status).toBe(200);
        expect(result.headers.get('cache-control')).toBe('private, no-store');
        expect(f.store.list).toHaveBeenCalledWith({
            actorId: f.actorId,
            noteId: f.noteId,
            blockId: f.blockId,
            access: { kind: 'note', locator, key },
        });
    });
    it('rejects caller supplied content, actor IDs, unsupported languages and incomplete grants', async () => {
        const f = fixture();
        for (const extra of [
            { sourceText: 'substituted' },
            { actorId: randomUUID() },
            { targetLanguage: 'zz-unsupported' },
        ]) {
            const response = await f.app.request(f.path, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    operationId: randomUUID(),
                    targetLanguage: 'fr',
                    ...extra,
                }),
            });
            expect(response.status).toBe(400);
        }
        expect(
            (
                await f.app.request(f.path, {
                    headers: {
                        ...headers,
                        'X-Languon-Share-Key': 'incomplete',
                    },
                })
            ).status,
        ).toBe(400);
        expect(f.store.request).not.toHaveBeenCalled();
    });
    it('does not reveal a revoked source or other actor job through reads/cancel', async () => {
        const f = fixture();
        f.store.job.mockRejectedValue(
            new KnowledgeDomainError('knowledge_not_found', 'Unavailable'),
        );
        f.store.cancel.mockRejectedValue(
            new KnowledgeDomainError('knowledge_not_found', 'Unavailable'),
        );
        const id = randomUUID();
        expect(
            (await f.app.request(`${f.path}/jobs/${id}`, { headers })).status,
        ).toBe(404);
        expect(
            (
                await f.app.request(`${f.path}/jobs/${id}/cancel`, {
                    method: 'POST',
                    headers,
                })
            ).status,
        ).toBe(404);
    });
});
