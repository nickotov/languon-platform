import { randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import {
    KnowledgeErrorResponseSchema,
    WorkbookIdParamsSchema,
    WorkbookProgressSchema,
    KnowledgeNoteIdParamsSchema,
    RecordWorkbookLearningEventRequestSchema,
    SetWorkbookNoteCompletionRequestSchema,
    SubmitWorkbookAttemptRequestSchema,
    WorkbookAttemptResponseSchema,
    WorkbookLearningEventResponseSchema,
    WorkbookLearningStateSchema,
    WorkbookNoteCompletionResponseSchema,
    type KnowledgeErrorCode,
} from '@languon/contracts';
import type { LearnerService } from '../../application/learner-service';
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

export function createLearnerRoutes({
    service,
    policy,
}: {
    service: LearnerService;
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
    for (const path of [
        '/knowledge/workbooks/:workbookId/progress',
        '/knowledge/:noteId/learning',
        '/knowledge/:noteId/learning/*',
    ]) {
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
            method: 'get',
            path: '/knowledge/workbooks/{workbookId}/progress',
            security,
            request: { params: WorkbookIdParamsSchema, headers },
            responses: { 200: json(WorkbookProgressSchema), ...errors },
        }),
        async (c) =>
            c.json(
                await service.workbookProgress(
                    ...auth(c),
                    c.req.valid('param').workbookId,
                    access(c.req.valid('header')),
                ),
                200,
            ),
    );
    const request = { params: KnowledgeNoteIdParamsSchema, headers };
    app.openapi(
        createRoute({
            method: 'get',
            path: '/knowledge/{noteId}/learning',
            security,
            request,
            responses: { 200: json(WorkbookLearningStateSchema), ...errors },
        }),
        async (c) =>
            c.json(
                await service.read(
                    ...auth(c),
                    c.req.valid('param').noteId,
                    access(c.req.valid('header')),
                ),
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/knowledge/{noteId}/learning/attempts',
            security,
            request: {
                ...request,
                body: body(SubmitWorkbookAttemptRequestSchema),
            },
            responses: { 200: json(WorkbookAttemptResponseSchema), ...errors },
        }),
        async (c) =>
            c.json(
                {
                    attempt: await service.attempt(
                        ...auth(c),
                        c.req.valid('param').noteId,
                        c.req.valid('json'),
                        access(c.req.valid('header')),
                    ),
                },
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/knowledge/{noteId}/learning/events',
            security,
            request: {
                ...request,
                body: body(RecordWorkbookLearningEventRequestSchema),
            },
            responses: {
                200: json(WorkbookLearningEventResponseSchema),
                ...errors,
            },
        }),
        async (c) =>
            c.json(
                {
                    event: await service.event(
                        ...auth(c),
                        c.req.valid('param').noteId,
                        c.req.valid('json'),
                        access(c.req.valid('header')),
                    ),
                },
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/knowledge/{noteId}/learning/completion',
            security,
            request: {
                ...request,
                body: body(SetWorkbookNoteCompletionRequestSchema),
            },
            responses: {
                200: json(WorkbookNoteCompletionResponseSchema),
                ...errors,
            },
        }),
        async (c) =>
            c.json(
                {
                    completion: await service.complete(
                        ...auth(c),
                        c.req.valid('param').noteId,
                        c.req.valid('json'),
                        access(c.req.valid('header')),
                    ),
                },
                200,
            ),
    );
    return app;
}
