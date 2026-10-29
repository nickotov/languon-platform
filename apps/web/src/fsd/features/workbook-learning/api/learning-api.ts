import { z } from 'zod';
import { BrowserApiError } from '@languon/browser-auth';
import * as c from '@languon/contracts';
import { resolveApiUrl } from '@/fsd/shared/api/api-url';
const learningErrorSchema = z.object({
    error: z.object({
        code: z.string().min(1).max(100),
        message: z.string().max(2_000),
        correlationId: z.string().max(200),
        details: z
            .object({ quote: c.ActionAllowanceQuoteSchema.optional() })
            .optional(),
    }),
});
type ErrorDetail = z.infer<typeof learningErrorSchema>['error'];
export class LearningApiError extends BrowserApiError<ErrorDetail> {}
async function request<T>(
    token: string,
    noteId: string,
    suffix: string,
    schema: { parse(value: unknown): T },
    body?: unknown,
    access?: c.WorkbookLearningShareAccess,
    signal?: AbortSignal,
    workbook = false,
): Promise<T> {
    const id = c.KnowledgeNoteIdParamsSchema.parse({ noteId }).noteId;
    const grant = access
        ? c.WorkbookLearningShareAccessSchema.parse(access)
        : undefined;
    const fallback: ErrorDetail = {
        code: 'internal_error',
        message: 'Learning state unavailable.',
        correlationId: 'workbook-learning-client',
    };
    const path = workbook
        ? `/knowledge/workbooks/${id}/progress`
        : `/knowledge/${id}/learning${suffix}`;
    let response: Response;
    try {
        response = await fetch(
            `${resolveApiUrl(process.env.NODE_ENV, process.env.NEXT_PUBLIC_API_URL)}${path}`,
            {
                method: body === undefined ? 'GET' : 'POST',
                credentials: 'include',
                cache: 'no-store',
                signal: signal ?? AbortSignal.timeout(30_000),
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${token}`,
                    ...(body === undefined
                        ? {}
                        : { 'Content-Type': 'application/json' }),
                    ...(grant
                        ? {
                              'X-Languon-Share-Kind': grant.kind,
                              'X-Languon-Share-Locator': grant.locator,
                              'X-Languon-Share-Key': grant.key,
                          }
                        : {}),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            },
        );
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error;
        throw new LearningApiError(0, fallback);
    }
    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
        const parsed = learningErrorSchema.safeParse(payload);
        throw new LearningApiError(
            response.status,
            parsed.success ? parsed.data.error : fallback,
        );
    }
    try {
        return schema.parse(payload);
    } catch {
        throw new LearningApiError(502, fallback);
    }
}
export const learningApi = {
    workbookProgress: (
        token: string,
        workbookId: string,
        access?: c.WorkbookLearningShareAccess,
        signal?: AbortSignal,
    ) =>
        request(
            token,
            workbookId,
            '',
            c.WorkbookProgressSchema,
            undefined,
            access,
            signal,
            true,
        ),
    state: (
        token: string,
        noteId: string,
        access?: c.WorkbookLearningShareAccess,
        signal?: AbortSignal,
    ) =>
        request(
            token,
            noteId,
            '',
            c.WorkbookLearningStateSchema,
            undefined,
            access,
            signal,
        ),
    attempt: (
        token: string,
        noteId: string,
        input: c.SubmitWorkbookAttemptRequest,
        access?: c.WorkbookLearningShareAccess,
    ) =>
        request(
            token,
            noteId,
            '/attempts',
            c.WorkbookAttemptResponseSchema,
            c.SubmitWorkbookAttemptRequestSchema.parse(input),
            access,
        ),
    event: (
        token: string,
        noteId: string,
        input: c.RecordWorkbookLearningEventRequest,
        access?: c.WorkbookLearningShareAccess,
    ) =>
        request(
            token,
            noteId,
            '/events',
            c.WorkbookLearningEventResponseSchema,
            c.RecordWorkbookLearningEventRequestSchema.parse(input),
            access,
        ),
    evaluate: (
        token: string,
        noteId: string,
        input: c.RequestKnowledgeExerciseEvaluation,
        access?: c.WorkbookLearningShareAccess,
        confirmedQuoteId?: string,
        signal?: AbortSignal,
    ) =>
        request(
            token,
            noteId,
            '/evaluations',
            c.KnowledgeExerciseEvaluationResponseSchema,
            {
                ...c.RequestKnowledgeExerciseEvaluationSchema.parse(input),
                ...(confirmedQuoteId ? { confirmedQuoteId } : {}),
            },
            access,
            signal,
        ),
    evaluation: (
        token: string,
        noteId: string,
        operationId: string,
        access?: c.WorkbookLearningShareAccess,
        signal?: AbortSignal,
    ) =>
        request(
            token,
            noteId,
            `/evaluations/${c.RequestKnowledgeExerciseEvaluationSchema.shape.operationId.parse(operationId)}`,
            c.KnowledgeExerciseEvaluationResponseSchema,
            undefined,
            access,
            signal,
        ),
    cancelEvaluation: (
        token: string,
        noteId: string,
        operationId: string,
        access?: c.WorkbookLearningShareAccess,
    ) =>
        request(
            token,
            noteId,
            `/evaluations/${c.RequestKnowledgeExerciseEvaluationSchema.shape.operationId.parse(operationId)}/cancel`,
            c.KnowledgeExerciseEvaluationResponseSchema,
            {},
            access,
        ),
    completion: (
        token: string,
        noteId: string,
        input: c.SetWorkbookNoteCompletionRequest,
        access?: c.WorkbookLearningShareAccess,
    ) =>
        request(
            token,
            noteId,
            '/completion',
            c.WorkbookNoteCompletionResponseSchema,
            c.SetWorkbookNoteCompletionRequestSchema.parse(input),
            access,
        ),
};
