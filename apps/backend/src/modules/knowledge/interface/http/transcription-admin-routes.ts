import { randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import {
    AdminErrorResponseSchema,
    KnowledgeTranscriptionAdminStateSchema,
    KnowledgeTranscriptionAdminPreviewSchema,
    KnowledgeTranscriptionAdminPreviewRequestSchema,
    KnowledgeTranscriptionAdminApplyRequestSchema,
} from '@languon/contracts';
import type { AdministrationService } from '../../../administration/application/administration-service';
import type { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import { mapAdministrationHttpError } from '../../../administration/interface/http/administration-http-error-mapping';
import type { TranscriptionAdminService } from '../../application/transcription-admin-service';

const json = (schema: z.ZodType, description = 'Success') => ({
    content: { 'application/json': { schema } },
    description,
});
const failure = json(
    AdminErrorResponseSchema,
    'Administration request rejected',
);
const errors = {
    400: failure,
    401: failure,
    403: failure,
    409: failure,
    413: failure,
    500: failure,
    503: failure,
};
const body = (schema: z.ZodType) => ({
    required: true as const,
    content: { 'application/json': { schema } },
});
const envelope = () => ({
    error: {
        code: 'invalid_request' as const,
        message: 'The request is invalid.',
        correlationId: randomUUID(),
    },
});
export function createTranscriptionAdminRoutes(options: {
    administration: Pick<
        AdministrationService,
        'authorizeOperation' | 'authorizeSensitiveOperation'
    >;
    policy: AuthHttpPolicy;
    service: TranscriptionAdminService;
}) {
    const app = new OpenAPIHono({
        defaultHook: (result, c) => {
            if (!result.success) return c.json(envelope(), 400);
        },
    });
    app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
        type: 'http',
        scheme: 'bearer',
    });
    for (const path of [
        '/admin/ai/transcription',
        '/admin/ai/transcription/*',
    ]) {
        app.use(path, async (c, next) => {
            c.header('Cache-Control', 'private, no-store');
            c.header('Referrer-Policy', 'no-referrer');
            const origin = c.req.header('Origin');
            if (origin) options.policy.assertCookieRequestOrigin(origin);
            await next();
        });
        app.use(
            path,
            bodyLimit({
                maxSize: 16_000,
                onError: (c) => c.json(envelope(), 413),
            }),
        );
    }
    app.onError((error, c) => {
        if (error instanceof z.ZodError) return c.json(envelope(), 400);
        const mapped = mapAdministrationHttpError(error);
        return c.json(mapped.response(randomUUID()), mapped.status);
    });
    async function authorize(
        header: string | undefined,
        origin: string | undefined,
        sensitive: boolean,
    ) {
        const correlationId = randomUUID();
        if (sensitive) options.policy.assertCookieRequestOrigin(origin ?? null);
        const token = options.policy.parseBearerAuthorization(header ?? null);
        const principal = sensitive
            ? await options.administration.authorizeSensitiveOperation(
                  token,
                  correlationId,
              )
            : await options.administration.authorizeOperation(
                  token,
                  correlationId,
              );
        return {
            userId: principal.actor.id,
            sessionId: principal.sessionId,
            correlationId,
        };
    }
    const security = [{ bearerAuth: [] as string[] }];
    app.openapi(
        createRoute({
            method: 'get',
            path: '/admin/ai/transcription',
            security,
            responses: {
                200: json(KnowledgeTranscriptionAdminStateSchema),
                ...errors,
            },
        }),
        async (c) => {
            await authorize(
                c.req.header('Authorization'),
                c.req.header('Origin'),
                false,
            );
            return c.json(await options.service.read(), 200);
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/admin/ai/transcription/preview',
            security,
            request: {
                body: body(KnowledgeTranscriptionAdminPreviewRequestSchema),
            },
            responses: {
                200: json(KnowledgeTranscriptionAdminPreviewSchema),
                ...errors,
            },
        }),
        async (c) =>
            c.json(
                await options.service.preview(
                    await authorize(
                        c.req.header('Authorization'),
                        c.req.header('Origin'),
                        true,
                    ),
                    c.req.valid('json'),
                ),
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/admin/ai/transcription/apply',
            security,
            request: {
                body: body(KnowledgeTranscriptionAdminApplyRequestSchema),
            },
            responses: {
                200: json(KnowledgeTranscriptionAdminStateSchema),
                ...errors,
            },
        }),
        async (c) =>
            c.json(
                await options.service.apply(
                    await authorize(
                        c.req.header('Authorization'),
                        c.req.header('Origin'),
                        true,
                    ),
                    c.req.valid('json'),
                ),
                200,
            ),
    );
    return app;
}
