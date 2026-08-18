import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { HealthResponseSchema } from '@languon/contracts';

export interface DependencyReadiness {
    postgres: 'ok' | 'unavailable';
    redis: 'ok' | 'unavailable';
}

export interface HealthRouteOptions {
    isShuttingDown: () => boolean;
    readiness: () => Promise<DependencyReadiness>;
    releaseSha: string;
}

const legacyHealthRoute = createRoute({
    method: 'get',
    path: '/health',
    responses: {
        200: {
            content: {
                'application/json': {
                    schema: HealthResponseSchema,
                },
            },
            description: 'Compatibility liveness response for the API process.',
        },
    },
    tags: ['Operations'],
});

const LiveResponseSchema = z.object({
    release: z.string(),
    service: z.literal('backend'),
    status: z.literal('ok'),
});

const ReadinessResponseSchema = z.object({
    dependencies: z.object({
        postgres: z.enum(['ok', 'unavailable']),
        redis: z.enum(['ok', 'unavailable']),
    }),
    release: z.string(),
    service: z.literal('backend'),
    status: z.enum(['ok', 'unavailable']),
});

const liveRoute = createRoute({
    method: 'get',
    path: '/livez',
    responses: {
        200: {
            content: { 'application/json': { schema: LiveResponseSchema } },
            description: 'The API process is alive.',
        },
    },
    tags: ['Operations'],
});

const readinessRoute = createRoute({
    method: 'get',
    path: '/readyz',
    responses: {
        200: {
            content: {
                'application/json': { schema: ReadinessResponseSchema },
            },
            description: 'The API and its required dependencies are ready.',
        },
        503: {
            content: {
                'application/json': { schema: ReadinessResponseSchema },
            },
            description: 'The API is draining or a dependency is unavailable.',
        },
    },
    tags: ['Operations'],
});

const defaultOptions: HealthRouteOptions = {
    isShuttingDown: () => false,
    readiness: async () => ({
        postgres: 'unavailable',
        redis: 'unavailable',
    }),
    releaseSha: 'development',
};

export function createHealthRoutes(
    options: HealthRouteOptions = defaultOptions,
): OpenAPIHono {
    return new OpenAPIHono()
        .openapi(legacyHealthRoute, (context) =>
            context.json({ service: 'backend', status: 'ok' }, 200),
        )
        .openapi(liveRoute, (context) =>
            context.json(
                {
                    release: options.releaseSha,
                    service: 'backend',
                    status: 'ok',
                },
                200,
            ),
        )
        .openapi(readinessRoute, async (context) => {
            const dependencies = options.isShuttingDown()
                ? { postgres: 'unavailable', redis: 'unavailable' as const }
                : await options.readiness().catch(() => ({
                      postgres: 'unavailable' as const,
                      redis: 'unavailable' as const,
                  }));
            const ready =
                !options.isShuttingDown() &&
                dependencies.postgres === 'ok' &&
                dependencies.redis === 'ok';
            const body = {
                dependencies,
                release: options.releaseSha,
                service: 'backend' as const,
                status: ready ? ('ok' as const) : ('unavailable' as const),
            };

            return ready ? context.json(body, 200) : context.json(body, 503);
        });
}
