import { describe, expect, it, vi } from 'vitest';

import { RateLimitExceededError } from '../../../../../../src/modules/authentication/application/authentication-errors';
import { AuthHttpPolicy } from '../../../../../../src/modules/authentication/interface/http/auth-http-policy';
import { createPasskeyAuthRoutes } from '../../../../../../src/modules/authentication/interface/http/passkey-auth.routes';
import type { PasskeyHttpOperations } from '../../../../../../src/modules/authentication/interface/http/passkey-http-operations';

const flowId = '0198a941-9498-7b8f-be17-cac0b0aca5b9';

function operations(): PasskeyHttpOperations {
    return {
        authenticationOptions: vi.fn(async () => ({
            expiresAt: '2026-08-13T10:05:00.000Z',
            flowId,
            options: {
                challenge: 'valid_base64url_challenge',
                rpId: 'app.languon.example',
                timeout: 300_000,
                userVerification: 'required' as const,
            },
        })),
        list: vi.fn(async () => ({ passkeys: [] })),
        registrationOptions: vi.fn(),
        rename: vi.fn(),
        revoke: vi.fn(),
        verifyAuthentication: vi.fn(),
        verifyRegistration: vi.fn(),
    };
}

function routes(passkeys = operations()) {
    return {
        app: createPasskeyAuthRoutes({
            operations: passkeys,
            policy: new AuthHttpPolicy({
                allowedOrigins: ['https://app.languon.example'],
                appEnvironment: 'production',
                refreshTokenTtlSeconds: 1_209_600,
            }),
        }),
        passkeys,
    };
}

describe('passkey auth HTTP routes', () => {
    it('passes bounded request metadata to the passkey application operation', async () => {
        const { app, passkeys } = routes();
        const response = await app.request(
            '/auth/passkeys/authentication/options',
            {
                body: '{}',
                headers: {
                    'Content-Type': 'application/json',
                    Origin: 'https://app.languon.example',
                    'X-Correlation-ID': 'passkey-test',
                },
                method: 'POST',
            },
        );

        expect(response.status).toBe(200);
        expect(passkeys.authenticationOptions).toHaveBeenCalledWith(
            expect.objectContaining({
                clientAddress: '127.0.0.1',
                correlationId: 'passkey-test',
            }),
        );
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
            'https://app.languon.example',
        );
    });

    it('rejects a hostile origin before starting a ceremony', async () => {
        const { app, passkeys } = routes();
        const response = await app.request(
            '/auth/passkeys/authentication/options',
            {
                body: '{}',
                headers: {
                    'Content-Type': 'application/json',
                    Origin: 'https://evil.example',
                },
                method: 'POST',
            },
        );

        expect(response.status).toBe(403);
        expect(passkeys.authenticationOptions).not.toHaveBeenCalled();
    });

    it('maps throttling without exposing implementation errors', async () => {
        const passkeys = operations();
        vi.mocked(passkeys.authenticationOptions).mockRejectedValue(
            new RateLimitExceededError(19),
        );
        const { app } = routes(passkeys);
        const response = await app.request(
            '/auth/passkeys/authentication/options',
            {
                body: '{}',
                headers: {
                    'Content-Type': 'application/json',
                    Origin: 'https://app.languon.example',
                },
                method: 'POST',
            },
        );

        expect(response.status).toBe(429);
        expect(response.headers.get('Retry-After')).toBe('19');
        await expect(response.json()).resolves.toMatchObject({
            error: { code: 'rate_limited', retryAfterSeconds: 19 },
        });
    });

    it('rejects an oversized ceremony body before invoking the operation', async () => {
        const { app, passkeys } = routes();
        const response = await app.request(
            '/auth/passkeys/authentication/verify',
            {
                body: JSON.stringify({ payload: 'x'.repeat(400 * 1024) }),
                headers: {
                    'Content-Type': 'application/json',
                    Origin: 'https://app.languon.example',
                },
                method: 'POST',
            },
        );

        expect(response.status).toBe(413);
        expect(passkeys.verifyAuthentication).not.toHaveBeenCalled();
        await expect(response.json()).resolves.toMatchObject({
            error: { code: 'invalid_request' },
        });
    });

    it('accepts a contract-valid large WebAuthn attestation within the transport bound', async () => {
        const { app, passkeys } = routes();
        vi.mocked(passkeys.verifyRegistration).mockResolvedValue({
            passkey: {
                createdAt: '2026-08-13T10:00:00.000Z',
                id: flowId,
                lastUsedAt: null,
                name: 'Large authenticator',
            },
            status: 'passkey_registered',
        });
        const response = await app.request(
            '/auth/passkeys/registration/verify',
            {
                body: JSON.stringify({
                    credential: {
                        clientExtensionResults: {},
                        id: 'credential',
                        rawId: 'credential',
                        response: {
                            attestationObject: 'A'.repeat(200_000),
                            clientDataJSON: 'client_data',
                        },
                        type: 'public-key',
                    },
                    flowId,
                    name: 'Large authenticator',
                }),
                headers: {
                    Authorization: 'Bearer aaa.bbb.ccc',
                    'Content-Type': 'application/json',
                    Origin: 'https://app.languon.example',
                },
                method: 'POST',
            },
        );

        expect(response.status).toBe(200);
        expect(passkeys.verifyRegistration).toHaveBeenCalledOnce();
    });

    it('documents bearer authentication only on access-token routes', () => {
        const { app } = routes();
        const document = app.getOpenAPIDocument({
            info: { title: 'test', version: '1' },
            openapi: '3.1.0',
        });

        expect(document.components?.securitySchemes).toMatchObject({
            bearerAuth: { bearerFormat: 'JWT', scheme: 'bearer', type: 'http' },
        });
        for (const [path, method] of [
            ['/auth/passkeys/registration/options', 'post'],
            ['/auth/passkeys/registration/verify', 'post'],
            ['/auth/passkeys', 'get'],
            ['/auth/passkeys/{passkeyId}', 'patch'],
            ['/auth/passkeys/{passkeyId}', 'delete'],
        ] as const) {
            expect(document.paths[path]?.[method]).toMatchObject({
                security: [{ bearerAuth: [] }],
            });
        }
        expect(
            document.paths['/auth/passkeys/authentication/options']?.post,
        ).not.toHaveProperty('security');
        expect(
            document.paths['/auth/passkeys/authentication/verify']?.post,
        ).not.toHaveProperty('security');
    });
});
