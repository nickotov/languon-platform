import { randomUUID } from 'node:crypto';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
    AdminAiCatalogDetailResponseSchema,
    AdminAiCatalogEntrySchema,
    AdminAiCatalogListResponseSchema,
    AdminAiCatalogParamsSchema,
    AdminErrorResponseSchema,
} from '@languon/contracts';
import { z } from 'zod';

import type { AdministrationRouteDependencies } from './administration.routes';
import { AdministrationHttpError } from './administration-http-error';

// JSON Schema documents can contain arbitrary nested JSON. The runtime contract
// validates z.json(); document its wire shape without recursing indefinitely in
// the installed OpenAPI converter's handling of Zod's recursive JSON union.
const documentedJsonSchema = z.record(z.string(), z.unknown()).nullable();
const [agentDefinition, toolDefinition, promptDefinition] =
    AdminAiCatalogEntrySchema.options;
const documentedDetailResponse = AdminAiCatalogDetailResponseSchema.extend({
    entry: z.discriminatedUnion('kind', [
        agentDefinition,
        toolDefinition.extend({
            inputSchema: documentedJsonSchema,
            outputSchema: documentedJsonSchema,
            requestContextSchema: documentedJsonSchema,
        }),
        promptDefinition,
    ]),
});

export function registerAdminAiCatalogRoutes(
    app: OpenAPIHono,
    dependencies: AdministrationRouteDependencies,
) {
    const failure = {
        content: { 'application/json': { schema: AdminErrorResponseSchema } },
        description: 'Catalog request rejected.',
    };
    const errors = {
        400: failure,
        401: failure,
        403: failure,
        404: failure,
        500: failure,
        503: failure,
    } as const;

    const authorize = (header: string | undefined) => {
        const token = dependencies.policy.parseBearerAuthorization(
            header ?? null,
        );

        return dependencies.administration.authorizeOperation(
            token,
            randomUUID(),
        );
    };

    app.openapi(
        createRoute({
            method: 'get',
            path: '/admin/ai-catalog',
            tags: ['Administration'],
            security: [{ bearerAuth: [] }],
            responses: {
                200: {
                    content: {
                        'application/json': {
                            schema: AdminAiCatalogListResponseSchema,
                        },
                    },
                    description:
                        'Read-only agent, tool and prompt definition summaries.',
                },
                ...errors,
            },
        }),
        async (context) => {
            await authorize(context.req.header('Authorization'));
            const response = AdminAiCatalogListResponseSchema.parse({
                entries: dependencies.aiCatalog.list(),
            });

            return context.json(response, 200);
        },
    );

    app.openapi(
        createRoute({
            method: 'get',
            path: '/admin/ai-catalog/{kind}/{id}',
            tags: ['Administration'],
            security: [{ bearerAuth: [] }],
            request: { params: AdminAiCatalogParamsSchema },
            responses: {
                200: {
                    content: {
                        'application/json': {
                            schema: documentedDetailResponse,
                        },
                    },
                    description:
                        'Read-only static definition and its related entries.',
                },
                ...errors,
            },
        }),
        async (context) => {
            await authorize(context.req.header('Authorization'));
            const { kind, id } = context.req.valid('param');
            const entry = dependencies.aiCatalog.detail(kind, id);
            if (!entry) {
                throw new AdministrationHttpError(
                    'ai_catalog_entry_not_found',
                    'AI catalog entry was not found.',
                    404,
                );
            }

            const response = AdminAiCatalogDetailResponseSchema.parse({
                entry,
            });

            return context.json(response, 200);
        },
    );
}
