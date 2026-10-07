import {
    DictionaryIdParamsSchema,
    DictionaryShareKeyHeadersSchema,
    SharedDictionaryParamsSchema,
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
import type { RequestWithSession, SentenceApi, TrainingTarget } from '../types';
import { ApiError } from '../lib/api-error';
import { createSentencePreparationApi } from './sentence-preparation-api';

interface Options {
    target: TrainingTarget;
    signedIn: boolean;
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
export function createSentenceApi(options: Options): SentenceApi {
    const { target, signedIn, requestWithSession } = options;
    const base = (
        options.baseUrl ??
        process.env.NEXT_PUBLIC_API_URL ??
        (process.env.NODE_ENV === 'production'
            ? '/api'
            : 'http://localhost:4000')
    ).replace(/\/$/, '');
    const root =
        target.kind === 'owner'
            ? `/learning/dictionaries/${encodeURIComponent(target.dictionaryId)}`
            : `/learning/shared-dictionaries/${encodeURIComponent(target.shareId)}`;
    const prefix = `${root}/sentences`;
    async function request<T>(
        path: string,
        schema: Schema<T>,
        method = 'GET',
        body?: unknown,
        publicRequest = false,
    ): Promise<T> {
        if (!publicRequest) {
            const valid =
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
            if (!valid)
                throw new ApiError(400, {
                    code: 'invalid_request',
                    correlationId: 'client-invalid-target',
                    message: 'The learning target is invalid.',
                });
            if (!signedIn)
                throw new ApiError(401, {
                    code: 'authentication_required',
                    correlationId: 'client-sign-in',
                    message: 'Sign in to practise sentences.',
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
        return publicRequest ? execute() : requestWithSession(execute);
    }
    return {
        ...createSentencePreparationApi(request, prefix, pathId),
        capabilities: () =>
            request(
                '/learning/sentences/capabilities',
                SentenceCapabilitiesResponseSchema,
                'GET',
                undefined,
                true,
            ),
        listEntries: (input) =>
            request(
                `${root}/entries?${queryString(LearningEntriesQuerySchema.parse(input))}`,
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
