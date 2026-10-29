import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { KnowledgeLibraryCopyService } from '../../application/library-copy-service';
import type { KnowledgeLibraryCopyStore } from '../../application/library-copy-store';
import { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import { createKnowledgeLibraryCopyRoutes } from './library-copy-routes';
import { KnowledgeDomainError } from '../../domain/knowledge';
function fixture() {
    const actor = randomUUID();
    const store = {
        previewVocabulary: vi.fn(async () => ({
            entries: [{ id: actor, term: 'cat', translation: 'кот' }],
            remainingRows: 100,
        })),
        copyVocabulary: vi.fn<KnowledgeLibraryCopyStore['copyVocabulary']>(),
        previewText: vi.fn<KnowledgeLibraryCopyStore['previewText']>(),
        copyText: vi.fn<KnowledgeLibraryCopyStore['copyText']>(),
    } satisfies KnowledgeLibraryCopyStore;
    const service = new KnowledgeLibraryCopyService({
        store,
        authenticate: async () => ({ userId: actor }),
        rateLimiter: {
            linkSubject: vi.fn(async () => {}),
            consume: vi.fn(async () => ({
                allowed: true,
                limit: 60,
                remaining: 59,
                retryAfterSeconds: 0,
            })),
        },
    });
    const policy = new AuthHttpPolicy({
        allowedOrigins: ['http://localhost:3000'],
        appEnvironment: 'test',
        refreshTokenTtlSeconds: 3600,
    });
    const input = {
        operationId: randomUUID(),
        noteId: randomUUID(),
        noteVersion: 1,
        blockId: randomUUID(),
        entryIds: [actor],
        destination: {
            kind: 'new',
            name: 'Words',
            sourceLanguage: 'en',
            targetLanguage: 'ru',
        },
    };
    return {
        actor,
        store,
        input,
        app: createKnowledgeLibraryCopyRoutes({ service, policy }),
    };
}
const headers = {
    Authorization: 'Bearer synthetic.payload.signature',
    'Content-Type': 'application/json',
    Origin: 'http://localhost:3000',
};
const path = '/knowledge/library/vocabulary/preview';
describe('knowledge library copy HTTP boundary', () => {
    it('requires authentication and resolves the destination owner server-side', async () => {
        const { actor, store, input, app } = fixture();
        expect(
            (
                await app.request(path, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(input),
                })
            ).status,
        ).toBe(401);
        const response = await app.request(path, {
            method: 'POST',
            headers,
            body: JSON.stringify(input),
        });
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(store.previewVocabulary).toHaveBeenCalledWith(
            actor,
            expect.objectContaining({ noteId: input.noteId }),
            expect.any(AbortSignal),
            undefined,
        );
    });
    it('rejects caller-supplied content and incomplete capability credentials', async () => {
        const { store, input, app } = fixture();
        expect(
            (
                await app.request(path, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        ...input,
                        entries: [{ term: 'injected' }],
                    }),
                })
            ).status,
        ).toBe(400);
        expect(
            (
                await app.request(path, {
                    method: 'POST',
                    headers: {
                        ...headers,
                        'X-Languon-Share-Key': 'a'.repeat(43),
                    },
                    body: JSON.stringify(input),
                })
            ).status,
        ).toBe(400);
        expect(store.previewVocabulary).not.toHaveBeenCalled();
    });
    it('forwards a complete share proof separately from copied content', async () => {
        const { actor, store, input, app } = fixture();
        const proof = {
            kind: 'workbook',
            locator: 'a'.repeat(32),
            key: 'b'.repeat(43),
        };
        expect(
            (
                await app.request(path, {
                    method: 'POST',
                    headers: {
                        ...headers,
                        'X-Languon-Share-Kind': proof.kind,
                        'X-Languon-Share-Locator': proof.locator,
                        'X-Languon-Share-Key': proof.key,
                    },
                    body: JSON.stringify(input),
                })
            ).status,
        ).toBe(200);
        expect(store.previewVocabulary).toHaveBeenCalledWith(
            actor,
            expect.any(Object),
            expect.any(AbortSignal),
            proof,
        );
    });
    it('maps revoked source and stale source versions without private detail', async () => {
        const { store, input, app } = fixture();
        store.previewVocabulary.mockRejectedValueOnce(
            new KnowledgeDomainError(
                'knowledge_not_found',
                'The note is unavailable.',
            ),
        );
        expect(
            (
                await app.request(path, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(input),
                })
            ).status,
        ).toBe(404);
        store.previewVocabulary.mockRejectedValueOnce(
            new KnowledgeDomainError('version_conflict', 'Preview again.'),
        );
        expect(
            (
                await app.request(path, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(input),
                })
            ).status,
        ).toBe(409);
    });
    it('rejects unsafe origins and oversized requests', async () => {
        const { store, input, app } = fixture();
        expect(
            (
                await app.request(path, {
                    method: 'POST',
                    headers: { ...headers, Origin: 'https://unsafe.example' },
                    body: JSON.stringify(input),
                })
            ).status,
        ).toBe(403);
        expect(
            (
                await app.request(path, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ text: 'x'.repeat(70_000) }),
                })
            ).status,
        ).toBe(413);
        expect(store.previewVocabulary).not.toHaveBeenCalled();
    });
});
