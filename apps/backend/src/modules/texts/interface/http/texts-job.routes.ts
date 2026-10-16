import type { MiddlewareHandler } from 'hono';
import { randomUUID } from 'node:crypto';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import {
    TextErrorResponseSchema,
    TextErrorCodeSchema,
    TextAiJobResponseSchema,
    TextJobIdParamsSchema,
    EnqueueTextDetectionRequestSchema,
    EnqueueTextTranslationRequestSchema,
} from '@languon/contracts';
import { TextsAiError } from '../../application/ports/texts-ai-provider';
import type { TextsJobService } from '../../application/texts-job-service';
import {
    InvalidRequestOriginError,
    type AuthHttpPolicy,
} from '../../../authentication/interface/http/auth-http-policy';
import { TextAiSelectionUnavailableError } from '../../../text-ai/application/text-ai-admission-participant';
import { mapDictionaryHttpError } from '../../../dictionaries/interface/http/dictionary-http-error-mapping';
const json = (schema: z.ZodType, description: string) => ({
    description,
    content: { 'application/json': { schema } },
});
const errors = {
    400: json(TextErrorResponseSchema, 'Invalid request'),
    401: json(TextErrorResponseSchema, 'Authentication required'),
    402: json(TextErrorResponseSchema, 'Insufficient credits'),
    403: json(TextErrorResponseSchema, 'Origin not allowed'),
    404: json(TextErrorResponseSchema, 'Not found'),
    409: json(TextErrorResponseSchema, 'Conflict'),
    413: json(TextErrorResponseSchema, 'Body too large'),
    429: json(TextErrorResponseSchema, 'Capacity unavailable'),
    500: json(TextErrorResponseSchema, 'Unexpected failure'),
    503: json(TextErrorResponseSchema, 'Unavailable'),
};
export function createTextsJobRoutes({
    service,
    policy,
}: {
    service: TextsJobService;
    policy: AuthHttpPolicy;
}) {
    const app = new OpenAPIHono({
        defaultHook: (result, c) =>
            result.success
                ? undefined
                : c.json(
                      {
                          error: {
                              code: 'invalid_request' as const,
                              message: 'The request is invalid.',
                              correlationId: randomUUID(),
                          },
                      },
                      400,
                  ),
    });
    const ownedPaths = ['/texts/ai/*'] as const;
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
        const origin = c.req.header('Origin');
        if (origin) {
            policy.assertCookieRequestOrigin(origin);
            c.header('Access-Control-Allow-Origin', origin);
            c.header('Vary', 'Origin');
        }
        await next();
    });
    for (const path of ownedPaths)
        app.options(path, (c) => {
            const origin = c.req.header('Origin');
            policy.assertCookieRequestOrigin(origin ?? null);
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
            maxSize: 512_000,
            onError: (c) =>
                c.json(
                    {
                        error: {
                            code: 'invalid_request',
                            message: 'The request is too large.',
                            correlationId: randomUUID(),
                        },
                    },
                    413,
                ),
        }),
    );
    app.onError((error, c) => {
        if (error instanceof InvalidRequestOriginError)
            return c.json(
                {
                    error: {
                        code: 'invalid_request',
                        message: 'The request origin is not allowed.',
                        correlationId: randomUUID(),
                    },
                },
                403,
            );
        if (error instanceof TextsAiError) {
            const parsed = TextErrorCodeSchema.safeParse(error.code);
            const code = parsed.success
                ? parsed.data
                : error.code === 'model_request_too_large'
                  ? 'invalid_request'
                  : 'service_unavailable';
            const status =
                code === 'authentication_required'
                    ? 401
                    : code === 'ai_credits_exhausted'
                      ? 402
                      : code.endsWith('_not_found')
                        ? 404
                        : code === 'version_conflict' ||
                            code === 'idempotency_conflict' ||
                            code === 'generation_proposal_expired' ||
                            code === 'generation_not_reviewable'
                          ? 409
                          : code === 'rate_limited'
                            ? 429
                            : code === 'invalid_request' ||
                                code === 'model_capacity_exceeded'
                              ? 400
                              : 503;
            return c.json(
                {
                    error: {
                        code,
                        message:
                            error.code === 'model_request_too_large'
                                ? error.message
                                : 'The text AI operation could not be completed.',
                        correlationId: randomUUID(),
                    },
                },
                status,
            );
        }
        if (error instanceof TextAiSelectionUnavailableError)
            return c.json(
                {
                    error: {
                        code: 'generation_not_available',
                        message: 'Choose another available AI model.',
                        correlationId: randomUUID(),
                    },
                },
                503,
            );
        if (
            error instanceof z.ZodError ||
            (error instanceof HTTPException && error.status === 400)
        )
            return c.json(
                {
                    error: {
                        code: 'invalid_request',
                        message: 'The request is invalid.',
                        correlationId: randomUUID(),
                    },
                },
                400,
            );
        const mapped = mapDictionaryHttpError(error);
        if (mapped && mapped.status === 401)
            return c.json(
                {
                    error: {
                        code: 'authentication_required',
                        message: 'Sign in to continue.',
                        correlationId: randomUUID(),
                    },
                },
                401,
            );
        return c.json(
            {
                error: {
                    code: 'internal_error',
                    message: 'The text AI operation could not be completed.',
                    correlationId: randomUUID(),
                },
            },
            500,
        );
    });
    app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
    });
    const token = (authorization: string | undefined) =>
        authorization?.startsWith('Bearer ')
            ? authorization.slice(7)
            : undefined;
    const security = [{ bearerAuth: [] }];
    app.openapi(
        createRoute({
            method: 'post',
            path: '/texts/ai/detection',
            operationId: 'enqueueTextDetection',
            tags: ['Texts'],
            security,
            request: {
                body: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: EnqueueTextDetectionRequestSchema,
                        },
                    },
                },
            },
            responses: {
                202: json(TextAiJobResponseSchema, 'Detection job'),
                ...errors,
            },
        }),
        async (c) =>
            c.json(
                {
                    job: await service.detect(
                        token(c.req.header('Authorization')),
                        c.req.valid('json'),
                        c.req.raw.signal,
                    ),
                },
                202,
            ),
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/texts/ai/translation',
            operationId: 'enqueueTextTranslation',
            tags: ['Texts'],
            security,
            request: {
                body: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: EnqueueTextTranslationRequestSchema,
                        },
                    },
                },
            },
            responses: {
                202: json(TextAiJobResponseSchema, 'Translation job'),
                ...errors,
            },
        }),
        async (c) =>
            c.json(
                {
                    job: await service.translate(
                        token(c.req.header('Authorization')),
                        c.req.valid('json'),
                        c.req.raw.signal,
                    ),
                },
                202,
            ),
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/texts/ai/jobs/{jobId}',
            operationId: 'getTextAiJob',
            tags: ['Texts'],
            security,
            request: { params: TextJobIdParamsSchema },
            responses: { 200: json(TextAiJobResponseSchema, 'Job'), ...errors },
        }),
        async (c) =>
            c.json(
                {
                    job: await service.get(
                        token(c.req.header('Authorization')),
                        c.req.valid('param').jobId,
                        c.req.raw.signal,
                    ),
                },
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/texts/ai/jobs/{jobId}/cancel',
            operationId: 'cancelTextAiJob',
            tags: ['Texts'],
            security,
            request: { params: TextJobIdParamsSchema },
            responses: { 200: json(TextAiJobResponseSchema, 'Job'), ...errors },
        }),
        async (c) =>
            c.json(
                {
                    job: await service.cancel(
                        token(c.req.header('Authorization')),
                        c.req.valid('param').jobId,
                        c.req.raw.signal,
                    ),
                },
                200,
            ),
    );
    return app;
}
