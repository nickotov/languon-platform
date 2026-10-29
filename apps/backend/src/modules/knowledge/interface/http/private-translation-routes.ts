import { randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
    KnowledgePrivateTranslationsResponseSchema,
    KnowledgeTranslationJobResponseSchema,
    RequestKnowledgeTranslationSchema,
} from '@languon/contracts';
import {
    actionAllowanceErrorResponse,
    actionAllowanceRequestMiddleware,
} from '../../../ai-credits/infrastructure/action-allowance-consent';
import { TextsAiError } from '../../../texts/application/ports/texts-ai-provider';
import {
    InvalidBearerAuthorizationError,
    InvalidRequestOriginError,
    type AuthHttpPolicy,
} from '../../../authentication/interface/http/auth-http-policy';
import { authenticationRequestMetadata } from '../../../authentication/interface/http/auth-http-request';
import { mapDictionaryHttpError } from '../../../dictionaries/interface/http/dictionary-http-error-mapping';
import { KnowledgeDomainError } from '../../domain/knowledge';
import type { KnowledgePrivateTranslationService } from '../../application/private-translation-service';
const json = (schema: z.ZodType, description = 'Success') => ({
    description,
    content: { 'application/json': { schema } },
});
const error = (code: string, message: string) => ({
    error: { code, message, correlationId: randomUUID() },
});
const failure = json(
    z.object({
        error: z.object({
            code: z.string(),
            message: z.string(),
            correlationId: z.uuid(),
        }),
    }),
    'Request rejected',
);
const errors = {
    400: failure,
    401: failure,
    402: failure,
    403: failure,
    404: failure,
    409: failure,
    413: failure,
    429: failure,
    500: failure,
    503: failure,
};
const params = z.object({ noteId: z.uuid(), blockId: z.uuid() });
const jobParams = params.extend({ jobId: z.uuid() });
const security = [{ bearerAuth: [] as string[] }];
export function createKnowledgePrivateTranslationRoutes({
    service,
    policy,
}: {
    service: KnowledgePrivateTranslationService;
    policy: AuthHttpPolicy;
}) {
    const app = new OpenAPIHono({
        defaultHook: (result, c) => {
            if (!result.success)
                return c.json(
                    error('invalid_request', 'The request is invalid.'),
                    400,
                );
        },
    });
    app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
        type: 'http',
        scheme: 'bearer',
    });
    for (const path of [
        '/knowledge/:noteId/blocks/:blockId/private-translations',
        '/knowledge/:noteId/blocks/:blockId/private-translations/*',
    ]) {
        app.use(path, async (c, next) => {
            c.header('Cache-Control', 'private, no-store');
            c.header('Referrer-Policy', 'no-referrer');
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
                maxSize: 16_000,
                onError: (c) =>
                    c.json(
                        error('invalid_request', 'The request is too large.'),
                        413,
                    ),
            }),
        );
        app.options(path, (c) => {
            const origin = c.req.header('Origin');
            policy.assertCookieRequestOrigin(origin ?? null);
            c.header('Access-Control-Allow-Origin', origin!);
            c.header('Access-Control-Allow-Credentials', 'true');
            c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            c.header(
                'Access-Control-Allow-Headers',
                'Authorization, Content-Type, X-Correlation-ID, X-Languon-Share-Kind, X-Languon-Share-Locator, X-Languon-Share-Key',
            );
            return c.body(null, 204);
        });
        app.use(path, actionAllowanceRequestMiddleware);
    }
    app.onError((caught, c) => {
        const allowance = actionAllowanceErrorResponse(caught, c);
        if (allowance) return allowance;
        let code = 'internal_error';
        let message = 'The translation request could not be completed.';
        let status: 400 | 401 | 402 | 403 | 404 | 409 | 429 | 500 | 503 = 500;
        if (caught instanceof KnowledgeDomainError) {
            code = caught.code;
            message = caught.message;
            status =
                code === 'knowledge_not_found'
                    ? 404
                    : code === 'version_conflict' ||
                        code === 'idempotency_conflict'
                      ? 409
                      : code === 'rate_limited'
                        ? 429
                        : code === 'service_unavailable'
                          ? 503
                          : 400;
        } else if (caught instanceof TextsAiError) {
            code = caught.code;
            message =
                code === 'model_capacity_exceeded'
                    ? 'This text is too long to translate in one action. Split it into smaller blocks.'
                    : code === 'access_revoked'
                      ? 'This learning material is unavailable.'
                      : 'The translation action is unavailable or changed.';
            status =
                code === 'access_revoked' || code === 'generation_job_not_found'
                    ? 404
                    : code === 'idempotency_conflict' ||
                        code === 'version_conflict'
                      ? 409
                      : code === 'rate_limited'
                        ? 429
                        : code === 'ai_credits_exhausted'
                          ? 402
                          : code === 'model_capacity_exceeded' ||
                              code === 'invalid_request'
                            ? 400
                            : 503;
        } else if (caught instanceof InvalidBearerAuthorizationError) {
            code = 'authentication_required';
            message = 'Sign in to continue.';
            status = 401;
        } else if (caught instanceof InvalidRequestOriginError) {
            code = 'invalid_origin';
            message = 'The request origin is not allowed.';
            status = 403;
        } else if (caught instanceof z.ZodError) {
            code = 'invalid_request';
            message = 'The request is invalid.';
            status = 400;
        } else {
            const mapped = mapDictionaryHttpError(caught);
            if (mapped.status === 401) {
                code = 'authentication_required';
                message = 'Sign in to continue.';
                status = 401;
            }
        }
        return c.json(error(code, message), status);
    });
    const auth = (c: Context) => {
        const metadata = authenticationRequestMetadata(c, policy);
        return [
            policy.parseBearerAuthorization(
                c.req.header('Authorization') ?? null,
            ),
            { signal: metadata.signal, clientAddress: metadata.clientAddress },
        ] as const;
    };
    const access = (c: Context) => {
        const kind = c.req.header('X-Languon-Share-Kind');
        const locator = c.req.header('X-Languon-Share-Locator');
        const key = c.req.header('X-Languon-Share-Key');
        return kind || locator || key ? { kind, locator, key } : undefined;
    };
    const path = '/knowledge/{noteId}/blocks/{blockId}/private-translations';
    app.openapi(
        createRoute({
            method: 'get',
            path,
            security,
            request: { params },
            responses: {
                200: json(KnowledgePrivateTranslationsResponseSchema),
                ...errors,
            },
        }),
        async (c) => {
            const input = c.req.valid('param');
            return c.json(
                await service.list(
                    ...auth(c),
                    input.noteId,
                    input.blockId,
                    access(c),
                ),
                200,
            );
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path,
            security,
            request: {
                params,
                body: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: RequestKnowledgeTranslationSchema,
                        },
                    },
                },
            },
            responses: {
                200: json(KnowledgeTranslationJobResponseSchema),
                ...errors,
            },
        }),
        async (c) => {
            const input = c.req.valid('param');
            return c.json(
                await service.request(
                    ...auth(c),
                    input.noteId,
                    input.blockId,
                    c.req.valid('json'),
                    access(c),
                ),
                200,
            );
        },
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: `${path}/jobs/{jobId}`,
            security,
            request: { params: jobParams },
            responses: {
                200: json(KnowledgeTranslationJobResponseSchema),
                ...errors,
            },
        }),
        async (c) => {
            const input = c.req.valid('param');
            return c.json(
                await service.job(
                    ...auth(c),
                    input.noteId,
                    input.blockId,
                    input.jobId,
                    access(c),
                ),
                200,
            );
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: `${path}/jobs/{jobId}/cancel`,
            security,
            request: { params: jobParams },
            responses: {
                200: json(KnowledgeTranslationJobResponseSchema),
                ...errors,
            },
        }),
        async (c) => {
            const input = c.req.valid('param');
            return c.json(
                await service.cancel(
                    ...auth(c),
                    input.noteId,
                    input.blockId,
                    input.jobId,
                    access(c),
                ),
                200,
            );
        },
    );
    return app;
}
