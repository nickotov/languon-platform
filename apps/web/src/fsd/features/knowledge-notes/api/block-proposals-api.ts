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
    const id =
        c.KnowledgeBlockProposalSchema.shape.conversationId.parse(
            conversationId,
        );
    return session(async (token) => {
        const response = await fetch(
            `${resolveApiUrl(process.env.NODE_ENV, process.env.NEXT_PUBLIC_API_URL)}/conversations/${encodeURIComponent(id)}/block-proposals${suffix}`,
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
            const failure =
                c.ConversationErrorResponseSchema.safeParse(payload);
            throw new ConversationApiError(response.status, {
                ...(failure.success
                    ? failure.data.error
                    : {
                          code: 'internal_error',
                          message: 'The proposal is unavailable.',
                      }),
                correlationId: failure.success
                    ? (failure.data.error.correlationId ??
                      'block-proposal-client')
                    : 'block-proposal-client',
            });
        }
        return schema.parse(payload);
    });
}
export const blockProposalsApi = {
    list: (
        session: ConversationSessionRequest,
        conversationId: string,
        signal?: AbortSignal,
    ) =>
        request(
            session,
            conversationId,
            '',
            c.KnowledgeBlockProposalsResponseSchema,
            undefined,
            signal,
        ),
    apply: (
        session: ConversationSessionRequest,
        conversationId: string,
        proposalId: string,
        expectedBranchVersion: number,
    ) => {
        const id = c.KnowledgeBlockProposalSchema.shape.id.parse(proposalId);
        return request(
            session,
            conversationId,
            `/${encodeURIComponent(id)}/apply`,
            c.ApplyKnowledgeBlockProposalResponseSchema,
            c.ApplyKnowledgeBlockProposalRequestSchema.parse({
                expectedBranchVersion,
            }),
        );
    },
};
