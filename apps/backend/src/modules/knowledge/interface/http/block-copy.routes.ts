import { randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import {
    CopyKnowledgeBlocksRequestSchema,
    CopyKnowledgeBlocksResponseSchema,
    KnowledgeErrorResponseSchema,
    type KnowledgeErrorCode,
} from '@languon/contracts';
import type { KnowledgeBlockCopyService } from '../../application/block-copy-service';
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
    description: 'Copy failed',
    content: { 'application/json': { schema: KnowledgeErrorResponseSchema } },
};
export function createKnowledgeBlockCopyRoutes({
    service,
    policy,
}: {
    service: KnowledgeBlockCopyService;
    policy: AuthHttpPolicy;
}) {
    const app = new OpenAPIHono({
        defaultHook: (result, c) => {
            if (!result.success)
                return c.json(
                    error('invalid_request', 'The copy request is invalid.'),
                    400,
                );
        },
    });
    app.use(
        '/knowledge/notes/*/blocks/copy',
        bodyLimit({
            maxSize: 32000,
            onError: (c) =>
                c.json(
                    error('invalid_request', 'The request is too large.'),
                    413,
                ),
        }),
    );
    app.use('/knowledge/notes/*/blocks/copy', async (c, next) => {
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
            c.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
            c.header(
                'Access-Control-Allow-Headers',
                'Authorization, Content-Type',
            );
            return c.body(null, 204);
        }
        await next();
    });
    app.onError((caught, c) => {
        if (caught instanceof InvalidBearerAuthorizationError)
            return c.json(
                error('authentication_required', 'Sign in to copy blocks.'),
                401,
            );
        if (caught instanceof InvalidRequestOriginError)
            return c.json(
                error('invalid_origin', 'The request origin is not allowed.'),
                403,
            );
        if (caught instanceof KnowledgeDomainError) {
            let status: 400 | 404 | 409 | 429 = 400;
            if (caught.code === 'knowledge_not_found') status = 404;
            if (
                ['version_conflict', 'idempotency_conflict'].includes(
                    caught.code,
                )
            )
                status = 409;
            if (caught.code === 'rate_limited') status = 429;
            return c.json(error(caught.code, caught.message), status);
        }
        if (caught instanceof z.ZodError)
            return c.json(
                error(
                    'invalid_request',
                    'The copied blocks do not fit this note.',
                ),
                400,
            );
        const mapped = mapDictionaryHttpError(caught);
        if (mapped.status === 401)
            return c.json(
                error('authentication_required', 'Sign in to copy blocks.'),
                401,
            );
        return c.json(
            error(
                'service_unavailable',
                'The blocks could not be copied. Try again.',
            ),
            503,
        );
    });
    app.openapi(
        createRoute({
            method: 'post',
            path: '/knowledge/notes/{noteId}/blocks/copy',
            request: {
                params: z.object({ noteId: z.uuid() }),
                body: {
                    content: {
                        'application/json': {
                            schema: CopyKnowledgeBlocksRequestSchema,
                        },
                    },
                    required: true,
                },
            },
            responses: {
                200: {
                    description:
                        'Preview or copied working draft; Save remains explicit',
                    content: {
                        'application/json': {
                            schema: CopyKnowledgeBlocksResponseSchema,
                        },
                    },
                },
                400: failed,
                401: failed,
                403: failed,
                404: failed,
                409: failed,
                413: failed,
                429: failed,
                503: failed,
            },
        }),
        async (c) => {
            const metadata = authenticationRequestMetadata(c, policy);
            const result = await service.copy(
                policy.parseBearerAuthorization(
                    c.req.header('Authorization') ?? null,
                ),
                {
                    signal: metadata.signal,
                    clientAddress: metadata.clientAddress,
                },
                c.req.valid('param').noteId,
                c.req.valid('json'),
            );
            return c.json(result, 200);
        },
    );
    return app;
}
