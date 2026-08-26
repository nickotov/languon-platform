import { randomUUID } from 'node:crypto';

import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
    CompleteDictionaryDocumentUploadRequestSchema,
    CompleteDictionaryDocumentUploadResponseSchema,
    CreateDictionaryDocumentUploadRequestSchema,
    CreateDictionaryDocumentUploadResponseSchema,
    DictionaryDocumentUploadIdParamsSchema,
    DictionaryErrorResponseSchema,
    DictionaryIdempotencyHeadersSchema,
    DictionaryIdParamsSchema,
} from '@languon/contracts';

import type { DictionaryDocumentService } from '../../application/dictionary-document-service';
import type { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import { authenticationRequestMetadata } from '../../../authentication/interface/http/auth-http-request';
import { DictionaryHttpError } from './dictionary-http-error';
import { mapDictionaryHttpError } from './dictionary-http-error-mapping';

const errorResponse = {
    content: { 'application/json': { schema: DictionaryErrorResponseSchema } },
    description: 'Dictionary document request failed.',
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
const correlationId = (value: string | undefined) =>
    value && /^[0-9a-f-]{36}$/i.test(value) ? value : randomUUID();

export function createDictionaryDocumentRoutes(dependencies: {
    policy: AuthHttpPolicy;
    service: DictionaryDocumentService;
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
            method: 'post',
            path: '/dictionaries/{dictionaryId}/document-uploads',
            request: {
                body: {
                    content: {
                        'application/json': {
                            schema: CreateDictionaryDocumentUploadRequestSchema,
                        },
                    },
                    required: true,
                },
                headers: DictionaryIdempotencyHeadersSchema.passthrough(),
                params: DictionaryIdParamsSchema,
            },
            responses: {
                202: {
                    content: {
                        'application/json': {
                            schema: CreateDictionaryDocumentUploadResponseSchema,
                        },
                    },
                    description: 'Document upload authorized.',
                },
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Dictionaries'],
        }),
        async (context) =>
            context.json(
                await dependencies.service.authorizeUpload(
                    bearer(context.req.header('Authorization')),
                    context.req.valid('header')['idempotency-key'],
                    context.req.valid('param').dictionaryId,
                    context.req.valid('json'),
                    requestContext(context),
                ),
                202,
            ),
    );

    app.openapi(
        createRoute({
            method: 'post',
            path: '/dictionary-document-uploads/{uploadId}/complete',
            request: {
                body: {
                    content: {
                        'application/json': {
                            schema: CompleteDictionaryDocumentUploadRequestSchema,
                        },
                    },
                    required: true,
                },
                params: DictionaryDocumentUploadIdParamsSchema,
            },
            responses: {
                200: {
                    content: {
                        'application/json': {
                            schema: CompleteDictionaryDocumentUploadResponseSchema,
                        },
                    },
                    description: 'Document upload completed.',
                },
                ...errors,
            },
            security: bearerSecurity,
            tags: ['Dictionaries'],
        }),
        async (context) =>
            context.json(
                await dependencies.service.completeUpload(
                    bearer(context.req.header('Authorization')),
                    context.req.valid('param').uploadId,
                    context.req.valid('json'),
                    requestContext(context),
                ),
                200,
            ),
    );

    return app;
}
