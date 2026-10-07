import { afterEach, describe, it, expect, vi } from 'vitest';
import {
    createLibraryApi,
    LibraryApiError,
} from '@/fsd/features/sentence-library/api/library-api';
import { displayDetail } from '@/fsd/features/sentence-library/lib/sentence-display';
import type { SentenceLibraryDetail } from '@languon/contracts';
const id = '10000000-0000-4000-8000-000000000001';
const operationId = '10000000-0000-4000-8000-000000000002';
const authenticate = <T>(request: (token: string) => Promise<T>) =>
    request('access-token');
const response = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
afterEach(() => vi.unstubAllGlobals());
describe('saved sentence library transport', () => {
    it('uses live shared capability only in headers and no-store authenticated requests', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(response({ items: [], nextCursor: null }));
        vi.stubGlobal('fetch', fetchMock);
        const key = 'a'.repeat(43);
        const api = createLibraryApi(
            { kind: 'shared', shareId: id, shareKey: key },
            authenticate,
        );
        await api.list({
            direction: 'target-to-source',
            personalArchive: 'active',
            globalArchive: 'active',
            contentState: 'all',
        });
        const [url, init] = fetchMock.mock.calls[0]!;
        expect(String(url)).toContain(
            `/learning/shared-dictionaries/${id}/sentences/library?`,
        );
        expect(String(url)).not.toContain(key);
        expect(init).toMatchObject({
            method: 'GET',
            cache: 'no-store',
            credentials: 'include',
        });
        expect(new Headers(init.headers).get('X-Languon-Share-Key')).toBe(key);
    });
    it('keeps the operation identity and frozen snapshot intact when replaying an uncertain mutation', async () => {
        const fetchMock = vi
            .fn()
            .mockImplementation(async () =>
                response({ operationId, affectedCount: 4 }),
            );
        vi.stubGlobal('fetch', fetchMock);
        const api = createLibraryApi(
            { kind: 'owner', dictionaryId: id },
            authenticate,
        );
        const input = {
            operationId,
            operation: 'archive' as const,
            selection: {
                type: 'all-matching' as const,
                snapshotToken: 'snapshot-token',
            },
        };
        await api.mutate(input);
        await api.mutate(input);
        expect(fetchMock.mock.calls[0]![1].body).toBe(
            fetchMock.mock.calls[1]![1].body,
        );
    });
    it('rejects outdated confirmation without hiding the domain failure', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                response(
                    {
                        error: {
                            code: 'version_conflict',
                            message: 'Examples changed.',
                            correlationId: 'example-conflict',
                        },
                    },
                    409,
                ),
            ),
        );
        const api = createLibraryApi(
            { kind: 'owner', dictionaryId: id },
            authenticate,
        );
        await expect(api.snapshot('archive', {})).rejects.toEqual(
            new LibraryApiError(409, 'version_conflict'),
        );
    });
    it('previews only with the dedicated free read endpoint and rejects invalid identifiers before transport', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            response(
                {
                    error: {
                        code: 'entry_not_found',
                        message: 'No example.',
                        correlationId: 'preview-missing',
                    },
                },
                404,
            ),
        );
        vi.stubGlobal('fetch', fetchMock);
        const api = createLibraryApi(
            { kind: 'owner', dictionaryId: id },
            authenticate,
        );
        await expect(api.detail(id)).rejects.toBeInstanceOf(LibraryApiError);
        expect(fetchMock.mock.calls[0]![0]).toContain(
            `/sentences/library/${id}`,
        );
        expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'GET' });
        expect(() => api.detail('bad-id')).toThrow();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it('keeps contextual phrases together without exposing identities', () => {
        const detail = {
            item: {
                exerciseId: id,
                dictionaryId: id,
                direction: 'target-to-source',
                sourceText: 'Il pleut des cordes.',
                sourceLanguage: 'fr',
                targetLanguage: 'ru',
                createdAt: '2026-10-07T00:00:00Z',
                contentState: 'current',
                sharing: 'shared',
                personalArchivedAt: null,
                globalArchivedAt: null,
                version: 1,
            },
            referenceTranslation: 'Льёт как из ведра.',
            exercise: {
                generationPolicyVersion: 2,
                hints: [
                    { id: 'h1', kind: 'contextual', text: 'льёт как из ведра' },
                ],
                segments: [
                    {
                        text: 'Il pleut des cordes',
                        contextualHintId: 'h1',
                        target: null,
                    },
                ],
            },
        } as unknown as SentenceLibraryDetail;
        const display = displayDetail(detail);
        expect(display.contextHints).toEqual([
            {
                id: 'h1',
                source: 'Il pleut des cordes',
                target: 'льёт как из ведра',
                kind: 'phrase',
            },
        ]);
        expect(display).not.toHaveProperty('creatorId');
    });
});
