import { afterEach, expect, it, vi } from 'vitest';
import { authApi } from '@/fsd/shared/api/auth-api';
import { resolveApiUrl } from '@/fsd/shared/api/api-url';
import { dictionaryApi } from '@/fsd/entities/dictionary';
import { createLearningApi } from '@/fsd/features/flashcard-training/api/learning-api';
import { createSentenceApi } from '@/fsd/features/sentence-training/api/sentence-api';
import { createLibraryApi } from '@/fsd/features/sentence-library/api/library-api';
import { preferencesApi } from '@/fsd/features/text-ai-preferences/api/preferences-api';
import { speechApi } from '@/fsd/features/speech-playback/api/speech-api';

const id = '10000000-0000-4000-8000-000000000001';
const authenticate = <T>(request: (token: string) => Promise<T>) =>
    request('test-token');
const options = {
    target: { kind: 'owner' as const, dictionaryId: id },
    signedIn: true,
    requestWithSession: authenticate,
};
afterEach(() => vi.unstubAllGlobals());

it('defaults to the public API prefix in every environment and preserves explicit paths', () => {
    for (const environment of ['development', 'production', 'test', undefined])
        expect(resolveApiUrl(environment, undefined)).toBe('/api');
    expect(
        resolveApiUrl('development', 'https://api.example.test/custom/'),
    ).toBe('https://api.example.test/custom');
});

it('routes every web API client through /api while preserving authentication transport', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 503 }));
    vi.stubGlobal('fetch', fetcher);
    const calls: Array<[() => Promise<unknown>, string]> = [
        [() => authApi.capabilities(), '/api/auth/capabilities'],
        [
            () => dictionaryApi.listDictionaries('test-token'),
            '/api/dictionaries',
        ],
        [
            () => createLearningApi(options).capabilities(),
            '/api/learning/capabilities',
        ],
        [
            () => createSentenceApi(options).capabilities(),
            '/api/learning/sentences/capabilities',
        ],
        [
            () =>
                createLibraryApi(options.target, authenticate).list({
                    direction: 'target-to-source',
                    personalArchive: 'active',
                    globalArchive: 'active',
                    contentState: 'all',
                }),
            `/api/learning/dictionaries/${id}/sentences/library?`,
        ],
        [() => preferencesApi.catalog('test-token'), '/api/text-ai/models'],
        [
            () =>
                speechApi(authenticate).status(
                    id,
                    new AbortController().signal,
                ),
            `/api/speech/requests/${id}`,
        ],
    ];
    for (const [operation, path] of calls) {
        fetcher.mockClear();
        await expect(operation()).rejects.toBeDefined();
        expect(fetcher).toHaveBeenCalledOnce();
        const [url, init] = vi.mocked(fetch).mock.calls[0]!;
        expect(String(url)).toMatch(
            new RegExp(`^${path.replace(/[?]/g, '\\?')}`),
        );
        expect(init?.credentials).toBe('include');
    }
});
