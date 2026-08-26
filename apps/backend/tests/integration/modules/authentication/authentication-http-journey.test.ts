import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    AuthErrorResponseSchema,
    AuthenticationSuccessResponseSchema,
    CurrentUserResponseSchema,
    ForgotPasswordResponseSchema,
    PasskeyRegistrationOptionsResponseSchema,
    PasswordLoginResponseSchema,
    SignUpResponseSchema,
} from '@languon/contracts';

import { createApp } from '../../../../src/app';
import { loadEnvironment } from '../../../../src/config/environment';
import {
    createAuthenticationComposition,
    type AuthenticationComposition,
} from '../../../../src/modules/authentication/infrastructure/authentication-composition';
import {
    createTestPostgresClient,
    getTestDatabaseUrl,
    isDatabaseIntegrationEnabled,
    migrateTestDatabase,
    resetTestDatabase,
} from '../../support/test-database';
import {
    createTestRedisClient,
    deleteNamespacedKeys,
    redisIntegrationEnabled,
} from '../../support/test-redis';

const describeIfInfrastructure =
    isDatabaseIntegrationEnabled() && redisIntegrationEnabled
        ? describe
        : describe.skip;
const origin = 'http://localhost:3333';
const initialPassword = 'A safe initial password 47!';
const replacementPassword = 'A different secure password 92!';

describeIfInfrastructure('composed authentication HTTP journey', () => {
    let authentication: AuthenticationComposition;
    let app: ReturnType<typeof createApp>;

    beforeAll(async () => {
        const database = createTestPostgresClient();
        await resetTestDatabase(database);
        await migrateTestDatabase(database);
        await database.end();

        authentication = await createAuthenticationComposition(
            loadEnvironment({
                APP_ENV: 'test',
                AUTH_ALLOWED_ORIGINS: origin,
                AUTH_CODE_HMAC_SECRET:
                    'http-journey-code-secret-40-bytes-aaaaaaaa',
                AUTH_JWT_SECRET: 'http-journey-jwt-secret-40-bytes-bbbbbbbb',
                DICTIONARY_HMAC_SECRET:
                    'http-journey-dictionary-secret-40-bytes-cccccccc',
                AUTH_WEBAUTHN_RP_ID: 'localhost',
                DATABASE_URL: getTestDatabaseUrl(),
                NODE_ENV: 'test',
                REDIS_URL: process.env.AUTH_TEST_REDIS_URL,
            }),
        );
        app = createApp({ authentication: authentication.options });
    });

    afterAll(async () => {
        await authentication?.close();
        const redis = createTestRedisClient();
        await redis.connect();
        await deleteNamespacedKeys(redis, 'languon:auth:v1');
        await redis.quit();
    });

    it('publishes the composed authentication contract in OpenAPI', async () => {
        const response = await app.request('/openapi.json');
        const document = (await response.json()) as {
            paths?: Record<string, unknown>;
        };

        expect(response.status).toBe(200);
        expect(document.paths).toMatchObject({
            '/auth/login/password': expect.any(Object),
            '/auth/passkeys/authentication/options': expect.any(Object),
            '/auth/sign-up': expect.any(Object),
            '/users/me': expect.any(Object),
        });
    });

    it('signs up, verifies, refreshes, signs out, resets, and signs in again', async () => {
        const email = 'journey.user@example.com';
        const signup = await post('/auth/sign-up', {
            email,
            password: initialPassword,
        });
        expect(signup.response.status).toBe(202);
        const signupBody = SignUpResponseSchema.parse(signup.body);
        expect(signupBody).toMatchObject({ status: 'verification_pending' });

        const verification = await post('/auth/email-verification/verify', {
            code: '0000',
            flowId: signupBody.verification.flowId,
        });
        expect(verification.response.status).toBe(200);
        const verificationBody = AuthenticationSuccessResponseSchema.parse(
            verification.body,
        );
        expect(verificationBody).toMatchObject({
            status: 'authenticated',
            user: { primaryEmail: email },
        });
        const firstCookie = cookieFrom(verification.response);
        expect(firstCookie).toMatch(/^languon_refresh=/);
        expect(JSON.stringify(verificationBody)).not.toContain(
            firstCookie.split('=')[1],
        );

        const currentUser = await get(
            '/users/me',
            verificationBody.accessToken,
        );
        expect(currentUser.response.status).toBe(200);
        expect(
            CurrentUserResponseSchema.parse(currentUser.body).user.primaryEmail,
        ).toBe(email);

        const registrationOptions = await post(
            '/auth/passkeys/registration/options',
            {},
            { accessToken: verificationBody.accessToken },
        );
        expect(registrationOptions.response.status).toBe(200);
        expect(
            PasskeyRegistrationOptionsResponseSchema.parse(
                registrationOptions.body,
            ).options,
        ).toMatchObject({
            rp: { id: 'localhost' },
        });

        const refreshed = await post(
            '/auth/refresh',
            {},
            { cookie: firstCookie },
        );
        expect(refreshed.response.status).toBe(200);
        const rotatedCookie = cookieFrom(refreshed.response);
        expect(rotatedCookie).not.toBe(firstCookie);

        const logout = await post(
            '/auth/logout',
            {},
            { cookie: rotatedCookie },
        );
        expect(logout.response.status).toBe(200);
        expect(logout.response.headers.get('Set-Cookie')).toContain(
            'Max-Age=0',
        );

        const rejectedRefresh = await post(
            '/auth/refresh',
            {},
            { cookie: rotatedCookie },
        );
        expect(rejectedRefresh.response.status).toBe(401);
        expect(
            AuthErrorResponseSchema.parse(rejectedRefresh.body),
        ).toMatchObject({
            error: { code: 'authentication_required' },
        });

        const recovery = await post('/auth/password/forgot', { email });
        expect(recovery.response.status).toBe(202);
        const recoveryBody = ForgotPasswordResponseSchema.parse(recovery.body);
        const reset = await post('/auth/password/reset', {
            code: '0000',
            flowId: recoveryBody.recovery.flowId,
            newPassword: replacementPassword,
        });
        expect(reset.response.status).toBe(200);

        const oldLogin = await post('/auth/login/password', {
            email,
            password: initialPassword,
        });
        expect(oldLogin.response.status).toBe(401);
        expect(AuthErrorResponseSchema.parse(oldLogin.body)).toMatchObject({
            error: { code: 'invalid_credentials' },
        });

        const newLogin = await post('/auth/login/password', {
            email,
            password: replacementPassword,
        });
        expect(newLogin.response.status).toBe(200);
        expect(PasswordLoginResponseSchema.parse(newLogin.body)).toMatchObject({
            status: 'authenticated',
        });
    });

    async function post(
        path: string,
        body: Record<string, unknown>,
        credentials: { accessToken?: string; cookie?: string } = {},
    ) {
        const response = await app.request(path, {
            body: JSON.stringify(body),
            headers: {
                ...(credentials.accessToken
                    ? { Authorization: `Bearer ${credentials.accessToken}` }
                    : {}),
                ...(credentials.cookie ? { Cookie: credentials.cookie } : {}),
                'Content-Type': 'application/json',
                Origin: origin,
            },
            method: 'POST',
        });
        return { body: (await response.json()) as unknown, response };
    }

    async function get(path: string, accessToken: string) {
        const response = await app.request(path, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        return { body: (await response.json()) as unknown, response };
    }

    function cookieFrom(response: Response): string {
        const setCookie = response.headers.get('Set-Cookie');
        if (!setCookie)
            throw new Error('Expected the response to set a cookie.');
        return setCookie.split(';', 1)[0] as string;
    }
});
