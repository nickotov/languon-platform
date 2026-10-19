import { randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import {
    CreateKnowledgeNoteRequestSchema,
    DeleteKnowledgeNoteRequestSchema,
    KnowledgeDeletedResponseSchema,
    KnowledgeErrorResponseSchema,
    KnowledgeNoteIdParamsSchema,
    KnowledgeNoteResponseSchema,
    KnowledgeRevisionsResponseSchema,
    ListKnowledgeQuerySchema,
    ListKnowledgeResponseSchema,
    RestoreKnowledgeNoteRequestSchema,
    UpdateKnowledgeNoteRequestSchema,
    type KnowledgeErrorCode,
} from '@languon/contracts';
import type { KnowledgeService } from '../../application/knowledge-service';
import { KnowledgeDomainError } from '../../domain/knowledge';
import {
    InvalidBearerAuthorizationError,
    InvalidRequestOriginError,
    type AuthHttpPolicy,
} from '../../../authentication/interface/http/auth-http-policy';
import { authenticationRequestMetadata } from '../../../authentication/interface/http/auth-http-request';
import { mapDictionaryHttpError } from '../../../dictionaries/interface/http/dictionary-http-error-mapping';

const json = (schema: z.ZodType, description = 'Success') => ({
    content: { 'application/json': { schema } },
    description,
});
const body = (schema: z.ZodType) => ({
    content: { 'application/json': { schema } },
    required: true,
});
const failure = json(KnowledgeErrorResponseSchema, 'Request failed');
const errors = {
    400: failure,
    401: failure,
    403: failure,
    404: failure,
    409: failure,
    413: failure,
    429: failure,
    500: failure,
    503: failure,
};
const security = [{ bearerAuth: [] as string[] }];
const envelope = (code: KnowledgeErrorCode, message: string) => ({
    error: { code, message, correlationId: randomUUID() },
});

export function createKnowledgeRoutes({
    service,
    policy,
}: {
    service: KnowledgeService;
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
    // Scoped middleware is essential: root mounts multiple routers at '/'.
    for (const path of ['/knowledge', '/knowledge/*']) {
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
                maxSize: 1_000_000,
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
            c.header(
                'Access-Control-Allow-Methods',
                'GET, POST, PATCH, DELETE, OPTIONS',
            );
            c.header(
                'Access-Control-Allow-Headers',
                'Authorization, Content-Type, X-Correlation-ID',
            );
            c.header('Vary', 'Origin');
            return c.body(null, 204);
        });
    }
    app.onError((error, c) => {
        let code: KnowledgeErrorCode = 'internal_error';
        let message = 'The request could not be completed.';
        let status: 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503 = 500;
        if (error instanceof KnowledgeDomainError) {
            code = error.code;
            message = error.message;
            status =
                code === 'knowledge_not_found'
                    ? 404
                    : [
                            'version_conflict',
                            'idempotency_conflict',
                            'deletion_busy',
                        ].includes(code)
                      ? 409
                      : code === 'rate_limited'
                        ? 429
                        : 400;
        } else if (error instanceof InvalidBearerAuthorizationError) {
            code = 'authentication_required';
            message = 'Sign in to continue.';
            status = 401;
        } else if (error instanceof InvalidRequestOriginError) {
            code = 'invalid_origin';
            message = 'The request origin is not allowed.';
            status = 403;
        } else if (error instanceof z.ZodError) {
            code = 'invalid_request';
            message = 'The request is invalid.';
            status = 400;
        } else {
            const mapped = mapDictionaryHttpError(error);
            if (mapped.status === 401) {
                code = 'authentication_required';
                message = 'Sign in to continue.';
                status = 401;
            } else if (mapped.status === 503) {
                code = 'service_unavailable';
                message = 'The service is temporarily unavailable.';
                status = 503;
            }
        }
        return c.json(envelope(code, message), status);
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
            path: '/knowledge',
            security,
            request: { query: ListKnowledgeQuerySchema },
            responses: { 200: json(ListKnowledgeResponseSchema), ...errors },
        }),
        async (c) =>
            c.json(await service.list(...auth(c), c.req.valid('query')), 200),
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/knowledge',
            security,
            request: { body: body(CreateKnowledgeNoteRequestSchema) },
            responses: { 201: json(KnowledgeNoteResponseSchema), ...errors },
        }),
        async (c) =>
            c.json(
                {
                    note: await service.create(
                        ...auth(c),
                        CreateKnowledgeNoteRequestSchema.parse(
                            c.req.valid('json'),
                        ),
                    ),
                },
                201,
            ),
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/knowledge/{noteId}',
            security,
            request: { params: KnowledgeNoteIdParamsSchema },
            responses: { 200: json(KnowledgeNoteResponseSchema), ...errors },
        }),
        async (c) =>
            c.json(
                {
                    note: await service.get(
                        ...auth(c),
                        c.req.valid('param').noteId,
                    ),
                },
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'patch',
            path: '/knowledge/{noteId}',
            security,
            request: {
                params: KnowledgeNoteIdParamsSchema,
                body: body(UpdateKnowledgeNoteRequestSchema),
            },
            responses: { 200: json(KnowledgeNoteResponseSchema), ...errors },
        }),
        async (c) =>
            c.json(
                {
                    note: await service.update(
                        ...auth(c),
                        c.req.valid('param').noteId,
                        UpdateKnowledgeNoteRequestSchema.parse(
                            c.req.valid('json'),
                        ),
                    ),
                },
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'delete',
            path: '/knowledge/{noteId}',
            security,
            request: {
                params: KnowledgeNoteIdParamsSchema,
                body: body(DeleteKnowledgeNoteRequestSchema),
            },
            responses: { 200: json(KnowledgeDeletedResponseSchema), ...errors },
        }),
        async (c) => {
            await service.delete(
                ...auth(c),
                c.req.valid('param').noteId,
                DeleteKnowledgeNoteRequestSchema.parse(c.req.valid('json')),
            );
            return c.json({ deleted: true as const }, 200);
        },
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/knowledge/{noteId}/revisions',
            security,
            request: { params: KnowledgeNoteIdParamsSchema },
            responses: {
                200: json(KnowledgeRevisionsResponseSchema),
                ...errors,
            },
        }),
        async (c) =>
            c.json(
                {
                    revisions: await service.revisions(
                        ...auth(c),
                        c.req.valid('param').noteId,
                    ),
                },
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/knowledge/{noteId}/restore',
            security,
            request: {
                params: KnowledgeNoteIdParamsSchema,
                body: body(RestoreKnowledgeNoteRequestSchema),
            },
            responses: { 200: json(KnowledgeNoteResponseSchema), ...errors },
        }),
        async (c) =>
            c.json(
                {
                    note: await service.restore(
                        ...auth(c),
                        c.req.valid('param').noteId,
                        RestoreKnowledgeNoteRequestSchema.parse(
                            c.req.valid('json'),
                        ),
                    ),
                },
                200,
            ),
    );
    return app;
}
