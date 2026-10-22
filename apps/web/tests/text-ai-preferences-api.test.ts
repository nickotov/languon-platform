import { isAuthenticationRequiredError } from '@languon/browser-auth';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    preferencesApi,
    PreferenceApiError,
} from '@/fsd/features/text-ai-preferences/api/preferences-api';

afterEach(() => vi.unstubAllGlobals());
describe('text AI preference remote boundary', () => {
    it('sends a validated optimistic PUT and authenticates every request', async () => {
        const fetcher = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    mode: 'auto',
                    modelId: null,
                    version: 2,
                    maxCreditsPerAction: null,
                    selectedModel: null,
                }),
                { status: 200 },
            ),
        );
        vi.stubGlobal('fetch', fetcher);
        await preferencesApi.save('session-token', {
            mode: 'auto',
            expectedVersion: 1,
        });
        expect(fetcher).toHaveBeenCalledWith(
            expect.stringContaining('/users/me/ai-model-preference'),
            expect.objectContaining({
                method: 'PUT',
                cache: 'no-store',
                headers: {
                    Authorization: 'Bearer session-token',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ mode: 'auto', expectedVersion: 1 }),
            }),
        );
    });
    it('rejects malformed or extra remote fields instead of treating them as a saved preference', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        mode: 'auto',
                        modelId: null,
                        version: -1,
                        selectedModel: null,
                        providerSecret: 'not-rendered',
                    }),
                    { status: 200 },
                ),
            ),
        );
        await expect(preferencesApi.read('token')).rejects.toThrow();
    });
    it('preserves typed authentication errors for the shared refresh coordinator', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        error: {
                            code: 'authentication_required',
                            message: 'Sign in.',
                            correlationId: 'local-test',
                        },
                    }),
                    { status: 401 },
                ),
            ),
        );
        const result = await preferencesApi
            .read('expired-token')
            .catch((error) => error);
        expect(result).toBeInstanceOf(PreferenceApiError);
        expect(isAuthenticationRequiredError(result)).toBe(true);
    });
    it('maps malformed failure bodies to a safe retryable error', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValue(
                    new Response('gateway failed', { status: 503 }),
                ),
        );
        await expect(preferencesApi.catalog('token')).rejects.toMatchObject({
            code: 'internal_error',
            status: 503,
        });
    });
});
