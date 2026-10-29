import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { KnowledgeTranscriptionJob } from '@languon/contracts';
import { createApp } from '../../../../app';
import { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import { AiCreditInsufficientBalanceError } from '../../../ai-credits/domain/ai-credit';
import { KnowledgeTranscriptionJobService } from '../../application/transcription-job-service';
import type { KnowledgeTranscriptionJobStore } from '../../application/transcription-job-store';
import { createKnowledgeTranscriptionJobRoutes } from './transcription-job-routes';
function fixture() {
    const noteId = randomUUID();
    const operationId = randomUUID();
    const assetId = randomUUID();
    const ownerId = randomUUID();
    const now = new Date().toISOString();
    const job: KnowledgeTranscriptionJob = {
        id: operationId,
        noteId,
        assetId,
        state: 'confirmation-required',
        maximumCredits: '1.000',
        result: null,
        failureCode: null,
        createdAt: now,
        updatedAt: now,
    };
    const store = {
        submit: vi.fn(async () => job),
        read: vi.fn(async () => job),
        cancel: vi.fn(async () => ({ ...job, state: 'cancelled' as const })),
        claim: vi.fn(),
        heartbeat: vi.fn(),
        audio: vi.fn(),
        authorizeDispatch: vi.fn(),
        finish: vi.fn(),
        recoverExpired: vi.fn(),
    } satisfies KnowledgeTranscriptionJobStore;
    const rateLimiter = {
        consume: vi.fn(async () => ({
            allowed: true as const,
            limit: 120,
            remaining: 119,
            retryAfterSeconds: 0,
        })),
        linkSubject: vi.fn(async () => undefined),
    };
    const service = new KnowledgeTranscriptionJobService({
        store,
        authenticate: async () => ({ userId: ownerId }),
        rateLimiter,
    });
    const policy = new AuthHttpPolicy({
        allowedOrigins: ['http://localhost:3000'],
        appEnvironment: 'test',
        refreshTokenTtlSeconds: 3600,
    });
    const app = createApp({
        knowledgeTranscription: createKnowledgeTranscriptionJobRoutes({
            service,
            policy,
        }),
    });
    return { app, noteId, operationId, assetId, ownerId, store, job };
}
const headers = {
    Authorization: 'Bearer synthetic.payload.signature',
    'Content-Type': 'application/json',
    Origin: 'http://localhost:3000',
};
describe('Transcription job HTTP authorization and explicit confirmation', () => {
    it('requires sign-in and preserves a non-dispatched confirmation response', async () => {
        const { app, noteId, operationId, assetId, store, ownerId } = fixture();
        const path = `/knowledge/${noteId}/transcriptions`;
        expect(
            (
                await app.request(path, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ operationId, noteId, assetId }),
                })
            ).status,
        ).toBe(401);
        const response = await app.request(path, {
            method: 'POST',
            headers,
            body: JSON.stringify({ operationId, noteId, assetId }),
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            job: { state: 'confirmation-required', maximumCredits: '1.000' },
        });
        expect(store.submit).toHaveBeenCalledWith(
            ownerId,
            { operationId, noteId, assetId, languages: [] },
            expect.any(AbortSignal),
        );
        expect(store.claim).not.toHaveBeenCalled();
        expect(response.headers.get('cache-control')).toBe('private, no-store');
    });
    it('rejects mismatched path authority and foreign origins before store mutation', async () => {
        const { app, noteId, operationId, assetId, store } = fixture();
        const path = `/knowledge/${noteId}/transcriptions`;
        expect(
            (
                await app.request(path, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        operationId,
                        noteId: randomUUID(),
                        assetId,
                    }),
                })
            ).status,
        ).toBe(400);
        expect(
            (
                await app.request(path, {
                    method: 'POST',
                    headers: { ...headers, Origin: 'https://hostile.invalid' },
                    body: JSON.stringify({ operationId, noteId, assetId }),
                })
            ).status,
        ).toBe(403);
        expect(store.submit).not.toHaveBeenCalled();
    });
    it('returns explicit credit errors and forwards cancellation only for the authenticated actor', async () => {
        const { app, noteId, operationId, assetId, store, ownerId } = fixture();
        store.submit.mockRejectedValueOnce(
            new AiCreditInsufficientBalanceError(
                'Never expose internal credit details',
            ),
        );
        const response = await app.request(
            `/knowledge/${noteId}/transcriptions`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({ operationId, noteId, assetId }),
            },
        );
        expect(response.status).toBe(402);
        expect(await response.json()).toMatchObject({
            error: { code: 'insufficient_credits' },
        });
        const cancelled = await app.request(
            `/knowledge/${noteId}/transcriptions/${operationId}/cancel`,
            { method: 'POST', headers },
        );
        expect(cancelled.status).toBe(200);
        expect(store.cancel).toHaveBeenCalledWith(ownerId, noteId, operationId);
    });
});
