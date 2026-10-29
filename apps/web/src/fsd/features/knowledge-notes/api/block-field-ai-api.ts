import { BrowserApiError } from '@languon/browser-auth';
import { z } from 'zod';
import {
    KnowledgeBlockFieldActionErrorSchema,
    KnowledgeBlockFieldActionResponseSchema,
    RequestKnowledgeBlockFieldActionSchema,
    type RequestKnowledgeBlockFieldAction,
} from '@languon/contracts';
import type { ConversationSessionRequest } from '@/fsd/entities/conversation';
import { resolveApiUrl } from '@/fsd/shared/api/api-url';

export type KnowledgeBlockFieldAiContext = {
    requestWithSession: ConversationSessionRequest;
    noteId: string;
    branchId: string;
};
const errorSchema = KnowledgeBlockFieldActionErrorSchema;
export class BlockFieldAiError extends BrowserApiError<
    z.infer<typeof errorSchema>['error']
> {}

async function request(
    context: KnowledgeBlockFieldAiContext,
    suffix: string,
    body?: unknown,
    signal?: AbortSignal,
) {
    const noteId = z.uuid().parse(context.noteId);
    return context.requestWithSession(async (token) => {
        const response = await fetch(
            `${resolveApiUrl(process.env.NODE_ENV, process.env.NEXT_PUBLIC_API_URL)}/knowledge/${encodeURIComponent(noteId)}/block-field-actions${suffix}`,
            {
                method: body === undefined ? 'GET' : 'POST',
                credentials: 'include',
                cache: 'no-store',
                signal: signal
                    ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
                    : AbortSignal.timeout(30_000),
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
            const parsed = errorSchema.safeParse(payload);
            throw new BlockFieldAiError(
                response.status,
                parsed.success
                    ? parsed.data.error
                    : {
                          code: 'internal_error',
                          message:
                              'AI checking is unavailable. Your edits are kept.',
                          correlationId: 'block-field-client',
                      },
            );
        }
        return KnowledgeBlockFieldActionResponseSchema.parse(payload);
    });
}
export const blockFieldAiApi = {
    submit(
        context: KnowledgeBlockFieldAiContext,
        input: RequestKnowledgeBlockFieldAction,
        confirmedQuoteId?: string,
    ) {
        const body = RequestKnowledgeBlockFieldActionSchema.parse(input);
        return request(context, '', {
            ...body,
            ...(confirmedQuoteId ? { confirmedQuoteId } : {}),
        });
    },
    get(
        context: KnowledgeBlockFieldAiContext,
        jobId: string,
        signal: AbortSignal,
    ) {
        return request(context, `/${z.uuid().parse(jobId)}`, undefined, signal);
    },
    cancel(context: KnowledgeBlockFieldAiContext, jobId: string) {
        return request(context, `/${z.uuid().parse(jobId)}/cancel`, {});
    },
};
