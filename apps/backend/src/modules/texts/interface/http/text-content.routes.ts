import type { MiddlewareHandler } from 'hono';
import { randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import {
    CreateTextFolderRequestSchema,
    UpdateTextFolderRequestSchema,
    TextVersionRequestSchema,
    CreateTextRequestSchema,
    SaveTextRequestSchema,
    ListTextFoldersQuerySchema,
    ListTextsQuerySchema,
    TextFolderResponseSchema,
    TextResponseSchema,
    ListTextFoldersResponseSchema,
    ListTextsResponseSchema,
    TextIdParamsSchema,
    TextFolderIdParamsSchema,
    TextErrorResponseSchema,
    TextShareParamsSchema,
    TextShareKeyHeadersSchema,
    TextShareResponseSchema,
    TextFolderSchema,
    TextSchema,
    CopySharedTextRequestSchema,
    CopySharedTextFolderRequestSchema,
} from '@languon/contracts';
import type { TextContentService } from '../../application/text-content-service';
import { TextDomainError } from '../../domain/text';
import { TextsAiError } from '../../application/ports/texts-ai-provider';
import type { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import {
    InvalidBearerAuthorizationError,
    InvalidRequestOriginError,
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
const error = json(TextErrorResponseSchema, 'Request failed');
const errors = {
    400: error,
    401: error,
    403: error,
    404: error,
    409: error,
    413: error,
    429: error,
    500: error,
    503: error,
};
const security = [{ bearerAuth: [] as string[] }];
export function createTextContentRoutes({
    service,
    policy,
}: {
    service: TextContentService;
    policy: AuthHttpPolicy;
}) {
    const app = new OpenAPIHono({
        defaultHook: (result, c) => {
            if (!result.success)
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
        },
    });
    app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
    });
    const ownedPaths = [
        '/text-folders',
        '/text-folders/*',
        '/texts',
        '/texts/*',
        '/shared-texts/*',
        '/shared-text-folders/*',
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
            policy.assertCookieRequestOrigin(origin);
            c.header('Access-Control-Allow-Origin', origin);
            c.header('Access-Control-Allow-Credentials', 'true');
            c.header('Vary', 'Origin');
        }
        await next();
    });
    for (const path of ownedPaths)
        app.options(path, (c) => {
            const origin = c.req.header('Origin');
            policy.assertCookieRequestOrigin(origin ?? null);
            c.header('Access-Control-Allow-Origin', origin!);
            c.header(
                'Access-Control-Allow-Methods',
                'GET, PATCH, PUT, POST, DELETE, OPTIONS',
            );
            c.header(
                'Access-Control-Allow-Headers',
                'Authorization, Content-Type, X-Correlation-ID, X-Languon-Share-Key',
            );
            c.header('Vary', 'Origin');
            return c.body(null, 204);
        });
    useOwned(
        bodyLimit({
            maxSize: 2_250_000,
            onError: (c) =>
                c.json(
                    {
                        error: {
                            code: 'invalid_request',
                            message: 'The request body is too large.',
                            correlationId: randomUUID(),
                        },
                    },
                    413,
                ),
        }),
    );
    app.onError((error, c) => {
        let code = 'internal_error';
        let message = 'The request could not be completed.';
        let status: 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503 = 500;
        if (error instanceof TextDomainError || error instanceof TextsAiError) {
            code = error.code;
            message = error.message;
            status = code.includes('not_found')
                ? 404
                : code.includes('conflict')
                  ? 409
                  : code === 'rate_limited'
                    ? 429
                    : code === 'service_unavailable'
                      ? 503
                      : 400;
        } else if (error instanceof InvalidBearerAuthorizationError) {
            code = 'authentication_required';
            message = 'Sign in to continue.';
            status = 401;
        } else if (error instanceof InvalidRequestOriginError) {
            code = 'invalid_request';
            message = 'The request origin is not allowed.';
            status = 403;
        } else {
            const mapped = mapDictionaryHttpError(error);
            if (mapped.status === 401) {
                status = 401;
                code = 'authentication_required';
                message = 'Sign in to continue.';
            } else if (mapped.status === 503) {
                status = 503;
                code = 'service_unavailable';
                message = 'The service is temporarily unavailable.';
            }
        }
        return c.json(
            { error: { code, message, correlationId: randomUUID() } },
            status,
        );
    });
    const token = (c: Parameters<typeof authenticationRequestMetadata>[0]) =>
        policy.parseBearerAuthorization(c.req.header('Authorization') ?? null);
    const context = (
        c: Parameters<typeof authenticationRequestMetadata>[0],
    ) => {
        const metadata = authenticationRequestMetadata(c, policy);
        return {
            clientAddress: metadata.clientAddress,
            signal: metadata.signal,
        };
    };
    app.openapi(
        createRoute({
            method: 'get',
            path: '/text-folders',
            security,
            request: { query: ListTextFoldersQuerySchema },
            responses: { 200: json(ListTextFoldersResponseSchema), ...errors },
        }),
        async (c) => {
            const r = await service.listFolders(
                token(c),
                context(c),
                c.req.valid('query'),
            );
            return c.json({ data: r.items, nextCursor: r.nextCursor }, 200);
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/text-folders',
            security,
            request: { body: body(CreateTextFolderRequestSchema) },
            responses: { 201: json(TextFolderResponseSchema), ...errors },
        }),
        async (c) =>
            c.json(
                {
                    folder: await service.createFolder(
                        token(c),
                        context(c),
                        CreateTextFolderRequestSchema.parse(
                            c.req.valid('json'),
                        ),
                    ),
                },
                201,
            ),
    );
    app.openapi(
        createRoute({
            method: 'patch',
            path: '/text-folders/{folderId}',
            security,
            request: {
                params: TextFolderIdParamsSchema,
                body: body(UpdateTextFolderRequestSchema),
            },
            responses: { 200: json(TextFolderResponseSchema), ...errors },
        }),
        async (c) =>
            c.json(
                {
                    folder: await service.updateFolder(
                        token(c),
                        context(c),
                        c.req.valid('param').folderId,
                        UpdateTextFolderRequestSchema.parse(
                            c.req.valid('json'),
                        ),
                    ),
                },
                200,
            ),
    );
    for (const lifecycle of ['archived', 'active'] as const) {
        const operation = lifecycle === 'archived' ? 'archive' : 'restore';
        app.openapi(
            createRoute({
                method: 'post',
                path: `/text-folders/{folderId}/${operation}`,
                security,
                request: {
                    params: TextFolderIdParamsSchema,
                    body: body(TextVersionRequestSchema),
                },
                responses: { 200: json(TextFolderResponseSchema), ...errors },
            }),
            async (c) =>
                c.json(
                    {
                        folder: await service.folderLifecycle(
                            token(c),
                            context(c),
                            c.req.valid('param').folderId,
                            TextVersionRequestSchema.parse(c.req.valid('json'))
                                .expectedVersion,
                            lifecycle,
                        ),
                    },
                    200,
                ),
        );
        app.openapi(
            createRoute({
                method: 'post',
                path: `/texts/{textId}/${operation}`,
                security,
                request: {
                    params: TextIdParamsSchema,
                    body: body(TextVersionRequestSchema),
                },
                responses: { 200: json(TextResponseSchema), ...errors },
            }),
            async (c) =>
                c.json(
                    {
                        text: await service.textLifecycle(
                            token(c),
                            context(c),
                            c.req.valid('param').textId,
                            TextVersionRequestSchema.parse(c.req.valid('json'))
                                .expectedVersion,
                            lifecycle,
                        ),
                    },
                    200,
                ),
        );
    }
    app.openapi(
        createRoute({
            method: 'get',
            path: '/text-folders/{folderId}/texts',
            security,
            request: {
                params: TextFolderIdParamsSchema,
                query: ListTextsQuerySchema,
            },
            responses: { 200: json(ListTextsResponseSchema), ...errors },
        }),
        async (c) => {
            const r = await service.listTexts(
                token(c),
                context(c),
                c.req.valid('param').folderId,
                c.req.valid('query'),
            );
            return c.json({ data: r.items, nextCursor: r.nextCursor }, 200);
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/texts',
            security,
            request: { body: body(CreateTextRequestSchema) },
            responses: { 201: json(TextResponseSchema), ...errors },
        }),
        async (c) =>
            c.json(
                {
                    text: await service.createText(
                        token(c),
                        context(c),
                        CreateTextRequestSchema.parse(c.req.valid('json')),
                    ),
                },
                201,
            ),
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/texts/{textId}',
            security,
            request: { params: TextIdParamsSchema },
            responses: { 200: json(TextResponseSchema), ...errors },
        }),
        async (c) =>
            c.json(
                {
                    text: await service.getText(
                        token(c),
                        context(c),
                        c.req.valid('param').textId,
                    ),
                },
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'put',
            path: '/texts/{textId}',
            security,
            request: {
                params: TextIdParamsSchema,
                body: body(SaveTextRequestSchema),
            },
            responses: { 200: json(TextResponseSchema), ...errors },
        }),
        async (c) =>
            c.json(
                {
                    text: await service.saveText(
                        token(c),
                        context(c),
                        c.req.valid('param').textId,
                        SaveTextRequestSchema.parse(c.req.valid('json')),
                    ),
                },
                200,
            ),
    );
    for (const kind of ['text', 'folder'] as const) {
        const path =
            kind === 'text' ? '/texts/{id}/share' : '/text-folders/{id}/share';
        const params = z.object({ id: z.uuid() });
        app.openapi(
            createRoute({
                method: 'post',
                path,
                security,
                request: { params, body: body(TextVersionRequestSchema) },
                responses: { 200: json(TextShareResponseSchema), ...errors },
            }),
            async (c) => {
                const share = await service.issueShare(
                    token(c),
                    context(c),
                    kind,
                    c.req.valid('param').id,
                    TextVersionRequestSchema.parse(c.req.valid('json'))
                        .expectedVersion,
                );
                return c.json(
                    { capability: { shareId: share.locator, key: share.key } },
                    200,
                );
            },
        );
        app.openapi(
            createRoute({
                method: 'delete',
                path,
                security,
                request: { params, body: body(TextVersionRequestSchema) },
                responses: {
                    204: { description: 'Sharing revoked' },
                    ...errors,
                },
            }),
            async (c) => {
                await service.revokeShare(
                    token(c),
                    context(c),
                    kind,
                    c.req.valid('param').id,
                    TextVersionRequestSchema.parse(c.req.valid('json'))
                        .expectedVersion,
                );
                return c.body(null, 204);
            },
        );
        const publicPath =
            kind === 'text'
                ? '/shared-texts/{shareId}'
                : '/shared-text-folders/{shareId}';
        app.openapi(
            createRoute({
                method: 'get',
                path: publicPath,
                request: {
                    params: TextShareParamsSchema,
                    headers: TextShareKeyHeadersSchema,
                    query: ListTextsQuerySchema,
                },
                responses: {
                    200: json(
                        z.object({
                            folder: TextFolderSchema.nullable(),
                            texts: z.array(TextSchema),
                            nextCursor: z.string().nullable(),
                        }),
                    ),
                    ...errors,
                },
            }),
            async (c) => {
                const result = await service.readShared(
                    context(c),
                    {
                        kind,
                        locator: c.req.valid('param').shareId,
                        key: c.req.valid('header')['x-languon-share-key'],
                    },
                    c.req.valid('query'),
                );
                return c.json(result, 200);
            },
        );
        app.openapi(
            createRoute({
                method: 'post',
                path: `${publicPath}/copy`,
                security,
                request: {
                    params: TextShareParamsSchema,
                    headers: TextShareKeyHeadersSchema,
                    body: body(
                        kind === 'text'
                            ? CopySharedTextRequestSchema
                            : CopySharedTextFolderRequestSchema,
                    ),
                },
                responses: { 201: json(z.object({ id: z.uuid() })), ...errors },
            }),
            async (c) => {
                const request =
                    kind === 'text'
                        ? (() => {
                              const value = CopySharedTextRequestSchema.parse(
                                  c.req.valid('json'),
                              );
                              return {
                                  idempotencyKey: value.operationId,
                                  destinationFolderId: value.folderId,
                                  expectedVersion: value.expectedVersion,
                              };
                          })()
                        : {
                              idempotencyKey:
                                  CopySharedTextFolderRequestSchema.parse(
                                      c.req.valid('json'),
                                  ).operationId,
                          };
                const result = await service.copyShared(
                    token(c),
                    context(c),
                    {
                        kind,
                        locator: c.req.valid('param').shareId,
                        key: c.req.valid('header')['x-languon-share-key'],
                    },
                    request,
                );
                return c.json(result, 201);
            },
        );
    }
    app.openapi(
        createRoute({
            method: 'post',
            path: '/shared-text-folders/{shareId}/texts/{textId}/copy',
            security,
            request: {
                params: TextShareParamsSchema.extend({ textId: z.uuid() }),
                headers: TextShareKeyHeadersSchema,
                body: body(CopySharedTextRequestSchema),
            },
            responses: { 201: json(z.object({ id: z.uuid() })), ...errors },
        }),
        async (c) => {
            const request = CopySharedTextRequestSchema.parse(
                c.req.valid('json'),
            );
            return c.json(
                await service.copyShared(
                    token(c),
                    context(c),
                    {
                        kind: 'folder',
                        locator: c.req.valid('param').shareId,
                        key: c.req.valid('header')['x-languon-share-key'],
                    },
                    {
                        sourceTextId: c.req.valid('param').textId,
                        destinationFolderId: request.folderId,
                        expectedVersion: request.expectedVersion,
                        idempotencyKey: request.operationId,
                    },
                ),
                201,
            );
        },
    );
    return app;
}
