import {
    actionAllowanceRequestMiddleware,
    actionAllowanceErrorResponse,
} from '../../../ai-credits/infrastructure/action-allowance-consent';
import {
    SentenceLibraryQuerySchema,
    SentenceLibraryListResponseSchema,
    SentenceLibraryDetailSchema,
    SentenceLibrarySnapshotRequestSchema,
    SentenceLibrarySnapshotResponseSchema,
    SentenceLibraryMutationRequestSchema,
    SentenceLibraryMutationResponseSchema,
    SentencePreparationStartRequestSchema,
    SentencePreparationBatchesQuerySchema,
    SentencePreparationBatchesResponseSchema,
    SentencePreparationResponseSchema,
    SentencePreparationCommandRequestSchema,
    SentencePreparationBatchSchema,
} from '@languon/contracts';
import { randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
    DictionaryIdParamsSchema,
    DictionaryShareKeyHeadersSchema,
    SharedDictionaryParamsSchema,
    SentenceErrorCodeSchema,
    SentenceErrorResponseSchema,
    type SentenceErrorCode,
    SentencePrepareRequestSchema,
    SentencePrepareResponseSchema,
    SentenceNextRequestSchema,
    SentenceNextResponseSchema,
    SentenceJobSchema,
    SentenceCheckRequestSchema,
    SentenceAttemptsQuerySchema,
    SentenceAttemptsResponseSchema,
    SentenceProgressQuerySchema,
    SentenceReferenceRevealRequestSchema,
    SentenceReferenceRevealResponseSchema,
    SentenceManualReviewsQuerySchema,
    SentenceManualReviewsResponseSchema,
    SentenceProgressResponseSchema,
    SentenceCapabilitiesResponseSchema,
} from '@languon/contracts';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import { authenticationRequestMetadata } from '../../../authentication/interface/http/auth-http-request';
import { mapDictionaryHttpError } from '../../../dictionaries/interface/http/dictionary-http-error-mapping';
import {
    SentenceConflictError,
    SentenceUnavailableError,
    SentenceModelUnavailableError,
    SentenceCreditsExhaustedError,
    SentenceCapacityUnavailableError,
} from '../../domain/sentence-errors';
import {
    LearningAuthenticationRequiredError,
    LearningConflictError,
    LearningEntryUnavailableError,
    LearningInvalidRequestError,
    LearningUnavailableError,
} from '../../domain/errors';
import type {
    SentencePracticeService,
    LearningTarget,
} from '../../application/sentence-practice-service';

const json = (schema: z.ZodType, description: string) => ({
    content: { 'application/json': { schema } },
    description,
});
const body = (schema: z.ZodType) => ({
    content: { 'application/json': { schema } },
    required: true,
});
const errors = {
    402: json(SentenceErrorResponseSchema, 'Insufficient AI credits'),
    400: json(SentenceErrorResponseSchema, 'Invalid request'),
    401: json(SentenceErrorResponseSchema, 'Authentication required'),
    404: json(SentenceErrorResponseSchema, 'Not found'),
    409: json(SentenceErrorResponseSchema, 'Conflict'),
    413: json(SentenceErrorResponseSchema, 'Body too large'),
    429: json(SentenceErrorResponseSchema, 'Rate limited'),
    500: json(SentenceErrorResponseSchema, 'Unexpected failure'),
    503: json(SentenceErrorResponseSchema, 'Unavailable'),
} as const;
const correlation = (context: Context) => {
    const candidate = context.req.header('X-Correlation-ID');
    return candidate && /^[0-9a-f-]{36}$/i.test(candidate)
        ? candidate
        : randomUUID();
};
const failure = (
    context: Context,
    code: SentenceErrorCode,
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

export function createSentenceRoutes({
    policy,
    service,
}: {
    policy: AuthHttpPolicy;
    service: SentencePracticeService;
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
            maxSize: 32_000,
            onError: (context) =>
                failure(
                    context,
                    'invalid_request',
                    413,
                    'The request body is too large.',
                ),
        }),
    );
    app.use('*', actionAllowanceRequestMiddleware);
    app.onError((error, context) => {
        const allowanceError = actionAllowanceErrorResponse(error, context);
        if (allowanceError) return allowanceError;
        if (!service.capabilities().sentencesEnabled)
            return failure(
                context,
                'feature_disabled',
                503,
                'Sentence practice is disabled.',
            );
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
                stale_content: 'stale_content',
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
        if (error instanceof SentenceConflictError)
            return failure(
                context,
                error.reason === 'operation_conflict'
                    ? 'idempotency_conflict'
                    : 'stale_content',
                409,
                'The learning state changed.',
            );
        if (error instanceof SentenceCapacityUnavailableError)
            return failure(
                context,
                'capacity_unavailable',
                503,
                'Sentence AI capacity is temporarily unavailable. Retry later.',
                error.retryAfterSeconds,
            );
        if (error instanceof SentenceUnavailableError)
            return failure(
                context,
                context.req.param('jobId')
                    ? 'job_not_found'
                    : 'entry_not_found',
                404,
                'The practice content was not found.',
            );
        if (error instanceof SentenceModelUnavailableError)
            return failure(
                context,
                'model_unavailable',
                503,
                'The selected model is unavailable.',
            );
        if (error instanceof SentenceCreditsExhaustedError)
            return failure(
                context,
                'ai_credits_exhausted',
                402,
                'Insufficient AI credits.',
            );
        const mapped = mapDictionaryHttpError(error);
        const code = SentenceErrorCodeSchema.safeParse(mapped.code);
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
            path: '/learning/sentences/capabilities',
            responses: {
                200: json(
                    SentenceCapabilitiesResponseSchema,
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
                      ...(accessToken ? { accessToken } : {}),
                  }
                : {
                      kind: 'owner',
                      dictionaryId: context.req.param('dictionaryId')!,
                      ...(accessToken ? { accessToken } : {}),
                  };
        };
        const metadata = (context: Context) =>
            authenticationRequestMetadata(context, policy);
        const security = [{ bearerAuth: [] as string[] }];
        app.openapi(
            createRoute({
                method: 'get',
                path: `${prefix}/library`,
                security,
                request: { ...request, query: SentenceLibraryQuerySchema },
                responses: {
                    200: json(
                        SentenceLibraryListResponseSchema,
                        'Sentence management result',
                    ),
                    ...errors,
                },
            }),
            async (c) =>
                c.json(
                    await service.listLibrary(
                        target(c),
                        c.req.valid('query'),
                        metadata(c),
                    ),
                    200,
                ),
        );
        app.openapi(
            createRoute({
                method: 'get',
                path: `${prefix}/library/{exerciseId}`,
                security,
                request: {
                    ...request,
                    params: params.extend({ exerciseId: z.uuid() }),
                },
                responses: {
                    200: json(
                        SentenceLibraryDetailSchema,
                        'Sentence management result',
                    ),
                    ...errors,
                },
            }),
            async (c) =>
                c.json(
                    await service.detailLibrary(
                        target(c),
                        c.req.param('exerciseId'),
                        metadata(c),
                    ),
                    200,
                ),
        );
        app.openapi(
            createRoute({
                method: 'post',
                path: `${prefix}/library/snapshots`,
                security,
                request: {
                    ...request,
                    body: body(SentenceLibrarySnapshotRequestSchema),
                },
                responses: {
                    200: json(
                        SentenceLibrarySnapshotResponseSchema,
                        'Sentence management result',
                    ),
                    ...errors,
                },
            }),
            async (c) =>
                c.json(
                    await service.snapshotLibrary(
                        target(c),
                        c.req.valid('json'),
                        metadata(c),
                    ),
                    200,
                ),
        );
        app.openapi(
            createRoute({
                method: 'post',
                path: `${prefix}/library/mutations`,
                security,
                request: {
                    ...request,
                    body: body(SentenceLibraryMutationRequestSchema),
                },
                responses: {
                    200: json(
                        SentenceLibraryMutationResponseSchema,
                        'Sentence management result',
                    ),
                    ...errors,
                },
            }),
            async (c) =>
                c.json(
                    await service.mutateLibrary(
                        target(c),
                        c.req.valid('json'),
                        metadata(c),
                    ),
                    200,
                ),
        );
        app.openapi(
            createRoute({
                method: 'post',
                path: `${prefix}/preparations`,
                security,
                request: {
                    ...request,
                    body: body(SentencePreparationStartRequestSchema),
                },
                responses: {
                    200: json(
                        SentencePreparationResponseSchema,
                        'Sentence management result',
                    ),
                    ...errors,
                },
            }),
            async (c) =>
                c.json(
                    await service.startPreparation(
                        target(c),
                        c.req.valid('json'),
                        metadata(c),
                    ),
                    200,
                ),
        );
        app.openapi(
            createRoute({
                method: 'get',
                path: `${prefix}/preparations/{preparationId}`,
                security,
                request: {
                    ...request,
                    params: params.extend({ preparationId: z.uuid() }),
                },
                responses: {
                    200: json(
                        SentencePreparationResponseSchema,
                        'Sentence management result',
                    ),
                    ...errors,
                },
            }),
            async (c) =>
                c.json(
                    await service.getPreparation(
                        target(c),
                        c.req.param('preparationId'),
                        metadata(c),
                    ),
                    200,
                ),
        );
        app.openapi(
            createRoute({
                method: 'post',
                path: `${prefix}/preparations/{preparationId}/commands`,
                security,
                request: {
                    ...request,
                    params: params.extend({ preparationId: z.uuid() }),
                    body: body(SentencePreparationCommandRequestSchema),
                },
                responses: {
                    200: json(
                        SentencePreparationResponseSchema,
                        'Sentence management result',
                    ),
                    ...errors,
                },
            }),
            async (c) =>
                c.json(
                    await service.commandPreparation(
                        target(c),
                        c.req.param('preparationId'),
                        c.req.valid('json'),
                        metadata(c),
                    ),
                    200,
                ),
        );
        app.openapi(
            createRoute({
                method: 'get',
                path: `${prefix}/preparations/{preparationId}/batches`,
                security,
                request: {
                    ...request,
                    params: params.extend({ preparationId: z.uuid() }),
                    query: SentencePreparationBatchesQuerySchema,
                },
                responses: {
                    200: json(
                        SentencePreparationBatchesResponseSchema,
                        'Prepared sentence batches',
                    ),
                    ...errors,
                },
            }),
            async (c) =>
                c.json(
                    await service.preparationBatches(
                        target(c),
                        c.req.param('preparationId'),
                        c.req.valid('query'),
                        metadata(c),
                    ),
                    200,
                ),
        );
        app.openapi(
            createRoute({
                method: 'get',
                path: `${prefix}/prepared-batches/{batchId}`,
                security,
                request: {
                    ...request,
                    params: params.extend({ batchId: z.uuid() }),
                },
                responses: {
                    200: json(
                        SentencePreparationBatchSchema,
                        'Sentence management result',
                    ),
                    ...errors,
                },
            }),
            async (c) =>
                c.json(
                    await service.preparedBatch(
                        target(c),
                        c.req.param('batchId'),
                        metadata(c),
                    ),
                    200,
                ),
        );
        app.openapi(
            createRoute({
                method: 'post',
                path: `${prefix}/prepare`,
                security,
                request: {
                    ...request,
                    body: body(SentencePrepareRequestSchema),
                },
                responses: {
                    200: json(
                        SentencePrepareResponseSchema,
                        'Prepared practice',
                    ),
                    ...errors,
                },
            }),
            async (c) =>
                c.json(
                    await service.prepare(
                        target(c),
                        SentencePrepareRequestSchema.parse(c.req.valid('json')),
                        metadata(c),
                    ),
                    200,
                ),
        );
        app.openapi(
            createRoute({
                method: 'post',
                path: `${prefix}/next`,
                security,
                request: { ...request, body: body(SentenceNextRequestSchema) },
                responses: {
                    200: json(
                        SentenceNextResponseSchema,
                        'Saved item or empty state',
                    ),
                    202: json(
                        SentenceNextResponseSchema,
                        'Admitted or replayed job',
                    ),
                    ...errors,
                },
            }),
            async (c) => {
                const result = await service.next(
                    target(c),
                    SentenceNextRequestSchema.parse(c.req.valid('json')),
                    metadata(c),
                );
                return c.json(result, result.kind === 'job' ? 202 : 200);
            },
        );
        const jobs = { ...request, params: params.extend({ jobId: z.uuid() }) };
        app.openapi(
            createRoute({
                method: 'get',
                path: `${prefix}/jobs/{jobId}`,
                security,
                request: jobs,
                responses: {
                    200: json(SentenceJobSchema, 'Authorized job'),
                    ...errors,
                },
            }),
            async (c) =>
                c.json(
                    await service.getJob(
                        target(c),
                        c.req.param('jobId')!,
                        metadata(c),
                    ),
                    200,
                ),
        );
        app.openapi(
            createRoute({
                method: 'post',
                path: `${prefix}/jobs/{jobId}/cancel`,
                security,
                request: jobs,
                responses: {
                    200: json(SentenceJobSchema, 'Cancellation state'),
                    ...errors,
                },
            }),
            async (c) =>
                c.json(
                    await service.cancelJob(
                        target(c),
                        c.req.param('jobId')!,
                        metadata(c),
                    ),
                    200,
                ),
        );
        app.openapi(
            createRoute({
                method: 'post',
                path: `${prefix}/exercises/{exerciseId}/checks`,
                security,
                request: {
                    ...request,
                    params: params.extend({ exerciseId: z.uuid() }),
                    body: body(SentenceCheckRequestSchema),
                },
                responses: {
                    202: json(
                        SentenceJobSchema,
                        'Admitted or replayed answer check',
                    ),
                    ...errors,
                },
            }),
            async (c) =>
                c.json(
                    await service.enqueueCheck(
                        target(c),
                        c.req.param('exerciseId')!,
                        SentenceCheckRequestSchema.parse(c.req.valid('json')),
                        metadata(c),
                    ),
                    202,
                ),
        );
        app.openapi(
            createRoute({
                method: 'get',
                path: `${prefix}/attempts`,
                security,
                request: { ...request, query: SentenceAttemptsQuerySchema },
                responses: {
                    200: json(
                        SentenceAttemptsResponseSchema,
                        'Personal attempts',
                    ),
                    ...errors,
                },
            }),
            async (c) =>
                c.json(
                    await service.attempts(
                        target(c),
                        SentenceAttemptsQuerySchema.parse(c.req.valid('query')),
                        metadata(c),
                    ),
                    200,
                ),
        );
        app.openapi(
            createRoute({
                method: 'get',
                path: `${prefix}/progress`,
                security,
                request: { ...request, query: SentenceProgressQuerySchema },
                responses: {
                    200: json(
                        SentenceProgressResponseSchema,
                        'Personal coverage',
                    ),
                    ...errors,
                },
            }),
            async (c) =>
                c.json(
                    await service.progress(
                        target(c),
                        SentenceProgressQuerySchema.parse(c.req.valid('query')),
                        metadata(c),
                    ),
                    200,
                ),
        );
        app.openapi(
            createRoute({
                method: 'post',
                path: `${prefix}/exercises/{exerciseId}/reference-answer`,
                security,
                request: {
                    ...request,
                    params: params.extend({ exerciseId: z.uuid() }),
                    body: body(SentenceReferenceRevealRequestSchema),
                },
                responses: {
                    200: json(
                        SentenceReferenceRevealResponseSchema,
                        'Free saved reference answer and personal manual review',
                    ),
                    ...errors,
                },
            }),
            async (c) =>
                c.json(
                    await service.revealReference(
                        target(c),
                        c.req.param('exerciseId')!,
                        SentenceReferenceRevealRequestSchema.parse(
                            c.req.valid('json'),
                        ),
                        metadata(c),
                    ),
                    200,
                ),
        );
        app.openapi(
            createRoute({
                method: 'get',
                path: `${prefix}/reviews`,
                security,
                request: {
                    ...request,
                    query: SentenceManualReviewsQuerySchema,
                },
                responses: {
                    200: json(
                        SentenceManualReviewsResponseSchema,
                        'Personal manual review history',
                    ),
                    ...errors,
                },
            }),
            async (c) =>
                c.json(
                    await service.manualReviews(
                        target(c),
                        SentenceManualReviewsQuerySchema.parse(
                            c.req.valid('query'),
                        ),
                        metadata(c),
                    ),
                    200,
                ),
        );
    };
    register(
        '/learning/dictionaries/{dictionaryId}/sentences',
        DictionaryIdParamsSchema,
        false,
    );
    register(
        '/learning/shared-dictionaries/{shareId}/sentences',
        SharedDictionaryParamsSchema,
        true,
    );
    return app;
}
