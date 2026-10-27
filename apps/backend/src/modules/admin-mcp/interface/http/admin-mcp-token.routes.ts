import { randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import {
    adminMcpIssueTokenSchema,
    adminMcpIssueTokenResponseSchema,
    adminMcpTokenListResponseSchema,
    adminMcpRevokeTokenSchema,
    adminMcpAuditQuerySchema,
    adminMcpAuditResponseSchema,
} from '@languon/contracts';
import type { AdministrationService } from '../../../administration/application/administration-service';
import { mapAdministrationHttpError } from '../../../administration/interface/http/administration-http-error-mapping';
import type { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import { InvalidRequestOriginError } from '../../../authentication/interface/http/auth-http-policy';
import { authHttpBodyLimit } from '../../../authentication/interface/http/auth-http-body-limit';
import type { AdminMcpCredentialService } from '../../application/admin-mcp-credential-service';
import { AdminMcpError } from '../../domain/admin-mcp';

export function createAdminMcpTokenRoutes(input: {
    appEnvironment: 'development' | 'test' | 'staging' | 'production';
    administration: AdministrationService;
    policy: AuthHttpPolicy;
    credentials: AdminMcpCredentialService;
}): OpenAPIHono {
    const app = new OpenAPIHono({
        defaultHook: (result, c) =>
            result.success
                ? undefined
                : c.json(
                      {
                          error: {
                              code: 'invalid_request',
                              message:
                                  'Review the token fields and finite permission limits.',
                              correlationId: randomUUID(),
                          },
                      },
                      400,
                  ),
    });
    if (
        input.appEnvironment !== 'development' &&
        input.appEnvironment !== 'test'
    )
        return app;
    app.use('/admin/mcp/*', authHttpBodyLimit);
    app.use('/admin/mcp/*', async (c, next) => {
        c.header('Cache-Control', 'no-store');
        c.header('Referrer-Policy', 'no-referrer');
        const origin = c.req.header('Origin');
        if (origin) input.policy.assertCookieRequestOrigin(origin);
        await next();
    });
    app.onError((error, c) => {
        if (error instanceof AdminMcpError) {
            const status =
                error.code === 'unauthorized'
                    ? 401
                    : error.code === 'not_found'
                      ? 404
                      : 403;
            return c.json(
                {
                    error: {
                        code: error.code,
                        message: error.message,
                        correlationId: randomUUID(),
                    },
                },
                status,
            );
        }
        const mapped = mapAdministrationHttpError(error);
        return c.json(mapped.response(randomUUID()), mapped.status);
    });
    const body = <S extends z.ZodType>(schema: S) => ({
        required: true,
        content: { 'application/json': { schema } },
    });
    const response = <S extends z.ZodType>(schema: S) => ({
        description: 'Own administrative MCP credential.',
        content: { 'application/json': { schema } },
    });
    const failure = response(
        z.object({
            error: z.object({
                code: z.string(),
                message: z.string(),
                correlationId: z.uuid(),
            }),
        }),
    );
    const errors = {
        400: failure,
        401: failure,
        403: failure,
        404: failure,
        413: failure,
        500: failure,
    };
    const authorize = (header: string | undefined, sensitive: boolean) => {
        const bearer = input.policy.parseBearerAuthorization(header ?? null);
        return sensitive
            ? input.administration.authorizeSensitiveOperation(
                  bearer,
                  randomUUID(),
              )
            : input.administration.authorizeOperation(bearer, randomUUID());
    };
    const assertOrigin = (origin: string | undefined) => {
        if (!origin) throw new InvalidRequestOriginError();
        input.policy.assertCookieRequestOrigin(origin);
    };
    app.openapi(
        createRoute({
            method: 'get',
            path: '/admin/mcp/tokens',
            tags: ['Admin MCP'],
            security: [{ bearerAuth: [] }],
            responses: {
                200: response(adminMcpTokenListResponseSchema),
                ...errors,
            },
        }),
        async (c) => {
            const principal = await authorize(
                c.req.header('Authorization'),
                false,
            );
            return c.json(
                {
                    tokens: await input.credentials.list(principal.actor.id),
                },
                200,
            );
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/admin/mcp/tokens',
            tags: ['Admin MCP'],
            security: [{ bearerAuth: [] }],
            request: { body: body(adminMcpIssueTokenSchema) },
            responses: {
                201: response(adminMcpIssueTokenResponseSchema),
                ...errors,
            },
        }),
        async (c) => {
            assertOrigin(c.req.header('Origin'));
            const principal = await authorize(
                c.req.header('Authorization'),
                true,
            );
            const result = await input.credentials.issue(
                principal.actor.id,
                c.req.valid('json'),
            );
            return c.json(result, 201);
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/admin/mcp/tokens/{tokenId}/revoke',
            tags: ['Admin MCP'],
            security: [{ bearerAuth: [] }],
            request: {
                params: z.object({ tokenId: z.uuid() }),
                body: body(adminMcpRevokeTokenSchema),
            },
            responses: {
                200: response(z.object({ success: z.literal(true) })),
                ...errors,
            },
        }),
        async (c) => {
            assertOrigin(c.req.header('Origin'));
            // Deliberate containment exception: valid admin session, no recent-auth step-up.
            const principal = await authorize(
                c.req.header('Authorization'),
                false,
            );
            await input.credentials.revoke(
                principal.actor.id,
                c.req.valid('param').tokenId,
                c.req.valid('json').reason,
            );
            return c.json({ success: true as const }, 200);
        },
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/admin/mcp/audit',
            tags: ['Admin MCP'],
            security: [{ bearerAuth: [] }],
            request: { query: adminMcpAuditQuerySchema },
            responses: {
                200: response(adminMcpAuditResponseSchema),
                ...errors,
            },
        }),
        async (c) => {
            const principal = await authorize(
                c.req.header('Authorization'),
                false,
            );
            return c.json(
                await input.credentials.audit(
                    principal.actor.id,
                    c.req.valid('query'),
                ),
                200,
            );
        },
    );
    return app;
}
