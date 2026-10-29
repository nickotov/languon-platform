import { randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
    KnowledgeExerciseEvaluationResponseSchema,
    KnowledgeExerciseEvaluationErrorSchema,
    RequestKnowledgeExerciseEvaluationSchema,
    WorkbookLearningShareAccessSchema,
} from '@languon/contracts';
import {
    actionAllowanceErrorResponse,
    actionAllowanceRequestMiddleware,
} from '../../../ai-credits/infrastructure/action-allowance-consent';
import { TextsAiError } from '../../../texts/application/ports/texts-ai-provider';
import {
    InvalidBearerAuthorizationError,
    InvalidRequestOriginError,
    type AuthHttpPolicy,
} from '../../../authentication/interface/http/auth-http-policy';
import { authenticationRequestMetadata } from '../../../authentication/interface/http/auth-http-request';
import { mapDictionaryHttpError } from '../../../dictionaries/interface/http/dictionary-http-error-mapping';
import { KnowledgeDomainError } from '../../domain/knowledge';
import type { KnowledgeExerciseEvaluationService } from '../../application/exercise-evaluation-service';

const json = (schema: z.ZodType, description = 'Success') => ({
    description,
    content: { 'application/json': { schema } },
});
const error = (code: string, message: string) => ({
    error: { code, message, correlationId: randomUUID() },
});
const failure = json(
    KnowledgeExerciseEvaluationErrorSchema,
    'Request rejected',
);
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
const params = z.object({ noteId: z.uuid() });
const jobParams = params.extend({ jobId: z.uuid() });
const security = [{ bearerAuth: [] as string[] }];

export function createKnowledgeExerciseEvaluationRoutes({
    service,
    policy,
}: {
    service: KnowledgeExerciseEvaluationService;
    policy: AuthHttpPolicy;
}) {
    const app = new OpenAPIHono({
        defaultHook: (result, context) => {
            if (!result.success)
                return context.json(
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
        '/knowledge/:noteId/learning/evaluations',
        '/knowledge/:noteId/learning/evaluations/*',
    ]) {
        app.use(path, async (context, next) => {
            context.header('Cache-Control', 'private, no-store');
            context.header('Referrer-Policy', 'no-referrer');
            context.header('X-Content-Type-Options', 'nosniff');
            const origin = context.req.header('Origin');
            if (origin) {
                policy.assertCookieRequestOrigin(origin);
                context.header('Access-Control-Allow-Origin', origin);
                context.header('Access-Control-Allow-Credentials', 'true');
                context.header('Vary', 'Origin');
            }
            await next();
        });
        app.use(
            path,
            bodyLimit({
                maxSize: 40_000,
                onError: (context) =>
                    context.json(
                        error('invalid_request', 'The request is too large.'),
                        413,
                    ),
            }),
        );
        app.options(path, (context) => {
            const origin = context.req.header('Origin');
            policy.assertCookieRequestOrigin(origin ?? null);
            context.header('Access-Control-Allow-Origin', origin!);
            context.header('Access-Control-Allow-Credentials', 'true');
            context.header(
                'Access-Control-Allow-Methods',
                'GET, POST, OPTIONS',
            );
            context.header(
                'Access-Control-Allow-Headers',
                'Authorization, Content-Type, X-Correlation-ID, X-Languon-Share-Kind, X-Languon-Share-Locator, X-Languon-Share-Key',
            );
            return context.body(null, 204);
        });
        app.use(path, actionAllowanceRequestMiddleware);
    }
    app.onError((caught, context) => {
        const allowance = actionAllowanceErrorResponse(caught, context);
        if (allowance) return allowance;
        if (caught instanceof InvalidBearerAuthorizationError)
            return context.json(
                error('authentication_required', 'Sign in to continue.'),
                401,
            );
        if (caught instanceof InvalidRequestOriginError)
            return context.json(
                error('invalid_origin', 'The request origin is not allowed.'),
                403,
            );
        if (caught instanceof z.ZodError)
            return context.json(
                error('invalid_request', 'The request is invalid.'),
                400,
            );
        if (
            caught instanceof TextsAiError ||
            caught instanceof KnowledgeDomainError
        ) {
            const code = caught.code;
            const status =
                code === 'access_revoked' ||
                code === 'generation_job_not_found' ||
                code === 'knowledge_not_found'
                    ? 404
                    : code === 'idempotency_conflict' ||
                        code === 'version_conflict' ||
                        code === 'source_changed'
                      ? 409
                      : code === 'rate_limited'
                        ? 429
                        : code === 'ai_credits_exhausted'
                          ? 402
                          : code === 'invalid_request' ||
                              code === 'model_capacity_exceeded'
                            ? 400
                            : 503;
            return context.json(
                error(
                    code,
                    code === 'access_revoked'
                        ? 'This material is unavailable.'
                        : 'The AI answer check is unavailable or changed.',
                ),
                status,
            );
        }
        const mapped = mapDictionaryHttpError(caught);
        if (mapped.status === 401)
            return context.json(
                error('authentication_required', 'Sign in to continue.'),
                401,
            );
        if (mapped.status === 402)
            return context.json(
                error(
                    'ai_credits_exhausted',
                    'Not enough credits for this action.',
                ),
                402,
            );
        return context.json(
            error(
                'service_unavailable',
                'The AI answer check is temporarily unavailable.',
            ),
            503,
        );
    });
    const auth = (context: Context) => {
        const metadata = authenticationRequestMetadata(context, policy);
        return [
            policy.parseBearerAuthorization(
                context.req.header('Authorization') ?? null,
            ),
            { signal: metadata.signal, clientAddress: metadata.clientAddress },
        ] as const;
    };
    const shareAccess = (context: Context) => {
        const kind = context.req.header('x-languon-share-kind');
        const locator = context.req.header('x-languon-share-locator');
        const key = context.req.header('x-languon-share-key');
        if (!kind && !locator && !key) return undefined;
        return WorkbookLearningShareAccessSchema.parse({ kind, locator, key });
    };
    const path = '/knowledge/{noteId}/learning/evaluations';
    app.openapi(
        createRoute({
            method: 'post',
            path,
            security,
            request: {
                params,
                body: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: RequestKnowledgeExerciseEvaluationSchema,
                        },
                    },
                },
            },
            responses: {
                202: json(KnowledgeExerciseEvaluationResponseSchema),
                ...errors,
            },
        }),
        async (context) =>
            context.json(
                await service.request(
                    ...auth(context),
                    context.req.valid('param').noteId,
                    context.req.valid('json'),
                    shareAccess(context),
                ),
                202,
            ),
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: `${path}/{jobId}`,
            security,
            request: { params: jobParams },
            responses: {
                200: json(KnowledgeExerciseEvaluationResponseSchema),
                ...errors,
            },
        }),
        async (context) => {
            const input = context.req.valid('param');
            return context.json(
                await service.get(
                    ...auth(context),
                    input.noteId,
                    input.jobId,
                    shareAccess(context),
                ),
                200,
            );
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: `${path}/{jobId}/cancel`,
            security,
            request: { params: jobParams },
            responses: {
                200: json(KnowledgeExerciseEvaluationResponseSchema),
                ...errors,
            },
        }),
        async (context) => {
            const input = context.req.valid('param');
            return context.json(
                await service.cancel(
                    ...auth(context),
                    input.noteId,
                    input.jobId,
                    shareAccess(context),
                ),
                200,
            );
        },
    );
    return app;
}
