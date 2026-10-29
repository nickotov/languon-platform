import { randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import type { Context } from 'hono';
import {
    KnowledgeTranscriptionJobResponseSchema,
    SubmitKnowledgeTranscriptionRequestSchema,
} from '@languon/contracts';
import type { KnowledgeTranscriptionJobService } from '../../application/transcription-job-service';
import { KnowledgeDomainError } from '../../domain/knowledge';
import { AiCreditInsufficientBalanceError } from '../../../ai-credits/domain/ai-credit';
import { OperatorBudgetUnavailableError } from '../../../ai-credits/infrastructure/persistence/drizzle/drizzle-operator-budget-participant';
import {
    InvalidBearerAuthorizationError,
    InvalidRequestOriginError,
    type AuthHttpPolicy,
} from '../../../authentication/interface/http/auth-http-policy';
import { authenticationRequestMetadata } from '../../../authentication/interface/http/auth-http-request';
import { mapDictionaryHttpError } from '../../../dictionaries/interface/http/dictionary-http-error-mapping';
const json = (schema: z.ZodType, description = 'Success') => ({
    description,
    content: { 'application/json': { schema } },
});
const errorSchema = z.object({
    error: z.object({
        code: z.string(),
        message: z.string(),
        correlationId: z.uuid(),
    }),
});
const failure = json(errorSchema, 'Request rejected');
const errors = {
    400: failure,
    401: failure,
    402: failure,
    403: failure,
    404: failure,
    409: failure,
    413: failure,
    429: failure,
    500: failure,
    503: failure,
};
const error = (code: string, message: string) => ({
    error: { code, message, correlationId: randomUUID() },
});
const security = [{ bearerAuth: [] as string[] }];
const note = z.object({ noteId: z.uuid() });
const operation = note.extend({ operationId: z.uuid() });
export function createKnowledgeTranscriptionJobRoutes({
    service,
    policy,
}: {
    service: KnowledgeTranscriptionJobService;
    policy: AuthHttpPolicy;
}) {
    const app = new OpenAPIHono({
        defaultHook: (result, c) => {
            if (!result.success)
                return c.json(
                    error('invalid_request', 'The request is invalid.'),
                    400,
                );
        },
    });
    app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
        type: 'http',
        scheme: 'bearer',
    });
    for (const path of [
        '/knowledge/:noteId/transcriptions',
        '/knowledge/:noteId/transcriptions/*',
    ]) {
        app.use(path, async (c, next) => {
            c.header('Cache-Control', 'private, no-store');
            c.header('Referrer-Policy', 'no-referrer');
            c.header('X-Content-Type-Options', 'nosniff');
            const origin = c.req.header('Origin');
            if (origin) {
                policy.assertCookieRequestOrigin(origin);
                c.header('Access-Control-Allow-Origin', origin);
                c.header('Access-Control-Allow-Credentials', 'true');
                c.header('Vary', 'Origin');
            }
            await next();
        });
        app.use(
            path,
            bodyLimit({
                maxSize: 16_000,
                onError: (c) =>
                    c.json(
                        error('invalid_request', 'The request is too large.'),
                        413,
                    ),
            }),
        );
        app.options(path, (c) => {
            const origin = c.req.header('Origin');
            policy.assertCookieRequestOrigin(origin ?? null);
            c.header('Access-Control-Allow-Origin', origin!);
            c.header('Access-Control-Allow-Credentials', 'true');
            c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            c.header(
                'Access-Control-Allow-Headers',
                'Authorization, Content-Type, X-Correlation-ID',
            );
            return c.body(null, 204);
        });
    }
    app.onError((caught, c) => {
        let code = 'internal_error';
        let message = 'The transcription request could not be completed.';
        let status: 400 | 401 | 402 | 403 | 404 | 409 | 429 | 500 | 503 = 500;
        if (caught instanceof KnowledgeDomainError) {
            code = caught.code;
            message = caught.message;
            if (code === 'knowledge_not_found') status = 404;
            else if (
                code === 'version_conflict' ||
                code === 'idempotency_conflict'
            )
                status = 409;
            else if (code === 'service_unavailable') status = 503;
            else if (code === 'rate_limited') status = 429;
            else status = 400;
        } else if (caught instanceof AiCreditInsufficientBalanceError) {
            code = 'insufficient_credits';
            message = 'There are not enough credits for this transcription.';
            status = 402;
        } else if (caught instanceof OperatorBudgetUnavailableError) {
            code = 'service_unavailable';
            message = 'Transcription is temporarily unavailable.';
            status = 503;
        } else if (caught instanceof InvalidBearerAuthorizationError) {
            code = 'authentication_required';
            message = 'Sign in to continue.';
            status = 401;
        } else if (caught instanceof InvalidRequestOriginError) {
            code = 'invalid_origin';
            message = 'The request origin is not allowed.';
            status = 403;
        } else if (caught instanceof z.ZodError) {
            code = 'invalid_request';
            message = 'The request is invalid.';
            status = 400;
        } else {
            const mapped = mapDictionaryHttpError(caught);
            if (mapped.status === 401) {
                code = 'authentication_required';
                message = 'Sign in to continue.';
                status = 401;
            } else if (mapped.status === 503) {
                code = 'service_unavailable';
                message = 'Transcription is temporarily unavailable.';
                status = 503;
            }
        }
        return c.json(error(code, message), status);
    });
    const auth = (c: Context) => {
        const metadata = authenticationRequestMetadata(c, policy);
        return [
            policy.parseBearerAuthorization(
                c.req.header('Authorization') ?? null,
            ),
            { signal: metadata.signal, clientAddress: metadata.clientAddress },
        ] as const;
    };
    app.openapi(
        createRoute({
            method: 'post',
            path: '/knowledge/{noteId}/transcriptions',
            security,
            request: {
                params: note,
                body: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: SubmitKnowledgeTranscriptionRequestSchema,
                        },
                    },
                },
            },
            responses: {
                200: json(KnowledgeTranscriptionJobResponseSchema),
                ...errors,
            },
        }),
        async (c) =>
            c.json(
                {
                    job: await service.submit(
                        ...auth(c),
                        c.req.valid('param').noteId,
                        c.req.valid('json'),
                    ),
                },
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/knowledge/{noteId}/transcriptions/{operationId}',
            security,
            request: { params: operation },
            responses: {
                200: json(KnowledgeTranscriptionJobResponseSchema),
                ...errors,
            },
        }),
        async (c) => {
            const params = c.req.valid('param');
            return c.json(
                {
                    job: await service.read(
                        ...auth(c),
                        params.noteId,
                        params.operationId,
                    ),
                },
                200,
            );
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/knowledge/{noteId}/transcriptions/{operationId}/cancel',
            security,
            request: { params: operation },
            responses: {
                200: json(KnowledgeTranscriptionJobResponseSchema),
                ...errors,
            },
        }),
        async (c) => {
            const params = c.req.valid('param');
            return c.json(
                {
                    job: await service.cancel(
                        ...auth(c),
                        params.noteId,
                        params.operationId,
                    ),
                },
                200,
            );
        },
    );
    return app;
}
