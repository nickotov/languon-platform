import { randomUUID } from 'node:crypto';

import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
    AdminAuditEventsQuerySchema,
    AdminAuditEventsResponseSchema,
    AdminDashboardResponseSchema,
    AdminErrorResponseSchema,
    AdminMeResponseSchema,
    AdminUserIdParamsSchema,
    AdminUserResponseSchema,
    AdminUsersQuerySchema,
    AdminUsersResponseSchema,
    AdminUserStatusMutationRequestSchema,
    AdminUserStatusMutationResponseSchema,
    AuthenticationSuccessResponseSchema,
    LogoutRequestSchema,
    LogoutResponseSchema,
    PasskeyAuthenticationOptionsRequestSchema,
    PasskeyAuthenticationOptionsResponseSchema,
    PasskeyAuthenticationVerifyRequestSchema,
    PasswordLoginRequestSchema,
    PasswordLoginResponseSchema,
    RefreshRequestSchema,
} from '@languon/contracts';
import { z } from 'zod';

import type { AuthenticationHttpOperations } from '../../../authentication/interface/http/authentication-http-operations';
import { authHttpBodyLimit } from '../../../authentication/interface/http/auth-http-body-limit';
import type { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import { InvalidRequestOriginError } from '../../../authentication/interface/http/auth-http-policy';
import { authenticationRequestMetadata } from '../../../authentication/interface/http/auth-http-request';
import type { PasskeyHttpOperations } from '../../../authentication/interface/http/passkey-http-operations';
import { AdminUserNotFoundError } from '../../application/administration-errors';
import type { AdministrationService } from '../../application/administration-service';
import { AdministrationHttpError } from './administration-http-error';
import { mapAdministrationHttpError } from './administration-http-error-mapping';

const errorResponse = {
    content: { 'application/json': { schema: AdminErrorResponseSchema } },
    description: 'Administration request failed.',
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

export interface AdministrationRouteDependencies {
    administration: AdministrationService;
    authentication: AuthenticationHttpOperations;
    passkeys: PasskeyHttpOperations;
    policy: AuthHttpPolicy;
}

export function createAdministrationRoutes(
    dependencies: AdministrationRouteDependencies,
): OpenAPIHono {
    const app = new OpenAPIHono({
        defaultHook: (result, context) => {
            if (result.success) return;
            return context.json(
                new AdministrationHttpError(
                    'invalid_request',
                    'The request is invalid.',
                    400,
                ).response(
                    correlationId(context.req.header('X-Correlation-ID')),
                ),
                400,
            );
        },
    });
    app.openAPIRegistry.registerComponent('securitySchemes', 'AdminJWT', {
        bearerFormat: 'JWT',
        scheme: 'bearer',
        type: 'http',
    });
    app.use('*', authHttpBodyLimit);
    app.use('*', async (context, next) => {
        for (const [name, value] of Object.entries(
            dependencies.policy.securityHeaders(),
        )) {
            context.header(name, value);
        }
        const origin = context.req.header('Origin');
        if (origin) {
            dependencies.policy.assertCookieRequestOrigin(origin);
            context.header('Access-Control-Allow-Origin', origin);
            context.header('Access-Control-Allow-Credentials', 'true');
            context.header('Vary', 'Origin');
        }
        await next();
    });
    app.onError((error, context) => {
        const mapped = mapAdministrationHttpError(error);
        if (mapped.status === 401 && context.req.path.includes('/auth/')) {
            context.header(
                'Set-Cookie',
                dependencies.policy.clearRefreshCookie(),
            );
        }
        if (mapped.retryAfterSeconds) {
            context.header('Retry-After', String(mapped.retryAfterSeconds));
        }
        return context.json(
            mapped.response(
                correlationId(context.req.header('X-Correlation-ID')),
            ),
            mapped.status,
        );
    });

    const assertOrigin = (origin: string | undefined) => {
        if (!origin) throw new InvalidRequestOriginError();
        dependencies.policy.assertCookieRequestOrigin(origin);
    };
    const metadata = (
        context: Parameters<typeof authenticationRequestMetadata>[0],
    ) => authenticationRequestMetadata(context, dependencies.policy);
    const bearer = (value: string | undefined) =>
        dependencies.policy.parseBearerAuthorization(value ?? null);

    app.options('*', (context) => {
        const origin = context.req.header('Origin');
        assertOrigin(origin);
        context.header('Access-Control-Allow-Origin', origin!);
        context.header('Access-Control-Allow-Credentials', 'true');
        context.header(
            'Access-Control-Allow-Headers',
            'Authorization, Content-Type, X-Correlation-ID, X-Languon-Admin-Authorization',
        );
        context.header('Access-Control-Allow-Methods', 'GET, POST');
        context.header('Vary', 'Origin');
        return context.body(null, 204);
    });

    app.openapi(
        createRoute({
            method: 'post',
            path: '/admin/auth/login/password',
            request: { body: requestBody(PasswordLoginRequestSchema) },
            responses: {
                200: jsonResponse(PasswordLoginResponseSchema, 'Signed in.'),
                ...errors,
            },
            tags: ['Admin authentication'],
        }),
        async (context) => {
            assertOrigin(context.req.header('Origin'));
            const requestMetadata = metadata(context);
            const result = await dependencies.authentication.loginWithPassword(
                context.req.valid('json'),
                requestMetadata,
            );
            if (
                result.refreshCredential &&
                result.response.status === 'authenticated'
            ) {
                try {
                    await dependencies.administration.assertActiveMembership(
                        result.response.user.id,
                        requestMetadata.correlationId,
                    );
                } catch (error) {
                    await dependencies.authentication.logout(
                        result.refreshCredential,
                        requestMetadata,
                    );
                    throw error;
                }
                context.header(
                    'Set-Cookie',
                    dependencies.policy.createRefreshCookie(
                        result.refreshCredential,
                        result.response.session.expiresAt,
                    ),
                );
            }
            return context.json(result.response, 200);
        },
    );

    app.openapi(
        createRoute({
            method: 'post',
            path: '/admin/auth/passkeys/authentication/options',
            request: {
                body: requestBody(PasskeyAuthenticationOptionsRequestSchema),
            },
            responses: {
                200: jsonResponse(
                    PasskeyAuthenticationOptionsResponseSchema,
                    'Passkey authentication options.',
                ),
                ...errors,
            },
            tags: ['Admin authentication'],
        }),
        async (context) => {
            assertOrigin(context.req.header('Origin'));
            return context.json(
                await dependencies.passkeys.authenticationOptions(
                    metadata(context),
                ),
                200,
            );
        },
    );

    app.openapi(
        createRoute({
            method: 'post',
            path: '/admin/auth/passkeys/authentication/verify',
            request: {
                body: requestBody(PasskeyAuthenticationVerifyRequestSchema),
            },
            responses: {
                200: jsonResponse(
                    AuthenticationSuccessResponseSchema,
                    'Signed in.',
                ),
                ...errors,
            },
            tags: ['Admin authentication'],
        }),
        async (context) => {
            assertOrigin(context.req.header('Origin'));
            const requestMetadata = metadata(context);
            const result = await dependencies.passkeys.verifyAuthentication(
                context.req.valid('json'),
                requestMetadata,
            );
            try {
                await dependencies.administration.assertActiveMembership(
                    result.response.user.id,
                    requestMetadata.correlationId,
                );
            } catch (error) {
                await dependencies.authentication.logout(
                    result.refreshCredential,
                    requestMetadata,
                );
                throw error;
            }
            context.header(
                'Set-Cookie',
                dependencies.policy.createRefreshCookie(
                    result.refreshCredential,
                    result.response.session.expiresAt,
                ),
            );
            return context.json(result.response, 200);
        },
    );

    app.openapi(
        createRoute({
            method: 'post',
            path: '/admin/auth/refresh',
            request: { body: requestBody(RefreshRequestSchema) },
            responses: {
                200: jsonResponse(
                    AuthenticationSuccessResponseSchema,
                    'Refreshed.',
                ),
                ...errors,
            },
            tags: ['Admin authentication'],
        }),
        async (context) => {
            assertOrigin(context.req.header('Origin'));
            const requestMetadata = metadata(context);
            const result = await dependencies.authentication.refresh(
                requireRefreshCookie(
                    context.req.header('Cookie'),
                    dependencies.policy.refreshCookieName(),
                ),
                requestMetadata,
            );
            try {
                await dependencies.administration.assertActiveMembership(
                    result.response.user.id,
                    requestMetadata.correlationId,
                );
            } catch (error) {
                await dependencies.authentication.logout(
                    result.refreshCredential,
                    requestMetadata,
                );
                throw error;
            }
            context.header(
                'Set-Cookie',
                dependencies.policy.createRefreshCookie(
                    result.refreshCredential,
                    result.response.session.expiresAt,
                ),
            );
            return context.json(result.response, 200);
        },
    );

    app.openapi(
        createRoute({
            method: 'post',
            path: '/admin/auth/logout',
            request: { body: requestBody(LogoutRequestSchema) },
            responses: {
                200: jsonResponse(LogoutResponseSchema, 'Signed out.'),
                ...errors,
            },
            tags: ['Admin authentication'],
        }),
        async (context) => {
            assertOrigin(context.req.header('Origin'));
            const response = await dependencies.authentication.logout(
                getCookie(
                    context.req.header('Cookie'),
                    dependencies.policy.refreshCookieName(),
                ),
                metadata(context),
            );
            context.header(
                'Set-Cookie',
                dependencies.policy.clearRefreshCookie(),
            );
            return context.json(response, 200);
        },
    );

    registerResourceRoutes(app, dependencies, bearer);
    return app;
}

function registerResourceRoutes(
    app: OpenAPIHono,
    dependencies: AdministrationRouteDependencies,
    bearer: (value: string | undefined) => string,
) {
    app.openapi(
        createRoute({
            method: 'get',
            path: '/admin/me',
            responses: {
                200: jsonResponse(
                    AdminMeResponseSchema,
                    'Current administrator.',
                ),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Administration'],
        }),
        async (context) =>
            context.json(
                {
                    actor: await dependencies.administration.currentActor(
                        bearer(context.req.header('Authorization')),
                    ),
                },
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/admin/dashboard',
            responses: {
                200: jsonResponse(
                    AdminDashboardResponseSchema,
                    'Administration summary.',
                ),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Administration'],
        }),
        async (context) =>
            context.json(
                await dependencies.administration.dashboard(
                    bearer(context.req.header('Authorization')),
                ),
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/admin/users',
            request: { query: AdminUsersQuerySchema },
            responses: {
                200: jsonResponse(AdminUsersResponseSchema, 'Users.'),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Administration'],
        }),
        async (context) =>
            context.json(
                await dependencies.administration.listUsers(
                    bearer(context.req.header('Authorization')),
                    context.req.valid('query'),
                ),
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/admin/users/{userId}',
            request: { params: AdminUserIdParamsSchema },
            responses: {
                200: jsonResponse(AdminUserResponseSchema, 'User detail.'),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Administration'],
        }),
        async (context) => {
            const user = await dependencies.administration.user(
                bearer(context.req.header('Authorization')),
                context.req.valid('param').userId,
            );
            if (!user) throw new AdminUserNotFoundError();
            return context.json({ user }, 200);
        },
    );
    for (const operation of ['disable', 'restore'] as const) {
        app.openapi(
            createRoute({
                method: 'post',
                path: `/admin/users/{userId}/${operation}`,
                request: {
                    params: AdminUserIdParamsSchema,
                    body: requestBody(AdminUserStatusMutationRequestSchema),
                },
                responses: {
                    200: jsonResponse(
                        AdminUserStatusMutationResponseSchema,
                        `User ${operation}d.`,
                    ),
                    ...errors,
                },
                security: bearerSecurity,
                tags: ['Administration'],
            }),
            async (context) => {
                const input = context.req.valid('json');
                const userId = context.req.valid('param').userId;
                const token = bearer(context.req.header('Authorization'));
                const id = correlationId(
                    context.req.header('X-Correlation-ID'),
                );
                const user =
                    operation === 'disable'
                        ? await dependencies.administration.disableUser(
                              token,
                              userId,
                              input,
                              id,
                          )
                        : await dependencies.administration.restoreUser(
                              token,
                              userId,
                              input,
                              id,
                          );
                return context.json({ user }, 200);
            },
        );
    }
    app.openapi(
        createRoute({
            method: 'get',
            path: '/admin/audit-events',
            request: { query: AdminAuditEventsQuerySchema },
            responses: {
                200: jsonResponse(
                    AdminAuditEventsResponseSchema,
                    'Administrative audit events.',
                ),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Administration'],
        }),
        async (context) =>
            context.json(
                await dependencies.administration.listAuditEvents(
                    bearer(context.req.header('Authorization')),
                    context.req.valid('query'),
                ),
                200,
            ),
    );
}

function requestBody(schema: z.ZodType) {
    return { content: { 'application/json': { schema } }, required: true };
}

function jsonResponse(schema: z.ZodType, description: string) {
    return { content: { 'application/json': { schema } }, description };
}

function getCookie(header: string | undefined, name: string): string | null {
    for (const pair of header?.split(';') ?? []) {
        const separator = pair.indexOf('=');
        if (separator > 0 && pair.slice(0, separator).trim() === name) {
            return pair.slice(separator + 1).trim();
        }
    }
    return null;
}

function requireRefreshCookie(
    header: string | undefined,
    name: string,
): string {
    const value = getCookie(header, name);
    if (!value) {
        throw new AdministrationHttpError(
            'authentication_required',
            'Authentication is required.',
            401,
        );
    }
    return value;
}

function correlationId(value: string | undefined): string {
    return value && z.string().uuid().safeParse(value).success
        ? value
        : randomUUID();
}
