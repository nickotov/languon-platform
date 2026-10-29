import { randomUUID } from 'node:crypto';
import {
    actionAllowanceRequestMiddleware,
    actionAllowanceErrorResponse,
} from '../../../ai-credits/infrastructure/action-allowance-consent';
import {
    SentenceConflictError,
    SentenceUnavailableError,
    SentenceModelUnavailableError,
    SentenceCreditsExhaustedError,
    SentenceCapacityUnavailableError,
} from '../../../learning/domain/sentence-errors';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
    KnowledgeVocabularyPracticeParamsSchema,
    WorkbookLearningShareAccessSchema,
    SentenceErrorResponseSchema as LearningErrorResponseSchema,
    SentenceErrorCodeSchema as LearningErrorCodeSchema,
    SentencePrepareRequestSchema,
    SentencePrepareResponseSchema,
    SentenceNextRequestSchema,
    SentenceNextResponseSchema,
    SentenceCapabilitiesResponseSchema,
    SentenceJobSchema,
    SentenceCheckRequestSchema,
    SentenceReferenceRevealRequestSchema,
    SentenceReferenceRevealResponseSchema,
    SentenceAttemptsQuerySchema,
    SentenceAttemptsResponseSchema,
    SentenceManualReviewsQuerySchema,
    SentenceManualReviewsResponseSchema,
    SentenceProgressQuerySchema,
    SentenceProgressResponseSchema,
} from '@languon/contracts';
import type { KnowledgeSentenceService } from '../../application/knowledge-sentence-free-service';
import type { VocabularyPracticeRequest } from '../../application/vocabulary-practice-service';
import { KnowledgeDomainError } from '../../domain/knowledge';
import {
    LearningConflictError,
    LearningEntryUnavailableError,
    LearningInvalidRequestError,
    LearningUnavailableError,
} from '../../../learning/domain/errors';
import type { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import { authenticationRequestMetadata } from '../../../authentication/interface/http/auth-http-request';
import { mapDictionaryHttpError } from '../../../dictionaries/interface/http/dictionary-http-error-mapping';
const json = (schema: z.ZodType) => ({
    content: { 'application/json': { schema } },
    description: 'Result',
});
const errorResponse = json(LearningErrorResponseSchema);
const errors = {
    402: errorResponse,
    400: errorResponse,
    401: errorResponse,
    403: errorResponse,
    404: errorResponse,
    409: errorResponse,
    413: errorResponse,
    429: errorResponse,
    500: errorResponse,
    503: errorResponse,
};
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
const envelope = (code: string, message: string) => ({
    error: { code, message, correlationId: randomUUID() },
});
export function createKnowledgeSentenceRoutes({
    service,
    policy,
}: {
    service: KnowledgeSentenceService;
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
    app.use('/knowledge/:noteId/vocabulary/:blockId/*', async (c, next) => {
        c.header('Cache-Control', 'private, no-store');
        c.header('Referrer-Policy', 'no-referrer');
        const origin = c.req.header('Origin');
        if (origin) policy.assertCookieRequestOrigin(origin);
        await next();
    });
    app.use(
        '/knowledge/:noteId/vocabulary/:blockId/*',
        bodyLimit({
            maxSize: 64_000,
            onError: (c) =>
                c.json(
                    envelope('invalid_request', 'The request is too large.'),
                    413,
                ),
        }),
    );
    app.options('/knowledge/:noteId/vocabulary/:blockId/sentences/*', (c) => {
        const origin = c.req.header('Origin');
        policy.assertCookieRequestOrigin(origin ?? null);
        c.header('Access-Control-Allow-Origin', origin!);
        c.header('Access-Control-Allow-Credentials', 'true');
        c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
        c.header(
            'Access-Control-Allow-Headers',
            'Authorization, Content-Type, X-Correlation-ID, X-Languon-Share-Key, X-Languon-Share-Kind, X-Languon-Share-Locator',
        );
        c.header('Vary', 'Origin');
        return c.body(null, 204);
    });
    app.use(
        '/knowledge/:noteId/vocabulary/:blockId/sentences/*',
        actionAllowanceRequestMiddleware,
    );
    app.onError((error, c) => {
        const consent = actionAllowanceErrorResponse(error, c);
        if (consent) return consent;
        if (error instanceof SentenceConflictError)
            return c.json(
                envelope(
                    error.reason === 'stale_content'
                        ? 'stale_content'
                        : 'idempotency_conflict',
                    'The learning state changed.',
                ),
                409,
            );
        if (error instanceof SentenceUnavailableError)
            return c.json(
                envelope(
                    'job_not_found',
                    'The practice content is unavailable.',
                ),
                404,
            );
        if (error instanceof SentenceModelUnavailableError)
            return c.json(
                envelope('model_unavailable', 'AI is unavailable.'),
                503,
            );
        if (error instanceof SentenceCreditsExhaustedError)
            return c.json(
                envelope('ai_credits_exhausted', 'Insufficient AI credits.'),
                402,
            );
        if (error instanceof SentenceCapacityUnavailableError)
            return c.json(
                envelope(
                    'capacity_unavailable',
                    'AI is temporarily unavailable.',
                ),
                503,
            );
        if (
            error instanceof z.ZodError ||
            error instanceof LearningInvalidRequestError
        )
            return c.json(
                envelope('invalid_request', 'The request is invalid.'),
                400,
            );
        if (error instanceof LearningEntryUnavailableError)
            return c.json(
                envelope('entry_not_found', 'The entry is unavailable.'),
                404,
            );
        if (error instanceof LearningUnavailableError)
            return c.json(
                envelope('source_not_found', 'The material is unavailable.'),
                404,
            );
        if (error instanceof LearningConflictError) {
            const codes = {
                preferences_conflict: 'version_conflict',
                stale_content: 'learning_version_conflict',
                operation_conflict: 'idempotency_conflict',
                undo_conflict: 'undo_conflict',
            };
            return c.json(
                envelope(
                    codes[error.reason],
                    'The learning state changed. Reload or retry.',
                ),
                409,
            );
        }
        if (error instanceof KnowledgeDomainError) {
            if (error.code === 'knowledge_not_found')
                return c.json(
                    envelope(
                        'source_not_found',
                        'The material is unavailable.',
                    ),
                    404,
                );
            if (error.code === 'version_conflict')
                return c.json(
                    envelope(
                        'learning_version_conflict',
                        'The material changed.',
                    ),
                    409,
                );
            if (error.code === 'rate_limited')
                return c.json(
                    envelope('rate_limited', 'Too many requests.'),
                    429,
                );
        }
        const mapped = mapDictionaryHttpError(error);
        const code = LearningErrorCodeSchema.safeParse(mapped.code);
        return c.json(
            envelope(
                code.success ? code.data : 'internal_error',
                code.success ? mapped.message : 'The request failed.',
            ),
            code.success ? mapped.status : 500,
        );
    });
    const request = (c: Context): VocabularyPracticeRequest => {
        const metadata = authenticationRequestMetadata(c, policy);
        const kind = c.req.header('X-Languon-Share-Kind');
        const locator = c.req.header('X-Languon-Share-Locator');
        const key = c.req.header('X-Languon-Share-Key');
        return {
            token: policy.parseBearerAuthorization(
                c.req.header('Authorization') ?? null,
            ),
            context: {
                signal: metadata.signal,
                clientAddress: metadata.clientAddress,
            },
            noteId: c.req.param('noteId') ?? '',
            blockId: c.req.param('blockId') ?? '',
            access:
                kind || locator || key
                    ? WorkbookLearningShareAccessSchema.parse({
                          kind,
                          locator,
                          key,
                      })
                    : undefined,
        };
    };
    const prefix = '/knowledge/{noteId}/vocabulary/{blockId}/sentences';
    const register = (
        method: 'get' | 'post' | 'put',
        suffix: string,
        response: z.ZodType,
        handler: (c: Context) => Promise<unknown>,
        input?: z.ZodType,
    ) => {
        app.openapi(
            createRoute({
                method,
                path: prefix + suffix,
                request: {
                    params: suffix.includes('{exerciseId}')
                        ? KnowledgeVocabularyPracticeParamsSchema.extend({
                              exerciseId: z.uuid(),
                          })
                        : suffix.includes('{jobId}')
                          ? KnowledgeVocabularyPracticeParamsSchema.extend({
                                jobId: z.uuid(),
                            })
                          : KnowledgeVocabularyPracticeParamsSchema,
                    headers,
                    ...(input
                        ? method === 'get'
                            ? { query: input }
                            : {
                                  body: {
                                      content: {
                                          'application/json': { schema: input },
                                      },
                                      required: true,
                                  },
                              }
                        : {}),
                },
                responses: {
                    200: json(response),
                    202: json(response),
                    ...errors,
                },
            }),
            async (c) => {
                const result = response.parse(await handler(c));
                const accepted =
                    suffix.endsWith('/checks') ||
                    (suffix === '/next' &&
                        typeof result === 'object' &&
                        result !== null &&
                        'kind' in result &&
                        result.kind === 'job');
                return c.json(result, accepted ? 202 : 200);
            },
        );
    };
    register('get', '/capabilities', SentenceCapabilitiesResponseSchema, (c) =>
        service.capabilities(request(c)),
    );
    register(
        'post',
        '/prepare',
        SentencePrepareResponseSchema,
        async (c) => service.prepare(request(c), await c.req.json()),
        SentencePrepareRequestSchema,
    );
    register(
        'post',
        '/next',
        SentenceNextResponseSchema,
        async (c) => service.next(request(c), await c.req.json()),
        SentenceNextRequestSchema,
    );
    register('get', '/jobs/{jobId}', SentenceJobSchema, (c) =>
        service.getJob(request(c), c.req.param('jobId') ?? ''),
    );
    register('post', '/jobs/{jobId}/cancel', SentenceJobSchema, (c) =>
        service.cancelJob(request(c), c.req.param('jobId') ?? ''),
    );
    register(
        'post',
        '/exercises/{exerciseId}/checks',
        SentenceJobSchema,
        async (c) =>
            service.enqueueCheck(
                request(c),
                c.req.param('exerciseId') ?? '',
                await c.req.json(),
            ),
        SentenceCheckRequestSchema,
    );
    register(
        'post',
        '/exercises/{exerciseId}/reference-answer',
        SentenceReferenceRevealResponseSchema,
        async (c) =>
            service.revealReference(
                request(c),
                c.req.param('exerciseId') ?? '',
                await c.req.json(),
            ),
        SentenceReferenceRevealRequestSchema,
    );
    register(
        'get',
        '/attempts',
        SentenceAttemptsResponseSchema,
        (c) => service.attempts(request(c), c.req.query()),
        SentenceAttemptsQuerySchema,
    );
    register(
        'get',
        '/reviews',
        SentenceManualReviewsResponseSchema,
        (c) => service.manualReviews(request(c), c.req.query()),
        SentenceManualReviewsQuerySchema,
    );
    register(
        'get',
        '/progress',
        SentenceProgressResponseSchema,
        (c) => service.progress(request(c), c.req.query()),
        SentenceProgressQuerySchema,
    );
    return app;
}
