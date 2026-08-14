import { describe, expect, it, vi } from 'vitest';

import {
    AuthenticationRequiredError,
    RateLimitExceededError,
    RecentAuthenticationRequiredError,
} from '../../../../../../src/modules/authentication/application/authentication-errors';
import { AuthHttpPolicy } from '../../../../../../src/modules/authentication/interface/http/auth-http-policy';
import type { AuthenticationHttpOperations } from '../../../../../../src/modules/authentication/interface/http/authentication-http-operations';
import { createPasswordAuthRoutes } from '../../../../../../src/modules/authentication/interface/http/password-auth.routes';

const userId = '0198a941-8ace-7115-aec6-d2b594aaee06';
const sessionId = '0198a941-7824-7de6-8200-e54baa45a926';
const flowId = '0198a941-9498-7b8f-be17-cac0b0aca5b9';
const now = '2026-08-13T10:00:00.000Z';

function authenticatedResponse() {
    return {
        accessToken: 'header.payload.signature',
        accessTokenExpiresAt: '2026-08-13T10:15:00.000Z',
        session: {
            authenticatedAt: now,
            createdAt: now,
            expiresAt: '2026-08-27T10:00:00.000Z',
            id: sessionId,
            recentAuthenticationExpiresAt: '2026-08-13T10:05:00.000Z',
        },
        status: 'authenticated' as const,
        tokenType: 'Bearer' as const,
        user: {
            createdAt: now,
            emailVerified: true as const,
            id: userId,
            primaryEmail: 'learner@example.com',
            status: 'active' as const,
        },
    };
}

function createOperations(): AuthenticationHttpOperations {
    const authenticated = authenticatedResponse();
    return {
        capabilities: vi.fn(async () => ({
            email: { passwordRecovery: true, signUp: true, verification: true },
            passkeys: { authentication: true, registration: true },
            passwordAuthentication: true,
        })),
        changePassword: vi.fn(async () => ({
            refreshCredential: 'replacement',
            response: authenticated,
        })),
        currentUser: vi.fn(async () => ({
            session: authenticated.session,
            user: authenticated.user,
        })),
        forgotPassword: vi.fn(async () => ({
            recovery: {
                expiresAt: '2026-08-13T10:10:00.000Z',
                flowId,
                resendAvailableAt: '2026-08-13T10:01:00.000Z',
            },
            status: 'recovery_pending' as const,
        })),
        loginWithPassword: vi.fn(async () => ({
            refreshCredential: 'opaque-login',
            response: authenticated,
        })),
        logout: vi.fn(async () => ({ status: 'signed_out' as const })),
        logoutAll: vi.fn(async () => ({
            status: 'all_sessions_revoked' as const,
        })),
        refresh: vi.fn(async () => ({
            refreshCredential: 'rotated-refresh',
            response: authenticated,
        })),
        resendEmailVerification: vi.fn(async () => ({
            status: 'verification_pending' as const,
            verification: {
                expiresAt: '2026-08-13T10:10:00.000Z',
                flowId,
                resendAvailableAt: '2026-08-13T10:01:00.000Z',
            },
        })),
        resetPassword: vi.fn(async () => ({
            status: 'password_reset' as const,
        })),
        signUp: vi.fn(async () => ({
            status: 'verification_pending' as const,
            verification: {
                expiresAt: '2026-08-13T10:10:00.000Z',
                flowId,
                resendAvailableAt: '2026-08-13T10:01:00.000Z',
            },
        })),
        verifyEmail: vi.fn(async () => ({
            refreshCredential: 'opaque-verify',
            response: authenticated,
        })),
    };
}

function createRoutes(operations = createOperations()) {
    return {
        app: createPasswordAuthRoutes({
            operations,
            policy: new AuthHttpPolicy({
                allowedOrigins: ['https://app.languon.example'],
                appEnvironment: 'production',
                refreshTokenTtlSeconds: 1_209_600,
            }),
        }),
        operations,
    };
}

describe('password auth HTTP routes', () => {
    it('publishes capabilities with no-store security headers', async () => {
        const { app } = createRoutes();
        const response = await app.request('/auth/capabilities');

        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
        await expect(response.json()).resolves.toMatchObject({
            passwordAuthentication: true,
        });
    });

    it('validates input, accepts an exact origin, and sets only an HTTP-only refresh cookie', async () => {
        const { app, operations } = createRoutes();
        const response = await app.request('/auth/login/password', {
            body: JSON.stringify({
                email: 'learner@example.com',
                password: 'a valid existing password',
            }),
            headers: {
                'Content-Type': 'application/json',
                Origin: 'https://app.languon.example',
            },
            method: 'POST',
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('Set-Cookie')).toContain(
            '__Host-languon_refresh=opaque-login',
        );
        expect(response.headers.get('Set-Cookie')).toContain('HttpOnly');
        expect(operations.loginWithPassword).toHaveBeenCalledWith(
            {
                email: 'learner@example.com',
                password: 'a valid existing password',
            },
            expect.objectContaining({ clientAddress: '127.0.0.1' }),
        );
        expect(JSON.stringify(await response.json())).not.toContain(
            'opaque-login',
        );
    });

    it('rejects hostile origins before invoking a mutating operation', async () => {
        const { app, operations } = createRoutes();
        const response = await app.request('/auth/sign-up', {
            body: JSON.stringify({
                email: 'learner@example.com',
                password: 'a sufficiently long password',
            }),
            headers: {
                'Content-Type': 'application/json',
                Origin: 'https://evil.example',
            },
            method: 'POST',
        });

        expect(response.status).toBe(403);
        expect(operations.signUp).not.toHaveBeenCalled();
        await expect(response.json()).resolves.toMatchObject({
            error: { code: 'forbidden' },
        });
    });

    it('rotates a cookie credential without returning it in JSON', async () => {
        const { app, operations } = createRoutes();
        const response = await app.request('/auth/refresh', {
            body: '{}',
            headers: {
                'Content-Type': 'application/json',
                Cookie: '__Host-languon_refresh=old-refresh',
                Origin: 'https://app.languon.example',
            },
            method: 'POST',
        });

        expect(operations.refresh).toHaveBeenCalledWith(
            'old-refresh',
            expect.objectContaining({ clientAddress: '127.0.0.1' }),
        );
        expect(response.headers.get('Set-Cookie')).toContain('rotated-refresh');
        expect(JSON.stringify(await response.json())).not.toContain(
            'rotated-refresh',
        );
    });

    it('keeps logout idempotent when the browser has no refresh cookie', async () => {
        const { app, operations } = createRoutes();
        const response = await app.request('/auth/logout', {
            body: '{}',
            headers: {
                'Content-Type': 'application/json',
                Origin: 'https://app.languon.example',
            },
            method: 'POST',
        });

        expect(response.status).toBe(200);
        expect(operations.logout).toHaveBeenCalledWith(
            null,
            expect.objectContaining({ clientAddress: '127.0.0.1' }),
        );
        expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
    });

    it('clears the refresh cookie when refresh authentication is terminally invalid', async () => {
        const operations = createOperations();
        vi.mocked(operations.refresh).mockRejectedValue(
            new AuthenticationRequiredError(),
        );
        const { app } = createRoutes(operations);
        const response = await app.request('/auth/refresh', {
            body: '{}',
            headers: {
                'Content-Type': 'application/json',
                Cookie: '__Host-languon_refresh=stale',
                Origin: 'https://app.languon.example',
            },
            method: 'POST',
        });

        expect(response.status).toBe(401);
        expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
    });

    it.each([
        [new RecentAuthenticationRequiredError(), 403],
        [new RateLimitExceededError(10), 429],
        [new Error('private'), 500],
    ])(
        'preserves the refresh cookie for a non-terminal %s response',
        async (error, status) => {
            const operations = createOperations();
            vi.mocked(operations.refresh).mockRejectedValue(error);
            const { app } = createRoutes(operations);
            const response = await app.request('/auth/refresh', {
                body: '{}',
                headers: {
                    'Content-Type': 'application/json',
                    Cookie: '__Host-languon_refresh=still-valid',
                    Origin: 'https://app.languon.example',
                },
                method: 'POST',
            });

            expect(response.status).toBe(status);
            expect(response.headers.has('Set-Cookie')).toBe(false);
        },
    );

    it('preserves the refresh cookie when logout fails transiently', async () => {
        const operations = createOperations();
        vi.mocked(operations.logout).mockRejectedValue(new Error('private'));
        const { app } = createRoutes(operations);
        const response = await app.request('/auth/logout', {
            body: '{}',
            headers: {
                'Content-Type': 'application/json',
                Cookie: '__Host-languon_refresh=still-valid',
                Origin: 'https://app.languon.example',
            },
            method: 'POST',
        });

        expect(response.status).toBe(500);
        expect(response.headers.has('Set-Cookie')).toBe(false);
    });

    it('rejects an oversized body before parsing or invoking an operation', async () => {
        const { app, operations } = createRoutes();
        const response = await app.request('/auth/login/password', {
            body: JSON.stringify({
                email: 'learner@example.com',
                password: 'x'.repeat(400 * 1024),
            }),
            headers: {
                'Content-Type': 'application/json',
                Origin: 'https://app.languon.example',
                'X-Correlation-ID': 'oversized-password-request',
            },
            method: 'POST',
        });

        expect(response.status).toBe(413);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(operations.loginWithPassword).not.toHaveBeenCalled();
        await expect(response.json()).resolves.toMatchObject({
            error: {
                code: 'invalid_request',
                correlationId: 'oversized-password-request',
            },
        });
    });

    it('documents the password and session operations', () => {
        const { app } = createRoutes();
        const document = app.getOpenAPIDocument({
            info: { title: 'test', version: '1' },
            openapi: '3.1.0',
        });
        const paths = document.paths;

        expect(Object.keys(paths)).toEqual(
            expect.arrayContaining([
                '/auth/sign-up',
                '/auth/email-verification/verify',
                '/auth/login/password',
                '/auth/refresh',
                '/auth/logout',
                '/auth/password/forgot',
                '/auth/password/reset',
                '/auth/password/change',
                '/users/me',
            ]),
        );
        expect(document.components?.securitySchemes).toMatchObject({
            bearerAuth: { bearerFormat: 'JWT', scheme: 'bearer', type: 'http' },
        });
        for (const [path, method] of [
            ['/auth/logout-all', 'post'],
            ['/auth/password/change', 'post'],
            ['/users/me', 'get'],
        ] as const) {
            expect(paths[path]?.[method]).toMatchObject({
                security: [{ bearerAuth: [] }],
            });
        }
        expect(paths['/auth/login/password']?.post).not.toHaveProperty(
            'security',
        );
    });
});
