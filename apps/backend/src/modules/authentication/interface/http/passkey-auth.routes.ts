import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
    AuthErrorResponseSchema,
    PasskeyAuthenticationOptionsRequestSchema,
    PasskeyAuthenticationOptionsResponseSchema,
    PasskeyAuthenticationVerifyRequestSchema,
    PasskeyAuthenticationVerifyResponseSchema,
    PasskeyIdParamsSchema,
    PasskeyListResponseSchema,
    PasskeyRegistrationOptionsRequestSchema,
    PasskeyRegistrationOptionsResponseSchema,
    PasskeyRegistrationVerifyRequestSchema,
    PasskeyRegistrationVerifyResponseSchema,
    RenamePasskeyRequestSchema,
    RenamePasskeyResponseSchema,
    RevokePasskeyResponseSchema,
} from '@languon/contracts';
import type { z } from 'zod';

import { authHttpBodyLimit, safeCorrelationId } from './auth-http-body-limit';
import { AuthHttpError } from './auth-http-error';
import { mapAuthenticationHttpError } from './auth-http-error-mapping';
import type { AuthHttpPolicy } from './auth-http-policy';
import { authenticationRequestMetadata } from './auth-http-request';
import type { PasskeyHttpOperations } from './passkey-http-operations';

const errorResponse = {
    content: { 'application/json': { schema: AuthErrorResponseSchema } },
    description: 'Passkey request failed.',
} as const;
const errors = {
    400: errorResponse,
    401: errorResponse,
    403: errorResponse,
    404: errorResponse,
    409: errorResponse,
    413: errorResponse,
    429: errorResponse,
    500: errorResponse,
    503: errorResponse,
} as const;
const bearerSecurity = [{ bearerAuth: [] as string[] }];
const body = (schema: z.ZodType) => ({
    content: { 'application/json': { schema } },
    required: true,
});
const response = (schema: z.ZodType, description: string) => ({
    content: { 'application/json': { schema } },
    description,
});

export function createPasskeyAuthRoutes(input: {
    operations: PasskeyHttpOperations;
    policy: AuthHttpPolicy;
}): OpenAPIHono {
    const app = new OpenAPIHono({
        defaultHook: (result, context) => {
            if (!result.success) {
                return context.json(
                    new AuthHttpError(
                        'invalid_request',
                        'The request is invalid.',
                        400,
                    ).response(
                        safeCorrelationId(
                            context.req.header('X-Correlation-ID'),
                        ),
                    ),
                    400,
                );
            }
        },
    });
    const bearer = (authorization: string | undefined) =>
        input.policy.parseBearerAuthorization(authorization ?? null);
    const assertOrigin = (origin: string | undefined) =>
        input.policy.assertCookieRequestOrigin(origin ?? null);

    app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
        bearerFormat: 'JWT',
        scheme: 'bearer',
        type: 'http',
    });

    app.onError((error, context) => {
        const correlationId = safeCorrelationId(
            context.req.header('X-Correlation-ID'),
        );
        const mapped = mapAuthenticationHttpError(error);
        if (mapped.retryAfterSeconds) {
            context.header('Retry-After', String(mapped.retryAfterSeconds));
        }
        return context.json(mapped.response(correlationId), mapped.status);
    });

    app.use('*', async (context, next) => {
        for (const [name, value] of Object.entries(
            input.policy.securityHeaders(),
        )) {
            context.header(name, value);
        }
        const origin = context.req.header('Origin');
        if (origin) {
            try {
                input.policy.assertCookieRequestOrigin(origin);
                context.header('Access-Control-Allow-Origin', origin);
                context.header('Access-Control-Allow-Credentials', 'true');
                context.header('Vary', 'Origin');
            } catch {
                // The operation maps a disallowed origin to a safe response.
            }
        }
        await next();
    });

    app.use('*', authHttpBodyLimit);

    app.openapi(
        createRoute({
            method: 'post',
            path: '/auth/passkeys/registration/options',
            request: { body: body(PasskeyRegistrationOptionsRequestSchema) },
            responses: {
                200: response(
                    PasskeyRegistrationOptionsResponseSchema,
                    'Passkey registration options.',
                ),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Authentication'],
        }),
        async (context) => {
            assertOrigin(context.req.header('Origin'));
            return context.json(
                await input.operations.registrationOptions(
                    bearer(context.req.header('Authorization')),
                    authenticationRequestMetadata(context, input.policy),
                ),
                200,
            );
        },
    );

    app.openapi(
        createRoute({
            method: 'post',
            path: '/auth/passkeys/registration/verify',
            request: { body: body(PasskeyRegistrationVerifyRequestSchema) },
            responses: {
                200: response(
                    PasskeyRegistrationVerifyResponseSchema,
                    'Passkey registered.',
                ),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Authentication'],
        }),
        async (context) => {
            assertOrigin(context.req.header('Origin'));
            return context.json(
                await input.operations.verifyRegistration(
                    bearer(context.req.header('Authorization')),
                    context.req.valid('json'),
                    authenticationRequestMetadata(context, input.policy),
                ),
                200,
            );
        },
    );

    app.openapi(
        createRoute({
            method: 'post',
            path: '/auth/passkeys/authentication/options',
            request: { body: body(PasskeyAuthenticationOptionsRequestSchema) },
            responses: {
                200: response(
                    PasskeyAuthenticationOptionsResponseSchema,
                    'Discoverable passkey options.',
                ),
                ...errors,
            },
            tags: ['Authentication'],
        }),
        async (context) => {
            assertOrigin(context.req.header('Origin'));
            return context.json(
                await input.operations.authenticationOptions(
                    authenticationRequestMetadata(context, input.policy),
                ),
                200,
            );
        },
    );

    app.openapi(
        createRoute({
            method: 'post',
            path: '/auth/passkeys/authentication/verify',
            request: { body: body(PasskeyAuthenticationVerifyRequestSchema) },
            responses: {
                200: response(
                    PasskeyAuthenticationVerifyResponseSchema,
                    'Passkey authenticated.',
                ),
                ...errors,
            },
            tags: ['Authentication'],
        }),
        async (context) => {
            assertOrigin(context.req.header('Origin'));
            const result = await input.operations.verifyAuthentication(
                context.req.valid('json'),
                authenticationRequestMetadata(context, input.policy),
            );
            context.header(
                'Set-Cookie',
                input.policy.createRefreshCookie(
                    result.refreshCredential,
                    result.response.session.expiresAt,
                ),
            );
            return context.json(result.response, 200);
        },
    );

    registerManagementRoutes(app, input, bearer, assertOrigin);
    return app;
}

function registerManagementRoutes(
    app: OpenAPIHono,
    input: { operations: PasskeyHttpOperations; policy: AuthHttpPolicy },
    bearer: (authorization: string | undefined) => string,
    assertOrigin: (origin: string | undefined) => void,
): void {
    app.openapi(
        createRoute({
            method: 'get',
            path: '/auth/passkeys',
            responses: {
                200: response(
                    PasskeyListResponseSchema,
                    'Safe passkey metadata.',
                ),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Authentication'],
        }),
        async (context) =>
            context.json(
                await input.operations.list(
                    bearer(context.req.header('Authorization')),
                    authenticationRequestMetadata(context, input.policy),
                ),
                200,
            ),
    );

    app.openapi(
        createRoute({
            method: 'patch',
            path: '/auth/passkeys/{passkeyId}',
            request: {
                body: body(RenamePasskeyRequestSchema),
                params: PasskeyIdParamsSchema,
            },
            responses: {
                200: response(RenamePasskeyResponseSchema, 'Passkey renamed.'),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Authentication'],
        }),
        async (context) => {
            assertOrigin(context.req.header('Origin'));
            return context.json(
                await input.operations.rename(
                    bearer(context.req.header('Authorization')),
                    context.req.valid('param').passkeyId,
                    context.req.valid('json'),
                    authenticationRequestMetadata(context, input.policy),
                ),
                200,
            );
        },
    );

    app.openapi(
        createRoute({
            method: 'delete',
            path: '/auth/passkeys/{passkeyId}',
            request: { params: PasskeyIdParamsSchema },
            responses: {
                200: response(RevokePasskeyResponseSchema, 'Passkey revoked.'),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Authentication'],
        }),
        async (context) => {
            assertOrigin(context.req.header('Origin'));
            return context.json(
                await input.operations.revoke(
                    bearer(context.req.header('Authorization')),
                    context.req.valid('param').passkeyId,
                    authenticationRequestMetadata(context, input.policy),
                ),
                200,
            );
        },
    );
}
