import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSentenceApi } from '@/fsd/features/sentence-training/api/sentence-api';
import type { RequestWithSession } from '@/fsd/features/sentence-training/types';
const id = '10000000-0000-4000-8000-000000000001';
const operation = '10000000-0000-4000-8000-000000000002';
const session = '10000000-0000-4000-8000-000000000003';
const configuration = {
    direction: 'source-to-target' as const,
    mode: 'saved-first' as const,
    scope: { type: 'all' as const },
    explanationLanguage: 'fr' as const,
};
const check = {
    operationId: operation,
    sessionId: session,
    answer: 'Hello',
    explanationLanguage: 'fr' as const,
    revealedHintIds: [],
};
const job = {
    id,
    kind: 'sentence-check',
    state: 'queued',
    cancellationRequested: false,
    attemptCount: 0,
    createdAt: '2026-10-04T00:00:00.000Z',
    updatedAt: '2026-10-04T00:00:00.000Z',
    failureCode: null,
    result: null,
};
const authenticate: RequestWithSession = (request) => request('access-token');
const options = {
    target: { kind: 'owner' as const, dictionaryId: id },
    signedIn: true,
    requestWithSession: authenticate,
    baseUrl: 'http://localhost:4000',
};
const response = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
afterEach(() => vi.unstubAllGlobals());
describe('sentence transport contracts', () => {
    it('transmits the confirmed next allowance without changing its frozen operation', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(
                response({
                    kind: 'job',
                    job: { ...job, kind: 'sentence-generation' },
                }),
            );
        vi.stubGlobal('fetch', fetchMock);
        const input = {
            ...configuration,
            operationId: operation,
            sessionId: session,
            visitedExerciseIds: [],
            confirmedQuoteId: '10000000-0000-4000-8000-000000000004',
        };
        await createSentenceApi(options).next(input);
        expect(
            JSON.parse(
                (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
            ),
        ).toEqual(input);
    });
    it('uses authenticated plural check and public capability routes without sharing protected credentials', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(response(job))
            .mockResolvedValueOnce(response({ sentencesEnabled: true }));
        vi.stubGlobal('fetch', fetchMock);
        const api = createSentenceApi(options);
        await api.check(id, check);
        await api.capabilities();
        expect(fetchMock.mock.calls[0]![0]).toBe(
            `http://localhost:4000/learning/dictionaries/${id}/sentences/exercises/${id}/checks`,
        );
        const init = fetchMock.mock.calls[0]![1] as RequestInit;
        expect(init).toMatchObject({
            method: 'POST',
            cache: 'no-store',
            credentials: 'include',
            body: JSON.stringify(check),
        });
        expect(new Headers(init.headers).get('authorization')).toBe(
            'Bearer access-token',
        );
        expect(fetchMock.mock.calls[1]![0]).toBe(
            'http://localhost:4000/learning/sentences/capabilities',
        );
        expect(
            new Headers(
                (fetchMock.mock.calls[1]![1] as RequestInit).headers,
            ).has('authorization'),
        ).toBe(false);
    });
    it('uses live shared keys for protected reads without leaking keys into URLs', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(response({ attempts: [], nextCursor: null }));
        vi.stubGlobal('fetch', fetchMock);
        const api = createSentenceApi({
            ...options,
            target: { kind: 'shared', shareId: id, shareKey: 'A'.repeat(43) },
        });
        await api.attempts({
            direction: 'target-to-source',
            exerciseId: operation,
        });
        const [url, init] = fetchMock.mock.calls[0]!;
        expect(url).toContain(
            `/learning/shared-dictionaries/${id}/sentences/attempts?`,
        );
        expect(url).not.toContain('key-that');
        expect(
            new Headers((init as RequestInit).headers).get(
                'x-languon-share-key',
            ),
        ).toBe('A'.repeat(43));
    });
    it('rejects anonymous personal practice/history/reference requests before transport', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const api = createSentenceApi({ ...options, signedIn: false });
        await expect(api.attempts({})).rejects.toMatchObject({
            status: 401,
            code: 'authentication_required',
        });
        await expect(
            api.revealReference(id, {
                operationId: operation,
                sessionId: session,
            }),
        ).rejects.toMatchObject({ status: 401 });
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('posts free reveal only when explicitly called, separate from exercise admission', async () => {
        const exercise = {
            id,
            dictionaryId: id,
            direction: 'source-to-target',
            sourceLanguage: 'fr',
            targetLanguage: 'en',
            sourceText: 'Bonjour',
            segments: [
                {
                    id: 'segment-1',
                    start: 0,
                    end: 7,
                    text: 'Bonjour',
                    target: null,
                },
            ],
            hints: [{ id: 'hint-1', text: 'hello' }],
            generationPolicyVersion: 1,
            createdAt: '2026-10-04T00:00:00.000Z',
        };
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(response({ kind: 'exercise', exercise }))
            .mockResolvedValueOnce(
                response({
                    review: {
                        id: operation,
                        exercise,
                        contentState: 'current',
                        sessionId: session,
                        referenceTranslation: 'Hello',
                        createdAt: '2026-10-04T00:00:00.000Z',
                    },
                }),
            );
        vi.stubGlobal('fetch', fetchMock);
        const api = createSentenceApi(options);
        await api.next({
            ...configuration,
            operationId: operation,
            sessionId: session,
            visitedExerciseIds: [],
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await api.revealReference(id, {
            operationId: operation,
            sessionId: session,
        });
        expect(fetchMock.mock.calls[1]![0]).toContain(
            `/exercises/${id}/reference-answer`,
        );
        expect(
            JSON.parse(
                (fetchMock.mock.calls[1]![1] as RequestInit).body as string,
            ),
        ).toEqual({ operationId: operation, sessionId: session });
    });
    it('validates bounded Unicode answers and unique scope IDs before issuing paid requests', () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const api = createSentenceApi(options);
        expect(() =>
            api.check(id, { ...check, answer: '😀'.repeat(4001) }),
        ).toThrow();
        expect(() =>
            api.next({
                ...configuration,
                operationId: operation,
                sessionId: session,
                visitedExerciseIds: [id, id],
            }),
        ).toThrow();
        expect(() =>
            api.prepare({
                ...configuration,
                scope: { type: 'manual', entryIds: [] },
            }),
        ).toThrow();
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('does not accept reference content smuggled into the normal exercise response', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            response({
                kind: 'exercise',
                exercise: { id, referenceAnswer: 'secret' },
            }),
        );
        vi.stubGlobal('fetch', fetchMock);
        const api = createSentenceApi(options);
        await expect(
            api.next({
                ...configuration,
                operationId: operation,
                sessionId: session,
                visitedExerciseIds: [],
            }),
        ).rejects.toMatchObject({ status: 502, code: 'service_unavailable' });
    });
    it('preserves explicit Retry-After and classifies ambiguous transport loss distinctly', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                response(
                    {
                        error: {
                            code: 'capacity_unavailable',
                            correlationId: 'test',
                            message: 'Busy',
                            retryAfterSeconds: 8,
                        },
                    },
                    503,
                ),
            )
            .mockRejectedValueOnce(new Error('Connection closed'));
        vi.stubGlobal('fetch', fetchMock);
        const api = createSentenceApi(options);
        await expect(api.check(id, check)).rejects.toMatchObject({
            code: 'capacity_unavailable',
            retryAfterSeconds: 8,
        });
        await expect(api.check(id, check)).rejects.toMatchObject({
            status: 0,
            code: 'network_timeout',
        });
    });
    it('rejects malformed path identifiers without fetching', () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const api = createSentenceApi(options);
        expect(() => api.getJob('../private')).toThrow();
        expect(() => api.check('invalid', check)).toThrow();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
