import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import {
    ApplyKnowledgeBlockProposalRequestSchema,
    ApplyKnowledgeBlockProposalResponseSchema,
    KnowledgeBlockProposalsResponseSchema,
} from '@languon/contracts';
import type {
    ConversationStore,
    ConversationAccess,
} from '../../application/ports/conversation-store';
import { ConversationError } from '../../domain/conversation';

const json = (schema: z.ZodType, description = 'Success') => ({
    description,
    content: { 'application/json': { schema } },
});
const failure = json(
    z.object({
        error: z.object({
            code: z.string(),
            message: z.string(),
            requestId: z.string(),
        }),
    }),
    'Request failed',
);
const errors = {
    400: failure,
    401: failure,
    403: failure,
    404: failure,
    409: failure,
    429: failure,
    500: failure,
    503: failure,
};
const security = [{ bearerAuth: [] as string[] }];
export function registerConversationBlockProposalRoutes(
    app: OpenAPIHono,
    store: ConversationStore,
    access: (context: Context) => Promise<ConversationAccess>,
) {
    app.openapi(
        createRoute({
            method: 'get',
            path: '/conversations/{conversationId}/block-proposals',
            security,
            request: { params: z.object({ conversationId: z.uuid() }) },
            responses: {
                200: json(KnowledgeBlockProposalsResponseSchema),
                ...errors,
            },
        }),
        async (c) => {
            if (!store.listBlockProposals)
                throw new ConversationError(
                    'service_unavailable',
                    'Block proposals are unavailable.',
                );
            return c.json(
                await store.listBlockProposals(
                    await access(c),
                    c.req.valid('param').conversationId,
                ),
                200,
            );
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/conversations/{conversationId}/block-proposals/{proposalId}/apply',
            security,
            request: {
                params: z.object({
                    conversationId: z.uuid(),
                    proposalId: z.uuid(),
                }),
                body: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: ApplyKnowledgeBlockProposalRequestSchema,
                        },
                    },
                },
            },
            responses: {
                200: json(ApplyKnowledgeBlockProposalResponseSchema),
                ...errors,
            },
        }),
        async (c) => {
            if (!store.applyBlockProposal)
                throw new ConversationError(
                    'service_unavailable',
                    'Block proposals are unavailable.',
                );
            const params = c.req.valid('param');
            return c.json(
                await store.applyBlockProposal(
                    await access(c),
                    params.conversationId,
                    params.proposalId,
                    c.req.valid('json').expectedBranchVersion,
                ),
                200,
            );
        },
    );
}
