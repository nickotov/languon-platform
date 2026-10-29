import { randomUUID } from 'node:crypto';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
    KnowledgeVocabularyPracticeParamsSchema,
    WorkbookLearningShareAccessSchema,
    LearningErrorResponseSchema,
    LearningErrorCodeSchema,
    LearningCapabilitiesResponseSchema,
    LearningEntriesQuerySchema,
    LearningEntriesResponseSchema,
    FlashcardPreferencesSchema,
    FlashcardPreferencesPutRequestSchema,
    FlashcardPrepareRequestSchema,
    FlashcardPrepareResponseSchema,
    FlashcardItemsRequestSchema,
    FlashcardItemsResponseSchema,
    FlashcardProgressResponseSchema,
    FlashcardAttemptRequestSchema,
    FlashcardAttemptResponseSchema,
    FlashcardUndoRequestSchema,
    FlashcardUndoResponseSchema,
} from '@languon/contracts';
import type {
    VocabularyPracticeService,
    VocabularyPracticeRequest,
} from '../../application/vocabulary-practice-service';
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
export function createVocabularyPracticeRoutes({
    service,
    policy,
}: {
    service: VocabularyPracticeService;
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
    app.options('/knowledge/:noteId/vocabulary/:blockId/learning/*', (c) => {
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
    app.onError((error, c) => {
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
    const prefix = '/knowledge/{noteId}/vocabulary/{blockId}/learning';
    const register = (
        method: 'get' | 'post' | 'put',
        suffix: string,
        response: z.ZodObject,
        handler: (c: Context) => Promise<unknown>,
        input?: z.ZodObject,
    ) => {
        app.openapi(
            createRoute({
                method,
                path: prefix + suffix,
                request: {
                    params: suffix.includes('{attemptId}')
                        ? KnowledgeVocabularyPracticeParamsSchema.extend({
                              attemptId: z.uuid(),
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
                responses: { 200: json(response), ...errors },
            }),
            async (c) => c.json(response.parse(await handler(c)), 200),
        );
    };
    register('get', '/capabilities', LearningCapabilitiesResponseSchema, (c) =>
        service.capabilities(request(c)),
    );
    register(
        'get',
        '/entries',
        LearningEntriesResponseSchema,
        (c) => service.entries(request(c), c.req.query()),
        LearningEntriesQuerySchema,
    );
    register('get', '/preferences', FlashcardPreferencesSchema, (c) =>
        service.preferences(request(c)),
    );
    register(
        'put',
        '/preferences',
        FlashcardPreferencesSchema,
        async (c) => service.savePreferences(request(c), await c.req.json()),
        FlashcardPreferencesPutRequestSchema,
    );
    register(
        'post',
        '/prepare',
        FlashcardPrepareResponseSchema,
        async (c) => service.prepare(request(c), await c.req.json()),
        FlashcardPrepareRequestSchema,
    );
    register(
        'post',
        '/items',
        FlashcardItemsResponseSchema,
        async (c) => service.items(request(c), await c.req.json()),
        FlashcardItemsRequestSchema,
    );
    register('get', '/progress', FlashcardProgressResponseSchema, (c) =>
        service.progress(request(c)),
    );
    register(
        'post',
        '/attempts',
        FlashcardAttemptResponseSchema,
        async (c) => service.rate(request(c), await c.req.json()),
        FlashcardAttemptRequestSchema,
    );
    register(
        'post',
        '/attempts/{attemptId}/undo',
        FlashcardUndoResponseSchema,
        async (c) =>
            service.undo(
                request(c),
                c.req.param('attemptId') ?? '',
                await c.req.json(),
            ),
        FlashcardUndoRequestSchema,
    );
    return app;
}
