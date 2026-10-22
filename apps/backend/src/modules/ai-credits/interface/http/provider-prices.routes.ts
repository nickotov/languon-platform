import { randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
    ProviderPricePublishRequestSchema,
    ProviderPriceSchema,
    ProviderPricesResponseSchema,
    AdminErrorResponseSchema,
} from '@languon/contracts';
import type { ProviderPriceStore } from '../../application/provider-price-store';
import { AccountingConflictError } from '../../domain/accounting';
import type { AdministrationService } from '../../../administration/application/administration-service';
import { mapAdministrationHttpError } from '../../../administration/interface/http/administration-http-error-mapping';
import {
    InvalidRequestOriginError,
    type AuthHttpPolicy,
} from '../../../authentication/interface/http/auth-http-policy';

export function createProviderPriceRoutes(options: {
    store: ProviderPriceStore;
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
                              message: 'Provider rates are invalid.',
                              correlationId: randomUUID(),
                          },
                      },
                      400,
                  ),
    });
    app.use('/admin/ai/accounting/provider-prices', async (c, next) => {
        c.header('Cache-Control', 'no-store');
        await next();
    });
    app.onError((error, c) => {
        if (error instanceof AccountingConflictError)
            return c.json(
                {
                    error: {
                        code: 'ai_settings_conflict',
                        message:
                            'The provider price revision changed. Refresh and try again.',
                        correlationId: randomUUID(),
                    },
                },
                409,
            );
        const mapped = mapAdministrationHttpError(error);
        return c.json(mapped.response(randomUUID()), mapped.status);
    });
    const errors = {
        400: {
            content: {
                'application/json': { schema: AdminErrorResponseSchema },
            },
            description: 'Invalid rates.',
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
            description: 'Revision conflict.',
        },
    };
    const tags = ['Administration'];
    const security = [{ bearerAuth: [] }];
    app.openapi(
        createRoute({
            method: 'get',
            path: '/admin/ai/accounting/provider-prices',
            tags,
            security,
            responses: {
                200: {
                    content: {
                        'application/json': {
                            schema: ProviderPricesResponseSchema,
                        },
                    },
                    description:
                        'Latest admin-reviewed provider USD rate revisions.',
                },
                ...errors,
            },
        }),
        async (c) => {
            await options.administration.authorizeOperation(
                options.policy.parseBearerAuthorization(
                    c.req.header('Authorization') ?? null,
                ),
                randomUUID(),
            );
            return c.json({ prices: await options.store.list() }, 200);
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/admin/ai/accounting/provider-prices',
            tags,
            security,
            request: {
                body: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: ProviderPricePublishRequestSchema,
                        },
                    },
                },
            },
            responses: {
                200: {
                    content: {
                        'application/json': { schema: ProviderPriceSchema },
                    },
                    description:
                        'New immutable provider USD revision. Existing actions keep their pinned rate.',
                },
                ...errors,
            },
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
                await options.store.publish(
                    c.req.valid('json'),
                    principal.actor.id,
                    new Date(),
                ),
                200,
            );
        },
    );
    return app;
}
