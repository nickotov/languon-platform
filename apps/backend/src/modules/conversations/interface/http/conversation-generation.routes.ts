import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import {
    GenerationRunsResponseSchema,
    GenerationRunDetailSchema,
    ContinueGenerationRunRequestSchema,
    ReviseGenerationRunRequestSchema,
    ApplyGenerationPlanRevisionRequestSchema,
    ResolveGenerationRunSourceRequestSchema,
    DiscardGenerationRunRequestSchema,
    ConversationTurnResponseSchema,
    ConversationActionQuoteSchema,
} from '@languon/contracts';
import type { ConversationService } from '../../application/conversation-service';
import type { ConversationAccess } from '../../application/ports/conversation-store';
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
            details: z
                .object({ quote: ConversationActionQuoteSchema })
                .optional(),
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
const params = z.object({ conversationId: z.uuid(), runId: z.uuid() });
const requestBody = (schema: z.ZodType) => ({
    required: true,
    content: { 'application/json': { schema } },
});
const unavailable = () =>
    new ConversationError(
        'service_unavailable',
        'Lesson generation is unavailable.',
    );

export function registerConversationGenerationRoutes(
    app: OpenAPIHono,
    service: ConversationService,
    access: (context: Context) => Promise<ConversationAccess>,
) {
    app.openapi(
        createRoute({
            method: 'get',
            path: '/conversations/{conversationId}/generation-runs',
            security,
            request: { params: z.object({ conversationId: z.uuid() }) },
            responses: { 200: json(GenerationRunsResponseSchema), ...errors },
        }),
        async (c) => {
            if (!service.store.listGenerationRuns) {
                throw unavailable();
            }

            return c.json(
                await service.store.listGenerationRuns(
                    await access(c),
                    c.req.valid('param').conversationId,
                ),
                200,
            );
        },
    );

    app.openapi(
        createRoute({
            method: 'get',
            path: '/conversations/{conversationId}/generation-runs/{runId}',
            security,
            request: { params },
            responses: { 200: json(GenerationRunDetailSchema), ...errors },
        }),
        async (c) => {
            if (!service.store.getGenerationRun) {
                throw unavailable();
            }

            const ids = c.req.valid('param');

            return c.json(
                await service.store.getGenerationRun(
                    await access(c),
                    ids.conversationId,
                    ids.runId,
                ),
                200,
            );
        },
    );

    app.openapi(
        createRoute({
            method: 'post',
            path: '/conversations/{conversationId}/generation-runs/{runId}/continue',
            security,
            request: {
                params,
                body: requestBody(ContinueGenerationRunRequestSchema),
            },
            responses: { 200: json(ConversationTurnResponseSchema), ...errors },
        }),
        async (c) => {
            if (!service.store.continueGenerationRun) {
                throw unavailable();
            }

            const ids = c.req.valid('param');
            const actor = await access(c);
            const lease = await service.admitSubmission(
                actor,
                c.req.raw.signal,
            );

            try {
                return c.json(
                    {
                        turn: await service.store.continueGenerationRun(
                            actor,
                            ids.conversationId,
                            ids.runId,
                            ContinueGenerationRunRequestSchema.parse(
                                c.req.valid('json'),
                            ),
                        ),
                    },
                    200,
                );
            } finally {
                await lease.release();
            }
        },
    );

    app.openapi(
        createRoute({
            method: 'post',
            path: '/conversations/{conversationId}/generation-runs/{runId}/revise',
            security,
            request: {
                params,
                body: requestBody(ReviseGenerationRunRequestSchema),
            },
            responses: { 200: json(ConversationTurnResponseSchema), ...errors },
        }),
        async (c) => {
            if (!service.store.reviseGenerationRun) {
                throw unavailable();
            }

            const ids = c.req.valid('param');
            const actor = await access(c);
            const lease = await service.admitSubmission(
                actor,
                c.req.raw.signal,
            );

            try {
                return c.json(
                    {
                        turn: await service.store.reviseGenerationRun(
                            actor,
                            ids.conversationId,
                            ids.runId,
                            ReviseGenerationRunRequestSchema.parse(
                                c.req.valid('json'),
                            ),
                        ),
                    },
                    200,
                );
            } finally {
                await lease.release();
            }
        },
    );

    app.openapi(
        createRoute({
            method: 'post',
            path: '/conversations/{conversationId}/generation-runs/{runId}/apply-revision',
            security,
            request: {
                params,
                body: requestBody(ApplyGenerationPlanRevisionRequestSchema),
            },
            responses: { 200: json(GenerationRunDetailSchema), ...errors },
        }),
        async (c) => {
            if (!service.store.applyGenerationRevision) {
                throw unavailable();
            }

            const ids = c.req.valid('param');
            const actor = await access(c);

            return c.json(
                await service.store.applyGenerationRevision(
                    actor,
                    ids.conversationId,
                    ids.runId,
                    ApplyGenerationPlanRevisionRequestSchema.parse(
                        c.req.valid('json'),
                    ),
                ),
                200,
            );
        },
    );

    app.openapi(
        createRoute({
            method: 'post',
            path: '/conversations/{conversationId}/generation-runs/{runId}/resolve-source',
            security,
            request: {
                params,
                body: requestBody(ResolveGenerationRunSourceRequestSchema),
            },
            responses: { 200: json(GenerationRunDetailSchema), ...errors },
        }),
        async (c) => {
            if (!service.store.resolveGenerationSource) {
                throw unavailable();
            }

            const ids = c.req.valid('param');
            const actor = await access(c);

            return c.json(
                await service.store.resolveGenerationSource(
                    actor,
                    ids.conversationId,
                    ids.runId,
                    ResolveGenerationRunSourceRequestSchema.parse(
                        c.req.valid('json'),
                    ),
                ),
                200,
            );
        },
    );

    app.openapi(
        createRoute({
            method: 'post',
            path: '/conversations/{conversationId}/generation-runs/{runId}/discard',
            security,
            request: {
                params,
                body: requestBody(DiscardGenerationRunRequestSchema),
            },
            responses: { 200: json(GenerationRunDetailSchema), ...errors },
        }),
        async (c) => {
            if (!service.store.discardGenerationRun) {
                throw unavailable();
            }

            const ids = c.req.valid('param');
            const actor = await access(c);

            return c.json(
                await service.store.discardGenerationRun(
                    actor,
                    ids.conversationId,
                    ids.runId,
                    DiscardGenerationRunRequestSchema.parse(
                        c.req.valid('json'),
                    ),
                ),
                200,
            );
        },
    );
}
