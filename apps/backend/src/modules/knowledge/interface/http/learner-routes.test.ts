import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { LearnerService } from '../../application/learner-service';
import type { LearnerStore } from '../../application/learner-store';
import { KnowledgeDomainError } from '../../domain/knowledge';
import { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import { createLearnerRoutes } from './learner-routes';

function fixture() {
    const actor = randomUUID();
    const noteId = randomUUID();
    const store = {
        workbookProgress: vi.fn<LearnerStore['workbookProgress']>(),
        read: vi.fn(async () => ({
            noteId,
            noteVersion: 1,
            attempts: [],
            events: [],
            completion: null,
            updatedSinceCompletion: false,
            exerciseRevisions: [],
            truncated: false,
        })),
        attempt: vi.fn<LearnerStore['attempt']>(),
        event: vi.fn<LearnerStore['event']>(),
        complete: vi.fn<LearnerStore['complete']>(),
    } satisfies LearnerStore;
    const service = new LearnerService({
        store,
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
        noteId,
        store,
        app: createLearnerRoutes({ service, policy }),
    };
}
const headers = {
    Authorization: 'Bearer synthetic.payload.signature',
    'Content-Type': 'application/json',
    Origin: 'http://localhost:3000',
};
describe('Private workbook learner HTTP boundary', () => {
    it('requires sign in and resolves the private actor from authentication', async () => {
        const { actor, noteId, store, app } = fixture();
        expect(
            (await app.request(`/knowledge/${noteId}/learning`)).status,
        ).toBe(401);
        const response = await app.request(`/knowledge/${noteId}/learning`, {
            headers,
        });
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(store.read).toHaveBeenCalledWith(actor, noteId, undefined);
    });
    it('serves aggregate progress only for the authenticated actor with private no-store responses', async () => {
        const { actor, noteId: workbookId, store, app } = fixture();
        store.workbookProgress.mockResolvedValue({
            workbookId,
            workbookVersion: 1,
            totalNotes: 2,
            completedNotes: 1,
            updatedSinceCompletion: 0,
        });
        expect(
            (await app.request(`/knowledge/workbooks/${workbookId}/progress`))
                .status,
        ).toBe(401);
        const response = await app.request(
            `/knowledge/workbooks/${workbookId}/progress`,
            { headers },
        );
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(store.workbookProgress).toHaveBeenCalledWith(
            actor,
            workbookId,
            undefined,
        );
        expect(await response.json()).toMatchObject({ completedNotes: 1 });
    });
    it('validates all capability fields together and never forwards incomplete access', async () => {
        const { noteId, store, app } = fixture();
        const bad = await app.request(`/knowledge/${noteId}/learning`, {
            headers: { ...headers, 'X-Languon-Share-Key': 'a'.repeat(43) },
        });
        expect(bad.status).toBe(400);
        expect(store.read).not.toHaveBeenCalled();
        const access = {
            kind: 'workbook',
            locator: 'b'.repeat(32),
            key: 'a'.repeat(43),
        };
        const response = await app.request(`/knowledge/${noteId}/learning`, {
            headers: {
                ...headers,
                'X-Languon-Share-Kind': access.kind,
                'X-Languon-Share-Locator': access.locator,
                'X-Languon-Share-Key': access.key,
            },
        });
        expect(response.status).toBe(200);
        expect(store.read).toHaveBeenCalledWith(
            expect.any(String),
            noteId,
            access,
        );
    });
    it('rejects client-selected identity and correctness fields before persistence', async () => {
        const { noteId, store, app } = fixture();
        const input = {
            id: randomUUID(),
            noteVersion: 1,
            exerciseId: randomUUID(),
            exerciseRevision: 'a'.repeat(64),
            answer: { format: 'free-text', text: 'Answer' },
            actorId: randomUUID(),
            evaluation: { status: 'correct', method: 'ai' },
        };
        const response = await app.request(
            `/knowledge/${noteId}/learning/attempts`,
            { method: 'POST', headers, body: JSON.stringify(input) },
        );
        expect(response.status).toBe(400);
        expect(store.attempt).not.toHaveBeenCalled();
    });
    it('maps source revocation to unavailable without exposing another learner', async () => {
        const { noteId, store, app } = fixture();
        store.read.mockRejectedValueOnce(
            new KnowledgeDomainError(
                'knowledge_not_found',
                'The knowledge note is unavailable.',
            ),
        );
        const response = await app.request(`/knowledge/${noteId}/learning`, {
            headers,
        });
        expect(response.status).toBe(404);
    });
    it('rejects disallowed origins and oversized attempts on scoped routes', async () => {
        const { app, noteId, store } = fixture();
        const forbidden = await app.request(`/knowledge/${noteId}/learning`, {
            headers: { ...headers, Origin: 'https://untrusted.example' },
        });
        expect(forbidden.status).toBe(403);
        const oversized = await app.request(
            `/knowledge/${noteId}/learning/attempts`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({ text: 'x'.repeat(70_000) }),
            },
        );
        expect(oversized.status).toBe(413);
        expect(store.attempt).not.toHaveBeenCalled();
    });
});
