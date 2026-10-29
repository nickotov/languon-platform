import { randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import {
    CopyWorkbookRequestSchema,
    CreateWorkbookRequestSchema,
    KnowledgeErrorResponseSchema,
    SetWorkbookNotesRequestSchema,
    SharedWorkbookSchema,
    UpdateWorkbookRequestSchema,
    WorkbookIdParamsSchema,
    WorkbookSchema,
    WorkbookShareKeySchema,
    WorkbookShareLocatorSchema,
    WorkbookShareSchema,
    WorkbookVersionSchema,
    type KnowledgeErrorCode,
} from '@languon/contracts';
import type { WorkbookService } from '../../application/workbook-service';
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
    required: true as const,
});
const error = (code: KnowledgeErrorCode, message: string) => ({
    error: { code, message, correlationId: randomUUID() },
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
const resultSchema = z.object({ workbook: WorkbookSchema });
const deletedSchema = z.object({ deleted: z.literal(true) });

export function createWorkbookRoutes({
    service,
    policy,
}: {
    service: WorkbookService;
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
        bearerFormat: 'JWT',
    });
    for (const path of ['/knowledge/workbooks', '/knowledge/workbooks/*']) {
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
                maxSize: 100_000,
                onError: (c) =>
                    c.json(
                        error(
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
                'GET, POST, PATCH, PUT, DELETE, OPTIONS',
            );
            c.header(
                'Access-Control-Allow-Headers',
                'Authorization, Content-Type, X-Correlation-ID, X-Languon-Share-Key, X-Languon-Share-Kind, X-Languon-Share-Locator',
            );
            c.header('Vary', 'Origin');
            return c.body(null, 204);
        });
    }
    app.onError((caught, c) => {
        let code: KnowledgeErrorCode = 'internal_error';
        let message = 'The request could not be completed.';
        let status: 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503 = 500;
        if (caught instanceof KnowledgeDomainError) {
            code = caught.code;
            message = caught.message;
            if (code === 'knowledge_not_found') status = 404;
            else if (
                [
                    'version_conflict',
                    'idempotency_conflict',
                    'deletion_busy',
                ].includes(code)
            )
                status = 409;
            else if (code === 'rate_limited') status = 429;
            else status = 400;
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
            } else if (mapped.status === 503) {
                code = 'service_unavailable';
                message = 'The service is temporarily unavailable.';
                status = 503;
            }
        }
        return c.json(error(code, message), status);
    });
    const context = (
        c: Parameters<typeof authenticationRequestMetadata>[0],
    ) => {
        const metadata = authenticationRequestMetadata(c, policy);
        return {
            signal: metadata.signal,
            clientAddress: metadata.clientAddress,
        };
    };
    const auth = (c: Parameters<typeof authenticationRequestMetadata>[0]) =>
        [
            policy.parseBearerAuthorization(
                c.req.header('Authorization') ?? null,
            ),
            context(c),
        ] as const;
    app.openapi(
        createRoute({
            method: 'get',
            path: '/knowledge/workbooks',
            security,
            responses: {
                200: json(z.object({ workbooks: z.array(WorkbookSchema) })),
                ...errors,
            },
        }),
        async (c) => c.json({ workbooks: await service.list(...auth(c)) }, 200),
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/knowledge/workbooks',
            security,
            request: { body: body(CreateWorkbookRequestSchema) },
            responses: { 201: json(resultSchema), ...errors },
        }),
        async (c) =>
            c.json(
                {
                    workbook: await service.create(
                        ...auth(c),
                        c.req.valid('json'),
                    ),
                },
                201,
            ),
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/knowledge/workbooks/shared/{locator}',
            request: {
                params: z.object({ locator: WorkbookShareLocatorSchema }),
            },
            responses: {
                200: json(z.object({ workbook: SharedWorkbookSchema })),
                ...errors,
            },
        }),
        async (c) =>
            c.json(
                {
                    workbook: await service.readShared(
                        context(c),
                        c.req.valid('param').locator,
                        WorkbookShareKeySchema.parse(
                            c.req.header('X-Languon-Share-Key'),
                        ),
                    ),
                },
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/knowledge/workbooks/{workbookId}',
            security,
            request: { params: WorkbookIdParamsSchema },
            responses: { 200: json(resultSchema), ...errors },
        }),
        async (c) =>
            c.json(
                {
                    workbook: await service.get(
                        ...auth(c),
                        c.req.valid('param').workbookId,
                    ),
                },
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'patch',
            path: '/knowledge/workbooks/{workbookId}',
            security,
            request: {
                params: WorkbookIdParamsSchema,
                body: body(UpdateWorkbookRequestSchema),
            },
            responses: { 200: json(resultSchema), ...errors },
        }),
        async (c) =>
            c.json(
                {
                    workbook: await service.update(
                        ...auth(c),
                        c.req.valid('param').workbookId,
                        c.req.valid('json'),
                    ),
                },
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'put',
            path: '/knowledge/workbooks/{workbookId}/notes',
            security,
            request: {
                params: WorkbookIdParamsSchema,
                body: body(SetWorkbookNotesRequestSchema),
            },
            responses: { 200: json(resultSchema), ...errors },
        }),
        async (c) =>
            c.json(
                {
                    workbook: await service.setNotes(
                        ...auth(c),
                        c.req.valid('param').workbookId,
                        c.req.valid('json'),
                    ),
                },
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'delete',
            path: '/knowledge/workbooks/{workbookId}',
            security,
            request: {
                params: WorkbookIdParamsSchema,
                body: body(WorkbookVersionSchema),
            },
            responses: { 200: json(deletedSchema), ...errors },
        }),
        async (c) => {
            await service.delete(
                ...auth(c),
                c.req.valid('param').workbookId,
                c.req.valid('json'),
            );
            return c.json({ deleted: true as const }, 200);
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/knowledge/workbooks/{workbookId}/share',
            security,
            request: {
                params: WorkbookIdParamsSchema,
                body: body(WorkbookVersionSchema),
            },
            responses: { 200: json(WorkbookShareSchema), ...errors },
        }),
        async (c) =>
            c.json(
                await service.issueShare(
                    ...auth(c),
                    c.req.valid('param').workbookId,
                    c.req.valid('json'),
                ),
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'delete',
            path: '/knowledge/workbooks/{workbookId}/share',
            security,
            request: {
                params: WorkbookIdParamsSchema,
                body: body(WorkbookVersionSchema),
            },
            responses: {
                200: json(z.object({ disabled: z.literal(true) })),
                ...errors,
            },
        }),
        async (c) => {
            await service.revokeShare(
                ...auth(c),
                c.req.valid('param').workbookId,
                c.req.valid('json'),
            );
            return c.json({ disabled: true as const }, 200);
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/knowledge/workbooks/shared/{locator}/copy',
            security,
            request: {
                params: z.object({ locator: WorkbookShareLocatorSchema }),
                body: body(CopyWorkbookRequestSchema),
            },
            responses: { 201: json(resultSchema), ...errors },
        }),
        async (c) =>
            c.json(
                {
                    workbook: await service.copyShared(
                        ...auth(c),
                        c.req.valid('param').locator,
                        WorkbookShareKeySchema.parse(
                            c.req.header('X-Languon-Share-Key'),
                        ),
                        c.req.valid('json'),
                    ),
                },
                201,
            ),
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/knowledge/workbooks/{workbookId}/copy',
            security,
            request: {
                params: WorkbookIdParamsSchema,
                body: body(
                    CopyWorkbookRequestSchema.extend({
                        expectedVersion:
                            WorkbookVersionSchema.shape.expectedVersion,
                    }),
                ),
            },
            responses: { 201: json(resultSchema), ...errors },
        }),
        async (c) =>
            c.json(
                {
                    workbook: await service.copy(
                        ...auth(c),
                        c.req.valid('param').workbookId,
                        c.req.valid('json'),
                    ),
                },
                201,
            ),
    );
    return app;
}
