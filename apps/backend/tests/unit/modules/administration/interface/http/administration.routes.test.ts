import { describe, expect, it, vi } from 'vitest';

import type { AdministrationService } from '../../../../../../src/modules/administration/application/administration-service';
import { AdminAccessDeniedError } from '../../../../../../src/modules/administration/application/administration-errors';
import { createAdministrationRoutes } from '../../../../../../src/modules/administration/interface/http/administration.routes';
import { AuthHttpPolicy } from '../../../../../../src/modules/authentication/interface/http/auth-http-policy';
import type { AuthenticationHttpOperations } from '../../../../../../src/modules/authentication/interface/http/authentication-http-operations';
import type { PasskeyHttpOperations } from '../../../../../../src/modules/authentication/interface/http/passkey-http-operations';

const origin = 'http://localhost:3001';
const userId = '0198c400-25ee-768b-8832-e06d47b174a9';
const sessionId = '0198c400-655c-7b8a-aa46-29a1e2652e62';

function authenticatedResponse() {
    return {
        accessToken: 'header.payload.signature',
        accessTokenExpiresAt: '2026-08-20T10:00:00.000Z',
        session: {
            authenticatedAt: '2026-08-20T09:00:00.000Z',
            createdAt: '2026-08-20T09:00:00.000Z',
            expiresAt: '2026-08-27T09:00:00.000Z',
            id: sessionId,
            recentAuthenticationExpiresAt: '2026-08-20T09:05:00.000Z',
        },
        status: 'authenticated' as const,
        tokenType: 'Bearer' as const,
        user: {
            createdAt: '2026-08-19T09:00:00.000Z',
            id: userId,
            primaryEmail: 'owner@example.com',
            status: 'active' as const,
            verified: true as const,
        },
    };
}

function setup(options: { denyMembership?: boolean } = {}) {
    const administration = {
        assertActiveMembership: options.denyMembership
            ? vi.fn().mockRejectedValue(new AdminAccessDeniedError())
            : vi.fn().mockResolvedValue({ role: 'owner' }),
        currentActor: vi.fn().mockResolvedValue({
            id: userId,
            primaryEmail: 'owner@example.com',
            role: 'owner',
        }),
        dashboard: vi.fn(),
        disableUser: vi.fn(),
        listAuditEvents: vi.fn(),
        listUsers: vi.fn().mockResolvedValue({
            data: [],
            page: 1,
            pageSize: 25,
            total: 0,
        }),
        restoreUser: vi.fn(),
        user: vi.fn(),
    } as unknown as AdministrationService;
    const authentication = {
        loginWithPassword: vi.fn().mockResolvedValue({
            refreshCredential: 'refresh-credential',
            response: authenticatedResponse(),
        }),
        logout: vi.fn().mockResolvedValue({ status: 'signed_out' }),
    } as unknown as AuthenticationHttpOperations;
    const passkeys = {} as PasskeyHttpOperations;
    const app = createAdministrationRoutes({
        administration,
        authentication,
        passkeys,
        policy: new AuthHttpPolicy({
            allowedOrigins: [origin],
            appEnvironment: 'development',
            refreshCookieNamespace: 'admin',
            refreshTokenTtlSeconds: 14 * 24 * 60 * 60,
        }),
    });
    return { administration, app, authentication };
}

describe('administration routes', () => {
    it('sets only the dedicated admin refresh cookie after membership check', async () => {
        const { administration, app } = setup();

        const response = await app.request('/admin/auth/login/password', {
            body: JSON.stringify({
                email: 'owner@example.com',
                password: 'correct horse battery staple',
            }),
            headers: { 'Content-Type': 'application/json', Origin: origin },
            method: 'POST',
        });

        expect(response.status).toBe(200);
        expect(administration.assertActiveMembership).toHaveBeenCalledWith(
            userId,
            expect.any(String),
        );
        expect(response.headers.get('Set-Cookie')).toContain(
            'languon_admin_refresh=refresh-credential',
        );
        expect(response.headers.get('Set-Cookie')).not.toContain(
            'languon_refresh=',
        );
    });

    it('revokes the just-created session and denies login without membership', async () => {
        const { app, authentication } = setup({ denyMembership: true });

        const response = await app.request('/admin/auth/login/password', {
            body: JSON.stringify({
                email: 'member@example.com',
                password: 'correct horse battery staple',
            }),
            headers: { 'Content-Type': 'application/json', Origin: origin },
            method: 'POST',
        });

        expect(response.status).toBe(403);
        expect(authentication.logout).toHaveBeenCalledWith(
            'refresh-credential',
            expect.objectContaining({ correlationId: expect.any(String) }),
        );
        expect(await response.json()).toMatchObject({
            error: { code: 'admin_access_denied' },
        });
    });

    it('validates pagination and requires a bearer token for user listing', async () => {
        const { administration, app } = setup();
        const response = await app.request('/admin/users?page=2&pageSize=10', {
            headers: { Authorization: 'Bearer header.payload.signature' },
        });

        expect(response.status).toBe(200);
        expect(administration.listUsers).toHaveBeenCalledWith(
            'header.payload.signature',
            { page: 2, pageSize: 10 },
        );
    });

    it('rejects credentialed authentication from an unlisted origin', async () => {
        const { app } = setup();
        const response = await app.request('/admin/auth/login/password', {
            body: JSON.stringify({
                email: 'owner@example.com',
                password: 'correct horse battery staple',
            }),
            headers: {
                'Content-Type': 'application/json',
                Origin: 'https://evil.example',
            },
            method: 'POST',
        });
        expect(response.status).toBe(403);
    });
});
