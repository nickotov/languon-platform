import { Chat } from '@ai-sdk/react';
import { DurableChatTransport } from '../src/fsd/entities/conversation/api/durable-chat-transport';
import {
    conversationUIMessages,
    type ConversationUIMessage,
} from '../src/fsd/entities/conversation/lib/conversation-ui-message';
import { reduceConversationEvent } from '../src/fsd/entities/conversation/lib/reduce-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ConversationDetailSchema } from '@languon/contracts';
import {
    conversationApi,
    ConversationApiError,
} from '../src/fsd/entities/conversation/api/conversation-api';

const id = 'a6e3a080-82b5-4cc6-ab7f-610517abb087';
const date = '2026-10-19T10:00:00.000Z';
const detail = ConversationDetailSchema.parse({
    conversation: {
        id,
        source: { kind: 'text', id },
        preferences: {},
        version: 1,
        createdAt: date,
        updatedAt: date,
    },
    messages: [],
    turns: [],
    drafts: [],
});
const snapshot = {
    id: 1,
    conversationId: id,
    createdAt: date,
    type: 'snapshot',
    data: detail,
};
const canonical = `id: 1\nevent: conversation\ndata: ${JSON.stringify(snapshot)}\n\n`;
const heartbeat = 'event: heartbeat\ndata: {}\n\n';

afterEach(() => vi.unstubAllGlobals());

it('keeps reading production named conversation events across heartbeat and unknown control events', async () => {
    const receive = vi.fn();
    const fetcher = vi
        .fn()
        .mockResolvedValue(
            new Response(
                `${heartbeat}${canonical}${heartbeat}event: future-control\ndata: not-json\n\n${canonical}`,
                { headers: { 'content-type': 'text/event-stream' } },
            ),
        );
    vi.stubGlobal('fetch', fetcher);
    await conversationApi.events(
        'local-token',
        id,
        0,
        receive,
        new AbortController().signal,
    );
    expect(receive).toHaveBeenCalledTimes(2);
    expect(receive).toHaveBeenNthCalledWith(1, snapshot);
    expect(receive).toHaveBeenNthCalledWith(2, snapshot);
});

it('turns in-stream unavailable into a safe terminal access error instead of parsing it as learner content', async () => {
    const receive = vi.fn();
    vi.stubGlobal(
        'fetch',
        vi
            .fn()
            .mockResolvedValue(
                new Response(
                    `${canonical}event: unavailable\ndata: {}\n\n${canonical}`,
                    { headers: { 'content-type': 'text/event-stream' } },
                ),
            ),
    );
    const reading = conversationApi.events(
        'local-token',
        id,
        0,
        receive,
        new AbortController().signal,
    );
    await expect(reading).rejects.toBeInstanceOf(ConversationApiError);
    await expect(reading).rejects.toMatchObject({ status: 404 });
    expect(receive).toHaveBeenCalledTimes(1);
});

it.each([401, 403, 404, 410])(
    'preserves terminal in-stream access status %s when supplied',
    async (status) => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValue(
                    new Response(
                        `event: unavailable\ndata: ${JSON.stringify({ status })}\n\n`,
                        { headers: { 'content-type': 'text/event-stream' } },
                    ),
                ),
        );
        await expect(
            conversationApi.events(
                'local-token',
                id,
                0,
                vi.fn(),
                new AbortController().signal,
            ),
        ).rejects.toMatchObject({ status });
    },
);

it('retains bounded validated error diagnostics and keeps malformed payloads generic', async () => {
    const error = {
        code: 'model_unavailable',
        message: 'Selected model cannot run chat.',
        requestId: id,
        correlationId: 'correlation-test-id',
    };
    vi.stubGlobal(
        'fetch',
        vi
            .fn()
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ error }), { status: 400 }),
            )
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        error: {
                            code: 17,
                            message: '<untrusted>',
                            requestId: {},
                        },
                    }),
                    { status: 503 },
                ),
            ),
    );
    await expect(
        conversationApi.detail('local-token', id),
    ).rejects.toMatchObject({ detail: error });
    await expect(
        conversationApi.detail('local-token', id),
    ).rejects.toMatchObject({
        detail: {
            code: 'service_unavailable',
            message: 'Conversation request failed.',
            correlationId: 'client-request',
        },
    });
});

it('resumes an actual EOF wire stream with its cursor without converting a transient close to access loss', async () => {
    const finalDetail = ConversationDetailSchema.parse({
        ...detail,
        messages: [
            {
                id: '206e752e-d69c-439c-8e74-20ef69cfd907',
                conversationId: id,
                role: 'assistant',
                content: 'Recovered answer',
                attachments: [],
                toolCalls: [],
                status: 'complete',
                sourceVersion: '1',
                sourceProvenance: 'saved',
                createdAt: date,
                turnId: null,
            },
        ],
    });
    const next = { ...snapshot, id: 2, data: finalDetail };
    let attempts = 0;
    const encoder = new TextEncoder();
    const fetcher = vi
        .fn()
        .mockImplementation(async (_input: string, init: RequestInit) => {
            attempts += 1;
            if (attempts === 1)
                return new Response(`${canonical}${heartbeat}`, {
                    headers: { 'content-type': 'text/event-stream' },
                });
            const stream = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(
                        encoder.encode(
                            `id: 2\nevent: conversation\ndata: ${JSON.stringify(next)}\n\n${heartbeat}`,
                        ),
                    );
                    init.signal?.addEventListener(
                        'abort',
                        () => controller.close(),
                        { once: true },
                    );
                },
            });
            return new Response(stream, {
                headers: { 'content-type': 'text/event-stream' },
            });
        });
    vi.stubGlobal('fetch', fetcher);
    const transport = new DurableChatTransport({
        request: (operation) => operation('local-token'),
        onAdmitted: vi.fn(),
    });
    let canonicalDetail = detail;
    const onError = vi.fn();
    const chat: Chat<ConversationUIMessage> = new Chat<ConversationUIMessage>({
        id,
        transport,
        onError,
        onData(part) {
            if (part.type !== 'data-canonical') return;
            canonicalDetail = reduceConversationEvent(
                canonicalDetail,
                part.data,
            )!;
            chat.messages = conversationUIMessages(canonicalDetail);
        },
    });
    const completion = chat.resumeStream();
    try {
        await vi.waitFor(
            () =>
                expect(chat.messages[0]?.parts[0]).toMatchObject({
                    type: 'text',
                    text: 'Recovered answer',
                }),
            { timeout: 3500 },
        );
        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(fetcher.mock.calls[0]?.[0]).toContain('/events?after=0');
        expect(fetcher.mock.calls[1]?.[0]).toContain('/events?after=1');
        expect(onError).not.toHaveBeenCalled();
        expect(chat.messages).toHaveLength(1);
    } finally {
        await chat.stop();
        transport.close();
        await completion;
    }
});
