import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { GenerationRunPreviewSchema } from '@languon/contracts';
import type { ConversationService } from '../../application/conversation-service';
import type { ConversationAccess } from '../../application/ports/conversation-store';
import { ConversationError } from '../../domain/conversation';

export function registerConversationGenerationPreviewRoute(
    app: OpenAPIHono,
    service: ConversationService,
    access: (context: Context) => Promise<ConversationAccess>,
) {
    const failure = {
        description: 'Request failed',
        content: {
            'application/json': {
                schema: z.object({
                    error: z.object({
                        code: z.string(),
                        message: z.string(),
                        requestId: z.string(),
                    }),
                }),
            },
        },
    };

    app.openapi(
        createRoute({
            method: 'get',
            path: '/conversations/{conversationId}/generation-runs/{runId}/preview',
            security: [{ bearerAuth: [] }],
            request: {
                params: z.object({ conversationId: z.uuid(), runId: z.uuid() }),
            },
            responses: {
                200: {
                    description:
                        'Validated prepared content for the current owner',
                    content: {
                        'application/json': {
                            schema: GenerationRunPreviewSchema,
                        },
                    },
                },
                401: failure,
                403: failure,
                404: failure,
                409: failure,
                500: failure,
                503: failure,
            },
        }),
        async (c) => {
            if (!service.store.getGenerationRunPreview) {
                throw new ConversationError(
                    'service_unavailable',
                    'Prepared lesson preview is unavailable.',
                );
            }

            const params = c.req.valid('param');

            return c.json(
                await service.store.getGenerationRunPreview(
                    await access(c),
                    params.conversationId,
                    params.runId,
                ),
                200,
            );
        },
    );
}
