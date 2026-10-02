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
    DictionaryShareKeyHeadersSchema,
    DictionaryIdParamsSchema,
    SharedDictionaryParamsSchema,
} from '@languon/contracts';
import type { RequestWithSession } from '@/fsd/entities/dictionary';
import { ApiError } from '../lib/api-error';
import type { LearningApi, TrainingTarget } from '../types';

interface Options {
    target: TrainingTarget;
    signedIn: boolean;
    requestWithSession: RequestWithSession;
    baseUrl?: string;
}
interface Schema<T> {
    parse(value: unknown): T;
}

/** Content is held only by the mounted feature, never in shared-key cache/storage. */
export function createLearningApi(options: Options): LearningApi {
    const { target, signedIn, requestWithSession } = options;
    const base = (
        options.baseUrl ??
        process.env.NEXT_PUBLIC_API_URL ??
        (process.env.NODE_ENV === 'production'
            ? '/api'
            : 'http://localhost:4000')
    ).replace(/\/$/, '');
    let prefix: string;
    if (target.kind === 'owner') {
        prefix = `/learning/dictionaries/${encodeURIComponent(target.dictionaryId)}`;
    } else {
        prefix = `/learning/shared-dictionaries/${encodeURIComponent(target.shareId)}`;
    }

    async function request<T>(
        path: string,
        schema: Schema<T>,
        method = 'GET',
        body?: unknown,
        publicRequest = false,
    ): Promise<T> {
        if (!publicRequest) {
            const parametersValid =
                target.kind === 'owner'
                    ? DictionaryIdParamsSchema.safeParse({
                          dictionaryId: target.dictionaryId,
                      }).success
                    : SharedDictionaryParamsSchema.safeParse({
                          shareId: target.shareId,
                      }).success &&
                      DictionaryShareKeyHeadersSchema.safeParse({
                          'x-languon-share-key': target.shareKey,
                      }).success;
            if (!parametersValid)
                throw new ApiError(400, {
                    code: 'invalid_request',
                    correlationId: 'client-invalid-target',
                    message: 'The learning target is invalid.',
                });
        }
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
                        ...(!publicRequest && target.kind === 'shared'
                            ? { 'X-Languon-Share-Key': target.shareKey }
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
        if (!publicRequest && (target.kind === 'owner' || signedIn))
            return requestWithSession(execute);
        return execute();
    }
    return {
        capabilities: () =>
            request(
                '/learning/capabilities',
                LearningCapabilitiesResponseSchema,
                'GET',
                undefined,
                true,
            ),
        getPreferences: () =>
            request(
                `${prefix}/flashcards/preferences`,
                FlashcardPreferencesSchema,
            ),
        putPreferences: (input) =>
            request(
                `${prefix}/flashcards/preferences`,
                FlashcardPreferencesSchema,
                'PUT',
                FlashcardPreferencesPutRequestSchema.parse(input),
            ),
        prepare: (input) =>
            request(
                `${prefix}/flashcards/prepare`,
                FlashcardPrepareResponseSchema,
                'POST',
                FlashcardPrepareRequestSchema.parse(input),
            ),
        getItems: (input) =>
            request(
                `${prefix}/flashcards/items`,
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
            request(
                `${prefix}/flashcards/progress`,
                FlashcardProgressResponseSchema,
            ),
        rate: (input) =>
            request(
                `${prefix}/flashcards/attempts`,
                FlashcardAttemptResponseSchema,
                'POST',
                FlashcardAttemptRequestSchema.parse(input),
            ),
        undo: (attemptId, operationId) => {
            // The attempt identifier is a path component, not a capability.
            const attempt = /^[0-9a-f-]{36}$/i.test(attemptId);
            if (!attempt) throw new Error('Invalid attempt identifier');
            return request(
                `${prefix}/flashcards/attempts/${encodeURIComponent(attemptId)}/undo`,
                FlashcardUndoResponseSchema,
                'POST',
                FlashcardUndoRequestSchema.parse({ operationId }),
            );
        },
    };
}
