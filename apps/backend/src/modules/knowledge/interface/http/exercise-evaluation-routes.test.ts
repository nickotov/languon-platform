import { createApp } from '../../../../app';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { KnowledgeExerciseEvaluationService } from '../../application/exercise-evaluation-service';
import { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import { TextsAiError } from '../../../texts/application/ports/texts-ai-provider';
import { createKnowledgeExerciseEvaluationRoutes } from './exercise-evaluation-routes';

const headers = {
    Authorization: 'Bearer synthetic.payload.signature',
    Origin: 'http://localhost:3000',
    'Content-Type': 'application/json',
};
type EvaluationStore = ConstructorParameters<
    typeof KnowledgeExerciseEvaluationService
>[0]['store'];

function fixture() {
    const actorId = randomUUID(),
        noteId = randomUUID();
    const job = {
        id: randomUUID(),
        noteId,
        attemptId: randomUUID(),
        exerciseId: randomUUID(),
        exerciseRevision: 'a'.repeat(64),
        status: 'queued' as const,
        attempt: null,
        result: null,
        failureCode: null,
        createdAt: new Date().toISOString(),
        completedAt: null,
    };
    const store = {
        request: vi.fn<EvaluationStore['request']>(async () => job),
        get: vi.fn<EvaluationStore['get']>(async () => job),
        cancel: vi.fn<EvaluationStore['cancel']>(async () => ({
            ...job,
            status: 'cancelled' as const,
            completedAt: new Date().toISOString(),
        })),
    };
    const service = new KnowledgeExerciseEvaluationService({
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
        attemptId: job.attemptId,
        replyLanguage: 'ru' as const,
    };
    return {
        actorId,
        noteId,
        job,
        store,
        input,
        path: `/knowledge/${noteId}/learning/evaluations`,
        app: createApp({
            knowledgeExerciseEvaluations:
                createKnowledgeExerciseEvaluationRoutes({
                    service,
                    policy: new AuthHttpPolicy({
                        allowedOrigins: ['http://localhost:3000'],
                        appEnvironment: 'test',
                        refreshTokenTtlSeconds: 3600,
                    }),
                }),
        }),
    };
}
describe('knowledge private exercise evaluation HTTP boundaries', () => {
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
            undefined,
        );
    });
    it('rejects arbitrary paths, caller identity and source-reference tampering before store execution', async () => {
        const f = fixture();
        for (const value of [
            { ...f.input, actorId: randomUUID() },
            { ...f.input, answer: 'An answer' },
            { ...f.input, evaluation: { status: 'correct', method: 'ai' } },
            {
                ...f.input,
                exercise: { referenceAnswer: 'A fabricated reference' },
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
    it('strips validated allowance consent metadata without changing the evaluation request', async () => {
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
    it('validates every shared capability header together and forwards only the authenticated private actor', async () => {
        const f = fixture();
        for (const proof of [
            { 'X-Languon-Share-Key': 'a'.repeat(43) },
            {
                'X-Languon-Share-Kind': 'note',
                'X-Languon-Share-Locator': 'b'.repeat(32),
            },
            {
                'X-Languon-Share-Kind': 'workbook',
                'X-Languon-Share-Locator': 'bad',
                'X-Languon-Share-Key': 'a'.repeat(43),
            },
        ]) {
            const response = await f.app.request(`${f.path}/${f.job.id}`, {
                headers: { ...headers, ...proof },
            });
            expect(response.status).toBe(400);
        }
        expect(f.store.get).not.toHaveBeenCalled();
        const access = {
            kind: 'workbook',
            locator: 'b'.repeat(32),
            key: 'a'.repeat(43),
        };
        const sharedHeaders = {
            ...headers,
            'X-Languon-Share-Kind': access.kind,
            'X-Languon-Share-Locator': access.locator,
            'X-Languon-Share-Key': access.key,
        };
        expect(
            (
                await f.app.request(`${f.path}/${f.job.id}`, {
                    headers: sharedHeaders,
                })
            ).status,
        ).toBe(200);
        expect(f.store.get).toHaveBeenCalledWith(
            f.actorId,
            f.noteId,
            f.job.id,
            expect.objectContaining({ signal: expect.any(AbortSignal) }),
            access,
        );
        expect(
            (
                await f.app.request(`${f.path}/${f.job.id}/cancel`, {
                    method: 'POST',
                    headers: sharedHeaders,
                })
            ).status,
        ).toBe(200);
        expect(f.store.cancel).toHaveBeenCalledWith(
            f.actorId,
            f.noteId,
            f.job.id,
            expect.any(Object),
            access,
        );
    });
    it('bounds the request body and rejects invalid attempt identities before admission', async () => {
        const f = fixture();
        const oversized = await f.app.request(f.path, {
            method: 'POST',
            headers,
            body: JSON.stringify({ ...f.input, extra: 'x'.repeat(40_000) }),
        });
        expect(oversized.status).toBe(413);
        const invalid = await f.app.request(f.path, {
            method: 'POST',
            headers,
            body: JSON.stringify({ ...f.input, attemptId: 'not-an-attempt' }),
        });
        expect(invalid.status).toBe(400);
        expect(f.store.request).not.toHaveBeenCalled();
    });
    it('does not reveal private feedback or reference text for forbidden or changed sources', async () => {
        const f = fixture();
        f.store.request.mockRejectedValue(new TextsAiError('source_changed'));
        const changed = await f.app.request(f.path, {
            method: 'POST',
            headers,
            body: JSON.stringify(f.input),
        });
        expect(changed.status).toBe(409);
        expect(await changed.json()).toMatchObject({
            error: { code: 'source_changed' },
        });
        f.store.get.mockRejectedValue(new TextsAiError('access_revoked'));
        const denied = await f.app.request(`${f.path}/${f.job.id}`, {
            headers,
        });
        expect(denied.status).toBe(404);
        expect(await denied.json()).not.toHaveProperty('job');
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
