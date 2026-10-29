import { resolveApiUrl } from '@/fsd/shared/api/api-url';
import {
    FlashcardAttemptRequestSchema,
    FlashcardAttemptResponseSchema,
    FlashcardItemsRequestSchema,
    FlashcardItemsResponseSchema,
    FlashcardPreferencesSchema,
    FlashcardPreferencesPutRequestSchema,
    FlashcardPrepareRequestSchema,
    FlashcardPrepareResponseSchema,
    FlashcardProgressResponseSchema,
    FlashcardUndoRequestSchema,
    FlashcardUndoResponseSchema,
    LearningCapabilitiesResponseSchema,
    LearningEntriesQuerySchema,
    LearningEntriesResponseSchema,
    LearningErrorResponseSchema,
    KnowledgeVocabularyPracticeParamsSchema,
    WorkbookLearningShareAccessSchema,
    type WorkbookLearningShareAccess,
} from '@languon/contracts';
import type { RequestWithSession } from '@/fsd/entities/dictionary';
import {
    FlashcardApiError as ApiError,
    type LearningApi,
} from '@/fsd/features/flashcard-training';

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

/** Content is held only by the mounted feature, never in shared-key cache/storage. */
export function createKnowledgeFlashcardApi(options: Options): LearningApi {
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
    const prefix = `/knowledge/${encodeURIComponent(source.noteId)}/vocabulary/${encodeURIComponent(source.blockId)}/learning`;

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
                let payload: unknown;
                try {
                    payload = await response.json();
                } catch {
                    payload = undefined;
                }
                if (!response.ok) {
                    const error =
                        LearningErrorResponseSchema.safeParse(payload);
                    throw new ApiError(
                        response.status,
                        error.success
                            ? error.data.error
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
                    message: 'The request could not be confirmed.',
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
                LearningCapabilitiesResponseSchema,
                'GET',
                undefined,
            ),
        getPreferences: () =>
            request(`${prefix}/preferences`, FlashcardPreferencesSchema),
        putPreferences: (input) =>
            request(
                `${prefix}/preferences`,
                FlashcardPreferencesSchema,
                'PUT',
                FlashcardPreferencesPutRequestSchema.parse(input),
            ),
        prepare: (input) =>
            request(
                `${prefix}/prepare`,
                FlashcardPrepareResponseSchema,
                'POST',
                FlashcardPrepareRequestSchema.parse(input),
            ),
        getItems: (input) =>
            request(
                `${prefix}/items`,
                FlashcardItemsResponseSchema,
                'POST',
                FlashcardItemsRequestSchema.parse(input),
            ),
        listEntries: (input) => {
            const query = LearningEntriesQuerySchema.parse(input);
            const parameters = new URLSearchParams({
                limit: String(query.limit),
            });
            if (query.search) parameters.set('search', query.search);
            if (query.cursor) parameters.set('cursor', query.cursor);
            return request(
                `${prefix}/entries?${parameters}`,
                LearningEntriesResponseSchema,
            );
        },
        getProgress: () =>
            request(`${prefix}/progress`, FlashcardProgressResponseSchema),
        rate: (input) =>
            request(
                `${prefix}/attempts`,
                FlashcardAttemptResponseSchema,
                'POST',
                FlashcardAttemptRequestSchema.parse(input),
            ),
        undo: (attemptId, operationId) => {
            // The attempt identifier is a path component, not a capability.
            const attempt = /^[0-9a-f-]{36}$/i.test(attemptId);
            if (!attempt) throw new Error('Invalid attempt identifier');
            return request(
                `${prefix}/attempts/${encodeURIComponent(attemptId)}/undo`,
                FlashcardUndoResponseSchema,
                'POST',
                FlashcardUndoRequestSchema.parse({ operationId }),
            );
        },
    };
}
