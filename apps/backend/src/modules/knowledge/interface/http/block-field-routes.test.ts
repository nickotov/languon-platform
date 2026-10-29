import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { KnowledgeBlockFieldService } from '../../application/block-field-service';
import { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import { TextsAiError } from '../../../texts/application/ports/texts-ai-provider';
import { createKnowledgeBlockFieldRoutes } from './block-field-routes';

const headers = {
    Authorization: 'Bearer synthetic.payload.signature',
    Origin: 'http://localhost:3000',
    'Content-Type': 'application/json',
};
type FieldStore = ConstructorParameters<
    typeof KnowledgeBlockFieldService
>[0]['store'];

function fixture() {
    const actorId = randomUUID(),
        noteId = randomUUID();
    const job = {
        id: randomUUID(),
        status: 'queued' as const,
        result: null,
        failureCode: null,
        createdAt: new Date().toISOString(),
        completedAt: null,
    };
    const store = {
        request: vi.fn<FieldStore['request']>(async () => job),
        get: vi.fn<FieldStore['get']>(async () => job),
        cancel: vi.fn<FieldStore['cancel']>(async () => ({
            ...job,
            status: 'cancelled' as const,
            completedAt: new Date().toISOString(),
        })),
    };
    const service = new KnowledgeBlockFieldService({
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
        burstLimiter: { consume: async () => ({ allowed: true }) },
    });
    const input = {
        operationId: randomUUID(),
        branchId: randomUUID(),
        blockId: randomUUID(),
        action: 'generate',
        field: {
            kind: 'vocabulary',
            entryId: randomUUID(),
            field: 'translation',
            sourceLanguage: 'fr',
            targetLanguage: 'ru',
            sourceText: 'travail',
            currentValue: '',
        },
    };
    return {
        actorId,
        noteId,
        job,
        store,
        input,
        path: `/knowledge/${noteId}/block-field-actions`,
        app: createKnowledgeBlockFieldRoutes({
            service,
            policy: new AuthHttpPolicy({
                allowedOrigins: ['http://localhost:3000'],
                appEnvironment: 'test',
                refreshTokenTtlSeconds: 3600,
            }),
        }),
    };
}
describe('knowledge atomic field HTTP boundaries', () => {
    it('requires sign-in, passes only authenticated actor and marks responses private', async () => {
        const f = fixture();
        expect((await f.app.request(`${f.path}/${f.job.id}`)).status).toBe(401);
        const response = await f.app.request(f.path, {
            method: 'POST',
            headers,
            body: JSON.stringify(f.input),
        });
        expect(response.status).toBe(202);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        expect(f.store.request).toHaveBeenCalledWith(
            f.actorId,
            f.noteId,
            f.input,
            expect.objectContaining({
                signal: expect.any(AbortSignal),
                now: expect.any(Date),
            }),
        );
    });
    it('rejects arbitrary paths, caller identity and source-language tampering before store execution', async () => {
        const f = fixture();
        for (const value of [
            { ...f.input, actorId: randomUUID() },
            { ...f.input, field: { ...f.input.field, field: '__proto__' } },
            {
                ...f.input,
                field: { ...f.input.field, sourceLanguage: 'javascript:bad' },
            },
        ]) {
            expect(
                (
                    await f.app.request(f.path, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(value),
                    })
                ).status,
            ).toBe(400);
        }
        expect(f.store.request).not.toHaveBeenCalled();
    });
    it('strips validated allowance consent metadata without changing the field request', async () => {
        const f = fixture();
        const accepted = await f.app.request(f.path, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                ...f.input,
                confirmedQuoteId: randomUUID(),
            }),
        });
        expect(accepted.status).toBe(202);
        expect(f.store.request.mock.calls[0]?.[2]).toEqual(f.input);
        const invalid = await f.app.request(f.path, {
            method: 'POST',
            headers,
            body: JSON.stringify({ ...f.input, confirmedQuoteId: 'invalid' }),
        });
        expect(invalid.status).toBe(400);
        expect(f.store.request).toHaveBeenCalledTimes(1);
    });
    it('rejects an untrusted origin before execution', async () => {
        const f = fixture();
        expect(
            (
                await f.app.request(f.path, {
                    method: 'POST',
                    headers: { ...headers, Origin: 'https://attacker.invalid' },
                    body: JSON.stringify(f.input),
                })
            ).status,
        ).toBe(403);
        expect(f.store.request).not.toHaveBeenCalled();
    });
    it('hides foreign/revoked job existence from status and cancellation', async () => {
        const f = fixture();
        f.store.get.mockRejectedValue(new TextsAiError('access_revoked'));
        f.store.cancel.mockRejectedValue(
            new TextsAiError('generation_job_not_found'),
        );
        expect(
            (await f.app.request(`${f.path}/${f.job.id}`, { headers })).status,
        ).toBe(404);
        expect(
            (
                await f.app.request(`${f.path}/${f.job.id}/cancel`, {
                    method: 'POST',
                    headers,
                })
            ).status,
        ).toBe(404);
    });
    it('keeps insufficient credit distinct from source errors', async () => {
        const f = fixture();
        f.store.request.mockRejectedValue(
            new TextsAiError('ai_credits_exhausted'),
        );
        const response = await f.app.request(f.path, {
            method: 'POST',
            headers,
            body: JSON.stringify(f.input),
        });
        expect(response.status).toBe(402);
        expect(await response.json()).toMatchObject({
            error: { code: 'ai_credits_exhausted' },
        });
    });
});
