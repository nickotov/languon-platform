import { randomUUID } from 'node:crypto';

import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
    AcceptDictionaryGenerationJobRequestSchema,
    AcceptDictionaryGenerationJobResponseSchema,
    CancelDictionaryGenerationJobRequestSchema,
    CancelDictionaryGenerationJobResponseSchema,
    DictionaryCardIdParamsSchema,
    DictionaryErrorResponseSchema,
    DictionaryGenerationJobIdParamsSchema,
    DictionaryGenerationJobResponseSchema,
    DictionaryIdParamsSchema,
    DictionaryIdempotencyHeadersSchema,
    DiscardDictionaryGenerationJobRequestSchema,
    DiscardDictionaryGenerationJobResponseSchema,
    EnqueueDictionaryCardGenerationRequestSchema,
    EnqueueDictionaryCardGenerationResponseSchema,
    EnqueueDictionaryPastedTermsGenerationRequestSchema,
    EnqueueDictionaryPastedTermsGenerationResponseSchema,
    ReadDictionaryGenerationCapabilitiesResponseSchema,
    ReadLatestDictionaryCardGenerationResponseSchema,
    RegenerateDictionaryGenerationJobRequestSchema,
    RegenerateDictionaryGenerationJobResponseSchema,
    RetryDictionaryDocumentTermsGenerationRequestSchema,
    RetryDictionaryDocumentTermsGenerationResponseSchema,
    RetryDictionaryImportPairsGenerationRequestSchema,
    RetryDictionaryImportPairsGenerationResponseSchema,
    RetryDictionaryPastedTermsGenerationRequestSchema,
    RetryDictionaryPastedTermsGenerationResponseSchema,
} from '@languon/contracts';
import type { z } from 'zod';

import type { DictionaryGenerationService } from '../../application/dictionary-generation-service';
import type { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import { authenticationRequestMetadata } from '../../../authentication/interface/http/auth-http-request';
import { DictionaryHttpError } from './dictionary-http-error';
import { mapDictionaryHttpError } from './dictionary-http-error-mapping';

const errorResponse = {
    content: { 'application/json': { schema: DictionaryErrorResponseSchema } },
    description: 'Dictionary generation request failed.',
} as const;
const errors = {
    400: errorResponse,
    401: errorResponse,
    404: errorResponse,
    409: errorResponse,
    429: errorResponse,
    500: errorResponse,
    503: errorResponse,
} as const;
const bearerSecurity = [{ bearerAuth: [] as string[] }];

const requestBody = (schema: z.ZodType) => ({
    content: { 'application/json': { schema } },
    required: true,
});
const jsonResponse = (schema: z.ZodType, description: string) => ({
    content: { 'application/json': { schema } },
    description,
});
const correlationId = (value: string | undefined) =>
    value && /^[0-9a-f-]{36}$/i.test(value) ? value : randomUUID();

export function createDictionaryGenerationRoutes(dependencies: {
    policy: AuthHttpPolicy;
    service: DictionaryGenerationService;
}) {
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
        dependencies.policy.parseBearerAuthorization(value ?? null);
    const requestContext = (
        context: Parameters<typeof authenticationRequestMetadata>[0],
    ) => {
        const metadata = authenticationRequestMetadata(
            context,
            dependencies.policy,
        );
        return {
            clientAddress: metadata.clientAddress,
            signal: metadata.signal,
        };
    };

    app.openapi(
        createRoute({
            method: 'get',
            path: '/dictionary-generation-capabilities',
            responses: {
                200: jsonResponse(
                    ReadDictionaryGenerationCapabilitiesResponseSchema,
                    'Dictionary generation capabilities.',
                ),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Dictionaries'],
        }),
        async (context) =>
            context.json(
                await dependencies.service.capabilities(
                    bearer(context.req.header('Authorization')),
                    requestContext(context),
                ),
                200,
            ),
    );

    app.openapi(
        createRoute({
            method: 'post',
            path: '/dictionaries/{dictionaryId}/batch-generations',
            request: {
                body: requestBody(
                    EnqueueDictionaryPastedTermsGenerationRequestSchema,
                ),
                headers: DictionaryIdempotencyHeadersSchema.passthrough(),
                params: DictionaryIdParamsSchema,
            },
            responses: {
                202: jsonResponse(
                    EnqueueDictionaryPastedTermsGenerationResponseSchema,
                    'Pasted-term generation enqueued.',
                ),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Dictionaries'],
        }),
        async (context) => {
            const params = context.req.valid('param');
            return context.json(
                {
                    job: await dependencies.service.enqueuePastedTerms(
                        bearer(context.req.header('Authorization')),
                        context.req.valid('header')['idempotency-key'],
                        params.dictionaryId,
                        context.req.valid('json'),
                        requestContext(context),
                    ),
                },
                202,
            );
        },
    );

    app.openapi(
        createRoute({
            method: 'post',
            path: '/dictionaries/{dictionaryId}/cards/{cardId}/generations',
            request: {
                body: requestBody(EnqueueDictionaryCardGenerationRequestSchema),
                headers: DictionaryIdempotencyHeadersSchema.passthrough(),
                params: DictionaryCardIdParamsSchema,
            },
            responses: {
                202: jsonResponse(
                    EnqueueDictionaryCardGenerationResponseSchema,
                    'Generation enqueued.',
                ),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Dictionaries'],
        }),
        async (context) => {
            const params = context.req.valid('param');
            return context.json(
                {
                    job: await dependencies.service.enqueue(
                        bearer(context.req.header('Authorization')),
                        context.req.valid('header')['idempotency-key'],
                        params.dictionaryId,
                        params.cardId,
                        context.req.valid('json'),
                        requestContext(context),
                    ),
                },
                202,
            );
        },
    );

    app.openapi(
        createRoute({
            method: 'get',
            path: '/dictionaries/{dictionaryId}/cards/{cardId}/generations/latest',
            request: { params: DictionaryCardIdParamsSchema },
            responses: {
                200: jsonResponse(
                    ReadLatestDictionaryCardGenerationResponseSchema,
                    'Latest retained generation job.',
                ),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Dictionaries'],
        }),
        async (context) => {
            const params = context.req.valid('param');
            return context.json(
                {
                    job: await dependencies.service.latest(
                        bearer(context.req.header('Authorization')),
                        params.dictionaryId,
                        params.cardId,
                        requestContext(context),
                    ),
                },
                200,
            );
        },
    );

    app.openapi(
        createRoute({
            method: 'get',
            path: '/dictionary-generation-jobs/{jobId}',
            request: { params: DictionaryGenerationJobIdParamsSchema },
            responses: {
                200: jsonResponse(
                    DictionaryGenerationJobResponseSchema,
                    'Generation job.',
                ),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Dictionaries'],
        }),
        async (context) =>
            context.json(
                {
                    job: await dependencies.service.read(
                        bearer(context.req.header('Authorization')),
                        context.req.valid('param').jobId,
                        requestContext(context),
                    ),
                },
                200,
            ),
    );

    app.openapi(
        createRoute({
            method: 'post',
            path: '/dictionary-generation-jobs/{jobId}/retry-pasted-terms',
            request: {
                body: requestBody(
                    RetryDictionaryPastedTermsGenerationRequestSchema,
                ),
                headers: DictionaryIdempotencyHeadersSchema.passthrough(),
                params: DictionaryGenerationJobIdParamsSchema,
            },
            responses: {
                202: jsonResponse(
                    RetryDictionaryPastedTermsGenerationResponseSchema,
                    'Pasted-term generation retry enqueued.',
                ),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Dictionaries'],
        }),
        async (context) =>
            context.json(
                {
                    job: await dependencies.service.retryPastedTerms(
                        bearer(context.req.header('Authorization')),
                        context.req.valid('header')['idempotency-key'],
                        context.req.valid('param').jobId,
                        context.req.valid('json'),
                        requestContext(context),
                    ),
                },
                202,
            ),
    );

    app.openapi(
        createRoute({
            method: 'post',
            path: '/dictionary-generation-jobs/{jobId}/retry-document-terms',
            request: {
                body: requestBody(
                    RetryDictionaryDocumentTermsGenerationRequestSchema,
                ),
                headers: DictionaryIdempotencyHeadersSchema.passthrough(),
                params: DictionaryGenerationJobIdParamsSchema,
            },
            responses: {
                202: jsonResponse(
                    RetryDictionaryDocumentTermsGenerationResponseSchema,
                    'Document-term failure retry enqueued.',
                ),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Dictionaries'],
        }),
        async (context) =>
            context.json(
                {
                    job: await dependencies.service.retryDocumentTerms(
                        bearer(context.req.header('Authorization')),
                        context.req.valid('header')['idempotency-key'],
                        context.req.valid('param').jobId,
                        context.req.valid('json'),
                        requestContext(context),
                    ),
                },
                202,
            ),
    );

    app.openapi(
        createRoute({
            method: 'post',
            path: '/dictionary-generation-jobs/{jobId}/retry-import-pairs',
            request: {
                body: requestBody(
                    RetryDictionaryImportPairsGenerationRequestSchema,
                ),
                headers: DictionaryIdempotencyHeadersSchema.passthrough(),
                params: DictionaryGenerationJobIdParamsSchema,
            },
            responses: {
                202: jsonResponse(
                    RetryDictionaryImportPairsGenerationResponseSchema,
                    'Import-pairs generation retry enqueued.',
                ),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Dictionaries'],
        }),
        async (context) =>
            context.json(
                {
                    job: await dependencies.service.retryImportPairs(
                        bearer(context.req.header('Authorization')),
                        context.req.valid('header')['idempotency-key'],
                        context.req.valid('param').jobId,
                        context.req.valid('json'),
                        requestContext(context),
                    ),
                },
                202,
            ),
    );

    const action = (
        suffix: 'cancel' | 'discard',
        body: z.ZodType,
        response: z.ZodType,
    ) => {
        app.openapi(
            createRoute({
                method: 'post',
                path: `/dictionary-generation-jobs/{jobId}/${suffix}`,
                request: {
                    body: requestBody(body),
                    params: DictionaryGenerationJobIdParamsSchema,
                },
                responses: {
                    200: jsonResponse(response, `Generation ${suffix}led.`),
                    ...errors,
                },
                security: bearerSecurity,
                tags: ['Dictionaries'],
            }),
            async (context) =>
                context.json(
                    {
                        job: await dependencies.service[suffix](
                            bearer(context.req.header('Authorization')),
                            context.req.valid('param').jobId,
                            requestContext(context),
                        ),
                    },
                    200,
                ),
        );
    };
    action(
        'cancel',
        CancelDictionaryGenerationJobRequestSchema,
        CancelDictionaryGenerationJobResponseSchema,
    );
    action(
        'discard',
        DiscardDictionaryGenerationJobRequestSchema,
        DiscardDictionaryGenerationJobResponseSchema,
    );

    app.openapi(
        createRoute({
            method: 'post',
            path: '/dictionary-generation-jobs/{jobId}/accept',
            request: {
                body: requestBody(AcceptDictionaryGenerationJobRequestSchema),
                params: DictionaryGenerationJobIdParamsSchema,
            },
            responses: {
                200: jsonResponse(
                    AcceptDictionaryGenerationJobResponseSchema,
                    'Generation proposal accepted.',
                ),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Dictionaries'],
        }),
        async (context) =>
            context.json(
                await dependencies.service.accept(
                    bearer(context.req.header('Authorization')),
                    context.req.valid('param').jobId,
                    context.req.valid('json'),
                    requestContext(context),
                ),
                200,
            ),
    );

    app.openapi(
        createRoute({
            method: 'post',
            path: '/dictionary-generation-jobs/{jobId}/regenerate',
            request: {
                body: requestBody(
                    RegenerateDictionaryGenerationJobRequestSchema,
                ),
                headers: DictionaryIdempotencyHeadersSchema.passthrough(),
                params: DictionaryGenerationJobIdParamsSchema,
            },
            responses: {
                202: jsonResponse(
                    RegenerateDictionaryGenerationJobResponseSchema,
                    'Replacement generation enqueued.',
                ),
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Dictionaries'],
        }),
        async (context) =>
            context.json(
                {
                    job: await dependencies.service.regenerate(
                        bearer(context.req.header('Authorization')),
                        context.req.valid('param').jobId,
                        context.req.valid('header')['idempotency-key'],
                        context.req.valid('json'),
                        requestContext(context),
                    ),
                },
                202,
            ),
    );

    return app;
}
