import { registerAdminMcpCheckTools } from './admin-mcp-check-tools';
import { actualizeModelPricesSchema } from '../../application/admin-mcp-price-actualization-service';
import type { AdminMcpCheckService } from '../../application/admin-mcp-check-service';
import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { adminMcpReasonSchema } from '@languon/contracts';
import type { AdminMcpCredentialService } from '../../application/admin-mcp-credential-service';
import {
    AdminMcpError,
    permissionForWrite,
    type AdminMcpActor,
} from '../../domain/admin-mcp';
import type { AdminMcpAdministrationService } from '../../application/admin-mcp-administration-service';
import {
    adminMcpReadSchemas,
    adminMcpWriteSchemas,
} from '../../application/operation-schemas';

export interface AdminMcpServerDependencies {
    credentials: AdminMcpCredentialService;
    administration: AdminMcpAdministrationService;
    checks: AdminMcpCheckService;
    port: number;
    actualizePrices?: (
        actor: AdminMcpActor,
        input: unknown,
        secret: string,
        signal: AbortSignal,
    ) => Promise<unknown>;
    verifyPrices?: (
        actor: AdminMcpActor,
        input: unknown,
        secret: string,
        signal: AbortSignal,
    ) => Promise<unknown>;
}
function json(value: unknown) {
    return JSON.stringify(value, (_key, item: unknown) =>
        typeof item === 'bigint' ? item.toString() : item,
    );
}
function result(value: unknown) {
    return { content: [{ type: 'text' as const, text: json(value) }] };
}
/** Never send database/provider exception text to clients. */
function failure(error: unknown) {
    const correlationId = randomUUID();
    if (error instanceof AdminMcpError)
        return {
            ...result({
                error: {
                    code: error.code,
                    message: error.message,
                    correlationId,
                },
            }),
            isError: true,
        };
    if (error instanceof z.ZodError)
        return {
            ...result({
                error: {
                    code: 'invalid_request',
                    message: 'Arguments do not match the tool schema.',
                    correlationId,
                },
            }),
            isError: true,
        };
    return {
        ...result({
            error: {
                code: 'operation_rejected',
                message:
                    'The operation could not be completed. Read current configuration and prerequisites before retrying.',
                correlationId,
            },
        }),
        isError: true,
    };
}
function createTools(
    deps: AdminMcpServerDependencies,
    actor: AdminMcpActor,
    secret: string,
    signal: AbortSignal,
) {
    const server = new McpServer({ name: 'languon-admin', version: '1.0.0' });
    const wrap = (call: () => Promise<unknown>) => async () => {
        try {
            return result(await call());
        } catch (error) {
            return failure(error);
        }
    };
    server.registerTool(
        'admin_connection_test',
        {
            description:
                'Read-only connection and credential check. Does not run AI or spend money.',
            inputSchema: z.object({}).strict(),
            annotations: { readOnlyHint: true },
        },
        wrap(async () => ({
            connected: true,
            tokenId: actor.tokenId,
            permissions: actor.permissions,
            limits: actor.limits,
            serverTime: new Date().toISOString(),
        })),
    );
    // Every operation has a fixed name and schema. New registry entries do not expand old permissions.
    for (const [operation, schema] of Object.entries(adminMcpReadSchemas)) {
        const permission = operation.startsWith('users.')
            ? 'users.read'
            : operation.startsWith('financial-reports.')
              ? 'financial-reports.read'
              : 'providers.read';
        if (
            !actor.permissions.includes(permission) ||
            !actor.allowedActions.includes(operation)
        )
            continue;
        const readSchema = schema.extend({
            reason: adminMcpReasonSchema.default(
                'Explicit delegated administrative inspection',
            ),
        });
        server.registerTool(
            operation.replaceAll('.', '_'),
            {
                description: `Read ${operation}; no paid generation. Financial results distinguish estimates and unknowns.`,
                inputSchema: readSchema as z.ZodType,
                annotations: { readOnlyHint: true },
            },
            async (args: unknown) => {
                try {
                    const value = await deps.administration.read(
                        actor,
                        operation as keyof typeof adminMcpReadSchemas,
                        args,
                    );
                    const disclosedValue =
                        operation === 'providers.inspect' &&
                        actor.permissions.includes('model-checks.run') &&
                        actor.allowedActions.includes('model-checks.status')
                            ? {
                                  ...(value as Record<string, unknown>),
                                  modelCheckLimits:
                                      await deps.checks.limits(actor),
                              }
                            : value;
                    return result(disclosedValue);
                } catch (error) {
                    return failure(error);
                }
            },
        );
    }
    for (const [operation, schema] of Object.entries(adminMcpWriteSchemas)) {
        const name = operation as keyof typeof adminMcpWriteSchemas;
        if (
            !actor.permissions.includes(permissionForWrite(name)) ||
            !actor.allowedActions.includes(operation)
        )
            continue;
        server.registerTool(
            `preview_${operation.replaceAll('.', '_').replaceAll('-', '_')}`,
            {
                description: `Preview ${operation}; no mutation. Shows current/proposed state, reason and limits. Valid five minutes; disclosure is not human approval.`,
                inputSchema: schema as z.ZodType,
                annotations: { readOnlyHint: true },
            },
            async (args: unknown) => {
                try {
                    return result(
                        await deps.administration.preview(actor, name, args),
                    );
                } catch (error) {
                    return failure(error);
                }
            },
        );
    }
    if (
        actor.permissions.some(
            (p) =>
                p.endsWith('.write') ||
                p === 'credits.grant' ||
                p === 'credits.revoke',
        )
    ) {
        server.registerTool(
            'admin_apply',
            {
                description:
                    'Apply an exact preview with a stable operationKey. Reuse the same pair after interruption; never create another key to retry a financial mutation.',
                inputSchema: z
                    .object({
                        previewId: z.uuid(),
                        operationKey: z.uuid(),
                    })
                    .strict(),
                annotations: { readOnlyHint: false, idempotentHint: true },
            },
            async (args: unknown) => {
                try {
                    return result(await deps.administration.apply(actor, args));
                } catch (error) {
                    return failure(error);
                }
            },
        );
    }
    registerAdminMcpCheckTools(server, deps.checks, actor, secret);
    if (
        deps.actualizePrices &&
        actor.permissions.includes('provider-prices.write') &&
        actor.allowedActions.includes('provider-prices.actualize-native.v1') &&
        actor.allowedActions.includes('provider-prices.native-write')
    ) {
        server.registerTool(
            'actualize_model_prices',
            {
                title: 'Actualize prices of models',
                description:
                    'Fetch official native pricing for real catalog models and prepare exact versioned price revisions. Includes tiers, schedules and native billing units. No paid generation or activation. Publish returned previews with admin_apply. Discovery pages contain at most50 models; continue with nextOffset until null. Retired/missing identities and source failures remain explicit.',
                inputSchema: actualizeModelPricesSchema,
                annotations: { readOnlyHint: false, openWorldHint: true },
            },
            async (args) => {
                try {
                    return result(
                        await deps.actualizePrices!(
                            actor,
                            args,
                            secret,
                            signal,
                        ),
                    );
                } catch (error) {
                    return failure(error);
                }
            },
        );
    }
    if (
        deps.verifyPrices &&
        actor.permissions.includes('providers.read') &&
        actor.allowedActions.includes('provider-prices.verify')
    ) {
        server.registerTool(
            'verify_model_prices',
            {
                title: 'Verify prices of models',
                description:
                    'Read-only official pricing verification for all real catalog models, including retired and unconfigured entries. Separately reports exact identity/source, stored-price comparison, native billing rules, publication and execution readiness. No price publication, preview, generation or activation. Omit models and continue nextOffset pages to verify the complete catalog.',
                inputSchema: actualizeModelPricesSchema,
                annotations: { readOnlyHint: true, openWorldHint: true },
            },
            async (args) => {
                try {
                    return result(
                        await deps.verifyPrices!(actor, args, secret, signal),
                    );
                } catch (error) {
                    return failure(error);
                }
            },
        );
    }
    return server;
}
export function createAdminMcpServer(deps: AdminMcpServerDependencies) {
    const app = new Hono();
    let active = 0;
    const bursts = new Map<string, { count: number; until: number }>();
    app.use('*', async (c, next) => {
        c.header('Cache-Control', 'no-store');
        const url = new URL(c.req.url);
        const hosts = new Set([
            `127.0.0.1:${deps.port}`,
            `localhost:${deps.port}`,
        ]);
        if (!hosts.has(c.req.header('Host') ?? url.host))
            return c.json({ error: 'invalid_host' }, 403);
        // Native clients omit Origin. Browser access is unnecessary for v1.
        if (c.req.header('Origin'))
            return c.json({ error: 'browser_origin_not_allowed' }, 403);
        if (url.search)
            return c.json({ error: 'query_parameters_not_allowed' }, 400);
        if (active >= 32) return c.json({ error: 'server_busy' }, 429);
        active++;
        try {
            await next();
        } finally {
            active--;
        }
    });
    app.get('/healthz', (c) => c.json({ status: 'ok' }));
    app.use(
        '/mcp',
        bodyLimit({
            maxSize: 65536,
            onError: (c) => c.json({ error: 'request_too_large' }, 413),
        }),
    );
    app.all('/mcp', async (c) => {
        const header = c.req.header('Authorization');
        if (!header?.startsWith('Bearer '))
            return c.json({ error: 'authentication_required' }, 401);
        const secret = header.slice(7);
        let actor: AdminMcpActor;
        try {
            actor = await deps.credentials.authenticate(secret);
        } catch {
            return c.json({ error: 'invalid_or_inactive_credential' }, 401);
        }
        const now = Date.now();
        const burst = bursts.get(actor.tokenId);
        if (burst && burst.until > now && burst.count >= 60)
            return c.json({ error: 'rate_limited' }, 429);
        if (!burst || burst.until <= now) {
            for (const [key, value] of bursts)
                if (value.until <= now) bursts.delete(key);
            if (bursts.size >= 10000)
                return c.json({ error: 'server_busy' }, 429);
            bursts.set(actor.tokenId, { count: 1, until: now + 60000 });
        } else burst.count++;
        const handler = createMcpHandler(
            () => createTools(deps, actor, secret, c.req.raw.signal),
            { responseMode: 'json' },
        );
        return handler.fetch(c.req.raw);
    });
    app.onError((_error, c) =>
        c.json({ error: 'internal_error', correlationId: randomUUID() }, 500),
    );
    return app;
}
