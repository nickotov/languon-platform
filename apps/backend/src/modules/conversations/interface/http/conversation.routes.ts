import { randomUUID } from 'node:crypto';
import type { Context } from 'hono';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import { streamSSE } from 'hono/streaming';
import {
    ChatPreferencesSchema,
    ConversationActionQuoteSchema,
    ConversationSourceSchema,
    CreateConversationRequestSchema,
    UpdateConversationRequestSchema,
    SubmitConversationTurnRequestSchema,
    UpdateKnowledgeDraftRequestSchema,
    PublishKnowledgeDraftRequestSchema,
    ConversationSchema,
    ConversationDetailSchema,
    ConversationTurnSchema,
    KnowledgeDraftSchema,
    KnowledgeNoteResponseSchema,
    CopiedAttachmentSchema,
    ConversationTextReferencesResponseSchema,
    ConversationTextReferenceResponseSchema,
} from '@languon/contracts';
import type { ConversationService } from '../../application/conversation-service';
import {
    ConversationActionConfirmationRequired,
    ConversationError,
} from '../../domain/conversation';
import {
    type AuthHttpPolicy,
    InvalidBearerAuthorizationError,
    InvalidRequestOriginError,
} from '../../../authentication/interface/http/auth-http-policy';
import { mapDictionaryHttpError } from '../../../dictionaries/interface/http/dictionary-http-error-mapping';
import { KnowledgeDomainError } from '../../../knowledge/domain/knowledge';

const json = (schema: z.ZodType, description = 'Success') => ({
    description,
    content: { 'application/json': { schema } },
});
const requestBody = (schema: z.ZodType) => ({
    required: true,
    content: { 'application/json': { schema } },
});
const error = json(
    z.object({
        error: z.object({
            code: z.string(),
            message: z.string(),
            requestId: z.string(),
            details: z
                .object({ quote: ConversationActionQuoteSchema })
                .optional(),
        }),
    }),
    'Request failed',
);
const errors = {
    400: error,
    401: error,
    403: error,
    404: error,
    409: error,
    413: error,
    429: error,
    500: error,
    503: error,
};
const id = z.object({ conversationId: z.uuid() });
const draftId = id.extend({ draftId: z.uuid() });
const referenceId = id.extend({ textId: z.uuid() });
const security = [{ bearerAuth: [] as string[] }];
export function createConversationRoutes({
    service,
    policy,
}: {
    service: ConversationService;
    policy: AuthHttpPolicy;
}) {
    const app = new OpenAPIHono({
        defaultHook: (result, c) => {
            if (!result.success)
                return c.json(
                    {
                        error: {
                            code: 'invalid_request',
                            message: 'The request is invalid.',
                            requestId: randomUUID(),
                        },
                    },
                    400,
                );
        },
    });
    app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
    });
    for (const path of [
        '/conversations',
        '/conversations/*',
        '/conversation-settings',
    ]) {
        app.use(path, async (c, next) => {
            c.header('Cache-Control', 'private, no-store');
            c.header('Referrer-Policy', 'no-referrer');
            c.header('X-Content-Type-Options', 'nosniff');
            const origin = c.req.header('Origin');
            if (origin) {
                policy.assertCookieRequestOrigin(origin);
                c.header('Access-Control-Allow-Origin', origin);
                c.header('Vary', 'Origin');
            }
            await next();
        });
        app.use(
            path,
            bodyLimit({
                maxSize: 1_100_000,
                onError: (c) =>
                    c.json(
                        {
                            error: {
                                code: 'invalid_request',
                                message: 'The request body is too large.',
                                requestId: randomUUID(),
                            },
                        },
                        413,
                    ),
            }),
        );
        app.options(path, (c) => {
            c.header(
                'Access-Control-Allow-Methods',
                'GET, POST, PATCH, PUT, DELETE, OPTIONS',
            );
            c.header(
                'Access-Control-Allow-Headers',
                'Authorization, Content-Type, X-Languon-Share-Key, Last-Event-ID',
            );
            return c.body(null, 204);
        });
    }
    app.onError((failure, c) => {
        let status: 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503 = 500;
        let code = 'internal_error';
        let message = 'The request could not be completed.';
        if (
            failure instanceof ConversationError ||
            failure instanceof KnowledgeDomainError
        ) {
            code = failure.code;
            message = failure.message;
            status = code.endsWith('not_found')
                ? 404
                : code === 'rate_limited'
                  ? 429
                  : [
                          'action_confirmation_required',
                          'response_active',
                          'version_conflict',
                          'idempotency_conflict',
                          'deletion_busy',
                      ].includes(code)
                    ? 409
                    : [
                            'service_unavailable',
                            'model_unavailable',
                            'capacity_unavailable',
                        ].includes(code)
                      ? 503
                      : 400;
        } else if (
            failure instanceof InvalidBearerAuthorizationError ||
            mapDictionaryHttpError(failure).status === 401
        ) {
            status = 401;
            code = 'authentication_required';
            message = 'Sign in to continue.';
        } else if (failure instanceof InvalidRequestOriginError) {
            status = 403;
            code = 'invalid_origin';
            message = 'The request origin is not allowed.';
        }
        return c.json(
            {
                error: {
                    code,
                    message,
                    requestId: randomUUID(),
                    ...(failure instanceof
                    ConversationActionConfirmationRequired
                        ? { details: { quote: failure.quote } }
                        : {}),
                },
            },
            status,
        );
    });
    const access = (c: Context) =>
        service.access(
            policy.parseBearerAuthorization(
                c.req.header('Authorization') ?? null,
            ),
            c.req.raw.signal,
            c.req.header('X-Languon-Share-Key'),
        );
    const revalidate = (c: Context) =>
        service.revalidate(
            policy.parseBearerAuthorization(
                c.req.header('Authorization') ?? null,
            ),
            c.req.raw.signal,
            c.req.header('X-Languon-Share-Key'),
        );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/conversations',
            security,
            request: {
                query: z.object({
                    sourceKind: ConversationSourceSchema.shape.kind,
                    sourceId: z.uuid(),
                    shareLocator: ConversationSourceSchema.shape.shareLocator,
                    shareKind: z.enum(['text', 'folder']).optional(),
                }),
            },
            responses: {
                200: json(
                    z.object({ conversations: z.array(ConversationSchema) }),
                ),
                ...errors,
            },
        }),
        async (c) => {
            const q = c.req.valid('query');
            return c.json(
                {
                    conversations: await service.store.list(await access(c), {
                        kind: q.sourceKind,
                        id: q.sourceId,
                        ...(q.shareLocator
                            ? { shareLocator: q.shareLocator }
                            : {}),
                        ...(q.shareKind ? { shareKind: q.shareKind } : {}),
                    }),
                },
                200,
            );
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/conversations',
            security,
            request: { body: requestBody(CreateConversationRequestSchema) },
            responses: {
                200: json(z.object({ conversation: ConversationSchema })),
                ...errors,
            },
        }),
        async (c) =>
            c.json(
                {
                    conversation: await service.store.create(
                        await access(c),
                        CreateConversationRequestSchema.parse(
                            c.req.valid('json'),
                        ),
                    ),
                },
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/conversations/{conversationId}',
            security,
            request: { params: id },
            responses: { 200: json(ConversationDetailSchema), ...errors },
        }),
        async (c) =>
            c.json(
                await service.store.detail(
                    await access(c),
                    c.req.valid('param').conversationId,
                ),
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'patch',
            path: '/conversations/{conversationId}',
            security,
            request: {
                params: id,
                body: requestBody(UpdateConversationRequestSchema),
            },
            responses: {
                200: json(z.object({ conversation: ConversationSchema })),
                ...errors,
            },
        }),
        async (c) =>
            c.json(
                {
                    conversation: await service.store.update(
                        await access(c),
                        c.req.valid('param').conversationId,
                        UpdateConversationRequestSchema.parse(
                            c.req.valid('json'),
                        ),
                    ),
                },
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'delete',
            path: '/conversations/{conversationId}',
            security,
            request: { params: id },
            responses: {
                200: json(z.object({ deleted: z.literal(true) })),
                ...errors,
            },
        }),
        async (c) => {
            await service.store.delete(
                await access(c),
                c.req.valid('param').conversationId,
            );
            return c.json({ deleted: true as const }, 200);
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/conversations/{conversationId}/turns',
            security,
            request: {
                params: id,
                body: requestBody(SubmitConversationTurnRequestSchema),
            },
            responses: {
                200: json(z.object({ turn: ConversationTurnSchema })),
                ...errors,
            },
        }),
        async (c) => {
            const actor = await access(c);
            const lease = await service.admitSubmission(
                actor,
                c.req.raw.signal,
            );
            try {
                return c.json(
                    {
                        turn: await service.store.submit(
                            actor,
                            c.req.valid('param').conversationId,
                            SubmitConversationTurnRequestSchema.parse(
                                c.req.valid('json'),
                            ),
                        ),
                    },
                    200,
                );
            } finally {
                await lease.release();
            }
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/conversations/{conversationId}/turns/{turnId}/stop',
            security,
            request: { params: id.extend({ turnId: z.uuid() }) },
            responses: {
                200: json(z.object({ turn: ConversationTurnSchema })),
                ...errors,
            },
        }),
        async (c) => {
            const p = c.req.valid('param');
            return c.json(
                {
                    turn: await service.store.stop(
                        await access(c),
                        p.conversationId,
                        p.turnId,
                    ),
                },
                200,
            );
        },
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/conversations/{conversationId}/context',
            security,
            request: {
                params: id,
                query: z.object({ query: z.string().max(200).default('') }),
            },
            responses: {
                200: json(
                    z.object({
                        material: z.array(CopiedAttachmentSchema),
                        total: z.number(),
                    }),
                ),
                ...errors,
            },
        }),
        async (c) =>
            c.json(
                await service.store.context(
                    await access(c),
                    c.req.valid('param').conversationId,
                    c.req.valid('query').query,
                ),
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/conversations/{conversationId}/references',
            security,
            request: {
                params: id,
                query: z.object({ q: z.string().max(200).default('') }),
            },
            responses: {
                200: json(ConversationTextReferencesResponseSchema),
                ...errors,
            },
        }),
        async (c) =>
            c.json(
                await service.store.textReferences(
                    await access(c),
                    c.req.valid('param').conversationId,
                    c.req.valid('query').q,
                ),
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/conversations/{conversationId}/references/{textId}',
            security,
            request: { params: referenceId },
            responses: {
                200: json(ConversationTextReferenceResponseSchema),
                ...errors,
            },
        }),
        async (c) => {
            const p = c.req.valid('param');
            return c.json(
                await service.store.textReference(
                    await access(c),
                    p.conversationId,
                    p.textId,
                ),
                200,
            );
        },
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/conversation-settings',
            security,
            responses: {
                200: json(z.object({ preferences: ChatPreferencesSchema })),
                ...errors,
            },
        }),
        async (c) =>
            c.json(
                {
                    preferences: await service.store.settings(
                        (await access(c)).ownerId,
                    ),
                },
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'put',
            path: '/conversation-settings',
            security,
            request: {
                body: requestBody(
                    z.object({ preferences: ChatPreferencesSchema }),
                ),
            },
            responses: {
                200: json(z.object({ preferences: ChatPreferencesSchema })),
                ...errors,
            },
        }),
        async (c) =>
            c.json(
                {
                    preferences: await service.store.settings(
                        (await access(c)).ownerId,
                        z
                            .object({ preferences: ChatPreferencesSchema })
                            .parse(c.req.valid('json')).preferences,
                    ),
                },
                200,
            ),
    );
    app.openapi(
        createRoute({
            method: 'patch',
            path: '/conversations/{conversationId}/drafts/{draftId}',
            security,
            request: {
                params: draftId,
                body: requestBody(UpdateKnowledgeDraftRequestSchema),
            },
            responses: {
                200: json(z.object({ draft: KnowledgeDraftSchema })),
                ...errors,
            },
        }),
        async (c) => {
            const p = c.req.valid('param');
            const input = UpdateKnowledgeDraftRequestSchema.parse(
                c.req.valid('json'),
            );
            return c.json(
                {
                    draft: await service.store.updateDraft(
                        await access(c),
                        p.conversationId,
                        p.draftId,
                        input.expectedVersion,
                        input.content,
                    ),
                },
                200,
            );
        },
    );
    app.openapi(
        createRoute({
            method: 'delete',
            path: '/conversations/{conversationId}/drafts/{draftId}',
            security,
            request: { params: draftId },
            responses: {
                200: json(z.object({ deleted: z.literal(true) })),
                ...errors,
            },
        }),
        async (c) => {
            const p = c.req.valid('param');
            await service.store.discardDraft(
                await access(c),
                p.conversationId,
                p.draftId,
            );
            return c.json({ deleted: true as const }, 200);
        },
    );
    app.openapi(
        createRoute({
            method: 'post',
            path: '/conversations/{conversationId}/drafts/{draftId}/publish',
            security,
            request: {
                params: draftId,
                body: requestBody(PublishKnowledgeDraftRequestSchema),
            },
            responses: { 200: json(KnowledgeNoteResponseSchema), ...errors },
        }),
        async (c) => {
            const p = c.req.valid('param');
            return c.json(
                {
                    note: await service.store.publishDraft(
                        await access(c),
                        p.conversationId,
                        p.draftId,
                        PublishKnowledgeDraftRequestSchema.parse(
                            c.req.valid('json'),
                        ),
                    ),
                },
                200,
            );
        },
    );
    app.openapi(
        createRoute({
            method: 'get',
            path: '/conversations/{conversationId}/events',
            security,
            request: {
                params: id,
                headers: z.object({
                    'last-event-id': z.coerce
                        .number()
                        .int()
                        .nonnegative()
                        .optional(),
                }),
                query: z.object({
                    after: z.coerce.number().int().nonnegative().default(0),
                }),
            },
            responses: {
                200: {
                    description: 'Durable server-sent conversation events',
                    content: { 'text/event-stream': { schema: z.string() } },
                },
                ...errors,
            },
        }),
        async (c) => {
            const actor = await access(c);
            const deadline = Date.now() + 240_000;
            const lease = await service.admitStream(actor, c.req.raw.signal);
            const release = () => {
                c.req.raw.signal.removeEventListener('abort', releaseOnAbort);
                return lease.release();
            };
            const releaseOnAbort = () => {
                void release();
            };
            c.req.raw.signal.addEventListener('abort', releaseOnAbort, {
                once: true,
            });
            try {
                c.req.raw.signal.throwIfAborted();
                const conversationId = c.req.valid('param').conversationId;
                // Spread queued subscribers without exceeding the existing
                // one-second access revalidation bound.
                const queuedPollMs =
                    750 + (Number.parseInt(conversationId.slice(-8), 16) % 251);
                let after = Math.max(
                    c.req.valid('query').after,
                    c.req.valid('header')['last-event-id'] ?? 0,
                );
                const initialDetail = await service.store.detail(
                    actor,
                    conversationId,
                );
                c.req.raw.signal.throwIfAborted();
                const activeTurns = new Map(
                    initialDetail.turns
                        .filter(
                            (turn) =>
                                turn.status === 'queued' ||
                                turn.status === 'running',
                        )
                        .map((turn) => [turn.id, turn.status]),
                );
                const response = streamSSE(c, async (stream) => {
                    stream.onAbort(releaseOnAbort);
                    const expiry = setTimeout(
                        () => stream.abort(),
                        Math.max(0, deadline - Date.now()),
                    );
                    try {
                        let lastZeroSnapshotData: string | undefined;
                        let unchangedPolls = 0;
                        while (!stream.aborted && Date.now() < deadline) {
                            const currentActor = await revalidate(c);
                            if (stream.aborted || Date.now() >= deadline) break;
                            const previousCursor = after;
                            const batch = await service.store.events(
                                currentActor,
                                conversationId,
                                after,
                            );
                            if (stream.aborted || Date.now() >= deadline) break;
                            let emitted = false;
                            for (const event of batch) {
                                if (stream.aborted || Date.now() >= deadline)
                                    break;
                                if (event.type === 'snapshot') {
                                    activeTurns.clear();
                                    for (const turn of event.data.turns) {
                                        if (
                                            turn.status === 'queued' ||
                                            turn.status === 'running'
                                        )
                                            activeTurns.set(
                                                turn.id,
                                                turn.status,
                                            );
                                    }
                                } else if (event.type === 'turn') {
                                    if (
                                        event.data.status === 'queued' ||
                                        event.data.status === 'running'
                                    )
                                        activeTurns.set(
                                            event.data.id,
                                            event.data.status,
                                        );
                                    else activeTurns.delete(event.data.id);
                                }
                                if (
                                    event.type === 'snapshot' &&
                                    event.id === 0
                                ) {
                                    const data = JSON.stringify(event.data);
                                    if (lastZeroSnapshotData === data) continue;
                                    lastZeroSnapshotData = data;
                                } else lastZeroSnapshotData = undefined;
                                await stream.writeSSE({
                                    id: String(event.id),
                                    event: 'conversation',
                                    data: JSON.stringify(event),
                                });
                                emitted = true;
                                after = event.id;
                            }
                            if (stream.aborted || Date.now() >= deadline) break;
                            if (!emitted)
                                await stream.writeSSE({
                                    event: 'heartbeat',
                                    data: '{}',
                                });
                            // A full persisted page may have more replay waiting. Drain only
                            // on cursor progress, and revalidate at the top of every page.
                            if (batch.length >= 100 && after > previousCursor)
                                continue;
                            unchangedPolls = emitted ? 0 : unchangedPolls + 1;
                            // Keep startup and running output responsive. A queued
                            // chat with four unchanged polls uses a spread-out
                            // cadence; every poll still revalidates current access.
                            const fastPoll =
                                [...activeTurns.values()].includes('running') ||
                                (activeTurns.size > 0 && unchangedPolls < 4);
                            await stream.sleep(
                                fastPoll
                                    ? 125
                                    : activeTurns.size > 0
                                      ? queuedPollMs
                                      : 1000,
                            );
                        }
                    } catch (failure) {
                        let status: 401 | 403 | 404 | undefined;
                        if (
                            (failure instanceof ConversationError ||
                                failure instanceof KnowledgeDomainError) &&
                            failure.code.endsWith('not_found')
                        )
                            status = 404;
                        else if (failure instanceof Error) {
                            const mapped = mapDictionaryHttpError(failure);
                            if (mapped.status === 401 || mapped.status === 403)
                                status = mapped.status;
                        }
                        // An ordinary EOF lets the client reconnect after transient failures;
                        // only a terminal access error invalidates the visible conversation.
                        if (!stream.aborted && status) {
                            try {
                                await stream.writeSSE({
                                    event: 'unavailable',
                                    data: JSON.stringify({ status }),
                                });
                            } catch {
                                /* A disconnected subscriber needs no further frames. */
                            }
                        }
                        // Handle inside the callback: Hono's onError path emits raw error text.
                    } finally {
                        clearTimeout(expiry);
                        await release();
                    }
                });
                // streamSSE sets its own cache header. Prevent intermediaries (including
                // Next compression) from buffering small private event batches.
                response.headers.set(
                    'Cache-Control',
                    'private, no-store, no-transform',
                );
                response.headers.set('X-Accel-Buffering', 'no');
                return response;
            } catch (failure) {
                await release();
                throw failure;
            }
        },
    );
    return app;
}
