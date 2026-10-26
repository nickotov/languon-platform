import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi';
import {
    AdminErrorResponseSchema,
    TextAiProbeRequestSchema,
    TextAiProbeRecoveryRequestSchema,
    TextAiProbeSchema,
    TextAiProbesResponseSchema,
} from '@languon/contracts';
import type { AdministrationRouteDependencies } from './administration.routes';
import { AdministrationHttpError } from './administration-http-error';

export function registerAdminTextAiProbeRoutes(
    app: OpenAPIHono,
    dependencies: AdministrationRouteDependencies,
) {
    const error = {
        content: { 'application/json': { schema: AdminErrorResponseSchema } },
        description: 'Probe request rejected.',
    };
    const responses = {
        400: error,
        401: error,
        403: error,
        409: error,
        429: error,
        503: error,
    } as const;
    const authorize = async (
        header: string | undefined,
        id: string,
        sensitive: boolean,
    ) => {
        const token = dependencies.policy.parseBearerAuthorization(
            header ?? null,
        );
        return sensitive
            ? dependencies.administration.authorizeSensitiveOperation(token, id)
            : dependencies.administration.authorizeOperation(token, id);
    };
    const service = () => {
        if (!dependencies.textAiProbes)
            throw new AdministrationHttpError(
                'probe_route_unavailable',
                'Model checks are not configured.',
                503,
            );
        return dependencies.textAiProbes;
    };
    app.openapi(
        createRoute({
            method: 'get',
            path: '/admin/ai-settings/probes',
            tags: ['Administration'],
            security: [{ bearerAuth: [] }],
            responses: {
                200: {
                    content: {
                        'application/json': {
                            schema: TextAiProbesResponseSchema,
                        },
                    },
                    description: 'Recent bounded model checks.',
                },
                ...responses,
            },
        }),
        async (context) => {
            await authorize(
                context.req.header('Authorization'),
                randomUUID(),
                false,
            );
            return context.json(await service().list(), 200);
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/admin/ai-settings/probes',
            tags: ['Administration'],
            security: [{ bearerAuth: [] }],
            request: {
                body: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: TextAiProbeRequestSchema,
                        },
                    },
                },
            },
            responses: {
                200: {
                    content: {
                        'application/json': { schema: TextAiProbeSchema },
                    },
                    description: 'Synthetic operator-funded model check.',
                },
                ...responses,
            },
        }),
        async (context) => {
            const origin = context.req.header('Origin');
            if (!origin)
                throw new AdministrationHttpError(
                    'invalid_request',
                    'A trusted origin is required.',
                    403,
                );
            dependencies.policy.assertCookieRequestOrigin(origin);
            const principal = await authorize(
                context.req.header('Authorization'),
                randomUUID(),
                true,
            );
            return context.json(
                await service().run(
                    principal.actor.id,
                    context.req.valid('json'),
                ),
                200,
            );
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/admin/ai-settings/probes/{probeId}/recover',
            tags: ['Administration'],
            security: [{ bearerAuth: [] }],
            request: {
                params: z.object({ probeId: z.uuid() }),
                body: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: TextAiProbeRecoveryRequestSchema,
                        },
                    },
                },
            },
            responses: {
                200: {
                    content: {
                        'application/json': { schema: TextAiProbeSchema },
                    },
                    description:
                        'Audited recovery without another provider request.',
                },
                ...responses,
            },
        }),
        async (context) => {
            const origin = context.req.header('Origin');
            if (!origin)
                throw new AdministrationHttpError(
                    'invalid_request',
                    'A trusted origin is required.',
                    403,
                );
            dependencies.policy.assertCookieRequestOrigin(origin);
            const principal = await authorize(
                context.req.header('Authorization'),
                randomUUID(),
                true,
            );
            return context.json(
                await service().recover(
                    principal.actor.id,
                    context.req.valid('param').probeId,
                    context.req.valid('json'),
                ),
                200,
            );
        },
    );
}
