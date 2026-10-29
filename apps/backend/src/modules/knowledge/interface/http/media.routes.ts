import { randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import {
    KnowledgeErrorResponseSchema,
    type KnowledgeErrorCode,
    KnowledgeMediaAssetSchema,
    KnowledgeMediaParamsSchema,
    KnowledgeMediaAccessSchema,
    knowledgeAudioMaximumBytes,
} from '@languon/contracts';
import type { KnowledgeMediaService } from '../../application/media-service';
import { KnowledgeDomainError } from '../../domain/knowledge';
import {
    InvalidBearerAuthorizationError,
    InvalidRequestOriginError,
    type AuthHttpPolicy,
} from '../../../authentication/interface/http/auth-http-policy';
import { authenticationRequestMetadata } from '../../../authentication/interface/http/auth-http-request';
import { mapDictionaryHttpError } from '../../../dictionaries/interface/http/dictionary-http-error-mapping';

const error = (code: KnowledgeErrorCode, message: string) => ({
    error: { code, message, correlationId: randomUUID() },
});
const failed = {
    description: 'Request failed',
    content: { 'application/json': { schema: KnowledgeErrorResponseSchema } },
};
const failures = {
    400: failed,
    401: failed,
    403: failed,
    404: failed,
    413: failed,
    429: failed,
    503: failed,
};

export function createKnowledgeMediaRoutes({
    service,
    policy,
}: {
    service: KnowledgeMediaService;
    policy: AuthHttpPolicy;
}) {
    const app = new OpenAPIHono();
    app.use(
        '/knowledge/notes/*/media/from-speech',
        bodyLimit({
            maxSize: 1024,
            onError: (c) =>
                c.json(
                    error('invalid_request', 'The request is too large.'),
                    413,
                ),
        }),
    );
    for (const path of [
        '/knowledge/notes/:noteId/media',
        '/knowledge/notes/:noteId/media/*',
    ])
        app.use(path, async (c, next) => {
            c.header('Cache-Control', 'private, no-store');
            c.header('X-Content-Type-Options', 'nosniff');
            c.header('Referrer-Policy', 'no-referrer');
            const origin = c.req.header('Origin');
            if (origin) {
                policy.assertCookieRequestOrigin(origin);
                c.header('Access-Control-Allow-Origin', origin);
                c.header('Access-Control-Allow-Credentials', 'true');
                c.header('Vary', 'Origin');
            }
            if (c.req.method === 'OPTIONS') {
                c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                c.header(
                    'Access-Control-Allow-Headers',
                    'Authorization, Content-Type, X-Languon-Share-Key',
                );
                return c.body(null, 204);
            }
            await next();
        });
    app.use(
        '/knowledge/notes/*/media',
        bodyLimit({
            maxSize: knowledgeAudioMaximumBytes,
            onError: (c) =>
                c.json(
                    {
                        error: {
                            code: 'invalid_request',
                            message: 'Audio exceeds 5 MiB.',
                        },
                    },
                    413,
                ),
        }),
    );
    app.onError((caught, c) => {
        if (caught instanceof InvalidBearerAuthorizationError)
            return c.json(
                error('authentication_required', 'Sign in to continue.'),
                401,
            );
        if (caught instanceof InvalidRequestOriginError)
            return c.json(
                error('invalid_origin', 'The request origin is not allowed.'),
                403,
            );
        if (caught instanceof KnowledgeDomainError) {
            let status: 400 | 404 | 429 = 400;
            if (caught.code === 'knowledge_not_found') status = 404;
            if (caught.code === 'rate_limited') status = 429;
            return c.json(error(caught.code, caught.message), status);
        }
        if (caught instanceof z.ZodError)
            return c.json(
                error('invalid_request', 'The request is invalid.'),
                400,
            );
        const mapped = mapDictionaryHttpError(caught);
        if (mapped.status === 401)
            return c.json(
                error('authentication_required', 'Sign in to continue.'),
                401,
            );
        return c.json(
            error('service_unavailable', 'The audio could not be loaded.'),
            503,
        );
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
    app.openapi(
        createRoute({
            method: 'post',
            path: '/knowledge/notes/{noteId}/media',
            request: {
                params: z.object({ noteId: z.uuid() }),
                body: {
                    content: {
                        'audio/wav': {
                            schema: z.string().openapi({ format: 'binary' }),
                        },
                        'audio/mpeg': {
                            schema: z.string().openapi({ format: 'binary' }),
                        },
                    },
                    required: true,
                },
            },
            responses: {
                ...failures,
                201: {
                    description: 'Owned audio asset',
                    content: {
                        'application/json': {
                            schema: z.object({
                                asset: KnowledgeMediaAssetSchema,
                            }),
                        },
                    },
                },
            },
        }),
        async (c) => {
            const token = policy.parseBearerAuthorization(
                c.req.header('Authorization') ?? null,
            );
            const bytes = new Uint8Array(await c.req.arrayBuffer());
            const asset = await service.upload(
                token,
                context(c),
                c.req.valid('param').noteId,
                bytes,
                c.req.header('Content-Type') ?? '',
            );
            return c.json({ asset }, 201);
        },
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/knowledge/notes/{noteId}/media/{assetId}',
            request: {
                params: KnowledgeMediaParamsSchema,
                query: z.object({
                    kind: z.enum(['note', 'workbook']).optional(),
                    locator: z.string().max(200).optional(),
                }),
            },
            responses: {
                ...failures,
                200: {
                    description: 'Authorized audio bytes',
                    content: {
                        'audio/wav': {
                            schema: z.string().openapi({ format: 'binary' }),
                        },
                        'audio/mpeg': {
                            schema: z.string().openapi({ format: 'binary' }),
                        },
                    },
                },
            },
        }),
        async (c) => {
            const { noteId, assetId } = c.req.valid('param'),
                query = c.req.valid('query');
            const token = c.req.header('Authorization')
                ? policy.parseBearerAuthorization(
                      c.req.header('Authorization')!,
                  )
                : undefined;
            const access = query.kind
                ? KnowledgeMediaAccessSchema.parse({
                      kind: query.kind,
                      locator: query.locator,
                      key: c.req.header('X-Languon-Share-Key'),
                  })
                : undefined;
            const audio = await service.read(
                context(c),
                noteId,
                assetId,
                token,
                access,
            );
            c.header('Content-Type', audio.mimeType);
            c.header('Content-Disposition', 'inline');
            c.header('Content-Length', String(audio.bytes.length));
            return c.body(new Uint8Array(audio.bytes), 200);
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/knowledge/notes/{noteId}/media/from-speech',
            request: {
                params: z.object({ noteId: z.uuid() }),
                body: {
                    content: {
                        'application/json': {
                            schema: z.object({ playbackId: z.uuid() }).strict(),
                        },
                    },
                    required: true,
                },
            },
            responses: {
                ...failures,
                201: {
                    description: 'Explicitly applied narration asset',
                    content: {
                        'application/json': {
                            schema: z.object({
                                asset: KnowledgeMediaAssetSchema,
                                sourceText: z.string().max(80000),
                                language: z.string().max(35),
                            }),
                        },
                    },
                },
            },
        }),
        async (c) => {
            const applied = await service.importSpeech(
                policy.parseBearerAuthorization(
                    c.req.header('Authorization') ?? null,
                ),
                context(c),
                c.req.valid('param').noteId,
                c.req.valid('json').playbackId,
            );
            return c.json(applied, 201);
        },
    );
    return app;
}
