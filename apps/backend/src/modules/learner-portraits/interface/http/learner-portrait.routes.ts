import { InterviewAccountingError } from '../../infrastructure/interview-accounting';
import { PortraitInterviewResourceLimitError } from '../../application/ports/interview-store';
import { authenticationRequestMetadata } from '../../../authentication/interface/http/auth-http-request';
import { randomUUID } from 'node:crypto';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
    ApprovePortraitRequestSchema,
    DeletePortraitRequestSchema,
    DiscardPortraitInterviewRequestSchema,
    PortraitInterviewerOutputSchema,
    PortraitOperationParamsSchema,
    PortraitStateSchema,
    SavePortraitDraftRequestSchema,
    SetPortraitUseRequestSchema,
    StartPortraitInterviewSchema,
    SetPortraitInterviewLocaleSchema,
    SubmitPortraitInterviewSchema,
    PortraitInterviewOperationResponseSchema,
    PortraitInterviewActiveOperationSchema,
    PortraitInterviewCompletedOperationSchema,
    PortraitInterviewStatusResponseSchema,
} from '@languon/contracts';
import type { PortraitService } from '../../application/portrait-service';
import type { InterviewService } from '../../application/interview-service';
import {
    PortraitConflictError,
    PortraitDraftUnavailableError,
    PortraitNotMeaningfulError,
    PortraitSensitiveContentError,
    PortraitUserUnavailableError,
} from '../../application/ports/portrait-store';
import {
    InvalidBearerAuthorizationError,
    InvalidRequestOriginError,
    type AuthHttpPolicy,
} from '../../../authentication/interface/http/auth-http-policy';
import type { RateLimiter } from '../../../authentication/application/ports/rate-limiter';
import { mapDictionaryHttpError } from '../../../dictionaries/interface/http/dictionary-http-error-mapping';

const json = (schema: z.ZodType, description = 'Success') => ({
    content: { 'application/json': { schema } },
    description,
});
const body = (schema: z.ZodType) => ({
    content: { 'application/json': { schema } },
    required: true,
});
const error = json(
    z.object({
        error: z.object({
            code: z.string(),
            message: z.string(),
            correlationId: z.uuid(),
        }),
    }),
    'Request failed',
);
const errors = {
    400: error,
    401: error,
    403: error,
    404: error,
    409: error,
    413: error,
    422: error,
    429: error,
    500: error,
    503: error,
};
const security = [{ bearerAuth: [] as string[] }];
const envelope = (code: string, message: string) => ({
    error: { code, message, correlationId: randomUUID() },
});
export function createLearnerPortraitRoutes(deps: {
    portraits: PortraitService;
    interviews: InterviewService;
    authenticate(token: string): Promise<{ userId: string }>;
    rateLimiter: RateLimiter;
    policy: AuthHttpPolicy;
    creditsBypass: boolean;
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
    });
    for (const path of ['/learner-portrait', '/learner-portrait/*']) {
        app.use(path, async (c, next) => {
            c.header('Cache-Control', 'private, no-store');
            c.header('X-Content-Type-Options', 'nosniff');
            c.header('Referrer-Policy', 'no-referrer');
            const origin = c.req.header('Origin');
            if (origin) {
                deps.policy.assertCookieRequestOrigin(origin);
                c.header('Access-Control-Allow-Origin', origin);
                c.header('Access-Control-Allow-Credentials', 'true');
                c.header('Vary', 'Origin');
            }
            await next();
        });
        app.use(
            path,
            bodyLimit({
                maxSize: 100_000,
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
        app.options(path, (c) => {
            const origin = c.req.header('Origin') ?? null;
            deps.policy.assertCookieRequestOrigin(origin);
            c.header('Access-Control-Allow-Origin', origin!);
            c.header('Access-Control-Allow-Credentials', 'true');
            c.header(
                'Access-Control-Allow-Methods',
                'GET,POST,PATCH,DELETE,OPTIONS',
            );
            c.header(
                'Access-Control-Allow-Headers',
                'Authorization,Content-Type',
            );
            return c.body(null, 204);
        });
    }
    app.onError((cause, c) => {
        if (cause instanceof PortraitInterviewResourceLimitError)
            return c.json(
                envelope(
                    'resource_limit',
                    'This interview has reached its size limit. Review your draft or start a new interview.',
                ),
                422,
            );
        if (
            cause instanceof InvalidBearerAuthorizationError ||
            cause instanceof PortraitUserUnavailableError
        )
            return c.json(
                envelope('authentication_required', 'Sign in to continue.'),
                401,
            );
        if (cause instanceof InvalidRequestOriginError)
            return c.json(
                envelope(
                    'invalid_origin',
                    'The request origin is not allowed.',
                ),
                403,
            );
        if (cause instanceof PortraitConflictError)
            return c.json(
                envelope(
                    'version_conflict',
                    'Your portrait changed. Review the latest version.',
                ),
                409,
            );
        if (cause instanceof PortraitDraftUnavailableError)
            return c.json(
                envelope(
                    'draft_unavailable',
                    'This interview or draft is unavailable or expired.',
                ),
                404,
            );
        if (cause instanceof PortraitSensitiveContentError)
            return c.json(
                envelope(
                    'invalid_request',
                    'Describe what helps you learn or a concrete learning preference. Remove diagnostic labels and diagnosis statements.',
                ),
                400,
            );
        if (
            cause instanceof PortraitNotMeaningfulError ||
            cause instanceof z.ZodError
        )
            return c.json(
                envelope('invalid_request', 'Review your portrait answers.'),
                400,
            );
        if (cause instanceof InterviewAccountingError)
            return c.json(
                envelope(cause.code, cause.message),
                cause.code === 'model_unavailable' ||
                    cause.code === 'capacity_unavailable'
                    ? 503
                    : cause.code === 'billing_notice_required'
                      ? 409
                      : 400,
            );
        const mapped = mapDictionaryHttpError(cause);
        if (mapped.status === 401)
            return c.json(
                envelope('authentication_required', 'Sign in to continue.'),
                401,
            );
        if (mapped.status === 503)
            return c.json(
                envelope(
                    'service_unavailable',
                    'The service is temporarily unavailable.',
                ),
                503,
            );
        if (cause instanceof Error && cause.message === 'portrait_rate_limited')
            return c.json(
                envelope(
                    'rate_limited',
                    'Too many requests. Try again shortly.',
                ),
                429,
            );
        return c.json(
            envelope('internal_error', 'The request could not be completed.'),
            500,
        );
    });
    const owner = async (c: Context) => {
        const { signal, clientAddress } = authenticationRequestMetadata(
            c,
            deps.policy,
        );
        signal.throwIfAborted();
        const addressDecision = await deps.rateLimiter.consume({
            scope: 'learner-portrait-address',
            subject: clientAddress,
            limit: 180,
            windowMs: 60_000,
            signal,
        });
        if (!addressDecision.allowed) throw new Error('portrait_rate_limited');
        const token = deps.policy.parseBearerAuthorization(
            c.req.header('Authorization') ?? null,
        );
        const principal = await deps.authenticate(token);
        const decision = await deps.rateLimiter.consume({
            scope: 'learner-portrait-http',
            subject: principal.userId,
            limit: 120,
            windowMs: 60_000,
            signal,
        });
        if (!decision.allowed) throw new Error('portrait_rate_limited');
        return principal.userId;
    };
    app.openapi(
        createRoute({
            method: 'get',
            path: '/learner-portrait',
            security,
            responses: { 200: json(PortraitStateSchema), ...errors },
        }),
        async (c) => c.json(await deps.portraits.get(await owner(c)), 200),
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/learner-portrait/interview/status',
            security,
            responses: {
                200: json(PortraitInterviewStatusResponseSchema),
                ...errors,
            },
        }),
        async (c) =>
            c.json(
                {
                    interview: await deps.interviews.status(await owner(c)),
                    creditsBypass: deps.creditsBypass,
                },
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'patch',
            path: '/learner-portrait/draft',
            security,
            request: { body: body(SavePortraitDraftRequestSchema) },
            responses: { 200: json(PortraitStateSchema), ...errors },
        }),
        async (c) =>
            c.json(
                await deps.portraits.saveDraft(
                    await owner(c),
                    SavePortraitDraftRequestSchema.parse(c.req.valid('json')),
                ),
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/learner-portrait/approve',
            security,
            request: { body: body(ApprovePortraitRequestSchema) },
            responses: { 200: json(PortraitStateSchema), ...errors },
        }),
        async (c) =>
            c.json(
                await deps.portraits.approve(
                    await owner(c),
                    ApprovePortraitRequestSchema.parse(c.req.valid('json')),
                ),
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'patch',
            path: '/learner-portrait/use',
            security,
            request: { body: body(SetPortraitUseRequestSchema) },
            responses: { 200: json(PortraitStateSchema), ...errors },
        }),
        async (c) =>
            c.json(
                await deps.portraits.setUse(
                    await owner(c),
                    SetPortraitUseRequestSchema.parse(c.req.valid('json')),
                ),
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'delete',
            path: '/learner-portrait',
            security,
            request: { body: body(DeletePortraitRequestSchema) },
            responses: { 200: json(PortraitStateSchema), ...errors },
        }),
        async (c) =>
            c.json(
                await deps.portraits.delete(
                    await owner(c),
                    DeletePortraitRequestSchema.parse(c.req.valid('json')),
                ),
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/learner-portrait/interview',
            security,
            request: { body: body(StartPortraitInterviewSchema) },
            responses: {
                200: json(
                    z.object({
                        interviewId: z.uuid(),
                        expiresAt: z.iso.datetime(),
                        context: z.unknown(),
                        initialQuestion: PortraitInterviewerOutputSchema,
                        activeOperation:
                            PortraitInterviewActiveOperationSchema.optional(),
                        latestCompletedOperation:
                            PortraitInterviewCompletedOperationSchema.optional(),
                        creditsBypass: z.boolean(),
                    }),
                ),
                ...errors,
            },
        }),
        async (c) =>
            c.json(
                {
                    ...(await deps.interviews.start(
                        await owner(c),
                        StartPortraitInterviewSchema.parse(c.req.valid('json')),
                    )),
                    creditsBypass: deps.creditsBypass,
                },
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/learner-portrait/interview/discard',
            security,
            request: { body: body(DiscardPortraitInterviewRequestSchema) },
            responses: { 200: json(PortraitStateSchema), ...errors },
        }),
        async (c) =>
            c.json(
                await deps.portraits.discardInterview(
                    await owner(c),
                    DiscardPortraitInterviewRequestSchema.parse(
                        c.req.valid('json'),
                    ),
                ),
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/learner-portrait/interview/responses',
            security,
            request: { body: body(SubmitPortraitInterviewSchema) },
            responses: {
                202: json(PortraitInterviewOperationResponseSchema),
                ...errors,
            },
        }),
        async (c) =>
            c.json(
                await deps.interviews.submit(
                    await owner(c),
                    SubmitPortraitInterviewSchema.parse(c.req.valid('json')),
                ),
                202,
            ),
    );
    app.openapi(
        createRoute({
            method: 'patch',
            path: '/learner-portrait/interview/locale',
            security,
            request: { body: body(SetPortraitInterviewLocaleSchema) },
            responses: {
                200: json(
                    z.object({
                        interviewId: z.uuid(),
                        expiresAt: z.iso.datetime(),
                        context: z.unknown(),
                    }),
                ),
                ...errors,
            },
        }),
        async (c) =>
            c.json(
                await deps.interviews.setLocale(
                    await owner(c),
                    SetPortraitInterviewLocaleSchema.parse(c.req.valid('json')),
                ),
                200,
            ),
    );
    for (const action of ['read', 'stop'] as const) {
        app.openapi(
            createRoute({
                method: action === 'read' ? 'get' : 'post',
                path: `/learner-portrait/interview/responses/{operationId}${action === 'stop' ? '/stop' : ''}`,
                security,
                request: { params: PortraitOperationParamsSchema },
                responses: {
                    200: json(PortraitInterviewOperationResponseSchema),
                    ...errors,
                },
            }),
            async (c) => {
                const id = c.req.valid('param').operationId;
                const result =
                    action === 'read'
                        ? await deps.interviews.read(await owner(c), id)
                        : await deps.interviews.stop(await owner(c), id);
                return result
                    ? c.json(result, 200)
                    : c.json(
                          envelope('not_found', 'Response unavailable.'),
                          404,
                      );
            },
        );
    }
    return app;
}
