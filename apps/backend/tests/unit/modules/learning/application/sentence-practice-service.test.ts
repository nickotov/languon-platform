import {
    SentenceCreditsExhaustedError,
    SentenceModelUnavailableError,
    SentenceConflictError,
    SentenceUnavailableError,
    SentenceCapacityUnavailableError,
} from '../../../../../src/modules/learning/domain/sentence-errors';
import { describe, it, expect, vi } from 'vitest';
import { fixture } from '../learning-test-fixture';
import { SentencePracticeService } from '../../../../../src/modules/learning/application/sentence-practice-service';
import type { SentencePracticeStore } from '../../../../../src/modules/learning/application/ports/sentence-practice-store';
import { LearningAuthenticationRequiredError } from '../../../../../src/modules/learning/domain/errors';
import { createSentenceRoutes } from '../../../../../src/modules/learning/interface/http/sentence.routes';
import { AuthHttpPolicy } from '../../../../../src/modules/authentication/interface/http/auth-http-policy';
const id = '00000000-0000-4000-8000-000000000001';
function setup(enabled = true) {
    const base = fixture();
    const store = {
        prepare: vi.fn(),
        next: vi.fn(),
        getJob: vi.fn(),
        cancelJob: vi.fn(),
        enqueueCheck: vi.fn(),
        attempts: vi.fn(),
        progress: vi.fn(),
        revealReference: vi.fn(),
        manualReviews: vi.fn(),
    } satisfies SentencePracticeStore;
    const service = new SentencePracticeService({
        ...base.dependencies,
        enabled,
        store,
    });
    return { ...base, service, store };
}
const context = {
    clientAddress: '127.0.0.1',
    signal: new AbortController().signal,
};
const input = {
    direction: 'source-to-target' as const,
    mode: 'saved-first' as const,
    scope: { type: 'all' as const },
};
describe('sentence admission service and HTTP', () => {
    it('reports admission pressure as retryable capacity 503 instead of missing content', async () => {
        const f = setup();
        f.store.next.mockRejectedValue(new SentenceCapacityUnavailableError(7));
        const app = createSentenceRoutes({
            service: f.service,
            policy: new AuthHttpPolicy({
                allowedOrigins: [],
                appEnvironment: 'test',
                refreshTokenTtlSeconds: 3600,
            }),
        });
        const res = await app.request(
            `/learning/dictionaries/${id}/sentences/next`,
            {
                method: 'POST',
                headers: {
                    Authorization: 'Bearer valid.token.value',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...input,
                    operationId: id,
                    sessionId: id,
                    visitedExerciseIds: [],
                }),
            },
        );
        expect(res.status).toBe(503);
        expect(res.headers.get('Retry-After')).toBe('7');
        expect((await res.json()).error).toMatchObject({
            code: 'capacity_unavailable',
            retryAfterSeconds: 7,
        });
        expect(f.store.cancelJob).not.toHaveBeenCalled();
        expect(f.store.revealReference).not.toHaveBeenCalled();
    });
    it('admits checks using the canonical plural checks route and preserves capacity failure', async () => {
        const f = setup();
        f.store.enqueueCheck.mockRejectedValue(
            new SentenceCapacityUnavailableError(),
        );
        const app = createSentenceRoutes({
            service: f.service,
            policy: new AuthHttpPolicy({
                allowedOrigins: [],
                appEnvironment: 'test',
                refreshTokenTtlSeconds: 3600,
            }),
        });
        const res = await app.request(
            `/learning/dictionaries/${id}/sentences/exercises/${id}/checks`,
            {
                method: 'POST',
                headers: {
                    Authorization: 'Bearer valid.token.value',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    operationId: id,
                    sessionId: id,
                    answer: 'Answer.',
                    explanationLanguage: 'en',
                    revealedHintIds: [],
                }),
            },
        );
        expect(res.status).toBe(503);
        expect((await res.json()).error.code).toBe('capacity_unavailable');
        expect(f.store.enqueueCheck).toHaveBeenCalled();
        expect(
            (
                await app.request(
                    `/learning/dictionaries/${id}/sentences/exercises/${id}/check`,
                    { method: 'POST' },
                )
            ).status,
        ).toBe(404);
    });

    it('reveals the existing reference freely even when paid admissions fail', async () => {
        const f = setup();
        f.store.next.mockRejectedValue(new SentenceModelUnavailableError());
        f.store.enqueueCheck.mockRejectedValue(
            new SentenceCreditsExhaustedError(),
        );
        f.store.revealReference.mockResolvedValue({
            review: { id, referenceTranslation: 'Saved answer' },
        });
        const app = createSentenceRoutes({
            service: f.service,
            policy: new AuthHttpPolicy({
                allowedOrigins: [],
                appEnvironment: 'test',
                refreshTokenTtlSeconds: 3600,
            }),
        });
        const res = await app.request(
            `/learning/dictionaries/${id}/sentences/exercises/${id}/reference-answer`,
            {
                method: 'POST',
                headers: {
                    Authorization: 'Bearer valid.token.value',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ operationId: id, sessionId: id }),
            },
        );
        expect(res.status).toBe(200);
        expect((await res.json()).review.referenceTranslation).toBe(
            'Saved answer',
        );
        expect(f.store.revealReference).toHaveBeenCalledWith(
            {
                kind: 'owner',
                dictionaryId: id,
                learnerId: 'learner',
            },
            id,
            { operationId: id, sessionId: id },
            {
                now: f.dependencies.clock.now(),
                signal: expect.any(AbortSignal),
            },
        );
        expect(f.store.next).not.toHaveBeenCalled();
        expect(f.store.enqueueCheck).not.toHaveBeenCalled();
        expect(f.store.getJob).not.toHaveBeenCalled();
    });
    it('requires authentication for shared free reveal and personal review history', async () => {
        const f = setup();
        const target = {
            kind: 'shared' as const,
            shareId: 'share',
            shareKey: 'secret',
        };
        await expect(
            f.service.revealReference(
                target,
                id,
                { operationId: id, sessionId: id },
                context,
            ),
        ).rejects.toBeInstanceOf(LearningAuthenticationRequiredError);
        await expect(
            f.service.manualReviews(target, { limit: 25 }, context),
        ).rejects.toBeInstanceOf(LearningAuthenticationRequiredError);
        expect(f.store.revealReference).not.toHaveBeenCalled();
        expect(f.store.manualReviews).not.toHaveBeenCalled();
    });
    it('passes live shared provenance to private manual history and free reveal', async () => {
        const f = setup();
        const target = {
            kind: 'shared' as const,
            shareId: 'share',
            shareKey: 'secret',
            accessToken: 'token',
        };
        await f.service.revealReference(
            target,
            id,
            { operationId: id, sessionId: id },
            context,
        );
        await f.service.manualReviews(target, { limit: 25 }, context);
        const access = {
            kind: 'shared',
            shareId: 'share',
            keyDigest: 'digest',
            learnerId: 'learner',
        };
        expect(f.store.revealReference.mock.calls[0]?.[0]).toEqual(access);
        expect(f.store.manualReviews.mock.calls[0]?.[0]).toEqual(access);
    });
    it('denies unavailable exercise provenance on the free path and keeps disabled feature guarded', async () => {
        const f = setup();
        f.store.revealReference.mockRejectedValue(
            new SentenceUnavailableError(),
        );
        const app = createSentenceRoutes({
            service: f.service,
            policy: new AuthHttpPolicy({
                allowedOrigins: [],
                appEnvironment: 'test',
                refreshTokenTtlSeconds: 3600,
            }),
        });
        const request = {
            method: 'POST',
            headers: {
                Authorization: 'Bearer valid.token.value',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ operationId: id, sessionId: id }),
        };
        expect(
            (
                await app.request(
                    `/learning/dictionaries/${id}/sentences/exercises/${id}/reference-answer`,
                    request,
                )
            ).status,
        ).toBe(404);
        const disabled = setup(false);
        const disabledApp = createSentenceRoutes({
            service: disabled.service,
            policy: new AuthHttpPolicy({
                allowedOrigins: [],
                appEnvironment: 'test',
                refreshTokenTtlSeconds: 3600,
            }),
        });
        const res = await disabledApp.request(
            `/learning/dictionaries/${id}/sentences/exercises/${id}/reference-answer`,
            request,
        );
        expect(res.status).toBe(503);
        expect((await res.json()).error.code).toBe('feature_disabled');
        expect(disabled.store.revealReference).not.toHaveBeenCalled();
    });
    it('serves authenticated personal review history without consulting paid admission', async () => {
        const f = setup();
        f.store.manualReviews.mockResolvedValue({
            reviews: [],
            nextCursor: null,
        });
        const app = createSentenceRoutes({
            service: f.service,
            policy: new AuthHttpPolicy({
                allowedOrigins: [],
                appEnvironment: 'test',
                refreshTokenTtlSeconds: 3600,
            }),
        });
        const res = await app.request(
            `/learning/dictionaries/${id}/sentences/reviews?direction=source-to-target&limit=25`,
            { headers: { Authorization: 'Bearer valid.token.value' } },
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ reviews: [], nextCursor: null });
        expect(f.store.manualReviews).toHaveBeenCalled();
        expect(f.store.next).not.toHaveBeenCalled();
        expect(f.store.enqueueCheck).not.toHaveBeenCalled();
    });

    it.each([
        {
            error: new SentenceCreditsExhaustedError(),
            status: 402,
            code: 'ai_credits_exhausted',
        },
        {
            error: new SentenceModelUnavailableError(),
            status: 503,
            code: 'model_unavailable',
        },
        {
            error: new SentenceConflictError('stale_content'),
            status: 409,
            code: 'stale_content',
        },
    ])('preserves actionable error $code', async ({ error, status, code }) => {
        const f = setup();
        f.store.next.mockRejectedValue(error);
        const app = createSentenceRoutes({
            service: f.service,
            policy: new AuthHttpPolicy({
                allowedOrigins: [],
                appEnvironment: 'test',
                refreshTokenTtlSeconds: 3600,
            }),
        });
        const res = await app.request(
            `/learning/dictionaries/${id}/sentences/next`,
            {
                method: 'POST',
                headers: {
                    Authorization: 'Bearer valid.token.value',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...input,
                    operationId: id,
                    sessionId: id,
                    visitedExerciseIds: [],
                }),
            },
        );
        expect(res.status).toBe(status);
        expect((await res.json()).error.code).toBe(code);
    });

    it('requires authentication even for shared prepare and performs no share lookup on rejection', async () => {
        const f = setup();
        await expect(
            f.service.prepare(
                { kind: 'shared', shareId: 'share', shareKey: 'key' },
                input,
                context,
            ),
        ).rejects.toBeInstanceOf(LearningAuthenticationRequiredError);
        expect(f.store.prepare).not.toHaveBeenCalled();
        expect(
            f.dependencies.dictionaries.findSharedCandidate,
        ).not.toHaveBeenCalled();
    });
    it('passes live share provenance and authenticated learner identity, without share key', async () => {
        const f = setup();
        await f.service.prepare(
            {
                kind: 'shared',
                shareId: 'share',
                shareKey: 'key',
                accessToken: 'token',
            },
            input,
            context,
        );
        expect(f.store.prepare).toHaveBeenCalledWith(
            {
                kind: 'shared',
                shareId: 'share',
                keyDigest: 'digest',
                learnerId: 'learner',
            },
            input,
            { now: f.dependencies.clock.now(), signal: context.signal },
        );
        expect(
            f.dependencies.rateLimiter.consume.mock.calls.map(
                ([call]) => call.scope,
            ),
        ).toEqual([
            'learning.sentences.public',
            'learning.sentences.prepare.learner',
        ]);
    });
    it('isolates capabilities and rejects shared history without bearer authentication', async () => {
        const f = setup();
        const app = createSentenceRoutes({
            service: f.service,
            policy: new AuthHttpPolicy({
                allowedOrigins: ['http://localhost:3333'],
                appEnvironment: 'test',
                refreshTokenTtlSeconds: 3600,
            }),
        });
        expect(
            (await app.request('/learning/sentences/capabilities')).status,
        ).toBe(200);
        const res = await app.request(
            '/learning/shared-dictionaries/abcdefghijklmnop/sentences/progress?direction=source-to-target',
            { headers: { 'x-languon-share-key': 'a'.repeat(43) } },
        );
        expect(res.status).toBe(401);
        expect(f.store.progress).not.toHaveBeenCalled();
    });
    it.each([
        { kind: 'empty', reason: 'no-saved-exercises' },
        { kind: 'job', job: { id } },
    ])('returns transport status for next $kind', async (result) => {
        const f = setup();
        f.store.next.mockResolvedValue(result);
        const app = createSentenceRoutes({
            service: f.service,
            policy: new AuthHttpPolicy({
                allowedOrigins: [],
                appEnvironment: 'test',
                refreshTokenTtlSeconds: 3600,
            }),
        });
        const res = await app.request(
            `/learning/dictionaries/${id}/sentences/next`,
            {
                method: 'POST',
                headers: {
                    Authorization: 'Bearer valid.token.value',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...input,
                    operationId: id,
                    sessionId: id,
                    visitedExerciseIds: [],
                }),
            },
        );
        expect(res.status).toBe(result.kind === 'job' ? 202 : 200);
    });
});
