import type { MiddlewareHandler } from 'hono';
import { TextsAiError } from '../../../texts/application/ports/texts-ai-provider';
import { TextAiSelectionUnavailableError } from '../../../text-ai/application/text-ai-admission-participant';
import { randomUUID } from 'node:crypto';
import { bodyLimit } from 'hono/body-limit';
import type { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import {
    InvalidBearerAuthorizationError,
    InvalidRequestOriginError,
} from '../../../authentication/interface/http/auth-http-policy';
import { authenticationRequestMetadata } from '../../../authentication/interface/http/auth-http-request';
import type { DictionaryRateLimiter } from '../../application/ports/dictionary-rate-limiter';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
    EnqueueTextSelectionRequestSchema,
    TextSelectionJobResponseSchema,
} from '@languon/contracts';
import type { TextSelectionService } from '../../application/text-selection-service';
import { TextSelectionError } from '../../domain/text-selection';
import { mapDictionaryHttpError } from './dictionary-http-error-mapping';
import { AiCreditInsufficientBalanceError } from '../../../ai-credits/domain/ai-credit';
import { DictionaryOwnerCapacityError } from '../../domain/limits';
import { TextDomainError as TextContentError } from '../../../texts/domain/text';
const response = (schema: z.ZodType, description: string) => ({
    content: { 'application/json': { schema } },
    description,
});
const body = (schema: z.ZodType) => ({
    required: true,
    content: { 'application/json': { schema } },
});
const errorSchema = z.object({
    error: z.object({ code: z.string(), message: z.string() }),
});
export function createTextSelectionRoutes(dependencies: {
    service: TextSelectionService;
    policy: AuthHttpPolicy;
    rateLimiter: DictionaryRateLimiter;
}) {
    const app = new OpenAPIHono({
        defaultHook: (result, context) =>
            !result.success
                ? context.json(
                      {
                          error: {
                              code: 'invalid_request',
                              message: 'Invalid request',
                          },
                      },
                      400,
                  )
                : undefined,
    });
    app.openAPIRegistry.registerComponent('securitySchemes', 'JWT', {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
    });
    const ownedPaths = [
        '/dictionaries/text-selections',
        '/dictionaries/text-selections/*',
    ] as const;
    const useOwned = (middleware: MiddlewareHandler) => {
        app.use('*', (context, next) => {
            const owned = ownedPaths.some((path) =>
                path.endsWith('/*')
                    ? context.req.path.startsWith(path.slice(0, -1))
                    : context.req.path === path,
            );
            return owned ? middleware(context, next) : next();
        });
    };
    useOwned(async (c, next) => {
        c.header('Cache-Control', 'private, no-store');
        c.header('Referrer-Policy', 'no-referrer');
        c.header('X-Robots-Tag', 'noindex, nofollow');
        c.header('X-Content-Type-Options', 'nosniff');
        const origin = c.req.header('Origin');
        if (origin) {
            dependencies.policy.assertCookieRequestOrigin(origin);
            c.header('Access-Control-Allow-Origin', origin);
            c.header('Vary', 'Origin');
        }
        await next();
    });
    for (const path of ownedPaths)
        app.options(path, (c) => {
            const origin = c.req.header('Origin');
            dependencies.policy.assertCookieRequestOrigin(origin ?? null);
            c.header('Access-Control-Allow-Origin', origin!);
            c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            c.header(
                'Access-Control-Allow-Headers',
                'Authorization, Content-Type, X-Correlation-ID, X-Languon-Share-Key',
            );
            c.header('Vary', 'Origin');
            return c.body(null, 204);
        });
    useOwned(
        bodyLimit({
            maxSize: 16_384,
            onError: (c) =>
                c.json(
                    {
                        error: {
                            code: 'invalid_request',
                            message: 'Request too large',
                            correlationId: randomUUID(),
                        },
                    },
                    413,
                ),
        }),
    );
    useOwned(async (c, next) => {
        const metadata = authenticationRequestMetadata(c, dependencies.policy);
        const result = await dependencies.rateLimiter.consume({
            key: `text-selection:${metadata.clientAddress}`,
            scope: c.req.method === 'POST' ? 'generation-enqueue' : 'owner',
            signal: c.req.raw.signal,
        });
        if (!result.allowed) {
            if (result.retryAfterSeconds)
                c.header('Retry-After', String(result.retryAfterSeconds));
            return c.json(
                {
                    error: {
                        code: 'rate_limited',
                        message: 'Try again later',
                        correlationId: randomUUID(),
                    },
                },
                429,
            );
        }
        await next();
    });
    app.onError((error, context) => {
        if (error instanceof InvalidBearerAuthorizationError)
            return context.json(
                {
                    error: {
                        code: 'authentication_required',
                        message: 'Sign in to continue',
                        correlationId: randomUUID(),
                    },
                },
                401,
            );
        if (error instanceof InvalidRequestOriginError)
            return context.json(
                {
                    error: {
                        code: 'invalid_request',
                        message: 'Request origin not allowed',
                        correlationId: randomUUID(),
                    },
                },
                403,
            );

        if (error instanceof TextsAiError)
            return context.json(
                {
                    error: {
                        code: error.code,
                        message: 'Translation proposal unavailable',
                    },
                },
                error.code === 'generation_job_not_found' ? 404 : 409,
            );
        if (error instanceof TextAiSelectionUnavailableError)
            return context.json(
                {
                    error: {
                        code: 'provider_unavailable',
                        message: 'Vocabulary generation unavailable',
                    },
                },
                503,
            );
        if (error instanceof AiCreditInsufficientBalanceError)
            return context.json(
                {
                    error: {
                        code: 'ai_credits_exhausted',
                        message: 'Not enough AI credits',
                    },
                },
                402,
            );
        if (error instanceof TextContentError)
            return context.json(
                {
                    error: {
                        code: error.code,
                        message: 'Source content unavailable',
                    },
                },
                error.code === 'version_conflict' ? 409 : 404,
            );
        if (error instanceof DictionaryOwnerCapacityError)
            return context.json(
                {
                    error: {
                        code: 'capacity_exceeded',
                        message: 'Dictionary capacity exceeded',
                    },
                },
                409,
            );
        if (error instanceof TextSelectionError) {
            const status =
                error.code === 'not_found' || error.code === 'access_revoked'
                    ? 404
                    : error.code === 'invalid_request'
                      ? 400
                      : error.code === 'provider_unavailable'
                        ? 503
                        : error.code === 'capacity_exceeded'
                          ? 429
                          : 409;
            return context.json(
                { error: { code: error.code, message: error.message } },
                status,
            );
        }
        const mapped = mapDictionaryHttpError(error);
        return context.json(mapped.response(randomUUID()), mapped.status);
    });
    const responses = {
        400: response(errorSchema, 'Invalid request'),
        401: response(errorSchema, 'Authentication required'),
        402: response(errorSchema, 'Credits exhausted'),
        404: response(errorSchema, 'Unavailable'),
        409: response(errorSchema, 'Conflict'),
        429: response(errorSchema, 'Capacity exceeded'),
        503: response(errorSchema, 'Unavailable'),
    };
    app.openapi(
        createRoute({
            method: 'post',
            path: '/dictionaries/text-selections',
            tags: ['Dictionaries'],
            security: [{ JWT: [] }],
            request: {
                body: body(EnqueueTextSelectionRequestSchema),
                headers: z
                    .object({
                        'x-languon-share-key': z.string().max(512).optional(),
                    })
                    .passthrough(),
            },
            responses: {
                202: response(
                    TextSelectionJobResponseSchema,
                    'Vocabulary generation admitted',
                ),
                ...responses,
            },
        }),
        async (c) =>
            c.json(
                {
                    job: await dependencies.service.enqueue(
                        dependencies.policy.parseBearerAuthorization(
                            c.req.header('Authorization') ?? null,
                        ),
                        c.req.valid('json') as z.infer<
                            typeof EnqueueTextSelectionRequestSchema
                        >,
                        c.req.header('x-languon-share-key'),
                    ),
                },
                202,
            ),
    );
    for (const action of ['read', 'cancel'] as const) {
        app.openapi(
            createRoute({
                method: action === 'read' ? 'get' : 'post',
                path:
                    action === 'read'
                        ? '/dictionaries/text-selections/{jobId}'
                        : '/dictionaries/text-selections/{jobId}/cancel',
                tags: ['Dictionaries'],
                security: [{ JWT: [] }],
                request: { params: z.object({ jobId: z.uuid() }) },
                responses: {
                    200: response(
                        TextSelectionJobResponseSchema,
                        'Vocabulary job status',
                    ),
                    ...responses,
                },
            }),
            async (c) => {
                c.header('Cache-Control', 'private, no-store');
                return c.json(
                    {
                        job: await dependencies.service[action](
                            dependencies.policy.parseBearerAuthorization(
                                c.req.header('Authorization') ?? null,
                            ),
                            c.req.valid('param').jobId,
                        ),
                    },
                    200,
                );
            },
        );
    }
    return app;
}
