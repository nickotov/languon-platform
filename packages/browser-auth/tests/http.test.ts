import {
    AuthErrorResponseSchema,
    CurrentUserResponseSchema,
} from '@languon/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBrowserApiClient } from '../src';

const client = createBrowserApiClient({
    baseUrl: 'https://api.example.test/',
    errorResponseSchema: AuthErrorResponseSchema,
    invalidResponseMessage: 'Invalid response.',
    networkErrorMessage: 'Network unavailable.',
});

afterEach(() => vi.unstubAllGlobals());

describe('browser API client', () => {
    it('sends credentials and bearer auth and validates the response', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    session: {
                        authenticatedAt: '2026-08-20T09:00:00.000Z',
                        createdAt: '2026-08-20T09:00:00.000Z',
                        expiresAt: '2026-08-27T09:00:00.000Z',
                        id: '0198c500-0d8d-7d54-b318-5912960bfa4e',
                        recentAuthenticationExpiresAt: null,
                    },
                    user: {
                        createdAt: '2026-08-19T09:00:00.000Z',
                        id: '0198c500-4b32-79b3-8c04-f4266c43c9ed',
                        primaryEmail: 'owner@example.com',
                        status: 'active',
                        emailVerified: true,
                    },
                }),
                { headers: { 'Content-Type': 'application/json' } },
            ),
        );
        vi.stubGlobal('fetch', fetchMock);

        await client.request('/users/me', {
            accessToken: 'access-token',
            responseSchema: CurrentUserResponseSchema,
        });

        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.example.test/users/me',
            expect.objectContaining({
                credentials: 'include',
                headers: expect.objectContaining({
                    Authorization: 'Bearer access-token',
                }),
            }),
        );
    });

    it('preserves validated server errors', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        error: {
                            code: 'authentication_required',
                            correlationId: 'request-1',
                            message: 'Authentication is required.',
                        },
                    }),
                    {
                        headers: { 'Content-Type': 'application/json' },
                        status: 401,
                    },
                ),
            ),
        );

        await expect(
            client.request('/users/me', {
                responseSchema: CurrentUserResponseSchema,
            }),
        ).rejects.toMatchObject({
            detail: { code: 'authentication_required' },
            status: 401,
        });
    });

    it('supports a scoped application-token header behind edge authentication', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    session: {
                        authenticatedAt: '2026-08-20T09:00:00.000Z',
                        createdAt: '2026-08-20T09:00:00.000Z',
                        expiresAt: '2026-08-27T09:00:00.000Z',
                        id: '0198c500-0d8d-7d54-b318-5912960bfa4e',
                        recentAuthenticationExpiresAt: null,
                    },
                    user: {
                        createdAt: '2026-08-19T09:00:00.000Z',
                        id: '0198c500-2f03-792c-a68d-d6dc0247bba7',
                        primaryEmail: 'owner@example.com',
                        status: 'active',
                        emailVerified: true,
                    },
                }),
                { headers: { 'Content-Type': 'application/json' } },
            ),
        );
        vi.stubGlobal('fetch', fetchMock);
        const edgeClient = createBrowserApiClient({
            accessTokenHeader: 'X-Languon-Admin-Authorization',
            baseUrl: 'https://admin.example.test/api',
            errorResponseSchema: AuthErrorResponseSchema,
            invalidResponseMessage: 'Invalid response.',
            networkErrorMessage: 'Network unavailable.',
        });

        await edgeClient.request('/users/me', {
            accessToken: 'application-token',
            responseSchema: CurrentUserResponseSchema,
        });

        expect(fetchMock).toHaveBeenCalledWith(
            'https://admin.example.test/api/users/me',
            expect.objectContaining({
                headers: expect.objectContaining({
                    'X-Languon-Admin-Authorization': 'Bearer application-token',
                }),
            }),
        );
    });
});
