import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
    AccountDeletionScheduleRequestSchema,
    AccountDeletionScheduleResponseSchema,
    AuthErrorResponseSchema,
    UpdateHandleRequestSchema,
    UpdateHandleResponseSchema,
} from '@languon/contracts';
import { bodyLimit } from 'hono/body-limit';

import type { AuthenticationService } from '../../../authentication/application/authentication-service';
import type { AccessTokenSigner } from '../../../authentication/application/ports/access-token';
import { AuthHttpError } from '../../../authentication/interface/http/auth-http-error';
import { mapAuthenticationHttpError } from '../../../authentication/interface/http/auth-http-error-mapping';
import type { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import {
    UserProfileConflictError,
    type UserProfileService,
    UserProfileUnavailableError,
} from '../../application/user-profile-service';
import { UserHandleAlreadyExistsError } from '../../domain/user.repository';
import {
    AccountDeletionConflictError,
    AccountDeletionJournalUnavailableError,
    AccountDeletionOwnerTransferRequiredError,
    type AccountDeletionService,
} from '../../application/account-deletion-service';

export interface UserProfileRouteDependencies {
    accessTokens: AccessTokenSigner;
    authentication: AuthenticationService;
    deletions?: AccountDeletionService;
    policy: AuthHttpPolicy;
    profiles: UserProfileService;
}

export function createUserProfileRoutes(
    dependencies: UserProfileRouteDependencies,
): OpenAPIHono {
    const app = new OpenAPIHono({
        defaultHook: (result, context) => {
            if (!result.success) {
                return context.json(
                    new AuthHttpError(
                        'invalid_request',
                        'The request is invalid.',
                        400,
                    ).response(),
                    400,
                );
            }
        },
    });
    app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
        bearerFormat: 'JWT',
        scheme: 'bearer',
        type: 'http',
    });
    app.use('/users/*', async (context, next) => {
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
    app.use(
        '/users/*',
        bodyLimit({
            maxSize: 16 * 1024,
            onError: (context) =>
                context.json(
                    new AuthHttpError(
                        'invalid_request',
                        'The request body is too large.',
                        413,
                    ).response(),
                    413,
                ),
        }),
    );
    app.options('/users/*', (context) => {
        dependencies.policy.assertCookieRequestOrigin(
            context.req.header('Origin') ?? null,
        );
        context.header('Access-Control-Allow-Methods', 'PATCH, POST, OPTIONS');
        context.header(
            'Access-Control-Allow-Headers',
            'Authorization, Content-Type, X-Correlation-ID',
        );
        return context.body(null, 204);
    });
    app.onError((error, context) => {
        const mapped =
            error instanceof UserHandleAlreadyExistsError
                ? new AuthHttpError(
                      'conflict',
                      'This handle is already taken.',
                      409,
                  )
                : error instanceof UserProfileConflictError
                  ? new AuthHttpError(
                        'conflict',
                        'The account changed concurrently. Try again.',
                        409,
                    )
                  : error instanceof UserProfileUnavailableError
                    ? new AuthHttpError(
                          'authentication_required',
                          'Authentication is required.',
                          401,
                      )
                    : error instanceof AccountDeletionOwnerTransferRequiredError
                      ? new AuthHttpError(
                            'owner_transfer_required',
                            'Transfer and revoke administrator ownership before removing this account.',
                            409,
                        )
                      : error instanceof AccountDeletionConflictError
                        ? new AuthHttpError(
                              'conflict',
                              'The account changed or removal is already pending.',
                              409,
                          )
                        : error instanceof AccountDeletionJournalUnavailableError
                          ? new AuthHttpError(
                                'service_unavailable',
                                'Account removal is temporarily unavailable.',
                                503,
                            )
                    : mapAuthenticationHttpError(error);
        return context.json(
            mapped.response(context.req.header('X-Correlation-ID')),
            mapped.status,
        );
    });
    app.openapi(
        createRoute({
            method: 'patch',
            path: '/users/me/handle',
            request: {
                body: {
                    content: {
                        'application/json': {
                            schema: UpdateHandleRequestSchema,
                        },
                    },
                    required: true,
                },
            },
            responses: {
                200: {
                    content: {
                        'application/json': {
                            schema: UpdateHandleResponseSchema,
                        },
                    },
                    description: 'Handle updated.',
                },
                400: {
                    content: {
                        'application/json': { schema: AuthErrorResponseSchema },
                    },
                    description: 'Invalid request.',
                },
                401: {
                    content: {
                        'application/json': { schema: AuthErrorResponseSchema },
                    },
                    description: 'Authentication required.',
                },
                403: {
                    content: {
                        'application/json': { schema: AuthErrorResponseSchema },
                    },
                    description: 'Request forbidden.',
                },
                409: {
                    content: {
                        'application/json': { schema: AuthErrorResponseSchema },
                    },
                    description:
                        'Handle already belongs to another account or state changed.',
                },
                413: {
                    content: {
                        'application/json': { schema: AuthErrorResponseSchema },
                    },
                    description: 'Request body too large.',
                },
                500: {
                    content: {
                        'application/json': { schema: AuthErrorResponseSchema },
                    },
                    description: 'Unexpected failure.',
                },
            },
            security: [{ bearerAuth: [] }],
            tags: ['Users'],
        }),
        async (context) => {
            const token = dependencies.policy.parseBearerAuthorization(
                context.req.header('Authorization') ?? null,
            );
            const claims = await dependencies.accessTokens.verify(token);
            await dependencies.authentication.requireActiveSession({
                sessionId: claims.sessionId,
                userId: claims.userId,
            });
            const handle = await dependencies.profiles.updateHandle({
                handle: context.req.valid('json').handle,
                now: new Date(),
                userId: claims.userId,
            });
            return context.json({ handle }, 200);
        },
    );
    if (dependencies.deletions) {
        const deletions = dependencies.deletions;
        app.openapi(
            createRoute({
                method: 'post',
                path: '/users/me/deletion',
                request: {
                    body: {
                        content: {
                            'application/json': {
                                schema: AccountDeletionScheduleRequestSchema,
                            },
                        },
                        required: true,
                    },
                },
                responses: {
                    202: {
                        content: {
                            'application/json': {
                                schema: AccountDeletionScheduleResponseSchema,
                            },
                        },
                        description: 'Account removal scheduled; sessions revoked.',
                    },
                    400: { content: { 'application/json': { schema: AuthErrorResponseSchema } }, description: 'Invalid request.' },
                    401: { content: { 'application/json': { schema: AuthErrorResponseSchema } }, description: 'Authentication required.' },
                    403: { content: { 'application/json': { schema: AuthErrorResponseSchema } }, description: 'Recent authentication required.' },
                    409: { content: { 'application/json': { schema: AuthErrorResponseSchema } }, description: 'Owner transfer required or account state conflict.' },
                    503: { content: { 'application/json': { schema: AuthErrorResponseSchema } }, description: 'Recovery journal unavailable.' },
                },
                security: [{ bearerAuth: [] }],
                tags: ['Users'],
            }),
            async (context) => {
                const token = dependencies.policy.parseBearerAuthorization(
                    context.req.header('Authorization') ?? null,
                );
                const claims = await dependencies.accessTokens.verify(token);
                const scheduled = await deletions.schedule({
                    sessionId: claims.sessionId,
                    userId: claims.userId,
                });
                context.header(
                    'Set-Cookie',
                    dependencies.policy.clearRefreshCookie(),
                );
                return context.json(
                    {
                        purgeAt: scheduled.purgeAt.toISOString(),
                        scheduledAt: scheduled.scheduledAt.toISOString(),
                        status: 'deletion_scheduled' as const,
                    },
                    202,
                );
            },
        );
    }
    return app;
}
