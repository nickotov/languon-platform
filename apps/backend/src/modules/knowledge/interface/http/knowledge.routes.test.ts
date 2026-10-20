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
    const branch = {
        id: randomUUID(),
        noteId: note.id,
        version: 1,
        basePublishedVersion: 1,
        content,
        updatedAt: now,
    };
    const workspace = {
        noteId: note.id,
        status: 'saved' as const,
        published: note,
        branches: [branch],
        preferredBranchId: branch.id,
        shareEnabled: false,
        limits: { referenceChars: 40000, editorChars: 40000 },
    };
    const store = {
        listWorkspaces: vi.fn(async () => ({
            workspaces: [
                {
                    id: note.id,
                    title: note.title,
                    status: 'saved' as const,
                    hasUnsavedChanges: false,
                    updatedAt: now,
                },
            ],
            total: 1,
            offset: 0,
            limit: 20,
        })),
        getWorkspace: vi.fn(async () => workspace),
        createDraft: vi.fn(async () => workspace),
        updateWorking: vi.fn(async () => ({
            branch,
            conflict: false,
            branches: [branch],
        })),
        resolveWorking: vi.fn(async () => workspace),
        saveWorkspace: vi.fn(async () => note),
        saveWorkspaceCopy: vi.fn(async () => note),
        getShare: vi.fn(async () => ({
            locator: 'a'.repeat(32),
            key: 'b'.repeat(43),
        })),
        issueShare: vi.fn(async () => ({
            locator: 'a'.repeat(32),
            key: 'b'.repeat(43),
        })),
        revokeShare: vi.fn(async () => ({ disabled: true as const })),
        readShared: vi.fn(async () => note),
        copyShared: vi.fn(async () => note),
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
    it('keeps the share key in a header and serves the published note without caching', async () => {
        const { app, store, note } = fixture();
        const path = `/knowledge/shared/${'a'.repeat(32)}`;
        expect((await app.request(path)).status).toBe(400);
        expect(store.readShared).not.toHaveBeenCalled();
        const response = await app.request(path, {
            headers: { 'X-Languon-Share-Key': 'b'.repeat(43) },
        });
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(await response.json()).toMatchObject({ note: { id: note.id } });
    });
    it('requires authentication before copying a shared note', async () => {
        const { app, store } = fixture();
        const path = `/knowledge/shared/${'a'.repeat(32)}/copy`;
        const request = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Languon-Share-Key': 'b'.repeat(43),
            },
            body: JSON.stringify({
                operationId: randomUUID(),
                expectedVersion: 1,
            }),
        };
        expect((await app.request(path, request)).status).toBe(401);
        expect(store.copyShared).not.toHaveBeenCalled();
        const response = await app.request(path, {
            ...request,
            headers: {
                ...request.headers,
                Authorization: 'Bearer synthetic.payload.signature',
            },
        });
        expect(response.status).toBe(201);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(store.copyShared).toHaveBeenCalledOnce();
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
