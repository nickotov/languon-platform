import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
    DictionaryAudioFieldSchema,
    DictionaryAudioRequestSchema,
    DictionaryAudioResponseSchema,
    DictionaryCardIdParamsSchema,
    DictionaryErrorResponseSchema,
} from '@languon/contracts';
import type { DictionaryAudioService } from '../../application/dictionary-audio-service';
import type { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import { randomUUID } from 'node:crypto';
import { mapDictionaryHttpError } from './dictionary-http-error-mapping';
import { DictionaryHttpError } from './dictionary-http-error';

const errors = {
    400: {
        description: 'Invalid request',
        content: {
            'application/json': { schema: DictionaryErrorResponseSchema },
        },
    },
    401: {
        description: 'Authentication required',
        content: {
            'application/json': { schema: DictionaryErrorResponseSchema },
        },
    },
    404: {
        description: 'Card or audio not found',
        content: {
            'application/json': { schema: DictionaryErrorResponseSchema },
        },
    },
    409: {
        description: 'Card changed',
        content: {
            'application/json': { schema: DictionaryErrorResponseSchema },
        },
    },
    429: {
        description: 'Budget or capacity exhausted',
        content: {
            'application/json': { schema: DictionaryErrorResponseSchema },
        },
    },
    503: {
        description: 'Audio unavailable',
        content: {
            'application/json': { schema: DictionaryErrorResponseSchema },
        },
    },
};
const stateResponse = {
    description: 'Current audio state',
    content: { 'application/json': { schema: DictionaryAudioResponseSchema } },
};
const params = DictionaryCardIdParamsSchema.extend({
    field: DictionaryAudioFieldSchema,
});

export function createDictionaryAudioRoutes(dependencies: {
    policy: AuthHttpPolicy;
    service: DictionaryAudioService;
}): OpenAPIHono {
    const app = new OpenAPIHono({
        defaultHook: (result, context) => {
            if (!result.success)
                return context.json(
                    new DictionaryHttpError(
                        'invalid_request',
                        'The request is invalid.',
                        400,
                    ).response(randomUUID()),
                    400,
                );
        },
    });
    app.use('*', async (context, next) => {
        context.header('Cache-Control', 'private, no-store');
        await next();
    });
    app.onError((error, context) => {
        const mapped = mapDictionaryHttpError(error);
        if (mapped.retryAfterSeconds)
            context.header('Retry-After', String(mapped.retryAfterSeconds));
        return context.json(mapped.response(randomUUID()), mapped.status);
    });
    app.openapi(
        createRoute({
            method: 'post',
            path: '/dictionaries/{dictionaryId}/cards/{cardId}/audio',
            tags: ['Dictionary audio'],
            security: [{ bearerAuth: [] }],
            request: {
                params: DictionaryCardIdParamsSchema,
                body: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: DictionaryAudioRequestSchema,
                        },
                    },
                },
            },
            responses: { ...errors, 200: stateResponse, 202: stateResponse },
        }),
        async (context) => {
            const { dictionaryId, cardId } = context.req.valid('param');
            const result = await dependencies.service.request(
                dependencies.policy.parseBearerAuthorization(
                    context.req.header('authorization') ?? null,
                ),
                dictionaryId,
                cardId,
                context.req.valid('json'),
                { signal: context.req.raw.signal },
            );
            return context.json(
                result,
                result.state === 'queued' || result.state === 'processing'
                    ? 202
                    : 200,
            );
        },
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/dictionaries/{dictionaryId}/cards/{cardId}/audio/{field}',
            tags: ['Dictionary audio'],
            security: [{ bearerAuth: [] }],
            request: { params },
            responses: { ...errors, 200: stateResponse },
        }),
        async (context) => {
            const { dictionaryId, cardId, field } = context.req.valid('param');
            return context.json(
                await dependencies.service.status(
                    dependencies.policy.parseBearerAuthorization(
                        context.req.header('authorization') ?? null,
                    ),
                    dictionaryId,
                    cardId,
                    field,
                    { signal: context.req.raw.signal },
                ),
                200,
            );
        },
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/dictionaries/{dictionaryId}/cards/{cardId}/audio/{field}/content',
            tags: ['Dictionary audio'],
            security: [{ bearerAuth: [] }],
            request: {
                params,
                query: z.object({ assetId: z.uuid() }).strict(),
            },
            responses: {
                ...errors,
                200: {
                    description: 'Private audio bytes',
                    content: {
                        'audio/mpeg': {
                            schema: z.string().openapi({ format: 'binary' }),
                        },
                        'audio/wav': {
                            schema: z.string().openapi({ format: 'binary' }),
                        },
                    },
                },
            },
        }),
        async (context) => {
            const { dictionaryId, cardId, field } = context.req.valid('param');
            const audio = await dependencies.service.content(
                dependencies.policy.parseBearerAuthorization(
                    context.req.header('authorization') ?? null,
                ),
                dictionaryId,
                cardId,
                field,
                context.req.valid('query').assetId,
                { signal: context.req.raw.signal },
            );
            context.header('Cache-Control', 'private, no-store');
            context.header('Content-Type', audio.mimeType);
            context.header('Content-Length', String(audio.bytes.byteLength));
            context.header('X-Content-Type-Options', 'nosniff');
            return context.body(new Uint8Array(audio.bytes), 200);
        },
    );
    return app;
}
