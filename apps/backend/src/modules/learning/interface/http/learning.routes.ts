import { randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
    DictionaryIdParamsSchema,
    DictionaryShareKeyHeadersSchema,
    SharedDictionaryParamsSchema,
    FlashcardAttemptRequestSchema,
    FlashcardAttemptResponseSchema,
    FlashcardItemsRequestSchema,
    FlashcardItemsResponseSchema,
    FlashcardPreferencesSchema,
    FlashcardPreferencesPutRequestSchema,
    FlashcardPrepareRequestSchema,
    FlashcardPrepareResponseSchema,
    FlashcardProgressResponseSchema,
    FlashcardUndoRequestSchema,
    FlashcardUndoResponseSchema,
    LearningCapabilitiesResponseSchema,
    LearningEntriesQuerySchema,
    LearningEntriesResponseSchema,
    LearningErrorCodeSchema,
    LearningErrorResponseSchema,
    type LearningErrorCode,
} from '@languon/contracts';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import { authenticationRequestMetadata } from '../../../authentication/interface/http/auth-http-request';
import { mapDictionaryHttpError } from '../../../dictionaries/interface/http/dictionary-http-error-mapping';
import {
    LearningAuthenticationRequiredError,
    LearningConflictError,
    LearningEntryUnavailableError,
    LearningInvalidRequestError,
    LearningUnavailableError,
} from '../../domain/errors';
import type {
    LearningService,
    LearningTarget,
} from '../../application/learning-service';

const json = (schema: z.ZodType, description: string) => ({
    content: { 'application/json': { schema } },
    description,
});
const body = (schema: z.ZodType) => ({
    content: { 'application/json': { schema } },
    required: true,
});
const errors = {
    400: json(LearningErrorResponseSchema, 'Invalid request'),
    401: json(LearningErrorResponseSchema, 'Authentication required'),
    404: json(LearningErrorResponseSchema, 'Not found'),
    409: json(LearningErrorResponseSchema, 'Conflict'),
    413: json(LearningErrorResponseSchema, 'Body too large'),
    429: json(LearningErrorResponseSchema, 'Rate limited'),
    500: json(LearningErrorResponseSchema, 'Unexpected failure'),
    503: json(LearningErrorResponseSchema, 'Unavailable'),
} as const;
const correlation = (context: Context) => {
    const candidate = context.req.header('X-Correlation-ID');
    return candidate && /^[0-9a-f-]{36}$/i.test(candidate)
        ? candidate
        : randomUUID();
};
const failure = (
    context: Context,
    code: LearningErrorCode,
    status: ContentfulStatusCode,
    message: string,
    retryAfterSeconds?: number,
) => {
    if (retryAfterSeconds !== undefined)
        context.header('Retry-After', String(retryAfterSeconds));
    return context.json(
        {
            error: {
                code,
                message,
                correlationId: correlation(context),
                ...(retryAfterSeconds === undefined
                    ? {}
                    : { retryAfterSeconds }),
            },
        },
        status,
    );
};

export function createLearningRoutes({
    policy,
    service,
}: {
    policy: AuthHttpPolicy;
    service: LearningService;
}): OpenAPIHono {
    const app = new OpenAPIHono({
        defaultHook: (result, context) =>
            result.success
                ? undefined
                : failure(
                      context,
                      'invalid_request',
                      400,
                      'The request is invalid.',
                  ),
    });
    app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
    });
    app.use('*', async (context, next) => {
        context.header('Cache-Control', 'private, no-store');
        context.header('Referrer-Policy', 'no-referrer');
        context.header('X-Robots-Tag', 'noindex, nofollow');
        const origin = context.req.header('Origin');
        if (origin) {
            policy.assertCookieRequestOrigin(origin);
            context.header('Access-Control-Allow-Origin', origin);
            context.header('Vary', 'Origin');
        }
        await next();
    });
    app.use(
        '*',
        bodyLimit({
            maxSize: 600_000,
            onError: (context) =>
                failure(
                    context,
                    'invalid_request',
                    413,
                    'The request body is too large.',
                ),
        }),
    );
    app.onError((error, context) => {
        if (error instanceof HTTPException && error.status === 400)
            return failure(
                context,
                'invalid_request',
                400,
                'The request is invalid.',
            );
        if (error instanceof LearningEntryUnavailableError)
            return failure(
                context,
                'entry_not_found',
                404,
                'The entry is no longer available.',
            );
        if (error instanceof LearningUnavailableError)
            return failure(
                context,
                context.req.path.includes('/shared-dictionaries/')
                    ? 'shared_dictionary_not_found'
                    : 'dictionary_not_found',
                404,
                'The dictionary was not found.',
            );
        if (error instanceof LearningAuthenticationRequiredError)
            return failure(
                context,
                'authentication_required',
                401,
                'Authentication is required.',
            );
        if (error instanceof LearningInvalidRequestError)
            return failure(
                context,
                'invalid_request',
                400,
                'The request is invalid.',
            );
        if (error instanceof LearningConflictError) {
            const code = {
                preferences_conflict: 'version_conflict',
                stale_content: 'learning_version_conflict',
                operation_conflict: 'idempotency_conflict',
                undo_conflict: 'undo_conflict',
            } as const;
            return failure(
                context,
                code[error.reason],
                409,
                'The learning state changed. Reload or retry the operation.',
            );
        }
        const mapped = mapDictionaryHttpError(error);
        const code = LearningErrorCodeSchema.safeParse(mapped.code);
        return failure(
            context,
            code.success ? code.data : 'internal_error',
            code.success ? mapped.status : 500,
            code.success ? mapped.message : 'An unexpected error occurred.',
            mapped.retryAfterSeconds,
        );
    });
    app.options('/learning/*', (context) => {
        context.header(
            'Access-Control-Allow-Methods',
            'GET, POST, PUT, OPTIONS',
        );
        context.header(
            'Access-Control-Allow-Headers',
            'Authorization, Content-Type, X-Correlation-ID, X-Languon-Share-Key',
        );
        context.header('Access-Control-Max-Age', '600');
        return context.body(null, 204);
    });
    app.openapi(
        createRoute({
            method: 'get',
            path: '/learning/capabilities',
            responses: {
                200: json(
                    LearningCapabilitiesResponseSchema,
                    'Available learning modes',
                ),
                ...errors,
            },
        }),
        (context) => context.json(service.capabilities(), 200),
    );

    const register = (prefix: string, params: z.ZodObject, shared: boolean) => {
        const request = {
            params,
            ...(shared ? { headers: DictionaryShareKeyHeadersSchema } : {}),
        };
        const target = (context: Context): LearningTarget => {
            const authorization = context.req.header('Authorization');
            const accessToken =
                authorization === undefined
                    ? undefined
                    : policy.parseBearerAuthorization(authorization);
            return shared
                ? {
                      kind: 'shared',
                      shareId: context.req.param('shareId')!,
                      shareKey: context.req.header('x-languon-share-key')!,
                      ...(accessToken === undefined ? {} : { accessToken }),
                  }
                : {
                      kind: 'owner',
                      dictionaryId: context.req.param('dictionaryId')!,
                      ...(accessToken === undefined ? {} : { accessToken }),
                  };
        };
        const metadata = (context: Context) =>
            authenticationRequestMetadata(context, policy);
        const security = shared
            ? [{}, { bearerAuth: [] as string[] }]
            : [{ bearerAuth: [] as string[] }];
        app.openapi(
            createRoute({
                method: 'get',
                path: `${prefix}/entries`,
                security,
                request: { ...request, query: LearningEntriesQuerySchema },
                responses: {
                    200: json(
                        LearningEntriesResponseSchema,
                        'Active entry previews',
                    ),
                    ...errors,
                },
            }),
            async (context) =>
                context.json(
                    await service.listEntries(
                        target(context),
                        context.req.valid('query'),
                        metadata(context),
                    ),
                    200,
                ),
        );
        app.openapi(
            createRoute({
                method: 'get',
                path: `${prefix}/flashcards/preferences`,
                security: [{ bearerAuth: [] as string[] }],
                request,
                responses: {
                    200: json(
                        FlashcardPreferencesSchema,
                        'Saved settings or defaults',
                    ),
                    ...errors,
                },
            }),
            async (context) =>
                context.json(
                    await service.getPreferences(
                        target(context),
                        metadata(context),
                    ),
                    200,
                ),
        );
        app.openapi(
            createRoute({
                method: 'put',
                path: `${prefix}/flashcards/preferences`,
                security: [{ bearerAuth: [] as string[] }],
                request: {
                    ...request,
                    body: body(FlashcardPreferencesPutRequestSchema),
                },
                responses: {
                    200: json(FlashcardPreferencesSchema, 'Updated settings'),
                    ...errors,
                },
            }),
            async (context) =>
                context.json(
                    await service.savePreferences(
                        target(context),
                        FlashcardPreferencesPutRequestSchema.parse(
                            context.req.valid('json'),
                        ),
                        metadata(context),
                    ),
                    200,
                ),
        );
        app.openapi(
            createRoute({
                method: 'post',
                path: `${prefix}/flashcards/prepare`,
                security,
                request: {
                    ...request,
                    body: body(FlashcardPrepareRequestSchema),
                },
                responses: {
                    200: json(
                        FlashcardPrepareResponseSchema,
                        'Ordered eligible IDs',
                    ),
                    ...errors,
                },
            }),
            async (context) =>
                context.json(
                    await service.prepare(
                        target(context),
                        FlashcardPrepareRequestSchema.parse(
                            context.req.valid('json'),
                        ),
                        metadata(context),
                    ),
                    200,
                ),
        );
        app.openapi(
            createRoute({
                method: 'post',
                path: `${prefix}/flashcards/items`,
                security,
                request: {
                    ...request,
                    body: body(FlashcardItemsRequestSchema),
                },
                responses: {
                    200: json(
                        FlashcardItemsResponseSchema,
                        'Bounded projected content',
                    ),
                    ...errors,
                },
            }),
            async (context) =>
                context.json(
                    await service.items(
                        target(context),
                        FlashcardItemsRequestSchema.parse(
                            context.req.valid('json'),
                        ),
                        metadata(context),
                    ),
                    200,
                ),
        );
        app.openapi(
            createRoute({
                method: 'get',
                path: `${prefix}/flashcards/progress`,
                security: [{ bearerAuth: [] as string[] }],
                request,
                responses: {
                    200: json(
                        FlashcardProgressResponseSchema,
                        'Current active entry totals',
                    ),
                    ...errors,
                },
            }),
            async (context) =>
                context.json(
                    await service.progress(target(context), metadata(context)),
                    200,
                ),
        );
        app.openapi(
            createRoute({
                method: 'post',
                path: `${prefix}/flashcards/attempts`,
                security: [{ bearerAuth: [] as string[] }],
                request: {
                    ...request,
                    body: body(FlashcardAttemptRequestSchema),
                },
                responses: {
                    200: json(
                        FlashcardAttemptResponseSchema,
                        'Acknowledged idempotent rating',
                    ),
                    ...errors,
                },
            }),
            async (context) =>
                context.json(
                    await service.recordAttempt(
                        target(context),
                        FlashcardAttemptRequestSchema.parse(
                            context.req.valid('json'),
                        ),
                        metadata(context),
                    ),
                    200,
                ),
        );
        app.openapi(
            createRoute({
                method: 'post',
                path: `${prefix}/flashcards/attempts/{attemptId}/undo`,
                security: [{ bearerAuth: [] as string[] }],
                request: {
                    ...request,
                    params: params.extend({ attemptId: z.uuid() }),
                    body: body(FlashcardUndoRequestSchema),
                },
                responses: {
                    200: json(
                        FlashcardUndoResponseSchema,
                        'Acknowledged reversal',
                    ),
                    ...errors,
                },
            }),
            async (context) =>
                context.json(
                    await service.undo(
                        target(context),
                        context.req.param('attemptId')!,
                        FlashcardUndoRequestSchema.parse(
                            context.req.valid('json'),
                        ),
                        metadata(context),
                    ),
                    200,
                ),
        );
    };
    register(
        '/learning/dictionaries/{dictionaryId}',
        DictionaryIdParamsSchema,
        false,
    );
    register(
        '/learning/shared-dictionaries/{shareId}',
        SharedDictionaryParamsSchema,
        true,
    );
    return app;
}
