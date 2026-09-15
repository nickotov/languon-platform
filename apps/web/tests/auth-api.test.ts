import { describe, expect, it, vi } from 'vitest';

import {
    authApi,
    AuthApiError,
    authErrorMessage,
    resolveApiUrl,
} from '@/fsd/shared/api/auth-api';

describe('auth API boundary', () => {
    it('uses environment-neutral same-origin routing in production', () => {
        expect(resolveApiUrl('production', undefined)).toBe('/api');
        expect(resolveApiUrl('development', undefined)).toBe(
            'http://localhost:4000',
        );
        expect(resolveApiUrl('production', 'https://api.example.test/')).toBe(
            'https://api.example.test',
        );
    });
    it('validates successful remote data against the shared schema', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ email: { signUp: true } }), {
                headers: { 'content-type': 'application/json' },
                status: 200,
            }),
        );

        await expect(
            authApi.capabilities(),
        ).rejects.toMatchObject<AuthApiError>({
            detail: { code: 'service_unavailable' },
            status: 502,
        });
    });

    it('maps malformed server errors to a safe generic message', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('upstream exploded', { status: 500 }),
        );

        await expect(
            authApi.capabilities(),
        ).rejects.toMatchObject<AuthApiError>({
            detail: {
                code: 'service_unavailable',
                message:
                    'Authentication is temporarily unavailable. Please try again.',
            },
            status: 500,
        });
    });

    it('always includes credentials and never puts tokens in a URL', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(
                JSON.stringify({
                    email: {
                        passwordRecovery: true,
                        signUp: true,
                        verification: true,
                    },
                    passkeys: { authentication: true, registration: true },
                    passwordAuthentication: true,
                }),
                {
                    headers: { 'content-type': 'application/json' },
                    status: 200,
                },
            ),
        );

        await authApi.capabilities();
        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:4000/auth/capabilities',
            expect.objectContaining({ credentials: 'include' }),
        );
        expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('token');
    });

    it("uses the backend's canonical sign-up route", async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(
                JSON.stringify({
                    status: 'verification_pending',
                    verification: {
                        expiresAt: '2026-08-13T10:10:00.000Z',
                        flowId: '10000000-0000-4000-8000-000000000003',
                        resendAvailableAt: '2026-08-13T10:01:00.000Z',
                    },
                }),
                {
                    headers: { 'content-type': 'application/json' },
                    status: 202,
                },
            ),
        );

        await authApi.signUp({
            email: 'learner@example.com',
            password: 'a very secure password',
        });

        expect(fetchMock.mock.calls[0]?.[0]).toBe(
            'http://localhost:4000/auth/sign-up',
        );
    });

    it('renders safe retry metadata for throttled operations', () => {
        const error = new AuthApiError(429, {
            code: 'rate_limited',
            correlationId: 'request-1',
            message: 'Too many attempts.',
            retryAfterSeconds: 45,
        });

        expect(authErrorMessage(error)).toBe(
            'Too many attempts. Try again in 45 seconds.',
        );
    });

    it('uses authenticated handle PATCH and empty deletion POST without leaking tokens in URLs', async () => {
        const fetchMock = vi
            .spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ handle: 'learner_42' }), {
                    headers: { 'content-type': 'application/json' },
                    status: 200,
                }),
            )
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        status: 'deletion_scheduled',
                        scheduledAt: '2026-09-15T10:00:00.000Z',
                        purgeAt: '2026-10-15T10:00:00.000Z',
                    }),
                    {
                        headers: { 'content-type': 'application/json' },
                        status: 202,
                    },
                ),
            );
        await expect(
            authApi.updateHandle({ handle: 'learner_42' }, 'aaa.bbb.ccc'),
        ).resolves.toEqual({ handle: 'learner_42' });
        await expect(
            authApi.scheduleAccountDeletion('aaa.bbb.ccc'),
        ).resolves.toMatchObject({ status: 'deletion_scheduled' });
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            'http://localhost:4000/users/me/handle',
            expect.objectContaining({
                body: '{"handle":"learner_42"}',
                method: 'PATCH',
                headers: expect.objectContaining({
                    Authorization: 'Bearer aaa.bbb.ccc',
                }),
            }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            'http://localhost:4000/users/me/deletion',
            expect.objectContaining({
                body: '{}',
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Bearer aaa.bbb.ccc',
                }),
            }),
        );
    });

    it.each([
        ['refresh', () => authApi.refresh()],
        ['logout', () => authApi.logout()],
        ['logout-all', () => authApi.logoutAll('aaa.bbb.ccc')],
        [
            'passkey authentication options',
            () => authApi.passkeyAuthenticationOptions(),
        ],
        [
            'passkey registration options',
            () => authApi.passkeyRegistrationOptions('aaa.bbb.ccc'),
        ],
    ])('sends required empty JSON for %s', async (_name, operation) => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({}), {
                headers: { 'content-type': 'application/json' },
                status: 500,
            }),
        );

        await expect(operation()).rejects.toBeInstanceOf(AuthApiError);
        expect(fetchMock).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                body: '{}',
                headers: expect.objectContaining({
                    'Content-Type': 'application/json',
                }),
                method: 'POST',
            }),
        );
    });
});
