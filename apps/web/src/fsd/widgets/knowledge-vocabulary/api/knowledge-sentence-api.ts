import { resolveApiUrl } from '@/fsd/shared/api/api-url';
import {
    KnowledgeVocabularyPracticeParamsSchema,
    WorkbookLearningShareAccessSchema,
    type WorkbookLearningShareAccess,
    LearningEntriesQuerySchema,
    LearningEntriesResponseSchema,
    SentenceCapabilitiesResponseSchema,
    SentencePrepareRequestSchema,
    SentencePrepareResponseSchema,
    SentenceNextRequestSchema,
    SentenceNextResponseSchema,
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
    SentenceErrorResponseSchema,
} from '@languon/contracts';
import type { RequestWithSession } from '@/fsd/entities/dictionary';
import {
    SentenceApiError as ApiError,
    type SentenceApi,
} from '@/fsd/features/sentence-training';

interface Options {
    noteId: string;
    blockId: string;
    access?: WorkbookLearningShareAccess | undefined;
    requestWithSession: RequestWithSession;
    baseUrl?: string;
}
interface Schema<T> {
    parse(value: unknown): T;
}
function pathId(value: string): string {
    if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            value,
        )
    )
        throw new ApiError(400, {
            code: 'invalid_request',
            correlationId: 'client-invalid-id',
            message: 'Invalid identifier.',
        });
    return encodeURIComponent(value);
}
function queryString(query: object): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
        if (value !== undefined) params.set(key, String(value));
    return params.toString();
}

/** Authenticated, no-store access only; references are never prefetched. */
export function createKnowledgeSentenceApi(options: Options): SentenceApi {
    const { requestWithSession } = options;
    const source = KnowledgeVocabularyPracticeParamsSchema.parse({
        noteId: options.noteId,
        blockId: options.blockId,
    });
    const access =
        options.access === undefined
            ? undefined
            : WorkbookLearningShareAccessSchema.parse(options.access);
    const base = resolveApiUrl(
        process.env.NODE_ENV,
        options.baseUrl ?? process.env.NEXT_PUBLIC_API_URL,
    );
    const root = `/knowledge/${encodeURIComponent(source.noteId)}/vocabulary/${encodeURIComponent(source.blockId)}`;
    const prefix = `${root}/sentences`;
    async function request<T>(
        path: string,
        schema: Schema<T>,
        method = 'GET',
        body?: unknown,
    ): Promise<T> {
        const execute = async (token?: string): Promise<T> => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30_000);
            try {
                const response = await fetch(`${base}${path}`, {
                    method,
                    cache: 'no-store',
                    credentials: 'include',
                    signal: controller.signal,
                    headers: {
                        Accept: 'application/json',
                        ...(body === undefined
                            ? {}
                            : { 'Content-Type': 'application/json' }),
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                        ...(access
                            ? {
                                  'X-Languon-Share-Key': access.key,
                                  'X-Languon-Share-Kind': access.kind,
                                  'X-Languon-Share-Locator': access.locator,
                              }
                            : {}),
                    },
                    ...(body === undefined
                        ? {}
                        : { body: JSON.stringify(body) }),
                });
                const payload: unknown = await response
                    .json()
                    .catch(() => undefined);
                if (!response.ok) {
                    const result =
                        SentenceErrorResponseSchema.safeParse(payload);
                    throw new ApiError(
                        response.status,
                        result.success
                            ? result.data.error
                            : {
                                  code: 'service_unavailable',
                                  correlationId: 'invalid-api-response',
                                  message:
                                      'The learning service is unavailable.',
                              },
                    );
                }
                try {
                    return schema.parse(payload);
                } catch {
                    throw new ApiError(502, {
                        code: 'service_unavailable',
                        correlationId: 'invalid-api-response',
                        message: 'The learning response is invalid.',
                    });
                }
            } catch (error) {
                if (error instanceof ApiError) throw error;
                throw new ApiError(0, {
                    code: 'service_unavailable',
                    correlationId: 'client-network',
                    message:
                        'The request could not be confirmed. Retry the same operation.',
                });
            } finally {
                clearTimeout(timeout);
            }
        };
        return requestWithSession(execute);
    }
    return {
        capabilities: () =>
            request(
                `${prefix}/capabilities`,
                SentenceCapabilitiesResponseSchema,
                'GET',
                undefined,
            ),
        listEntries: (input) =>
            request(
                `${root}/learning/entries?${queryString(LearningEntriesQuerySchema.parse(input))}`,
                LearningEntriesResponseSchema,
            ),
        prepare: (input) =>
            request(
                `${prefix}/prepare`,
                SentencePrepareResponseSchema,
                'POST',
                SentencePrepareRequestSchema.parse(input),
            ),
        next: (input) =>
            request(
                `${prefix}/next`,
                SentenceNextResponseSchema,
                'POST',
                SentenceNextRequestSchema.parse(input),
            ),
        getJob: (id) =>
            request(`${prefix}/jobs/${pathId(id)}`, SentenceJobSchema),
        cancelJob: (id) =>
            request(
                `${prefix}/jobs/${pathId(id)}/cancel`,
                SentenceJobSchema,
                'POST',
            ),
        check: (id, input) =>
            request(
                `${prefix}/exercises/${pathId(id)}/checks`,
                SentenceJobSchema,
                'POST',
                SentenceCheckRequestSchema.parse(input),
            ),
        revealReference: (id, input) =>
            request(
                `${prefix}/exercises/${pathId(id)}/reference-answer`,
                SentenceReferenceRevealResponseSchema,
                'POST',
                SentenceReferenceRevealRequestSchema.parse(input),
            ),
        attempts: (input) =>
            request(
                `${prefix}/attempts?${queryString(SentenceAttemptsQuerySchema.parse(input))}`,
                SentenceAttemptsResponseSchema,
            ),
        manualReviews: (input) =>
            request(
                `${prefix}/reviews?${queryString(SentenceManualReviewsQuerySchema.parse(input))}`,
                SentenceManualReviewsResponseSchema,
            ),
        progress: (direction) =>
            request(
                `${prefix}/progress?${queryString(SentenceProgressQuerySchema.parse({ direction }))}`,
                SentenceProgressResponseSchema,
            ),
    };
}
