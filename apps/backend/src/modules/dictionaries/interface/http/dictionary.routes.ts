import { randomUUID } from 'node:crypto';

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
    CreateDictionaryCardRequestSchema,
    CreateDictionaryRequestSchema,
    DictionaryCardIdParamsSchema,
    DictionaryCardLifecycleMutationRequestSchema,
    DictionaryCardResponseSchema,
    DictionaryErrorResponseSchema,
    ExportDictionaryQuerySchema,
    ExportDictionaryResponseHeadersSchema,
    ImportDictionaryRequestSchema,
    ImportDictionaryResponseSchema,
    DictionaryIdempotencyHeadersSchema,
    DictionaryIdParamsSchema,
    DictionaryLifecycleMutationRequestSchema,
    DictionaryResponseSchema,
    DictionaryShareKeyHeadersSchema,
    ForkSharedDictionaryRequestSchema,
    ForkSharedDictionaryResponseSchema,
    LanguagesResponseSchema,
    ListDictionariesQuerySchema,
    ListDictionariesResponseSchema,
    ListDictionaryCardsQuerySchema,
    ListDictionaryCardsResponseSchema,
    ListSharedDictionaryQuerySchema,
    PreviewDictionaryImportRequestSchema,
    PreviewDictionaryImportResponseSchema,
    ReorderDictionaryCardsRequestSchema,
    ReorderDictionaryCardsResponseSchema,
    RotateDictionaryShareKeyRequestSchema,
    RotateDictionaryShareKeyResponseSchema,
    SharedDictionaryParamsSchema,
    SharedDictionaryResponseSchema,
    UpdateDictionaryCardRequestSchema,
    UpdateDictionaryRequestSchema,
} from '@languon/contracts';
import { bodyLimit } from 'hono/body-limit';

import type { DictionaryService } from '../../application/dictionary-service';
import type { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import { authenticationRequestMetadata } from '../../../authentication/interface/http/auth-http-request';
import { DictionaryHttpError } from './dictionary-http-error';
import { mapDictionaryHttpError } from './dictionary-http-error-mapping';

const errorResponse = {
    content: { 'application/json': { schema: DictionaryErrorResponseSchema } },
    description: 'Dictionary request failed.',
} as const;
const errors = {
    400: errorResponse,
    401: errorResponse,
    404: errorResponse,
    409: errorResponse,
    413: errorResponse,
    429: errorResponse,
    500: errorResponse,
    503: errorResponse,
} as const;
const bearerSecurity = [{ bearerAuth: [] as string[] }];

function requestBody(schema: z.ZodType) {
    return { content: { 'application/json': { schema } }, required: true };
}

function jsonResponse(schema: z.ZodType, description: string) {
    return { content: { 'application/json': { schema } }, description };
}

function correlationId(value: string | undefined): string {
    return value &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            value,
        )
        ? value
        : randomUUID();
}

export interface DictionaryRouteDependencies {
    policy: AuthHttpPolicy;
    service: DictionaryService;
}

export function createDictionaryRoutes({
    policy,
    service,
}: DictionaryRouteDependencies): OpenAPIHono {
    const requestContext = (
        context: Parameters<typeof authenticationRequestMetadata>[0],
    ) => {
        const metadata = authenticationRequestMetadata(context, policy);
        return {
            clientAddress: metadata.clientAddress,
            signal: metadata.signal,
        };
    };
    const app = new OpenAPIHono({
        defaultHook: (result, context) => {
            if (result.success) return;
            return context.json(
                new DictionaryHttpError(
                    'invalid_request',
                    'The request is invalid.',
                    400,
                ).response(
                    correlationId(context.req.header('X-Correlation-ID')),
                ),
                400,
            );
        },
    });
    app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
        bearerFormat: 'JWT',
        scheme: 'bearer',
        type: 'http',
    });
    app.use(
        '*',
        bodyLimit({
            maxSize: 2_250_000,
            onError: (context) =>
                context.json(
                    new DictionaryHttpError(
                        'invalid_request',
                        'The request body is too large.',
                        413,
                    ).response(
                        correlationId(context.req.header('X-Correlation-ID')),
                    ),
                    413,
                ),
        }),
    );
    app.use('*', async (context, next) => {
        for (const [name, value] of Object.entries(policy.securityHeaders()))
            context.header(name, value);
        context.header('Cache-Control', 'private, no-store');
        context.header('Referrer-Policy', 'no-referrer');
        context.header('X-Robots-Tag', 'noindex, nofollow');
        const origin = context.req.header('Origin');
        if (origin) {
            policy.assertCookieRequestOrigin(origin);
            context.header('Access-Control-Allow-Origin', origin);
            context.header('Access-Control-Allow-Credentials', 'true');
            context.header(
                'Access-Control-Expose-Headers',
                'Cache-Control, Content-Disposition, Content-Type, Referrer-Policy, X-Content-Type-Options',
            );
            context.header('Vary', 'Origin');
        }
        await next();
    });
    app.onError((error, context) => {
        const mapped = mapDictionaryHttpError(error);
        if (mapped.retryAfterSeconds)
            context.header('Retry-After', String(mapped.retryAfterSeconds));
        return context.json(
            mapped.response(
                correlationId(context.req.header('X-Correlation-ID')),
            ),
            mapped.status,
        );
    });

    const bearer = (value: string | undefined) =>
        policy.parseBearerAuthorization(value ?? null);

    app.openapi(
        createRoute({
            method: 'post',
            path: '/dictionary-imports/preview',
            request: {
                body: requestBody(PreviewDictionaryImportRequestSchema),
            },
            responses: {
                200: jsonResponse(
                    PreviewDictionaryImportResponseSchema,
                    'Dictionary import preview.',
                ),
                ...errors,
            },
            security: bearerSecurity,
        }),
        async (context) =>
            context.json(
                await service.previewDictionaryImport(
                    bearer(context.req.header('Authorization')),
                    context.req.valid('json'),
                    requestContext(context),
                ),
                200,
            ),
    );

    app.openapi(
        createRoute({
            method: 'post',
            path: '/dictionary-imports',
            request: {
                body: requestBody(ImportDictionaryRequestSchema),
                headers: DictionaryIdempotencyHeadersSchema,
            },
            responses: {
                200: jsonResponse(
                    ImportDictionaryResponseSchema,
                    'Dictionary import committed.',
                ),
                ...errors,
            },
            security: bearerSecurity,
        }),
        async (context) =>
            context.json(
                await service.importDictionary(
                    bearer(context.req.header('Authorization')),
                    context.req.valid('header')['idempotency-key'],
                    context.req.valid('json'),
                    requestContext(context),
                ),
                200,
            ),
    );

    app.openapi(
        createRoute({
            method: 'get',
            path: '/dictionaries/{dictionaryId}/export',
            request: {
                params: DictionaryIdParamsSchema,
                query: ExportDictionaryQuerySchema,
            },
            responses: {
                200: {
                    content: {
                        'text/csv': {
                            schema: z.string().openapi({ format: 'binary' }),
                        },
                        'text/plain': {
                            schema: z.string().openapi({ format: 'binary' }),
                        },
                    },
                    description: 'Dictionary export attachment.',
                    headers: ExportDictionaryResponseHeadersSchema,
                },
                ...errors,
            },
            security: bearerSecurity,
        }),
        async (context) => {
            const result = await service.exportDictionary(
                bearer(context.req.header('Authorization')),
                context.req.valid('param').dictionaryId,
                context.req.valid('query').format,
                requestContext(context),
            );
            return context.body(result.body, 200, result.headers);
        },
    );

    app.options('*', (context) => {
        const origin = context.req.header('Origin');
        policy.assertCookieRequestOrigin(origin ?? null);
        context.header('Access-Control-Allow-Origin', origin!);
        context.header('Access-Control-Allow-Credentials', 'true');
        context.header(
            'Access-Control-Allow-Headers',
            'Authorization, Content-Type, X-Correlation-ID, Idempotency-Key, X-Languon-Share-Key',
        );
        context.header(
            'Access-Control-Allow-Methods',
            'GET, PATCH, POST, OPTIONS',
        );
        context.header('Vary', 'Origin');
        return context.body(null, 204);
    });

    app.openapi(
        createRoute({
            method: 'get',
            path: '/languages',
            responses: {
                200: jsonResponse(
                    LanguagesResponseSchema,
                    'Supported languages.',
                ),
                ...errors,
            },
            tags: ['Dictionaries'],
        }),
        (context) => context.json(service.languages(), 200),
    );

    app.openapi(
        createRoute({
            method: 'get',
            path: '/dictionaries',
            request: { query: ListDictionariesQuerySchema },
            responses: {
                200: jsonResponse(
                    ListDictionariesResponseSchema,
                    'Owner dictionaries.',
                ),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Dictionaries'],
        }),
        async (context) =>
            context.json(
                await service.listDictionaries(
                    bearer(context.req.header('Authorization')),
                    context.req.valid('query'),
                    requestContext(context),
                ),
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/dictionaries',
            request: {
                headers: DictionaryIdempotencyHeadersSchema.passthrough(),
                body: requestBody(CreateDictionaryRequestSchema),
            },
            responses: {
                201: jsonResponse(
                    DictionaryResponseSchema,
                    'Dictionary created.',
                ),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Dictionaries'],
        }),
        async (context) =>
            context.json(
                {
                    dictionary: await service.createDictionary(
                        bearer(context.req.header('Authorization')),
                        context.req.valid('header')['idempotency-key'],
                        context.req.valid('json'),
                        requestContext(context),
                    ),
                },
                201,
            ),
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/dictionaries/{dictionaryId}',
            request: { params: DictionaryIdParamsSchema },
            responses: {
                200: jsonResponse(DictionaryResponseSchema, 'Dictionary.'),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Dictionaries'],
        }),
        async (context) =>
            context.json(
                {
                    dictionary: await service.readDictionary(
                        bearer(context.req.header('Authorization')),
                        context.req.valid('param').dictionaryId,
                        requestContext(context),
                    ),
                },
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'patch',
            path: '/dictionaries/{dictionaryId}',
            request: {
                params: DictionaryIdParamsSchema,
                body: requestBody(UpdateDictionaryRequestSchema),
            },
            responses: {
                200: jsonResponse(
                    DictionaryResponseSchema,
                    'Dictionary updated.',
                ),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Dictionaries'],
        }),
        async (context) =>
            context.json(
                {
                    dictionary: await service.updateDictionary(
                        bearer(context.req.header('Authorization')),
                        context.req.valid('param').dictionaryId,
                        context.req.valid('json'),
                        requestContext(context),
                    ),
                },
                200,
            ),
    );

    for (const lifecycle of ['archive', 'restore'] as const) {
        app.openapi(
            createRoute({
                method: 'post',
                path: `/dictionaries/{dictionaryId}/${lifecycle}`,
                request: {
                    params: DictionaryIdParamsSchema,
                    body: requestBody(DictionaryLifecycleMutationRequestSchema),
                },
                responses: {
                    200: jsonResponse(
                        DictionaryResponseSchema,
                        `Dictionary ${lifecycle}d.`,
                    ),
                    ...errors,
                },
                security: bearerSecurity,
                tags: ['Dictionaries'],
            }),
            async (context) => {
                const token = bearer(context.req.header('Authorization'));
                const id = context.req.valid('param').dictionaryId;
                const input = context.req.valid('json');
                const dictionary =
                    lifecycle === 'archive'
                        ? await service.archiveDictionary(
                              token,
                              id,
                              input,
                              requestContext(context),
                          )
                        : await service.restoreDictionary(
                              token,
                              id,
                              input,
                              requestContext(context),
                          );
                return context.json({ dictionary }, 200);
            },
        );
    }

    app.openapi(
        createRoute({
            method: 'get',
            path: '/dictionaries/{dictionaryId}/cards',
            request: {
                params: DictionaryIdParamsSchema,
                query: ListDictionaryCardsQuerySchema,
            },
            responses: {
                200: jsonResponse(
                    ListDictionaryCardsResponseSchema,
                    'Dictionary cards.',
                ),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Dictionary cards'],
        }),
        async (context) =>
            context.json(
                await service.listCards(
                    bearer(context.req.header('Authorization')),
                    context.req.valid('param').dictionaryId,
                    context.req.valid('query'),
                    requestContext(context),
                ),
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/dictionaries/{dictionaryId}/cards',
            request: {
                params: DictionaryIdParamsSchema,
                body: requestBody(CreateDictionaryCardRequestSchema),
            },
            responses: {
                201: jsonResponse(
                    DictionaryCardResponseSchema,
                    'Card created.',
                ),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Dictionary cards'],
        }),
        async (context) =>
            context.json(
                await service.createCard(
                    bearer(context.req.header('Authorization')),
                    context.req.valid('param').dictionaryId,
                    context.req.valid('json'),
                    requestContext(context),
                ),
                201,
            ),
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/dictionaries/{dictionaryId}/cards/{cardId}',
            request: { params: DictionaryCardIdParamsSchema },
            responses: {
                200: jsonResponse(DictionaryCardResponseSchema, 'Card.'),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Dictionary cards'],
        }),
        async (context) =>
            context.json(
                await service.readCard(
                    bearer(context.req.header('Authorization')),
                    context.req.valid('param').dictionaryId,
                    context.req.valid('param').cardId,
                    requestContext(context),
                ),
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'patch',
            path: '/dictionaries/{dictionaryId}/cards/{cardId}',
            request: {
                params: DictionaryCardIdParamsSchema,
                body: requestBody(UpdateDictionaryCardRequestSchema),
            },
            responses: {
                200: jsonResponse(
                    DictionaryCardResponseSchema,
                    'Card updated.',
                ),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Dictionary cards'],
        }),
        async (context) =>
            context.json(
                await service.updateCard(
                    bearer(context.req.header('Authorization')),
                    context.req.valid('param').dictionaryId,
                    context.req.valid('param').cardId,
                    context.req.valid('json'),
                    requestContext(context),
                ),
                200,
            ),
    );

    for (const lifecycle of ['archive', 'restore'] as const) {
        app.openapi(
            createRoute({
                method: 'post',
                path: `/dictionaries/{dictionaryId}/cards/{cardId}/${lifecycle}`,
                request: {
                    params: DictionaryCardIdParamsSchema,
                    body: requestBody(
                        DictionaryCardLifecycleMutationRequestSchema,
                    ),
                },
                responses: {
                    200: jsonResponse(
                        DictionaryCardResponseSchema,
                        `Card ${lifecycle}d.`,
                    ),
                    ...errors,
                },
                security: bearerSecurity,
                tags: ['Dictionary cards'],
            }),
            async (context) => {
                const token = bearer(context.req.header('Authorization'));
                const params = context.req.valid('param');
                const input = context.req.valid('json');
                const response =
                    lifecycle === 'archive'
                        ? await service.archiveCard(
                              token,
                              params.dictionaryId,
                              params.cardId,
                              input,
                              requestContext(context),
                          )
                        : await service.restoreCard(
                              token,
                              params.dictionaryId,
                              params.cardId,
                              input,
                              requestContext(context),
                          );
                return context.json(response, 200);
            },
        );
    }

    app.openapi(
        createRoute({
            method: 'post',
            path: '/dictionaries/{dictionaryId}/cards/reorder',
            request: {
                params: DictionaryIdParamsSchema,
                body: requestBody(ReorderDictionaryCardsRequestSchema),
            },
            responses: {
                200: jsonResponse(
                    ReorderDictionaryCardsResponseSchema,
                    'Cards reordered.',
                ),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Dictionary cards'],
        }),
        async (context) =>
            context.json(
                await service.reorderCards(
                    bearer(context.req.header('Authorization')),
                    context.req.valid('param').dictionaryId,
                    context.req.valid('json'),
                    requestContext(context),
                ),
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/dictionaries/{dictionaryId}/share-key/rotate',
            request: {
                params: DictionaryIdParamsSchema,
                body: requestBody(RotateDictionaryShareKeyRequestSchema),
            },
            responses: {
                200: jsonResponse(
                    RotateDictionaryShareKeyResponseSchema,
                    'Share capability rotated.',
                ),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Dictionary sharing'],
        }),
        async (context) =>
            context.json(
                await service.rotateShare(
                    bearer(context.req.header('Authorization')),
                    context.req.valid('param').dictionaryId,
                    context.req.valid('json').expectedDictionaryVersion,
                    requestContext(context),
                ),
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/shared/dictionaries/{shareId}',
            request: {
                params: SharedDictionaryParamsSchema,
                headers:
                    DictionaryShareKeyHeadersSchema.partial().passthrough(),
                query: ListSharedDictionaryQuerySchema,
            },
            responses: {
                200: jsonResponse(
                    SharedDictionaryResponseSchema,
                    'Shared dictionary.',
                ),
                ...errors,
            },
            tags: ['Dictionary sharing'],
        }),
        async (context) =>
            context.json(
                await service.readShared(
                    context.req.valid('param').shareId,
                    context.req.valid('header')['x-languon-share-key'] ?? '',
                    context.req.valid('query'),
                    requestContext(context),
                ),
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/shared/dictionaries/{shareId}/fork',
            request: {
                params: SharedDictionaryParamsSchema,
                headers: DictionaryShareKeyHeadersSchema.partial()
                    .merge(DictionaryIdempotencyHeadersSchema)
                    .passthrough(),
                body: requestBody(ForkSharedDictionaryRequestSchema),
            },
            responses: {
                201: jsonResponse(
                    ForkSharedDictionaryResponseSchema,
                    'Dictionary forked.',
                ),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Dictionary sharing'],
        }),
        async (context) =>
            context.json(
                {
                    dictionary: await service.forkShared(
                        bearer(context.req.header('Authorization')),
                        context.req.valid('param').shareId,
                        context.req.valid('header')['x-languon-share-key'] ??
                            '',
                        context.req.valid('header')['idempotency-key'],
                        context.req.valid('json'),
                        requestContext(context),
                    ),
                },
                201,
            ),
    );
    return app;
}
