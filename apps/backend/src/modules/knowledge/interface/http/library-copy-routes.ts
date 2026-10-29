import { randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import {
    KnowledgeErrorResponseSchema,
    CopyKnowledgeVocabularyRequestSchema,
    CopyKnowledgeTextRequestSchema,
    CopyKnowledgeVocabularyResponseSchema,
    CopyKnowledgeTextResponseSchema,
    KnowledgeVocabularyPreviewSchema,
    KnowledgeTextLibraryPreviewSchema,
    type KnowledgeErrorCode,
} from '@languon/contracts';
import type { KnowledgeLibraryCopyService } from '../../application/library-copy-service';
import { TextDomainError } from '../../../texts/domain/text';
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
const envelope = (code: KnowledgeErrorCode, message: string) => ({
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
const headers = z.object({
    'x-languon-share-kind': z.enum(['note', 'workbook']).optional(),
    'x-languon-share-locator': z
        .string()
        .regex(/^[A-Za-z0-9_-]{32}$/u)
        .optional(),
    'x-languon-share-key': z
        .string()
        .regex(/^[A-Za-z0-9_-]{43}$/u)
        .optional(),
});

export function createKnowledgeLibraryCopyRoutes({
    service,
    policy,
}: {
    service: KnowledgeLibraryCopyService;
    policy: AuthHttpPolicy;
}) {
    const app = new OpenAPIHono({
        defaultHook: (result, c) => {
            if (!result.success)
                return c.json(
                    envelope('invalid_request', 'The request is invalid.'),
                    400,
                );
        },
    });
    app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
    });
    for (const path of ['/knowledge/library/*']) {
        app.use(path, async (c, next) => {
            c.header('Cache-Control', 'private, no-store');
            c.header('Referrer-Policy', 'no-referrer');
            c.header('X-Content-Type-Options', 'nosniff');
            const origin = c.req.header('Origin');
            if (origin) policy.assertCookieRequestOrigin(origin);
            await next();
        });
        app.use(
            path,
            bodyLimit({
                maxSize: 64_000,
                onError: (c) =>
                    c.json(
                        envelope(
                            'invalid_request',
                            'The request body is too large.',
                        ),
                        413,
                    ),
            }),
        );
    }
    app.onError((error, c) => {
        let code: KnowledgeErrorCode = 'internal_error';
        let message = 'The request could not be completed.';
        let status: 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503 = 500;
        if (error instanceof KnowledgeDomainError) {
            code = error.code;
            message = error.message;
            if (code === 'knowledge_not_found') status = 404;
            else if (
                code === 'version_conflict' ||
                code === 'idempotency_conflict'
            )
                status = 409;
            else if (code === 'rate_limited') status = 429;
            else status = 400;
        } else if (error instanceof TextDomainError) {
            code =
                error.code === 'version_conflict' ||
                error.code === 'idempotency_conflict'
                    ? error.code
                    : 'invalid_request';
            message = error.message;
            status =
                code === 'version_conflict' || code === 'idempotency_conflict'
                    ? 409
                    : 400;
        } else if (error instanceof InvalidBearerAuthorizationError) {
            code = 'authentication_required';
            message = 'Sign in to continue.';
            status = 401;
        } else if (error instanceof InvalidRequestOriginError) {
            code = 'invalid_origin';
            message = 'The request origin is not allowed.';
            status = 403;
        } else if (error instanceof z.ZodError) {
            code = 'invalid_request';
            message = 'The request is invalid.';
            status = 400;
        } else {
            const mapped = mapDictionaryHttpError(error);
            if (mapped.status === 401) {
                code = 'authentication_required';
                message = 'Sign in to continue.';
                status = 401;
            } else if (
                mapped.status === 400 ||
                mapped.status === 409 ||
                mapped.status === 404 ||
                mapped.status === 429
            ) {
                status = mapped.status;
                code =
                    mapped.status === 409
                        ? 'version_conflict'
                        : mapped.status === 404
                          ? 'knowledge_not_found'
                          : mapped.status === 429
                            ? 'rate_limited'
                            : 'invalid_request';
                message =
                    'The destination or request is unavailable. Preview again.';
            } else if (mapped.status === 503) {
                code = 'service_unavailable';
                message = 'The service is temporarily unavailable.';
                status = 503;
            }
        }
        return c.json(envelope(code, message), status);
    });
    const auth = (c: Parameters<typeof authenticationRequestMetadata>[0]) => {
        const metadata = authenticationRequestMetadata(c, policy);
        return [
            policy.parseBearerAuthorization(
                c.req.header('Authorization') ?? null,
            ),
            { signal: metadata.signal, clientAddress: metadata.clientAddress },
        ] as const;
    };
    const access = (input: z.infer<typeof headers>) => {
        if (
            !input['x-languon-share-kind'] &&
            !input['x-languon-share-locator'] &&
            !input['x-languon-share-key']
        )
            return undefined;
        return {
            kind: input['x-languon-share-kind'],
            locator: input['x-languon-share-locator'],
            key: input['x-languon-share-key'],
        };
    };
    app.openapi(
        createRoute({
            method: 'post',
            path: '/knowledge/library/vocabulary/preview',
            security,
            request: {
                headers,
                body: body(CopyKnowledgeVocabularyRequestSchema),
            },
            responses: {
                200: json(KnowledgeVocabularyPreviewSchema),
                ...errors,
            },
        }),
        async (c) => {
            const [token, context] = auth(c);
            const result = await service.vocabulary(
                token,
                context,
                c.req.valid('json'),
                true,
                access(c.req.valid('header')),
            );
            return c.json(KnowledgeVocabularyPreviewSchema.parse(result), 200);
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/knowledge/library/vocabulary/copy',
            security,
            request: {
                headers,
                body: body(CopyKnowledgeVocabularyRequestSchema),
            },
            responses: {
                200: json(CopyKnowledgeVocabularyResponseSchema),
                ...errors,
            },
        }),
        async (c) => {
            const [token, context] = auth(c);
            const result = await service.vocabulary(
                token,
                context,
                c.req.valid('json'),
                false,
                access(c.req.valid('header')),
            );
            return c.json(
                CopyKnowledgeVocabularyResponseSchema.parse(result),
                200,
            );
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/knowledge/library/text/preview',
            security,
            request: { headers, body: body(CopyKnowledgeTextRequestSchema) },
            responses: {
                200: json(KnowledgeTextLibraryPreviewSchema),
                ...errors,
            },
        }),
        async (c) => {
            const [token, context] = auth(c);
            const result = await service.text(
                token,
                context,
                c.req.valid('json'),
                true,
                access(c.req.valid('header')),
            );
            return c.json(KnowledgeTextLibraryPreviewSchema.parse(result), 200);
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/knowledge/library/text/copy',
            security,
            request: { headers, body: body(CopyKnowledgeTextRequestSchema) },
            responses: {
                200: json(CopyKnowledgeTextResponseSchema),
                ...errors,
            },
        }),
        async (c) => {
            const [token, context] = auth(c);
            const result = await service.text(
                token,
                context,
                c.req.valid('json'),
                false,
                access(c.req.valid('header')),
            );
            return c.json(
                CopyKnowledgeTextResponseSchema.parse({ text: result }),
                200,
            );
        },
    );
    return app;
}
