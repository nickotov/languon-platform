import { AdminUsersResponseSchema } from '@languon/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    AdminApiError,
    adminApi,
    resolveAdminAccessTokenHeader,
    resolveAdminApiUrl,
} from '../src/shared/api/admin-api';
import { accessTokenStore } from '../src/shared/auth/access-token-store';
import { adminAuthProvider } from '../src/shared/auth/admin-auth-provider';
import { adminI18nProvider } from '../src/shared/i18n/admin-i18n-provider';

afterEach(() => {
    accessTokenStore.clear();
    vi.unstubAllGlobals();
});

describe('admin API boundary', () => {
    it('provides English labels and interpolated values through Refine i18n', () => {
        expect(adminI18nProvider.getLocale()).toBe('en');
        expect(
            adminI18nProvider.translate('users.matching', { count: 3 }),
        ).toBe('3 matching users');
        expect(adminI18nProvider.translate('user.confirmDisable')).toBe(
            'Confirm disable',
        );
    });

    it('uses the same-origin API proxy by default and supports explicit URLs', () => {
        expect(resolveAdminApiUrl(true, undefined)).toBe('/api');
        expect(resolveAdminApiUrl(false, undefined)).toBe('/api');
        expect(resolveAdminApiUrl(false, 'http://localhost:4000/')).toBe(
            'http://localhost:4000',
        );
        expect(resolveAdminAccessTokenHeader(false)).toBe('Authorization');
        expect(resolveAdminAccessTokenHeader(true)).toBe(
            'X-Languon-Admin-Authorization',
        );
    });

    it('requires a refresh session when no memory-only token is available', async () => {
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
            adminApi.users({ page: 1, pageSize: 25 }),
        ).rejects.toBeInstanceOf(AdminApiError);
    });

    it('coordinates one refresh and retries concurrent expired-token requests once', async () => {
        const fetchMock = vi.fn(
            async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = String(input);
                const headers = init?.headers as Record<string, string>;
                if (url.endsWith('/admin/auth/refresh')) {
                    return jsonResponse(authenticationResponse());
                }
                if (headers.Authorization === 'Bearer expired-token') {
                    return jsonResponse(
                        {
                            error: {
                                code: 'authentication_required',
                                correlationId: 'expired-request',
                                message: 'Authentication is required.',
                            },
                        },
                        401,
                    );
                }
                return jsonResponse({
                    data: [],
                    page: 1,
                    pageSize: 25,
                    total: 0,
                });
            },
        );
        vi.stubGlobal('fetch', fetchMock);
        accessTokenStore.set('expired-token');

        await Promise.all([
            adminApi.users({ page: 1, pageSize: 25 }),
            adminApi.users({ page: 1, pageSize: 25 }),
        ]);

        expect(
            fetchMock.mock.calls.filter(([input]) =>
                String(input).endsWith('/admin/auth/refresh'),
            ),
        ).toHaveLength(1);
        expect(accessTokenStore.get()).toBe('aaa.bbb.ccc');
    });

    it('validates protected list responses and sends the bearer token', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify(
                    AdminUsersResponseSchema.parse({
                        data: [],
                        page: 2,
                        pageSize: 10,
                        total: 0,
                    }),
                ),
                { headers: { 'Content-Type': 'application/json' } },
            ),
        );
        vi.stubGlobal('fetch', fetchMock);
        accessTokenStore.set('admin-access-token');

        await adminApi.users({ page: 2, pageSize: 10, status: 'disabled' });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringMatching(
                /\/admin\/users\?page=2&pageSize=10&status=disabled$/,
            ),
            expect.objectContaining({
                credentials: 'include',
                headers: expect.objectContaining({
                    Authorization: 'Bearer admin-access-token',
                }),
            }),
        );
    });

    it('preserves administration conflict details for explicit UI handling', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        error: {
                            code: 'user_state_conflict',
                            correlationId: 'request-42',
                            message: 'The user changed since it was loaded.',
                        },
                    }),
                    {
                        headers: { 'Content-Type': 'application/json' },
                        status: 409,
                    },
                ),
            ),
        );
        accessTokenStore.set('admin-access-token');

        await expect(
            adminApi.mutateUser(
                '0198c600-52bb-7e53-8ac3-3102668e32ab',
                'disable',
                {
                    expectedVersion: 3,
                    reason: 'Reviewed account policy violation',
                },
            ),
        ).rejects.toMatchObject({
            detail: { code: 'user_state_conflict' },
            status: 409,
        });
    });

    it('keeps an active in-memory session available during a transient network failure', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
        accessTokenStore.set('aaa.bbb.ccc');

        await expect(adminAuthProvider.check()).resolves.toMatchObject({
            authenticated: true,
            error: expect.objectContaining({ status: 0 }),
        });
        expect(accessTokenStore.get()).toBe('aaa.bbb.ccc');
    });
});

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
        status,
    });
}

function authenticationResponse() {
    return {
        accessToken: 'aaa.bbb.ccc',
        accessTokenExpiresAt: '2026-08-20T09:15:00.000Z',
        session: {
            authenticatedAt: '2026-08-20T09:00:00.000Z',
            createdAt: '2026-08-20T09:00:00.000Z',
            expiresAt: '2026-08-27T09:00:00.000Z',
            id: '0198c500-0d8d-7d54-b318-5912960bfa4e',
            recentAuthenticationExpiresAt: '2026-08-20T09:05:00.000Z',
        },
        status: 'authenticated',
        tokenType: 'Bearer',
        user: {
            createdAt: '2026-08-19T09:00:00.000Z',
            emailVerified: true,
            id: '0198c500-2f03-792c-a68d-d6dc0247bba7',
            primaryEmail: 'owner@example.com',
            status: 'active',
        },
    };
}
