import * as c from '@languon/contracts';
import { id, request } from './transport';
export const jobsApi = {
    getPendingAiJob: (
        accessToken: string,
        textId: string,
        signal?: AbortSignal,
    ) =>
        request(
            `/texts/${id(textId)}/pending-job`,
            c.TextPendingJobResponseSchema,
            { accessToken, signal },
        ),
    detectLanguage: (
        accessToken: string,
        body: c.EnqueueTextDetectionRequest,
        signal?: AbortSignal,
    ) =>
        request(
            '/texts/ai/detection',
            c.TextAiJobResponseSchema,
            { accessToken, signal },
            'POST',
            c.EnqueueTextDetectionRequestSchema.parse(body),
        ),
    translateText: (
        accessToken: string,
        body: c.EnqueueTextTranslationRequest,
        signal?: AbortSignal,
    ) =>
        request(
            '/texts/ai/translation',
            c.TextAiJobResponseSchema,
            { accessToken, signal },
            'POST',
            c.EnqueueTextTranslationRequestSchema.parse(body),
        ),
    getAiJob: (accessToken: string, jobId: string, signal?: AbortSignal) =>
        request(`/texts/ai/jobs/${id(jobId)}`, c.TextAiJobResponseSchema, {
            accessToken,
            signal,
        }),
    cancelAiJob: (accessToken: string, jobId: string, signal?: AbortSignal) =>
        request(
            `/texts/ai/jobs/${id(jobId)}/cancel`,
            c.TextAiJobResponseSchema,
            { accessToken, signal },
            'POST',
        ),
    enqueueSelection: (
        accessToken: string,
        body: c.TextSelectionRequest,
        key?: string,
        signal?: AbortSignal,
    ) =>
        request(
            '/dictionaries/text-selections',
            c.TextSelectionJobResponseSchema,
            {
                accessToken,
                signal,
                ...(key === undefined
                    ? {}
                    : {
                          headers: {
                              'X-Languon-Share-Key':
                                  c.TextShareKeySchema.parse(key),
                          },
                      }),
            },
            'POST',
            c.EnqueueTextSelectionRequestSchema.parse(body),
        ),
    getSelectionJob: (
        accessToken: string,
        jobId: string,
        signal?: AbortSignal,
    ) =>
        request(
            `/dictionaries/text-selections/${id(jobId)}`,
            c.TextSelectionJobResponseSchema,
            { accessToken, signal },
        ),
    cancelSelectionJob: (
        accessToken: string,
        jobId: string,
        signal?: AbortSignal,
    ) =>
        request(
            `/dictionaries/text-selections/${id(jobId)}/cancel`,
            c.TextSelectionJobResponseSchema,
            { accessToken, signal },
            'POST',
        ),
};
