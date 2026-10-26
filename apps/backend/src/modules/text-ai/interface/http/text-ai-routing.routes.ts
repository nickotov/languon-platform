import { randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
    AdminErrorResponseSchema,
    TextAiRoutingPublishRequestSchema,
    TextAiRoutingDisableRequestSchema,
    TextAiRoutingResponseSchema,
} from '@languon/contracts';
import type { TextAiRoutingStore } from '../../application/text-ai-routing-store';
import {
    TextAiRoutingConflictError,
    TextAiRoutingInvalidError,
    TextAiRoutingUnavailableError,
} from '../../domain/text-ai-routing';
import type { AdministrationService } from '../../../administration/application/administration-service';
import { mapAdministrationHttpError } from '../../../administration/interface/http/administration-http-error-mapping';
import {
    InvalidRequestOriginError,
    type AuthHttpPolicy,
} from '../../../authentication/interface/http/auth-http-policy';

export function createTextAiRoutingRoutes(options: {
    store: TextAiRoutingStore;
    administration: AdministrationService;
    policy: AuthHttpPolicy;
}) {
    const app = new OpenAPIHono({
        defaultHook: (result, c) =>
            result.success
                ? undefined
                : c.json(
                      {
                          error: {
                              code: 'invalid_request',
                              message: 'Routing configuration is invalid.',
                              correlationId: randomUUID(),
                          },
                      },
                      400,
                  ),
    });
    app.use('/admin/ai/routing*', async (c, next) => {
        c.header('Cache-Control', 'no-store');
        await next();
    });
    app.onError((error, c) => {
        if (error instanceof TextAiRoutingConflictError)
            return c.json(
                {
                    error: {
                        code: 'ai_settings_conflict',
                        message: 'Routing changed. Refresh and review again.',
                        correlationId: randomUUID(),
                    },
                },
                409,
            );
        if (
            error instanceof TextAiRoutingInvalidError ||
            error instanceof TextAiRoutingUnavailableError
        )
            return c.json(
                {
                    error: {
                        code: 'ai_settings_invalid',
                        message: error.message,
                        correlationId: randomUUID(),
                    },
                },
                400,
            );
        const mapped = mapAdministrationHttpError(error);
        return c.json(mapped.response(randomUUID()), mapped.status);
    });
    const errors = Object.fromEntries(
        [400, 401, 403, 409].map((status) => [
            status,
            {
                description: 'Routing request rejected.',
                content: {
                    'application/json': { schema: AdminErrorResponseSchema },
                },
            },
        ]),
    );
    const response = {
        description: 'Current immutable routing revision.',
        content: {
            'application/json': { schema: TextAiRoutingResponseSchema },
        },
    };
    app.openapi(
        createRoute({
            method: 'get',
            path: '/admin/ai/routing',
            tags: ['Administration'],
            security: [{ bearerAuth: [] }],
            responses: { 200: response, ...errors },
        }),
        async (c) => {
            await options.administration.authorizeOperation(
                options.policy.parseBearerAuthorization(
                    c.req.header('Authorization') ?? null,
                ),
                randomUUID(),
            );
            return c.json(
                {
                    revision: await options.store.current(),
                    catalog: await options.store.catalog(),
                },
                200,
            );
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/admin/ai/routing',
            tags: ['Administration'],
            security: [{ bearerAuth: [] }],
            request: {
                body: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: TextAiRoutingPublishRequestSchema,
                        },
                    },
                },
            },
            responses: { 200: response, ...errors },
        }),
        async (c) => {
            const origin = c.req.header('Origin');
            if (!origin) throw new InvalidRequestOriginError();
            options.policy.assertCookieRequestOrigin(origin);
            const principal =
                await options.administration.authorizeSensitiveOperation(
                    options.policy.parseBearerAuthorization(
                        c.req.header('Authorization') ?? null,
                    ),
                    randomUUID(),
                );
            return c.json(
                {
                    revision: await options.store.publish(
                        c.req.valid('json'),
                        principal.actor.id,
                        new Date(),
                    ),
                    catalog: await options.store.catalog(),
                },
                200,
            );
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/admin/ai/routing/disable',
            tags: ['Administration'],
            security: [{ bearerAuth: [] }],
            request: {
                body: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: TextAiRoutingDisableRequestSchema,
                        },
                    },
                },
            },
            responses: { 200: response, ...errors },
        }),
        async (c) => {
            const origin = c.req.header('Origin');
            if (!origin) throw new InvalidRequestOriginError();
            options.policy.assertCookieRequestOrigin(origin);
            const principal =
                await options.administration.authorizeSensitiveOperation(
                    options.policy.parseBearerAuthorization(
                        c.req.header('Authorization') ?? null,
                    ),
                    randomUUID(),
                );
            return c.json(
                {
                    revision: await options.store.disable(
                        c.req.valid('json'),
                        principal.actor.id,
                        new Date(),
                    ),
                    catalog: await options.store.catalog(),
                },
                200,
            );
        },
    );
    return app;
}
