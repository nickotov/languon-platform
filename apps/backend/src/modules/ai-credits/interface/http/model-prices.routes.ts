import { randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
    ModelPricePublishRequestSchema,
    ModelPriceSchema,
    ModelPricesResponseSchema,
    AdminErrorResponseSchema,
} from '@languon/contracts';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { z } from 'zod';
import type { databaseSchema } from '../../../../infrastructure/database/schema';
import type { AdministrationService } from '../../../administration/application/administration-service';
import type { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import { InvalidRequestOriginError } from '../../../authentication/interface/http/auth-http-policy';
import { mapAdministrationHttpError } from '../../../administration/interface/http/administration-http-error-mapping';
import {
    DrizzleModelPriceParticipant,
    ModelPriceConflictError,
    ModelPriceUnavailableError,
} from '../../infrastructure/persistence/drizzle/drizzle-model-price-participant';

export function createModelPriceRoutes(options: {
    database: PostgresJsDatabase<typeof databaseSchema>;
    administration: AdministrationService;
    policy: AuthHttpPolicy;
    publishingEnabled?: boolean;
}) {
    const app = new OpenAPIHono({
        defaultHook: (result, c) =>
            result.success
                ? undefined
                : c.json(
                      {
                          error: {
                              code: 'invalid_request',
                              message: 'The request is invalid.',
                              correlationId: randomUUID(),
                          },
                      },
                      400,
                  ),
    });
    app.use('/admin/ai/model-prices', async (c, next) => {
        c.header('Cache-Control', 'no-store');
        await next();
    });
    app.onError((error, c) => {
        if (error instanceof ModelPriceConflictError)
            return c.json(
                {
                    error: {
                        code: 'ai_settings_conflict',
                        message: 'The price changed. Refresh and try again.',
                        correlationId: randomUUID(),
                    },
                },
                409,
            );
        if (error instanceof ModelPriceUnavailableError)
            return c.json(
                {
                    error: {
                        code: 'invalid_request',
                        message: 'The model or its rates are invalid.',
                        correlationId: randomUUID(),
                    },
                },
                400,
            );
        const mapped = mapAdministrationHttpError(error);
        return c.json(mapped.response(randomUUID()), mapped.status);
    });
    const response = (
        schema: typeof ModelPriceSchema | typeof ModelPricesResponseSchema,
    ) => ({
        content: { 'application/json': { schema } },
        description: 'Current immutable model prices.',
    });
    const errors = {
        400: {
            content: {
                'application/json': { schema: AdminErrorResponseSchema },
            },
            description: 'Invalid request.',
        },
        401: {
            content: {
                'application/json': { schema: AdminErrorResponseSchema },
            },
            description: 'Authentication required.',
        },
        403: {
            content: {
                'application/json': { schema: AdminErrorResponseSchema },
            },
            description: 'Owner or recent authentication required.',
        },
        409: {
            content: {
                'application/json': { schema: AdminErrorResponseSchema },
            },
            description: 'Price changed.',
        },
    };
    app.openapi(
        createRoute({
            method: 'get',
            path: '/admin/ai/model-prices',
            tags: ['Administration'],
            security: [{ bearerAuth: [] }],
            responses: { 200: response(ModelPricesResponseSchema), ...errors },
        }),
        async (c) => {
            const token = options.policy.parseBearerAuthorization(
                c.req.header('Authorization') ?? null,
            );
            await options.administration.authorizeOperation(
                token,
                randomUUID(),
            );
            const prices = await options.database.transaction((tx) =>
                new DrizzleModelPriceParticipant(tx).list(),
            );
            return c.json({ prices }, 200);
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/admin/ai/model-prices',
            tags: ['Administration'],
            security: [{ bearerAuth: [] }],
            request: {
                body: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: ModelPricePublishRequestSchema,
                        },
                    },
                },
            },
            responses: { 200: response(ModelPriceSchema), ...errors },
        }),
        async (c) => {
            const origin = c.req.header('Origin');
            if (!origin) throw new InvalidRequestOriginError();
            options.policy.assertCookieRequestOrigin(origin);
            const correlation = z
                .string()
                .uuid()
                .safeParse(c.req.header('X-Correlation-ID'));
            const correlationId = correlation.success
                ? correlation.data
                : randomUUID();
            const token = options.policy.parseBearerAuthorization(
                c.req.header('Authorization') ?? null,
            );
            const principal =
                await options.administration.authorizeSensitiveOperation(
                    token,
                    correlationId,
                );
            if (options.publishingEnabled === false)
                return c.json(
                    {
                        error: {
                            code: 'access_denied',
                            message:
                                'Model price publication is disabled until compatible API and worker versions are deployed.',
                            correlationId,
                        },
                    },
                    403,
                );
            const price = await options.database.transaction((tx) =>
                new DrizzleModelPriceParticipant(tx).publish(
                    c.req.valid('json'),
                    principal.actor.id,
                    new Date(),
                    correlationId,
                ),
            );
            return c.json(price, 200);
        },
    );
    return app;
}
