import { randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { RateLimitUnavailableError } from '../../../authentication/application/ports/rate-limiter';
import {
    NavigationQuerySchema,
    NavigationRecentQuerySchema,
    NavigationResourceParamsSchema,
    NavigationPinRequestSchema,
    NavigationResourcesResponseSchema,
    NavigationResourceResponseSchema,
    NavigationErrorResponseSchema,
} from '@languon/contracts';
import type { NavigationService } from '../../application/navigation-service';
import { NavigationError } from '../../application/navigation-ports';
import {
    InvalidRequestOriginError,
    type AuthHttpPolicy,
} from '../../../authentication/interface/http/auth-http-policy';
import { authenticationRequestMetadata } from '../../../authentication/interface/http/auth-http-request';
import { mapDictionaryHttpError } from '../../../dictionaries/interface/http/dictionary-http-error-mapping';
const json = (schema: z.ZodType, description = 'Success') => ({
    content: { 'application/json': { schema } },
    description,
});
const failure = json(NavigationErrorResponseSchema, 'Request failed');
const errors = {
    400: failure,
    401: failure,
    403: failure,
    404: failure,
    413: failure,
    429: failure,
    500: failure,
    503: failure,
};
const security = [{ bearerAuth: [] as string[] }];
const envelope = (
    code: z.infer<typeof NavigationErrorResponseSchema>['error']['code'],
    message: string,
) => ({ error: { code, message, correlationId: randomUUID() } });
export function createNavigationRoutes({
    service,
    policy,
}: {
    service: NavigationService;
    policy: AuthHttpPolicy;
}) {
    const app = new OpenAPIHono({
        defaultHook: (result, c) => {
            if (!result.success)
                return c.json(
                    envelope('invalid_request', 'The request is invalid.'),
                    400,
                );
        },
    });
    app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
    });
    for (const path of ['/navigation', '/navigation/*']) {
        app.use(path, async (c, next) => {
            c.header('Cache-Control', 'private, no-store');
            c.header('Referrer-Policy', 'no-referrer');
            c.header('X-Robots-Tag', 'noindex, nofollow');
            c.header('X-Content-Type-Options', 'nosniff');
            const origin = c.req.header('Origin');
            if (origin) {
                policy.assertCookieRequestOrigin(origin);
                c.header('Access-Control-Allow-Origin', origin);
                c.header('Access-Control-Allow-Credentials', 'true');
                c.header('Vary', 'Origin');
            }
            await next();
        });
        app.use(
            path,
            bodyLimit({
                maxSize: 1024,
                onError: (c) =>
                    c.json(
                        envelope(
                            'invalid_request',
                            'The request body is too large.',
                        ),
                        413,
                    ),
            }),
        );
        app.options(path, (c) => {
            const origin = c.req.header('Origin');
            policy.assertCookieRequestOrigin(origin ?? null);
            c.header('Access-Control-Allow-Origin', origin!);
            c.header('Access-Control-Allow-Credentials', 'true');
            c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
            c.header(
                'Access-Control-Allow-Headers',
                'Authorization, Content-Type, X-Correlation-ID',
            );
            c.header('Vary', 'Origin');
            return c.body(null, 204);
        });
    }
    app.onError((error, c) => {
        if (error instanceof NavigationError)
            return c.json(
                envelope(error.code, error.message),
                error.code === 'resource_not_found' ? 404 : 429,
            );
        if (error instanceof InvalidRequestOriginError)
            return c.json(
                envelope(
                    'invalid_origin',
                    'The request origin is not allowed.',
                ),
                403,
            );
        if (error instanceof z.ZodError)
            return c.json(
                envelope('invalid_request', 'The request is invalid.'),
                400,
            );
        if (error instanceof HTTPException && error.status === 400)
            return c.json(
                envelope('invalid_request', 'The request is invalid.'),
                400,
            );
        if (error instanceof RateLimitUnavailableError)
            return c.json(
                envelope(
                    'service_unavailable',
                    'The service is temporarily unavailable.',
                ),
                503,
            );
        const mapped = mapDictionaryHttpError(error);
        if (mapped.status === 401)
            return c.json(
                envelope('authentication_required', 'Sign in to continue.'),
                401,
            );
        if (mapped.status === 503)
            return c.json(
                envelope(
                    'service_unavailable',
                    'The service is temporarily unavailable.',
                ),
                503,
            );
        return c.json(
            envelope('internal_error', 'The request could not be completed.'),
            500,
        );
    });
    const auth = (c: Parameters<typeof authenticationRequestMetadata>[0]) => {
        const metadata = authenticationRequestMetadata(c, policy);
        return [
            policy.parseBearerAuthorization(
                c.req.header('Authorization') ?? null,
            ),
            { signal: metadata.signal, clientAddress: metadata.clientAddress },
        ] as const;
    };
    app.openapi(
        createRoute({
            method: 'get',
            path: '/navigation/resources',
            security,
            request: { query: NavigationQuerySchema },
            responses: {
                200: json(NavigationResourcesResponseSchema),
                ...errors,
            },
        }),
        async (c) =>
            c.json(await service.list(...auth(c), c.req.valid('query')), 200),
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/navigation/recent',
            security,
            request: { query: NavigationRecentQuerySchema },
            responses: {
                200: json(NavigationResourcesResponseSchema),
                ...errors,
            },
        }),
        async (c) =>
            c.json(
                await service.list(...auth(c), c.req.valid('query'), true),
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/navigation/resources/{kind}/{id}/opened',
            security,
            request: { params: NavigationResourceParamsSchema },
            responses: {
                200: json(NavigationResourceResponseSchema),
                ...errors,
            },
        }),
        async (c) => {
            const { kind, id } = c.req.valid('param');
            return c.json(
                await service.mutate(...auth(c), kind, id, { opened: true }),
                200,
            );
        },
    );
    app.openapi(
        createRoute({
            method: 'put',
            path: '/navigation/resources/{kind}/{id}/pin',
            security,
            request: {
                params: NavigationResourceParamsSchema,
                body: {
                    content: {
                        'application/json': {
                            schema: NavigationPinRequestSchema,
                        },
                    },
                    required: true,
                },
            },
            responses: {
                200: json(NavigationResourceResponseSchema),
                ...errors,
            },
        }),
        async (c) => {
            const { kind, id } = c.req.valid('param');
            return c.json(
                await service.mutate(...auth(c), kind, id, c.req.valid('json')),
                200,
            );
        },
    );
    return app;
}
