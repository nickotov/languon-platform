import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import { WorkbookService } from '../../application/workbook-service';
import type { WorkbookStore } from '../../application/workbook-store';
import { KnowledgeDomainError } from '../../domain/knowledge';
import { createWorkbookRoutes } from './workbook.routes';
import { createApp } from '../../../../app';

function fixture() {
    const owner = randomUUID();
    const id = randomUUID();
    const now = new Date().toISOString();
    const workbook = {
        id,
        title: 'Workbook',
        version: 1,
        shared: false,
        notes: [],
        createdAt: now,
        updatedAt: now,
    };
    const store = {
        list: vi.fn(async () => [workbook]),
        create: vi.fn(async () => workbook),
        get: vi.fn(async () => workbook),
        update: vi.fn(async () => workbook),
        setNotes: vi.fn(async () => workbook),
        delete: vi.fn(async () => {}),
        issueShare: vi.fn(async () => ({
            locator: 'a'.repeat(32),
            key: 'b'.repeat(43),
        })),
        revokeShare: vi.fn(async () => {}),
        readShared: vi.fn(async () => ({
            id,
            title: 'Workbook',
            version: 1,
            notes: [],
            createdAt: now,
            updatedAt: now,
        })),
        copy: vi.fn(async () => workbook),
        copyShared: vi.fn(async () => workbook),
    } satisfies WorkbookStore;
    const service = new WorkbookService({
        store,
        authenticate: vi.fn(async () => ({ userId: owner })),
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
    const app = createApp({
        workbooks: createWorkbookRoutes({ service, policy }),
    });
    return { app, store, owner, id };
}
const headers = {
    Authorization: 'Bearer synthetic.payload.signature',
    'Content-Type': 'application/json',
    Origin: 'http://localhost:3000',
};
describe('Workbook routes and service boundaries', () => {
    it('allows the validated workbook learner capability headers only from an approved browser origin', async () => {
        const { app, id } = fixture();
        const response = await app.request(
            `/knowledge/workbooks/${id}/progress`,
            {
                method: 'OPTIONS',
                headers: {
                    Origin: 'http://localhost:3000',
                    'Access-Control-Request-Method': 'GET',
                    'Access-Control-Request-Headers':
                        'authorization,x-languon-share-kind,x-languon-share-locator,x-languon-share-key',
                },
            },
        );
        expect(response.status).toBe(204);
        const allowed = response.headers
            .get('access-control-allow-headers')!
            .toLowerCase();
        for (const header of [
            'x-languon-share-kind',
            'x-languon-share-locator',
            'x-languon-share-key',
        ])
            expect(allowed).toContain(header);
        expect(response.headers.get('access-control-allow-origin')).toBe(
            'http://localhost:3000',
        );
        expect(
            (
                await app.request(`/knowledge/workbooks/${id}/progress`, {
                    method: 'OPTIONS',
                    headers: { Origin: 'https://untrusted.example' },
                })
            ).status,
        ).toBe(403);
    });
    it('requires authentication for owner content and forwards authenticated identity', async () => {
        const { app, store, owner } = fixture();
        expect((await app.request('/knowledge/workbooks')).status).toBe(401);
        const response = await app.request('/knowledge/workbooks', { headers });
        expect(response.status).toBe(200);
        expect(store.list).toHaveBeenCalledWith(owner);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
    });
    it('rejects unsafe origin, malformed identities and duplicate membership without persistence', async () => {
        const { app, store, id } = fixture();
        const noteId = randomUUID();
        const invalid = await app.request(`/knowledge/workbooks/${id}/notes`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
                expectedVersion: 1,
                noteIds: [noteId, noteId],
            }),
        });
        expect(invalid.status).toBe(400);
        expect(store.setNotes).not.toHaveBeenCalled();
        expect(
            (await app.request('/knowledge/workbooks/not-a-uuid', { headers }))
                .status,
        ).toBe(400);
        expect(
            (
                await app.request('/knowledge/workbooks', {
                    headers: { ...headers, Origin: 'https://hostile.invalid' },
                })
            ).status,
        ).toBe(403);
    });
    it('permits public saved reads with capability in header and never substitutes body authority', async () => {
        const { app, store } = fixture();
        const locator = 'a'.repeat(32);
        const key = 'b'.repeat(43);
        expect(
            (
                await app.request(`/knowledge/workbooks/shared/${locator}`, {
                    headers: { 'X-Languon-Share-Key': key },
                })
            ).status,
        ).toBe(200);
        expect(store.readShared).toHaveBeenCalledWith(locator, key);
        expect(
            (await app.request(`/knowledge/workbooks/shared/${locator}`))
                .status,
        ).toBe(400);
    });
    it('preserves version conflict responses for clients to resolve', async () => {
        const { app, store, id } = fixture();
        store.update.mockRejectedValueOnce(
            new KnowledgeDomainError('version_conflict', 'Reload.'),
        );
        const response = await app.request(`/knowledge/workbooks/${id}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ expectedVersion: 1, title: 'Changed' }),
        });
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({
            error: { code: 'version_conflict' },
        });
    });
    it('copies an owned workbook with explicit source version and destination identity', async () => {
        const { app, store, id, owner } = fixture();
        const input = {
            id: randomUUID(),
            title: 'Independent copy',
            expectedVersion: 1,
        };
        const response = await app.request(`/knowledge/workbooks/${id}/copy`, {
            method: 'POST',
            headers,
            body: JSON.stringify(input),
        });
        expect(response.status).toBe(201);
        expect(store.copy).toHaveBeenCalledWith(owner, id, input);
    });
});
