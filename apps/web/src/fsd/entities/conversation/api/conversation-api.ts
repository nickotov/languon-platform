import { BrowserApiError } from '@languon/browser-auth';
import {
    ChatPreferencesResponseSchema,
    ConversationErrorResponseSchema,
    ConversationStreamUnavailableSchema,
    type ConversationErrorDetail,
    TextAiPreferenceResponseSchema,
    ConversationDetailSchema,
    ConversationEventSchema,
    ConversationResponseSchema,
    ListConversationsResponseSchema,
    ConversationTurnResponseSchema,
    ConversationContextResponseSchema,
    ConversationTextReferencesResponseSchema,
    ConversationTextReferenceResponseSchema,
    KnowledgeDraftResponseSchema,
    KnowledgeNoteResponseSchema,
    ConversationDeletedResponseSchema,
    CreateConversationRequestSchema,
    UpdateConversationRequestSchema,
    SubmitConversationTurnRequestSchema,
    UpdateKnowledgeDraftRequestSchema,
    PublishKnowledgeDraftRequestSchema,
    type ChatPreferences,
    type ConversationEvent,
    type ConversationSource,
    type KnowledgeNoteContent,
    type PublishKnowledgeDraftRequest,
    type SubmitConversationTurnRequest,
} from '@languon/contracts';
import { resolveApiUrl } from '@/fsd/shared/api/api-url';
import { readEventStream } from '../lib/read-event-stream';

type Schema<T> = { parse(value: unknown): T };
export type ConversationSessionRequest = <T>(
    operation: (token: string) => Promise<T>,
) => Promise<T>;
export class ConversationApiError extends BrowserApiError<
    ConversationErrorDetail & { correlationId: string }
> {
    public override readonly name = 'ConversationApiError';
}
const base = resolveApiUrl(
    process.env.NODE_ENV,
    process.env.NEXT_PUBLIC_API_URL,
);
function headers(token: string, shareKey?: string) {
    return {
        Authorization: `Bearer ${token}`,
        ...(shareKey ? { 'X-Languon-Share-Key': shareKey } : {}),
    };
}
async function assertResponse(response: Response) {
    if (response.ok) return;
    const body: unknown = await response.json().catch(() => null);
    const parsed = ConversationErrorResponseSchema.safeParse(body);
    const error: ConversationErrorDetail = parsed.success
        ? parsed.data.error
        : {
              code: 'service_unavailable',
              message: 'Conversation request failed.',
          };
    throw new ConversationApiError(response.status, {
        ...error,
        correlationId:
            error.correlationId ??
            response.headers.get('x-correlation-id') ??
            error.requestId ??
            'client-request',
    });
}
async function request<T>(
    token: string,
    path: string,
    schema: Schema<T>,
    options: {
        method?: string;
        body?: unknown;
        shareKey?: string | undefined;
        signal?: AbortSignal | undefined;
    } = {},
) {
    const response = await fetch(`${base}${path}`, {
        method: options.method ?? 'GET',
        cache: 'no-store',
        credentials: 'include',
        headers: {
            ...headers(token, options.shareKey),
            Accept: 'application/json',
            ...(options.body === undefined
                ? {}
                : { 'Content-Type': 'application/json' }),
        },
        ...(options.body === undefined
            ? {}
            : { body: JSON.stringify(options.body) }),
        signal: options.signal ?? AbortSignal.timeout(30_000),
    });
    await assertResponse(response);
    return schema.parse(await response.json());
}
export const conversationApi = {
    readModelPreference: (token: string, signal?: AbortSignal) =>
        request(
            token,
            '/users/me/ai-model-preference',
            TextAiPreferenceResponseSchema,
            { signal },
        ),
    list(
        token: string,
        source: ConversationSource,
        shareKey?: string,
        signal?: AbortSignal,
    ) {
        const query = new URLSearchParams({
            sourceKind: source.kind,
            sourceId: source.id,
        });
        if (source.shareLocator) query.set('shareLocator', source.shareLocator);
        if (source.shareKind) query.set('shareKind', source.shareKind);
        return request(
            token,
            `/conversations?${query}`,
            ListConversationsResponseSchema,
            { shareKey, signal },
        );
    },
    create: (token: string, source: ConversationSource, shareKey?: string) =>
        request(token, '/conversations', ConversationResponseSchema, {
            method: 'POST',
            body: CreateConversationRequestSchema.parse({ source }),
            shareKey,
        }),
    detail: (
        token: string,
        id: string,
        shareKey?: string,
        signal?: AbortSignal,
    ) =>
        request(token, `/conversations/${id}`, ConversationDetailSchema, {
            shareKey,
            signal,
        }),
    update: (
        token: string,
        id: string,
        preferences: ChatPreferences,
        shareKey?: string,
    ) =>
        request(token, `/conversations/${id}`, ConversationResponseSchema, {
            method: 'PATCH',
            body: UpdateConversationRequestSchema.parse({ preferences }),
            shareKey,
        }),
    rename: (token: string, id: string, title: string, shareKey?: string) =>
        request(token, `/conversations/${id}`, ConversationResponseSchema, {
            method: 'PATCH',
            body: UpdateConversationRequestSchema.parse({ title }),
            shareKey,
        }),
    delete: (token: string, id: string, shareKey?: string) =>
        request(
            token,
            `/conversations/${id}`,
            ConversationDeletedResponseSchema,
            { method: 'DELETE', shareKey },
        ),
    submit: (
        token: string,
        id: string,
        body: SubmitConversationTurnRequest,
        shareKey?: string,
    ) =>
        request(
            token,
            `/conversations/${id}/turns`,
            ConversationTurnResponseSchema,
            {
                method: 'POST',
                body: SubmitConversationTurnRequestSchema.parse(body),
                shareKey,
            },
        ),
    stop: (token: string, id: string, turnId: string, shareKey?: string) =>
        request(
            token,
            `/conversations/${id}/turns/${turnId}/stop`,
            ConversationTurnResponseSchema,
            { method: 'POST', body: {}, shareKey },
        ),
    context: (
        token: string,
        id: string,
        query: string,
        shareKey?: string,
        signal?: AbortSignal,
    ) =>
        request(
            token,
            `/conversations/${id}/context?${new URLSearchParams({ query })}`,
            ConversationContextResponseSchema,
            { shareKey, signal },
        ),
    references: (
        token: string,
        conversationId: string,
        query: string,
        signal?: AbortSignal,
    ) =>
        request(
            token,
            `/conversations/${conversationId}/references?${new URLSearchParams({ q: query })}`,
            ConversationTextReferencesResponseSchema,
            { signal },
        ),
    reference: (
        token: string,
        conversationId: string,
        textId: string,
        signal?: AbortSignal,
    ) =>
        request(
            token,
            `/conversations/${conversationId}/references/${textId}`,
            ConversationTextReferenceResponseSchema,
            { signal },
        ),
    readDefaults: (token: string, signal?: AbortSignal) =>
        request(
            token,
            '/conversation-settings',
            ChatPreferencesResponseSchema,
            { signal },
        ),
    saveDefaults: (token: string, preferences: ChatPreferences) =>
        request(
            token,
            '/conversation-settings',
            ChatPreferencesResponseSchema,
            {
                method: 'PUT',
                body: ChatPreferencesResponseSchema.parse({ preferences }),
            },
        ),
    updateDraft: (
        token: string,
        id: string,
        draftId: string,
        expectedVersion: number,
        content: KnowledgeNoteContent,
        shareKey?: string,
    ) =>
        request(
            token,
            `/conversations/${id}/drafts/${draftId}`,
            KnowledgeDraftResponseSchema,
            {
                method: 'PATCH',
                body: UpdateKnowledgeDraftRequestSchema.parse({
                    expectedVersion,
                    content,
                }),
                shareKey,
            },
        ),
    publishDraft: (
        token: string,
        id: string,
        draftId: string,
        body: PublishKnowledgeDraftRequest,
        shareKey?: string,
    ) =>
        request(
            token,
            `/conversations/${id}/drafts/${draftId}/publish`,
            KnowledgeNoteResponseSchema,
            {
                method: 'POST',
                body: PublishKnowledgeDraftRequestSchema.parse(body),
                shareKey,
            },
        ),
    deleteDraft: (
        token: string,
        id: string,
        draftId: string,
        shareKey?: string,
    ) =>
        request(
            token,
            `/conversations/${id}/drafts/${draftId}`,
            ConversationDeletedResponseSchema,
            { method: 'DELETE', shareKey },
        ),
    async events(
        token: string,
        id: string,
        after: number,
        onEvent: (event: ConversationEvent) => void,
        signal: AbortSignal,
        shareKey?: string,
    ) {
        const response = await fetch(
            `${base}/conversations/${id}/events?after=${after}`,
            {
                cache: 'no-store',
                credentials: 'include',
                headers: {
                    ...headers(token, shareKey),
                    Accept: 'text/event-stream',
                },
                signal,
            },
        );
        await assertResponse(response);
        if (
            !response.headers.get('content-type')?.includes('text/event-stream')
        )
            throw new Error('Invalid stream response');
        await readEventStream(
            response,
            (event) => {
                if (event.event === 'unavailable') {
                    let raw: unknown;
                    try {
                        raw = JSON.parse(event.data);
                    } catch {
                        /* Legacy/invalid controls fail closed. */
                    }
                    const control =
                        ConversationStreamUnavailableSchema.safeParse(raw);
                    const status = control.success
                        ? (control.data.status ?? 404)
                        : 404;
                    throw new ConversationApiError(status, {
                        code: 'conversation_not_found',
                        message: 'This conversation is unavailable.',
                        correlationId:
                            response.headers.get('x-correlation-id') ??
                            'conversation-stream',
                    });
                }
                // SSE controls are not canonical conversation data. Heartbeats keep
                // the connection alive; unknown named controls are forward-compatible.
                if (event.event !== 'conversation') return;
                onEvent(ConversationEventSchema.parse(JSON.parse(event.data)));
            },
            signal,
        );
    },
};
