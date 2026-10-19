import { Chat } from '@ai-sdk/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    ConversationDetailSchema,
    type ConversationEvent,
} from '@languon/contracts';
import {
    conversationApi,
    ConversationApiError,
} from '../src/fsd/entities/conversation/api/conversation-api';
import { DurableChatTransport } from '../src/fsd/entities/conversation/api/durable-chat-transport';
import {
    conversationUIMessages,
    type ConversationUIMessage,
} from '../src/fsd/entities/conversation/lib/conversation-ui-message';
import { reduceConversationEvent } from '../src/fsd/entities/conversation/lib/reduce-event';

const conversationId = 'a6e3a080-82b5-4cc6-ab7f-610517abb087';
const turnId = '206e752e-d69c-439c-8e74-20ef69cfd907';
const messageId = 'b32f30f1-336b-4727-91f0-ebc84d11685a';
const date = '2026-10-19T10:00:00.000Z';
const initial = ConversationDetailSchema.parse({
    conversation: {
        id: conversationId,
        source: { kind: 'text', id: conversationId },
        preferences: {},
        version: 1,
        createdAt: date,
        updatedAt: date,
    },
    messages: [],
    turns: [],
    drafts: [],
});
const turn = {
    id: turnId,
    conversationId,
    modelId: 'deepseek/flash',
    status: 'queued' as const,
    failureCode: null,
    usage: {
        inputTokens: 0,
        outputTokens: 0,
        chargedCredits: '0',
        estimated: false,
    },
    createdAt: date,
    updatedAt: date,
};
const message = {
    id: messageId,
    conversationId,
    role: 'assistant' as const,
    content: 'Hello',
    attachments: [
        {
            id: turnId,
            label: 'Source',
            content: '<script>plain copied text</script>',
        },
    ],
    toolCalls: [
        {
            id: 'tool-1',
            name: 'read_source_context' as const,
            state: 'succeeded' as const,
        },
    ],
    status: 'complete' as const,
    sourceVersion: '1',
    sourceProvenance: 'saved' as const,
    createdAt: date,
    turnId,
};
const event: ConversationEvent = {
    id: 2,
    conversationId,
    createdAt: date,
    type: 'message',
    data: message,
};

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('durable AI SDK UI transport', () => {
    it('admits once with the stable request ID, replaces canonical replay, and detaches without cancelling server work', async () => {
        const submit = vi
            .spyOn(conversationApi, 'submit')
            .mockResolvedValue({ turn });
        const stopServer = vi.spyOn(conversationApi, 'stop');
        const events = vi
            .spyOn(conversationApi, 'events')
            .mockImplementation(
                async (_token, _id, _after, receive, signal) => {
                    receive({
                        id: 1,
                        conversationId,
                        createdAt: date,
                        type: 'snapshot',
                        data: initial,
                    });
                    receive(event);
                    receive(event); // A replayed ID must not append the text/tool output twice.
                    await new Promise<void>((resolve) =>
                        signal.addEventListener('abort', () => resolve(), {
                            once: true,
                        }),
                    );
                },
            );
        const admitted = vi.fn();
        const transport = new DurableChatTransport({
            request: (operation) => operation('local-token'),
            onAdmitted: admitted,
        });
        let canonical = initial;
        const chat: Chat<ConversationUIMessage> =
            new Chat<ConversationUIMessage>({
                id: conversationId,
                transport,
                sendAutomaticallyWhen: () => false,
                onData(part) {
                    if (part.type !== 'data-canonical') return;
                    canonical = reduceConversationEvent(canonical, part.data)!;
                    chat.messages = conversationUIMessages(canonical);
                },
            });
        const requestId = '82953067-877d-419b-baf9-a27bbde32e89';
        const completion = chat.sendMessage(
            { text: 'Explain this' },
            {
                body: {
                    turn: {
                        requestId,
                        content: 'Explain this',
                        attachments: [],
                    },
                },
            },
        );
        await vi.waitFor(() => expect(chat.messages[0]?.id).toBe(messageId));
        expect(submit).toHaveBeenCalledTimes(1);
        expect(submit.mock.calls[0]?.[2].requestId).toBe(requestId);
        expect(admitted).toHaveBeenCalledWith(turn);
        expect(chat.messages).toHaveLength(1);
        expect(
            chat.messages[0]?.parts.filter((part) => part.type === 'text'),
        ).toEqual([{ type: 'text', text: 'Hello' }]);
        expect(
            chat.messages[0]?.parts.find(
                (part) => part.type === 'tool-read_source_context',
            ),
        ).toMatchObject({ state: 'output-available', providerExecuted: true });
        await chat.stop();
        transport.close();
        await completion;
        expect(events).toHaveBeenCalledTimes(1);
        expect(stopServer).not.toHaveBeenCalled();
    });

    it('resumes from canonical snapshots without admitting another provider call', async () => {
        const submit = vi.spyOn(conversationApi, 'submit');
        vi.spyOn(conversationApi, 'events').mockImplementation(
            async (_token, _id, _after, receive, signal) => {
                receive({
                    id: 2,
                    conversationId,
                    createdAt: date,
                    type: 'snapshot',
                    data: { ...initial, messages: [message] },
                });
                await new Promise<void>((resolve) =>
                    signal.addEventListener('abort', () => resolve(), {
                        once: true,
                    }),
                );
            },
        );
        const transport = new DurableChatTransport({
            request: (operation) => operation('local-token'),
            onAdmitted: vi.fn(),
        });
        const stream = await transport.reconnectToStream({
            chatId: conversationId,
        });
        const reader = stream!.getReader();
        await reader.read(); // Connection state.
        const chunk = await reader.read();
        expect(chunk.value).toMatchObject({
            type: 'data-canonical',
            data: { type: 'snapshot' },
        });
        await reader.cancel();
        expect(submit).not.toHaveBeenCalled();
    });
    it('recovers a transient SSE failure from its cursor without admission or duplicated answer/tool parts', async () => {
        const submit = vi.spyOn(conversationApi, 'submit');
        const connections: boolean[] = [];
        const received: number[] = [];
        const partial: ConversationEvent = {
            ...event,
            data: {
                ...message,
                content: 'Hel',
                status: 'streaming',
                toolCalls: [
                    {
                        id: 'tool-1',
                        name: 'read_source_context',
                        state: 'running',
                    },
                ],
            },
        };
        const finished: ConversationEvent = { ...event, id: 3 };
        const terminal: ConversationEvent = {
            id: 4,
            conversationId,
            createdAt: date,
            type: 'turn',
            data: { ...turn, status: 'succeeded' },
        };
        let attempts = 0;
        const events = vi
            .spyOn(conversationApi, 'events')
            .mockImplementation(async (_token, _id, after, receive, signal) => {
                attempts += 1;
                if (attempts === 1) {
                    expect(after).toBe(0);
                    receive({
                        id: 1,
                        conversationId,
                        createdAt: date,
                        type: 'snapshot',
                        data: initial,
                    });
                    receive(partial);
                    throw new TypeError('Network connection interrupted');
                }
                expect(after).toBe(2);
                receive(partial); // The old message/tool state must not be processed twice.
                receive(finished);
                receive(terminal);
                await new Promise<void>((resolve) =>
                    signal.addEventListener('abort', () => resolve(), {
                        once: true,
                    }),
                );
            });
        const transport = new DurableChatTransport({
            request: (operation) => operation('local-token'),
            onAdmitted: vi.fn(),
        });
        let canonical = initial;
        const chat: Chat<ConversationUIMessage> =
            new Chat<ConversationUIMessage>({
                id: conversationId,
                transport,
                sendAutomaticallyWhen: () => false,
                onData(part) {
                    if (part.type === 'data-connection')
                        connections.push(part.data.reconnecting);
                    if (part.type !== 'data-canonical') return;
                    received.push(part.data.id);
                    canonical = reduceConversationEvent(canonical, part.data)!;
                    chat.messages = conversationUIMessages(canonical);
                },
            });
        const completion = chat.resumeStream();
        try {
            await vi.waitFor(
                () => expect(canonical.turns[0]?.status).toBe('succeeded'),
                { timeout: 3500 },
            );
            expect(events).toHaveBeenCalledTimes(2);
            expect(events.mock.calls.map((call) => call[2])).toEqual([0, 2]);
            expect(received).toEqual([1, 2, 3, 4]);
            expect(connections).toContain(true);
            expect(connections.at(-1)).toBe(false);
            expect(chat.messages).toHaveLength(1);
            expect(
                chat.messages[0]?.parts.filter((part) => part.type === 'text'),
            ).toEqual([{ type: 'text', text: 'Hello' }]);
            expect(
                chat.messages[0]?.parts.filter(
                    (part) => part.type === 'tool-read_source_context',
                ),
            ).toHaveLength(1);
            expect(
                chat.messages[0]?.parts.find(
                    (part) => part.type === 'tool-read_source_context',
                ),
            ).toMatchObject({ state: 'output-available' });
            expect(submit).not.toHaveBeenCalled();
        } finally {
            await chat.stop();
            transport.close();
            await completion;
        }
    });

    it.each([401, 403, 404, 410])(
        'ends the SDK subscription after terminal access error %s without retrying',
        async (status) => {
            vi.useFakeTimers();
            const error = new ConversationApiError(status, {
                code: 'source_access_denied',
                message: 'Source unavailable.',
                correlationId: 'transport-access-test',
            });
            const events = vi
                .spyOn(conversationApi, 'events')
                .mockRejectedValue(error);
            const submit = vi.spyOn(conversationApi, 'submit');
            const onError = vi.fn();
            const transport = new DurableChatTransport({
                request: (operation) => operation('local-token'),
                onAdmitted: vi.fn(),
            });
            const chat = new Chat<ConversationUIMessage>({
                id: conversationId,
                transport,
                onError,
            });
            await chat.resumeStream();
            expect(onError).toHaveBeenCalledExactlyOnceWith(error);
            expect(chat.status).toBe('error');
            await vi.advanceTimersByTimeAsync(10_000);
            expect(events).toHaveBeenCalledTimes(1);
            expect(submit).not.toHaveBeenCalled();
            transport.close();
        },
    );
});
