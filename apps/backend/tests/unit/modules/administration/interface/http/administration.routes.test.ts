import { describe, expect, it, vi } from 'vitest';

import type { AdministrationService } from '../../../../../../src/modules/administration/application/administration-service';
import {
    AdminAccessDeniedError,
    AdminAiSettingsConflictError,
    AdminCancellationJournalUnavailableError,
} from '../../../../../../src/modules/administration/application/administration-errors';
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
        aiSettings: vi.fn().mockResolvedValue({
            providers: [],
            settings: {
                activeProvider: null,
                defaultModel: null,
                enabledModels: [],
                updatedAt: null,
                version: 0,
            },
        }),
        updateAiSettings: vi.fn().mockResolvedValue({
            providers: [],
            settings: {
                activeProvider: 'deepseek',
                defaultModel: 'deepseek-chat',
                enabledModels: ['deepseek-chat'],
                updatedAt: '2026-08-20T09:00:00.000Z',
                version: 1,
            },
        }),
        dashboard: vi.fn(),
        cancelUserDeletion: vi.fn().mockResolvedValue({
            activeSessionCount: 0,
            createdAt: '2026-08-19T09:00:00.000Z',
            emailVerified: true,
            id: userId,
            isOwner: false,
            passkeyCount: 0,
            primaryEmail: 'target@example.com',
            status: 'active',
            updatedAt: '2026-08-20T09:00:00.000Z',
            version: 3,
        }),
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
    it('does not apply the admin origin policy to unrelated application routes', async () => {
        const { app } = setup();

        const response = await app.request('/languages', {
            headers: { Origin: 'http://localhost:3333' },
        });

        expect(response.status).toBe(404);
    });

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

    it('validates, routes, and maps conflicts for AI settings mutations', async () => {
        const { administration, app } = setup();
        const body = {
            activeProvider: 'deepseek',
            defaultModel: 'deepseek-chat',
            enabledModels: ['deepseek-chat'],
            expectedVersion: 0,
            reason: 'Enable reviewed dictionary generation',
        };
        const response = await app.request('/admin/ai-settings', {
            body: JSON.stringify(body),
            headers: {
                Authorization: 'Bearer header.payload.signature',
                'Content-Type': 'application/json',
                Origin: origin,
            },
            method: 'PATCH',
        });
        expect(response.status).toBe(200);
        expect(administration.updateAiSettings).toHaveBeenCalledWith(
            'header.payload.signature',
            body,
            expect.any(String),
        );

        const invalid = await app.request('/admin/ai-settings', {
            body: JSON.stringify({ ...body, endpoint: 'http://attacker.test' }),
            headers: {
                Authorization: 'Bearer header.payload.signature',
                'Content-Type': 'application/json',
                Origin: origin,
            },
            method: 'PATCH',
        });
        expect(invalid.status).toBe(400);

        vi.mocked(administration.updateAiSettings).mockRejectedValue(
            new AdminAiSettingsConflictError(),
        );
        const conflict = await app.request('/admin/ai-settings', {
            body: JSON.stringify(body),
            headers: {
                Authorization: 'Bearer header.payload.signature',
                'Content-Type': 'application/json',
                Origin: origin,
            },
            method: 'PATCH',
        });
        expect(conflict.status).toBe(409);
        expect(await conflict.json()).toMatchObject({
            error: { code: 'ai_settings_conflict' },
        });
    });

    it('denies AI settings through the service authorization boundary', async () => {
        const { administration, app } = setup();
        vi.mocked(administration.aiSettings).mockRejectedValue(
            new AdminAccessDeniedError(),
        );
        const response = await app.request('/admin/ai-settings', {
            headers: { Authorization: 'Bearer header.payload.signature' },
        });
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({
            error: { code: 'admin_access_denied' },
        });
    });

    it('validates and routes deletion cancellation as a distinct admin mutation', async () => {
        const { administration, app } = setup();
        const body = {
            expectedVersion: 2,
            reason: 'Support verified the request',
        };
        const response = await app.request(
            `/admin/users/${userId}/deletion/cancel`,
            {
                body: JSON.stringify(body),
                headers: {
                    Authorization: 'Bearer header.payload.signature',
                    'Content-Type': 'application/json',
                    Origin: origin,
                },
                method: 'POST',
            },
        );
        expect(response.status).toBe(200);
        expect(administration.cancelUserDeletion).toHaveBeenCalledWith(
            'header.payload.signature',
            userId,
            body,
            expect.any(String),
        );
        expect(await response.json()).toMatchObject({
            user: { id: userId, status: 'active', version: 3 },
        });

        const invalid = await app.request(
            `/admin/users/${userId}/deletion/cancel`,
            {
                body: JSON.stringify({ expectedVersion: 2, reason: 'no' }),
                headers: {
                    Authorization: 'Bearer header.payload.signature',
                    'Content-Type': 'application/json',
                    Origin: origin,
                },
                method: 'POST',
            },
        );
        expect(invalid.status).toBe(400);
    });

    it('returns a retryable failure when the cancellation journal is unavailable', async () => {
        const { administration, app } = setup();
        vi.mocked(administration.cancelUserDeletion).mockRejectedValue(
            new AdminCancellationJournalUnavailableError(),
        );
        const response = await app.request(
            `/admin/users/${userId}/deletion/cancel`,
            {
                body: JSON.stringify({
                    expectedVersion: 2,
                    reason: 'Support verified the request',
                }),
                headers: {
                    Authorization: 'Bearer header.payload.signature',
                    'Content-Type': 'application/json',
                    Origin: origin,
                },
                method: 'POST',
            },
        );
        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({
            error: { code: 'service_unavailable' },
        });
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
