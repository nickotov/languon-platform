import { randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import {
    AdminErrorResponseSchema,
    AiAccountingSettingsSchema,
    AiAccountingSettingsPublishSchema,
    CapabilityPolicySchema,
    CapabilityPolicyPublishSchema,
} from '@languon/contracts';
import { z } from 'zod';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { databaseSchema } from '../../../../infrastructure/database/schema';
import type { AdministrationService } from '../../../administration/application/administration-service';
import type { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import { InvalidRequestOriginError } from '../../../authentication/interface/http/auth-http-policy';
import { mapAdministrationHttpError } from '../../../administration/interface/http/administration-http-error-mapping';
import {
    CapabilityPolicyConflictError,
    DrizzleCapabilityPolicyParticipant,
} from '../../infrastructure/persistence/drizzle/drizzle-capability-policy-participant';

export function createCapabilityPolicyRoutes(options: {
    database: PostgresJsDatabase<typeof databaseSchema>;
    administration: AdministrationService;
    policy: AuthHttpPolicy;
}) {
    const invalid = () => ({
        error: {
            code: 'invalid_request' as const,
            message: 'The request is invalid.',
            correlationId: randomUUID(),
        },
    });
    const app = new OpenAPIHono({
        defaultHook: (result, c) =>
            result.success ? undefined : c.json(invalid(), 400),
    });
    app.use('/admin/ai/capability-policies', async (c, next) => {
        c.header('Cache-Control', 'no-store');
        await next();
    });
    app.onError((error, c) => {
        if (error instanceof CapabilityPolicyConflictError)
            return c.json(
                {
                    error: {
                        code: 'ai_settings_conflict' as const,
                        message: 'The policy changed. Refresh and try again.',
                        correlationId: randomUUID(),
                    },
                },
                409,
            );
        const mapped = mapAdministrationHttpError(error);
        return c.json(mapped.response(randomUUID()), mapped.status);
    });
    const json = (schema: z.ZodType) => ({
        content: { 'application/json': { schema } },
        description: 'Capability charging policy.',
    });
    const errors = {
        400: json(AdminErrorResponseSchema),
        401: json(AdminErrorResponseSchema),
        403: json(AdminErrorResponseSchema),
        409: json(AdminErrorResponseSchema),
        500: json(AdminErrorResponseSchema),
    };
    app.openapi(
        createRoute({
            method: 'get',
            path: '/admin/ai/capability-policies',
            tags: ['Administration'],
            security: [{ bearerAuth: [] }],
            responses: {
                200: json(
                    z.object({ policies: z.array(CapabilityPolicySchema) }),
                ),
                ...errors,
            },
        }),
        async (c) => {
            const token = options.policy.parseBearerAuthorization(
                c.req.header('Authorization') ?? null,
            );
            await options.administration.authorizeOperation(
                token,
                randomUUID(),
            );
            const policies = await options.database.transaction((tx) =>
                new DrizzleCapabilityPolicyParticipant(tx).list(),
            );
            return c.json({ policies }, 200);
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/admin/ai/capability-policies',
            tags: ['Administration'],
            security: [{ bearerAuth: [] }],
            request: {
                body: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: CapabilityPolicyPublishSchema,
                        },
                    },
                },
            },
            responses: { 200: json(CapabilityPolicySchema), ...errors },
        }),
        async (c) => {
            const origin = c.req.header('Origin');
            if (!origin) throw new InvalidRequestOriginError();
            options.policy.assertCookieRequestOrigin(origin);
            const token = options.policy.parseBearerAuthorization(
                c.req.header('Authorization') ?? null,
            );
            const correlationId = randomUUID();
            const principal =
                await options.administration.authorizeSensitiveOperation(
                    token,
                    correlationId,
                );
            const policy = await options.database.transaction((tx) =>
                new DrizzleCapabilityPolicyParticipant(tx).publish(
                    c.req.valid('json'),
                    principal.actor.id,
                    new Date(),
                    correlationId,
                ),
            );
            return c.json(policy, 200);
        },
    );
    app.use('/admin/ai/accounting-settings', async (c, next) => {
        c.header('Cache-Control', 'no-store');
        await next();
    });
    app.openapi(
        createRoute({
            method: 'get',
            path: '/admin/ai/accounting-settings',
            tags: ['Administration'],
            security: [{ bearerAuth: [] }],
            responses: { 200: json(AiAccountingSettingsSchema), ...errors },
        }),
        async (c) => {
            const token = options.policy.parseBearerAuthorization(
                c.req.header('Authorization') ?? null,
            );
            await options.administration.authorizeOperation(
                token,
                randomUUID(),
            );
            const settings = await options.database.transaction((tx) =>
                new DrizzleCapabilityPolicyParticipant(tx).settings(),
            );
            return c.json(settings, 200);
        },
    );
    app.openapi(
        createRoute({
            method: 'patch',
            path: '/admin/ai/accounting-settings',
            tags: ['Administration'],
            security: [{ bearerAuth: [] }],
            request: {
                body: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: AiAccountingSettingsPublishSchema,
                        },
                    },
                },
            },
            responses: { 200: json(AiAccountingSettingsSchema), ...errors },
        }),
        async (c) => {
            const origin = c.req.header('Origin');
            if (!origin) throw new InvalidRequestOriginError();
            options.policy.assertCookieRequestOrigin(origin);
            const token = options.policy.parseBearerAuthorization(
                c.req.header('Authorization') ?? null,
            );
            const correlationId = randomUUID();
            const principal =
                await options.administration.authorizeSensitiveOperation(
                    token,
                    correlationId,
                );
            const settings = await options.database.transaction((tx) =>
                new DrizzleCapabilityPolicyParticipant(tx).publishSettings(
                    c.req.valid('json'),
                    principal.actor.id,
                    new Date(),
                    correlationId,
                ),
            );
            return c.json(settings, 200);
        },
    );
    return app;
}
