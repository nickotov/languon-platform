import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import {
    ApplyKnowledgeContentProposalRequestSchema,
    ApplyKnowledgeContentProposalResponseSchema,
    KnowledgeContentProposalsResponseSchema,
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
export function registerConversationContentProposalRoutes(
    app: OpenAPIHono,
    store: ConversationStore,
    access: (context: Context) => Promise<ConversationAccess>,
) {
    app.openapi(
        createRoute({
            method: 'get',
            path: '/conversations/{conversationId}/content-proposals',
            security,
            request: { params: z.object({ conversationId: z.uuid() }) },
            responses: {
                200: json(KnowledgeContentProposalsResponseSchema),
                ...errors,
            },
        }),
        async (c) => {
            if (!store.listContentProposals) {
                throw new ConversationError(
                    'service_unavailable',
                    'Block proposals are unavailable.',
                );
            }

            return c.json(
                await store.listContentProposals(
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
            path: '/conversations/{conversationId}/content-proposals/{proposalId}/apply',
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
                            schema: ApplyKnowledgeContentProposalRequestSchema,
                        },
                    },
                },
            },
            responses: {
                200: json(ApplyKnowledgeContentProposalResponseSchema),
                ...errors,
            },
        }),
        async (c) => {
            if (!store.applyContentProposal) {
                throw new ConversationError(
                    'service_unavailable',
                    'Block proposals are unavailable.',
                );
            }

            const params = c.req.valid('param');

            return c.json(
                await store.applyContentProposal(
                    await access(c),
                    params.conversationId,
                    params.proposalId,
                    c.req.valid('json').expectedBranchVersion,
                    c.req.valid('json').mode,
                    c.req.valid('json').insertionPosition,
                ),
                200,
            );
        },
    );
}
