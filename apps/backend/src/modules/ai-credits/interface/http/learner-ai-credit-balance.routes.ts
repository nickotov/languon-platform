import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import {
    AuthErrorResponseSchema,
    LearnerAiCreditBalanceSchema,
} from '@languon/contracts';
import type { AuthenticationService } from '../../../authentication/application/authentication-service';
import type { AccessTokenSigner } from '../../../authentication/application/ports/access-token';
import { AuthHttpError } from '../../../authentication/interface/http/auth-http-error';
import { mapAuthenticationHttpError } from '../../../authentication/interface/http/auth-http-error-mapping';
import type { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import type { LearnerAiCreditBalanceService } from '../../application/learner-ai-credit-balance';

export interface LearnerAiCreditBalanceRouteDependencies {
    accessTokens: AccessTokenSigner;
    authentication: AuthenticationService;
    policy: AuthHttpPolicy;
    balances: LearnerAiCreditBalanceService;
}

export function createLearnerAiCreditBalanceRoutes(
    dependencies: LearnerAiCreditBalanceRouteDependencies,
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
    const path = '/users/me/ai-credits';
    app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
    });
    app.use(path, async (context, next) => {
        for (const [name, value] of Object.entries(
            dependencies.policy.securityHeaders(),
        ))
            context.header(name, value);
        context.header('Cache-Control', 'private, no-store');
        const origin = context.req.header('Origin');
        if (origin) {
            dependencies.policy.assertCookieRequestOrigin(origin);
            context.header('Access-Control-Allow-Origin', origin);
            context.header('Access-Control-Allow-Credentials', 'true');
            context.header('Vary', 'Origin');
        }
        await next();
    });
    app.options(path, (context) => {
        dependencies.policy.assertCookieRequestOrigin(
            context.req.header('Origin') ?? null,
        );
        context.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
        context.header(
            'Access-Control-Allow-Headers',
            'Authorization, Content-Type, X-Correlation-ID',
        );
        return context.body(null, 204);
    });
    app.onError((error, context) => {
        const mapped = mapAuthenticationHttpError(error);
        return context.json(
            mapped.response(context.req.header('X-Correlation-ID')),
            mapped.status,
        );
    });
    const error = (description: string) => ({
        description,
        content: { 'application/json': { schema: AuthErrorResponseSchema } },
    });
    app.openapi(
        createRoute({
            method: 'get',
            path,
            tags: ['AI credits'],
            security: [{ bearerAuth: [] }],
            request: { query: z.object({}).strict() },
            responses: {
                200: {
                    description:
                        'Current learner available balance; unlimited access has no numeric balance.',
                    content: {
                        'application/json': {
                            schema: LearnerAiCreditBalanceSchema,
                        },
                    },
                },
                400: error('Invalid request.'),
                401: error('Authentication required.'),
                403: error('Request forbidden.'),
                500: error('Balance could not be read.'),
                503: error('Service unavailable.'),
            },
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
            return context.json(
                await dependencies.balances.get(claims.userId),
                200,
            );
        },
    );
    return app;
}
