import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { KnowledgeNoteContentSchema } from '@languon/contracts';
import { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import { KnowledgeService } from '../../application/knowledge-service';
import type { KnowledgeStore } from '../../application/knowledge-store';
import { KnowledgeDomainError } from '../../domain/knowledge';
import { createKnowledgeRoutes } from './knowledge.routes';
const now = '2026-10-19T00:00:00.000Z';
const content = KnowledgeNoteContentSchema.parse({
    title: 'Grammar',
    summary: 'A summary',
    categories: ['grammar'],
    studiedLanguage: 'es',
    explanationLanguage: 'en',
    body: {
        schemaVersion: 1,
        document: { type: 'doc', content: [{ type: 'paragraph' }] },
    },
});
function fixture() {
    const note = {
        ...content,
        id: randomUUID(),
        version: 1,
        createdAt: now,
        updatedAt: now,
    };
    const owner = randomUUID();
    const store = {
        list: vi.fn(async () => ({
            notes: [note],
            total: 1,
            offset: 0,
            limit: 20,
        })),
        get: vi.fn(async () => note),
        create: vi.fn(async () => note),
        update: vi.fn(async () => note),
        delete: vi.fn(async () => {}),
        revisions: vi.fn(async () => []),
        restore: vi.fn(async () => note),
    } satisfies KnowledgeStore;
    const authenticate = vi.fn(async () => ({ userId: owner }));
    const service = new KnowledgeService({
        store,
        authenticate,
        rateLimiter: {
            linkSubject: vi.fn(async () => {}),
            consume: vi.fn(async () => ({
                allowed: true as const,
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
        app: createKnowledgeRoutes({ service, policy }),
        store,
        authenticate,
        owner,
        note,
    };
}
describe('Knowledge HTTP boundary', () => {
    it('requires a verified bearer principal and serves private responses', async () => {
        const { app, store, owner } = fixture();
        expect((await app.request('/knowledge')).status).toBe(401);
        expect(store.list).not.toHaveBeenCalled();
        const response = await app.request('/knowledge', {
            headers: { Authorization: 'Bearer synthetic.payload.signature' },
        });
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(store.list).toHaveBeenCalledWith(owner, {
            offset: 0,
            limit: 20,
        });
    });
    it('rejects disallowed origins and malformed rich content before mutation', async () => {
        const { app, store } = fixture();
        const headers = {
            Authorization: 'Bearer synthetic.payload.signature',
            'Content-Type': 'application/json',
        };
        const denied = await app.request('/knowledge', {
            method: 'POST',
            headers: { ...headers, Origin: 'https://untrusted.test' },
            body: JSON.stringify({ operationId: randomUUID(), content }),
        });
        expect(denied.status).toBe(403);
        const invalid = await app.request('/knowledge', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                operationId: randomUUID(),
                content: {
                    ...content,
                    body: {
                        schemaVersion: 1,
                        document: {
                            type: 'doc',
                            content: [
                                {
                                    type: 'image',
                                    attrs: { src: 'javascript:x' },
                                },
                            ],
                        },
                    },
                },
            }),
        });
        expect(invalid.status).toBe(400);
        expect(store.create).not.toHaveBeenCalled();
    });
    it('maps optimistic conflicts without exposing internals', async () => {
        const { app, store, note } = fixture();
        store.update.mockRejectedValueOnce(
            new KnowledgeDomainError('version_conflict', 'The note changed.'),
        );
        const response = await app.request(`/knowledge/${note.id}`, {
            method: 'PATCH',
            headers: {
                Authorization: 'Bearer synthetic.payload.signature',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                operationId: randomUUID(),
                expectedVersion: 1,
                content,
            }),
        });
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({
            error: { code: 'version_conflict' },
        });
    });
    it('generates the public OpenAPI document for versioned rich content', () => {
        const { app } = fixture();
        expect(() =>
            app.getOpenAPI31Document({
                openapi: '3.1.0',
                info: { title: 'Knowledge', version: '1' },
            }),
        ).not.toThrow();
    });
});
