import * as c from '@languon/contracts';
import {
    ConversationApiError,
    type ConversationSessionRequest,
} from '@/fsd/entities/conversation';
import { resolveApiUrl } from '@/fsd/shared/api/api-url';

async function request<T>(
    session: ConversationSessionRequest,
    conversationId: string,
    suffix: string,
    schema: { parse(value: unknown): T },
    body?: unknown,
    signal?: AbortSignal,
): Promise<T> {
    const id = c.ConversationSchema.shape.id.parse(conversationId);

    return session(async (token) => {
        const response = await fetch(
            `${resolveApiUrl(process.env.NODE_ENV, process.env.NEXT_PUBLIC_API_URL)}/conversations/${encodeURIComponent(id)}/generation-runs${suffix}`,
            {
                method: body === undefined ? 'GET' : 'POST',
                credentials: 'include',
                cache: 'no-store',
                signal: signal ?? AbortSignal.timeout(30_000),
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                    ...(body === undefined
                        ? {}
                        : { 'Content-Type': 'application/json' }),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            },
        );
        const payload: unknown = await response.json();
        if (!response.ok) {
            const parsed = c.ConversationErrorResponseSchema.safeParse(payload);
            const detail = parsed.success
                ? parsed.data.error
                : {
                      code: 'internal_error',
                      message: 'This lesson is unavailable.',
                  };

            throw new ConversationApiError(response.status, {
                ...detail,
                correlationId: detail.correlationId ?? 'lesson-run-client',
            });
        }

        return schema.parse(payload);
    });
}

function runPath(id: string) {
    return `/${encodeURIComponent(c.GenerationRunSummarySchema.shape.id.parse(id))}`;
}

export const lessonRunsApi = {
    list: (
        session: ConversationSessionRequest,
        conversationId: string,
        signal?: AbortSignal,
    ) =>
        request(
            session,
            conversationId,
            '',
            c.GenerationRunsResponseSchema,
            undefined,
            signal,
        ),
    detail: (
        session: ConversationSessionRequest,
        conversationId: string,
        runId: string,
        signal?: AbortSignal,
    ) =>
        request(
            session,
            conversationId,
            runPath(runId),
            c.GenerationRunDetailSchema,
            undefined,
            signal,
        ),
    continue: (
        session: ConversationSessionRequest,
        conversationId: string,
        runId: string,
        input: c.ContinueGenerationRunRequest,
    ) =>
        request(
            session,
            conversationId,
            `${runPath(runId)}/continue`,
            c.ConversationTurnResponseSchema,
            c.ContinueGenerationRunRequestSchema.parse(input),
        ),
    revise: (
        session: ConversationSessionRequest,
        conversationId: string,
        runId: string,
        input: c.ReviseGenerationRunRequest,
    ) =>
        request(
            session,
            conversationId,
            `${runPath(runId)}/revise`,
            c.ConversationTurnResponseSchema,
            c.ReviseGenerationRunRequestSchema.parse(input),
        ),
    applyRevision: (
        session: ConversationSessionRequest,
        conversationId: string,
        runId: string,
        input: c.ApplyGenerationPlanRevisionRequest,
    ) =>
        request(
            session,
            conversationId,
            `${runPath(runId)}/apply-revision`,
            c.GenerationRunDetailSchema,
            c.ApplyGenerationPlanRevisionRequestSchema.parse(input),
        ),
    resolveSource: (
        session: ConversationSessionRequest,
        conversationId: string,
        runId: string,
        input: c.ResolveGenerationRunSourceRequest,
    ) =>
        request(
            session,
            conversationId,
            `${runPath(runId)}/resolve-source`,
            c.GenerationRunDetailSchema,
            c.ResolveGenerationRunSourceRequestSchema.parse(input),
        ),
    discard: (
        session: ConversationSessionRequest,
        conversationId: string,
        runId: string,
        input: c.DiscardGenerationRunRequest,
    ) =>
        request(
            session,
            conversationId,
            `${runPath(runId)}/discard`,
            c.GenerationRunDetailSchema,
            c.DiscardGenerationRunRequestSchema.parse(input),
        ),
};
