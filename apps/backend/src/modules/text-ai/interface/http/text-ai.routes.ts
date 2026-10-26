import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
    TextAiErrorResponseSchema,
    TextAiModelsResponseSchema,
    TextAiPreferenceResponseSchema,
    UpdateTextAiPreferenceRequestSchema,
} from '@languon/contracts';
import { bodyLimit } from 'hono/body-limit';
import type { AuthenticationService } from '../../../authentication/application/authentication-service';
import type { AccessTokenSigner } from '../../../authentication/application/ports/access-token';
import { AuthHttpError } from '../../../authentication/interface/http/auth-http-error';
import { mapAuthenticationHttpError } from '../../../authentication/interface/http/auth-http-error-mapping';
import type { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import type { TextAiPreferenceService } from '../../application/text-ai-preference-service';
import {
    TextAiModelUnavailableError,
    TextAiPreferenceConflictError,
    TextAiUserUnavailableError,
} from '../../domain/text-ai-preference-store';

export interface TextAiRouteDependencies {
    accessTokens: AccessTokenSigner;
    authentication: AuthenticationService;
    policy: AuthHttpPolicy;
    preferences: TextAiPreferenceService;
}
export function createTextAiRoutes(
    dependencies: TextAiRouteDependencies,
): OpenAPIHono {
    const app = new OpenAPIHono({
        defaultHook: (result, context) => {
            if (!result.success)
                return context.json(
                    new AuthHttpError(
                        'invalid_request',
                        'The request is invalid.',
                        400,
                    ).response(),
                    400,
                );
        },
    });
    app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
    });
    for (const path of ['/text-ai/models', '/users/me/ai-model-preference']) {
        app.use(path, async (context, next) => {
            for (const [name, value] of Object.entries(
                dependencies.policy.securityHeaders(),
            ))
                context.header(name, value);
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
            path,
            bodyLimit({
                maxSize: 4096,
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
        app.options(path, (context) => {
            dependencies.policy.assertCookieRequestOrigin(
                context.req.header('Origin') ?? null,
            );
            context.header('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
            context.header(
                'Access-Control-Allow-Headers',
                'Authorization, Content-Type, X-Correlation-ID',
            );
            return context.body(null, 204);
        });
    }
    app.onError((error, context) => {
        if (error instanceof TextAiModelUnavailableError)
            return context.json(
                {
                    error: {
                        code: 'model_unavailable' as const,
                        message: error.message,
                        correlationId:
                            context.req.header('X-Correlation-ID') ??
                            crypto.randomUUID(),
                    },
                },
                409,
            );
        const mapped =
            error instanceof TextAiPreferenceConflictError
                ? new AuthHttpError(
                      'conflict',
                      'The preference changed. Reload it and reapply your changes.',
                      409,
                  )
                : error instanceof TextAiUserUnavailableError
                  ? new AuthHttpError(
                        'authentication_required',
                        'Authentication is required.',
                        401,
                    )
                  : mapAuthenticationHttpError(error);
        return context.json(
            mapped.response(context.req.header('X-Correlation-ID')),
            mapped.status,
        );
    });
    const authenticate = async (authorization: string | undefined) => {
        const token = dependencies.policy.parseBearerAuthorization(
            authorization ?? null,
        );
        const claims = await dependencies.accessTokens.verify(token);
        await dependencies.authentication.requireActiveSession({
            sessionId: claims.sessionId,
            userId: claims.userId,
        });
        return claims.userId;
    };
    const errors = {
        400: {
            description: 'Invalid request.',
            content: {
                'application/json': { schema: TextAiErrorResponseSchema },
            },
        },
        401: {
            description: 'Authentication required.',
            content: {
                'application/json': { schema: TextAiErrorResponseSchema },
            },
        },
        403: {
            description: 'Request forbidden.',
            content: {
                'application/json': { schema: TextAiErrorResponseSchema },
            },
        },
        409: {
            description: 'Preference changed or model unavailable.',
            content: {
                'application/json': { schema: TextAiErrorResponseSchema },
            },
        },
        413: {
            description: 'Body too large.',
            content: {
                'application/json': { schema: TextAiErrorResponseSchema },
            },
        },
        500: {
            description: 'Unexpected failure.',
            content: {
                'application/json': { schema: TextAiErrorResponseSchema },
            },
        },
        503: {
            description: 'Service unavailable.',
            content: {
                'application/json': { schema: TextAiErrorResponseSchema },
            },
        },
    };
    app.openapi(
        createRoute({
            method: 'get',
            path: '/text-ai/models',
            security: [{ bearerAuth: [] }],
            tags: ['Text AI'],
            responses: {
                ...errors,
                200: {
                    description: 'No learner-selectable models.',
                    content: {
                        'application/json': {
                            schema: TextAiModelsResponseSchema,
                        },
                    },
                },
            },
        }),
        async (context) =>
            context.json(
                await dependencies.preferences.models(
                    await authenticate(context.req.header('Authorization')),
                ),
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/users/me/ai-model-preference',
            security: [{ bearerAuth: [] }],
            tags: ['Text AI'],
            responses: {
                ...errors,
                200: {
                    description:
                        'Current AI action budget; routing is managed by Languon.',
                    content: {
                        'application/json': {
                            schema: TextAiPreferenceResponseSchema,
                        },
                    },
                },
            },
        }),
        async (context) =>
            context.json(
                await dependencies.preferences.get(
                    await authenticate(context.req.header('Authorization')),
                ),
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'put',
            path: '/users/me/ai-model-preference',
            security: [{ bearerAuth: [] }],
            tags: ['Text AI'],
            request: {
                body: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: UpdateTextAiPreferenceRequestSchema,
                        },
                    },
                },
            },
            responses: {
                ...errors,
                200: {
                    description: 'Preference updated.',
                    content: {
                        'application/json': {
                            schema: TextAiPreferenceResponseSchema,
                        },
                    },
                },
            },
        }),
        async (context) =>
            context.json(
                await dependencies.preferences.update(
                    await authenticate(context.req.header('Authorization')),
                    context.req.valid('json'),
                ),
                200,
            ),
    );
    return app;
}
