import { isAuthenticationRequiredError } from '@languon/browser-auth';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLearningApi } from '@/fsd/features/flashcard-training/api/learning-api';
import type { RequestWithSession } from '@/fsd/entities/dictionary';
import type { TrainingTarget } from '@/fsd/features/flashcard-training/types';

const id = '10000000-0000-4000-8000-000000000001';
const configuration = {
    front: ['targetExample' as const],
    back: ['sourceExample' as const],
};
const shared: TrainingTarget = {
    kind: 'shared',
    shareId: 'a'.repeat(32),
    shareKey: 'b'.repeat(64),
};
function response(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
function preferences() {
    return { configuration, shuffle: true, version: 0 };
}
function authenticated(): RequestWithSession {
    return vi.fn(async (operation) => operation('access-token'));
}
afterEach(() => {
    vi.unstubAllGlobals();
});

describe('validated training HTTP client', () => {
    it('validates an invalid capability at the request boundary, not during rendering', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(response({ flashcardsEnabled: false }));
        vi.stubGlobal('fetch', fetchMock);
        let api!: ReturnType<typeof createLearningApi>;
        expect(() => {
            api = createLearningApi({
                target: { ...shared, shareKey: 'short' },
                signedIn: false,
                requestWithSession: authenticated(),
            });
        }).not.toThrow();
        expect(await api.capabilities()).toEqual({ flashcardsEnabled: false });
        await expect(api.listEntries({})).rejects.toMatchObject({
            code: 'invalid_request',
            status: 400,
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it('uses the owner refresh wrapper and validates preferences responses', async () => {
        const fetchMock = vi.fn().mockResolvedValue(response(preferences()));
        vi.stubGlobal('fetch', fetchMock);
        const requestWithSession = authenticated();
        const api = createLearningApi({
            target: { kind: 'owner', dictionaryId: id },
            signedIn: true,
            requestWithSession,
            baseUrl: 'http://localhost:4000/',
        });
        expect(await api.getPreferences()).toEqual(preferences());
        expect(requestWithSession).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
            `http://localhost:4000/learning/dictionaries/${id}/flashcards/preferences`,
            expect.objectContaining({
                cache: 'no-store',
                headers: expect.objectContaining({
                    Authorization: 'Bearer access-token',
                }),
            }),
        );
    });
    it('passes the shared capability only in its dedicated header, never a URL', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            response({
                entryIds: [id],
                eligibleCount: 1,
                skippedCount: 0,
                fallbackCount: 1,
            }),
        );
        vi.stubGlobal('fetch', fetchMock);
        const wrapper = authenticated();
        const api = createLearningApi({
            target: shared,
            signedIn: true,
            requestWithSession: wrapper,
        });
        await api.prepare({ configuration, scope: { type: 'all' } });
        const [url, options] = fetchMock.mock.calls[0]!;
        expect(String(url)).not.toContain(shared.shareKey);
        expect(options.headers).toMatchObject({
            'X-Languon-Share-Key': shared.shareKey,
            Authorization: 'Bearer access-token',
        });
        expect(wrapper).toHaveBeenCalledTimes(1);
    });
    it('anonymous shared content reads never acquire or send a bearer token', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(response({ entries: [], nextCursor: null }));
        vi.stubGlobal('fetch', fetchMock);
        const wrapper = authenticated();
        const api = createLearningApi({
            target: shared,
            signedIn: false,
            requestWithSession: wrapper,
        });
        await api.listEntries({ search: 'bonjour + hello', limit: 25 });
        expect(wrapper).not.toHaveBeenCalled();
        expect(
            fetchMock.mock.calls[0]![1].headers.Authorization,
        ).toBeUndefined();
        expect(fetchMock.mock.calls[0]![0]).toContain(
            'search=bonjour+%2B+hello',
        );
    });
    it('capabilities is public and carries neither share key nor bearer token', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(response({ flashcardsEnabled: true }));
        vi.stubGlobal('fetch', fetchMock);
        const wrapper = authenticated();
        const api = createLearningApi({
            target: shared,
            signedIn: true,
            requestWithSession: wrapper,
        });
        await api.capabilities();
        expect(wrapper).not.toHaveBeenCalled();
        expect(fetchMock.mock.calls[0]![1].headers).toEqual({
            Accept: 'application/json',
        });
    });
    it('preserves the shared 401 shape required by the refresh wrapper', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            response(
                {
                    error: {
                        code: 'authentication_required',
                        correlationId: 'test',
                        message: 'Expired',
                    },
                },
                401,
            ),
        );
        vi.stubGlobal('fetch', fetchMock);
        const api = createLearningApi({
            target: shared,
            signedIn: true,
            requestWithSession: authenticated(),
        });
        await expect(api.getProgress()).rejects.toSatisfy(
            isAuthenticationRequiredError,
        );
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it('refresh retry never silently falls back to anonymous when a token is invalid', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                response(
                    {
                        error: {
                            code: 'authentication_required',
                            correlationId: 'test',
                            message: 'Expired',
                        },
                    },
                    401,
                ),
            )
            .mockResolvedValueOnce(response(preferences()));
        vi.stubGlobal('fetch', fetchMock);
        const wrapper: RequestWithSession = async (operation) => {
            try {
                return await operation('old-token');
            } catch (error) {
                if (!isAuthenticationRequiredError(error)) throw error;
                return operation('new-token');
            }
        };
        const api = createLearningApi({
            target: shared,
            signedIn: true,
            requestWithSession: wrapper,
        });
        await api.getPreferences();
        expect(
            fetchMock.mock.calls.map(
                ([, options]) => options.headers.Authorization,
            ),
        ).toEqual(['Bearer old-token', 'Bearer new-token']);
    });
    it('rejects malformed successful payloads instead of displaying unvalidated content', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValue(
                    response({ entries: [{ text: '<script>' }] }),
                ),
        );
        const api = createLearningApi({
            target: shared,
            signedIn: false,
            requestWithSession: authenticated(),
        });
        await expect(api.listEntries({})).rejects.toMatchObject({
            status: 502,
            code: 'service_unavailable',
        });
    });
    it('bounds requests before transport and rejects invalid configuration or large batches', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const api = createLearningApi({
            target: shared,
            signedIn: false,
            requestWithSession: authenticated(),
        });
        expect(() =>
            api.getItems({ configuration, entryIds: Array(26).fill(id) }),
        ).toThrow();
        expect(() =>
            api.prepare({
                configuration: { front: [], back: ['source'] },
                scope: { type: 'all' },
            }),
        ).toThrow();
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('preserves a retry-after budget and classifies network loss as an ambiguous failure', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                response(
                    {
                        error: {
                            code: 'rate_limited',
                            correlationId: 'test',
                            message: 'Slow down',
                            retryAfterSeconds: 4,
                        },
                    },
                    429,
                ),
            )
            .mockRejectedValueOnce(new Error('disconnect'));
        vi.stubGlobal('fetch', fetchMock);
        const api = createLearningApi({
            target: shared,
            signedIn: false,
            requestWithSession: authenticated(),
        });
        await expect(api.listEntries({})).rejects.toMatchObject({
            code: 'rate_limited',
            retryAfterSeconds: 4,
        });
        await expect(api.listEntries({})).rejects.toMatchObject({
            code: 'network_timeout',
            status: 0,
        });
    });
});
