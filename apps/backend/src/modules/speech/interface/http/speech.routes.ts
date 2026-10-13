import { randomUUID } from 'node:crypto';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import {
    SpeechAvailabilityRequestSchema,
    SpeechAvailabilityResponseSchema,
    SpeechPrepareRequestSchema,
    SpeechConfirmRequestSchema,
    SpeechResponseSchema,
    AdminSpeechListQuerySchema,
    AdminSpeechListResponseSchema,
    AdminSpeechDeleteRequestSchema,
    AdminSpeechDeleteResponseSchema,
} from '@languon/contracts';
import type { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import type { AdministrationService } from '../../../administration/application/administration-service';
import { mapAdministrationHttpError } from '../../../administration/interface/http/administration-http-error-mapping';
import { mapDictionaryHttpError } from '../../../dictionaries/interface/http/dictionary-http-error-mapping';
import { AiCreditInsufficientBalanceError } from '../../../ai-credits/domain/ai-credit';
import { SpeechError } from '../../domain/speech-policy';
import type { SpeechService } from '../../application/speech-service';
import type { SpeechStore, AudioObjectStorage } from '../../application/ports';

const errorSchema = z.object({
    error: z.object({
        code: z.string(),
        message: z.string(),
        correlationId: z.string(),
    }),
});
const errorResponse = {
    description: 'Speech request failed.',
    content: { 'application/json': { schema: errorSchema } },
} as const;
const errors = {
    400: errorResponse,
    401: errorResponse,
    403: errorResponse,
    404: errorResponse,
    409: errorResponse,
    413: errorResponse,
    429: errorResponse,
    503: errorResponse,
} as const;
const bearerSecurity = [{ bearerAuth: [] as string[] }];
const stateResponse = {
    description: 'Pronunciation preparation state.',
    content: { 'application/json': { schema: SpeechResponseSchema } },
} as const;
const params = z.object({ id: z.string().uuid() });
const bytesResponse = {
    description: 'Private pronunciation bytes.',
    content: {
        'audio/mpeg': { schema: z.string().openapi({ format: 'binary' }) },
        'audio/wav': { schema: z.string().openapi({ format: 'binary' }) },
    },
} as const;

export function createSpeechRoutes(options: {
    service: SpeechService;
    policy: AuthHttpPolicy;
    authenticate: (accessToken: string) => Promise<string>;
}): OpenAPIHono {
    const app = new OpenAPIHono({
        defaultHook: (result, c) => {
            if (!result.success)
                return c.json(
                    {
                        error: {
                            code: 'invalid_request',
                            message: 'The request is invalid.',
                            correlationId: randomUUID(),
                        },
                    },
                    400,
                );
        },
    });
    app.use(
        '*',
        bodyLimit({
            maxSize: 64 * 1024,
            onError: (c) =>
                c.json(
                    {
                        error: {
                            code: 'request_too_large',
                            message: 'The request is too large.',
                            correlationId: randomUUID(),
                        },
                    },
                    413,
                ),
        }),
    );
    app.use('*', async (c, next) => {
        c.header('Cache-Control', 'private, no-store');
        c.header('X-Content-Type-Options', 'nosniff');
        const origin = c.req.header('Origin');
        if (origin) {
            options.policy.assertCookieRequestOrigin(origin);
            c.header('Access-Control-Allow-Origin', origin);
            c.header('Access-Control-Allow-Credentials', 'true');
            c.header(
                'Access-Control-Expose-Headers',
                'Cache-Control, Content-Type, X-Content-Type-Options',
            );
            c.header('Vary', 'Origin');
        }
        await next();
    });
    app.onError((error, c) => {
        if (error instanceof SpeechError)
            return c.json(
                {
                    error: {
                        code: error.code,
                        message:
                            'Pronunciation is unavailable for this request.',
                        correlationId: randomUUID(),
                    },
                },
                error.status,
            );
        if (error instanceof AiCreditInsufficientBalanceError)
            return c.json(
                {
                    error: {
                        code: 'ai_credits_exhausted',
                        message: 'Your available credits are insufficient.',
                        correlationId: randomUUID(),
                    },
                },
                409,
            );
        const mapped = mapDictionaryHttpError(error);
        return c.json(mapped.response(randomUUID()), mapped.status);
    });
    const actor = (authorization: string | undefined) =>
        options.authenticate(
            options.policy.parseBearerAuthorization(authorization ?? null),
        );
    // Keep preflight scoped to this module so other modules retain their policy.
    app.options('/speech/*', (c) => {
        const origin = c.req.header('Origin');
        options.policy.assertCookieRequestOrigin(origin ?? null);
        c.header('Access-Control-Allow-Origin', origin!);
        c.header('Access-Control-Allow-Credentials', 'true');
        c.header(
            'Access-Control-Allow-Headers',
            'Authorization, Content-Type, X-Correlation-ID',
        );
        c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        c.header('Vary', 'Origin');
        return c.body(null, 204);
    });
    app.openapi(
        createRoute({
            method: 'post',
            path: '/speech/availability',
            tags: ['Speech'],
            security: bearerSecurity,
            request: {
                body: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: SpeechAvailabilityRequestSchema,
                        },
                    },
                },
            },
            responses: {
                ...errors,
                200: {
                    description: 'Supported authorized speech sources.',
                    content: {
                        'application/json': {
                            schema: SpeechAvailabilityResponseSchema,
                        },
                    },
                },
            },
        }),
        async (c) =>
            c.json(
                await options.service.availability(
                    await actor(c.req.header('Authorization')),
                    c.req.valid('json').sources,
                ),
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/speech/prepare',
            tags: ['Speech'],
            security: bearerSecurity,
            request: {
                body: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: SpeechPrepareRequestSchema,
                        },
                    },
                },
            },
            responses: { ...errors, 200: stateResponse, 202: stateResponse },
        }),
        async (c) => {
            const result = await options.service.prepare(
                await actor(c.req.header('Authorization')),
                c.req.valid('json'),
            );
            return c.json(
                result,
                ['queued', 'processing'].includes(result.state) ? 202 : 200,
            );
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/speech/confirm',
            tags: ['Speech'],
            security: bearerSecurity,
            request: {
                body: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: SpeechConfirmRequestSchema,
                        },
                    },
                },
            },
            responses: { ...errors, 200: stateResponse, 202: stateResponse },
        }),
        async (c) => {
            const result = await options.service.confirm(
                await actor(c.req.header('Authorization')),
                c.req.valid('json'),
            );
            return c.json(
                result,
                ['queued', 'processing'].includes(result.state) ? 202 : 200,
            );
        },
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/speech/requests/{id}',
            tags: ['Speech'],
            security: bearerSecurity,
            request: { params },
            responses: { ...errors, 200: stateResponse },
        }),
        async (c) =>
            c.json(
                await options.service.status(
                    await actor(c.req.header('Authorization')),
                    c.req.valid('param').id,
                ),
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/speech/playbacks/{id}/content',
            tags: ['Speech'],
            security: bearerSecurity,
            request: { params },
            responses: { ...errors, 200: bytesResponse },
        }),
        async (c) => {
            const result = await options.service.content(
                await actor(c.req.header('Authorization')),
                c.req.valid('param').id,
                c.req.raw.signal,
            );
            c.header('Content-Type', result.audio.mimeType);
            c.header('Content-Length', String(result.audio.bytes.length));
            c.header('X-Speech-Fixture', String(result.fixture));
            return c.body(new Uint8Array(result.audio.bytes), 200);
        },
    );
    return app;
}

export function createAdminSpeechRoutes(options: {
    store: SpeechStore;
    storage: AudioObjectStorage;
    administration: AdministrationService;
    policy: AuthHttpPolicy;
    now?: () => Date;
}): OpenAPIHono {
    const now = options.now ?? (() => new Date());
    const app = new OpenAPIHono({
        defaultHook: (result, c) => {
            if (!result.success)
                return c.json(
                    {
                        error: {
                            code: 'invalid_request',
                            message: 'The request is invalid.',
                            correlationId: randomUUID(),
                        },
                    },
                    400,
                );
        },
    });
    app.use('*', bodyLimit({ maxSize: 64 * 1024 }));
    app.use('*', async (c, next) => {
        c.header('Cache-Control', 'private, no-store');
        for (const [name, value] of Object.entries(
            options.policy.securityHeaders(),
        ))
            c.header(name, value);
        const origin = c.req.header('Origin');
        if (origin) {
            options.policy.assertCookieRequestOrigin(origin);
            c.header('Access-Control-Allow-Origin', origin);
            c.header('Access-Control-Allow-Credentials', 'true');
            c.header('Vary', 'Origin');
        }
        await next();
    });
    app.onError((error, c) => {
        if (error instanceof SpeechError)
            return c.json(
                {
                    error: {
                        code: error.code,
                        message: 'Refresh the audio selection and try again.',
                        correlationId: randomUUID(),
                    },
                },
                error.status,
            );
        const mapped = mapAdministrationHttpError(error);
        return c.json(mapped.response(randomUUID()), mapped.status);
    });
    const token = (authorization: string | undefined) =>
        options.policy.parseBearerAuthorization(authorization ?? null);
    app.openapi(
        createRoute({
            method: 'get',
            path: '/admin/speech/recordings',
            tags: ['Admin speech'],
            security: bearerSecurity,
            request: { query: AdminSpeechListQuerySchema },
            responses: {
                ...errors,
                200: {
                    description: 'Retained audio inventory.',
                    content: {
                        'application/json': {
                            schema: AdminSpeechListResponseSchema,
                        },
                    },
                },
            },
        }),
        async (c) => {
            await options.administration.authorizeOperation(
                token(c.req.header('Authorization')),
                randomUUID(),
            );
            return c.json(
                await options.store.listRecordings(c.req.valid('query')),
                200,
            );
        },
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/admin/speech/recordings/{id}/content',
            tags: ['Admin speech'],
            security: bearerSecurity,
            request: { params },
            responses: { ...errors, 200: bytesResponse },
        }),
        async (c) => {
            const accessToken = token(c.req.header('Authorization'));
            await options.administration.authorizeOperation(
                accessToken,
                randomUUID(),
            );
            const reference = await options.store.adminPlayback(
                    c.req.valid('param').id,
                ),
                audio = await options.storage.read(reference, c.req.raw.signal);
            if (!audio)
                throw new SpeechError('speech_recording_unavailable', 404);
            await options.administration.authorizeOperation(
                accessToken,
                randomUUID(),
            );
            await options.store.adminPlayback(c.req.valid('param').id);
            c.header('Content-Type', audio.mimeType);
            c.header('Content-Length', String(audio.bytes.length));
            return c.body(new Uint8Array(audio.bytes), 200);
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/admin/speech/recordings/delete',
            tags: ['Admin speech'],
            security: bearerSecurity,
            request: {
                body: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: AdminSpeechDeleteRequestSchema,
                        },
                    },
                },
            },
            responses: {
                ...errors,
                200: {
                    description: 'Recording removals.',
                    content: {
                        'application/json': {
                            schema: AdminSpeechDeleteResponseSchema,
                        },
                    },
                },
            },
        }),
        async (c) => {
            options.policy.assertCookieRequestOrigin(
                c.req.header('Origin') ?? null,
            );
            const correlationId = randomUUID();
            const { actor } =
                await options.administration.authorizeSensitiveOperation(
                    token(c.req.header('Authorization')),
                    correlationId,
                );
            const input = c.req.valid('json');
            const selected = await options.store.markDeleting({
                recordings: input.recordings,
                audit: {
                    actorId: actor.id,
                    correlationId,
                    reason: input.reason,
                    occurredAt: now(),
                },
            });
            for (const target of selected) {
                await options.storage.delete(target.storage);
                await options.store.deleted(target.id, now());
            }
            return c.json({ deletedIds: selected.map((item) => item.id) }, 200);
        },
    );
    return app;
}
