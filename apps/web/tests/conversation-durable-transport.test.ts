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
import { DurableMessageProjection } from '../src/fsd/entities/conversation/lib/durable-message-projection';
import { reduceConversationEvent } from '../src/fsd/entities/conversation/lib/reduce-event';

const conversationId = 'a6e3a080-82b5-4cc6-ab7f-610517abb087';
const turnId = '206e752e-d69c-439c-8e74-20ef69cfd907';
const messageId = 'b32f30f1-336b-4727-91f0-ebc84d11685a';
const date = '2026-10-19T10:00:00.000Z';
const initial = ConversationDetailSchema.parse({
    conversation: {
        id: conversationId,
        title: null,
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
    modelId: null,
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
                    if (part.type === 'data-reconcile') {
                        chat.messages = conversationUIMessages(part.data);
                    }
                    if (part.type !== 'data-canonical') return;
                    canonical = reduceConversationEvent(canonical, part.data)!;
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
        ).toEqual([
            expect.objectContaining({
                type: 'text',
                text: 'Hello',
                state: 'done',
            }),
        ]);
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
                    if (part.type === 'data-reconcile')
                        chat.messages = conversationUIMessages(part.data);
                    if (part.type !== 'data-canonical') return;
                    received.push(part.data.id);
                    canonical = reduceConversationEvent(canonical, part.data)!;
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
            ).toEqual([
                expect.objectContaining({
                    type: 'text',
                    text: 'Hello',
                    state: 'done',
                }),
            ]);
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

    it('updates the actual SDK progressively without canonical resets and safely rebuilds truncation or a later turn', async () => {
        let receive!: (event: ConversationEvent) => void;
        vi.spyOn(conversationApi, 'events').mockImplementation(
            async (_token, _id, _after, onEvent, signal) => {
                receive = onEvent;
                onEvent({
                    id: 1,
                    conversationId,
                    createdAt: date,
                    type: 'snapshot',
                    data: initial,
                });
                await new Promise<void>((resolve) =>
                    signal.addEventListener('abort', () => resolve(), {
                        once: true,
                    }),
                );
            },
        );
        const reconciliations = vi.fn();
        const transport = new DurableChatTransport({
            request: (operation) => operation('local-token'),
            onAdmitted: vi.fn(),
        });
        const chat: Chat<ConversationUIMessage> =
            new Chat<ConversationUIMessage>({
                id: conversationId,
                transport,
                onData(part) {
                    if (part.type === 'data-reconcile') {
                        reconciliations();
                        chat.messages = conversationUIMessages(part.data);
                    }
                },
            });
        const completion = chat.resumeStream();
        function update(
            id: number,
            content: string,
            status: 'streaming' | 'complete' | 'incomplete' = 'streaming',
            assistantId = messageId,
        ) {
            receive({
                ...event,
                id,
                data: {
                    ...message,
                    id: assistantId,
                    content,
                    status,
                    toolCalls: [],
                },
            });
        }
        const text = (index = 0) =>
            chat.messages[index]?.parts
                .filter((part) => part.type === 'text')
                .map((part) => part.text)
                .join('');
        try {
            await vi.waitFor(() => expect(receive).toBeDefined());
            update(2, 'Hel');
            await vi.waitFor(() => expect(text()).toBe('Hel'));
            update(3, 'Hello');
            await vi.waitFor(() => expect(text()).toBe('Hello'));
            receive({
                ...event,
                id: 999,
                conversationId: '397ec960-17c8-47b8-836d-a1627a361c45',
            });
            update(2, 'Old replay');
            update(3, 'Repeated ID');
            update(4, 'Hello world');
            await vi.waitFor(() => expect(text()).toBe('Hello world'));
            receive({
                id: 1,
                conversationId,
                createdAt: date,
                type: 'snapshot',
                data: initial,
            });
            expect(reconciliations).toHaveBeenCalledTimes(1);
            // A canonical restart/truncation replaces text rather than appending it.
            update(5, 'New');
            await vi.waitFor(() => expect(text()).toBe('New'));
            update(6, 'New answer', 'incomplete');
            await vi.waitFor(() =>
                expect(chat.messages[0]?.metadata?.status).toBe('incomplete'),
            );
            expect(text()).toBe('New answer');
            expect(
                chat.messages[0]?.parts.filter((part) => part.type === 'text'),
            ).toHaveLength(1);
            update(
                7,
                'Another turn',
                'complete',
                'c7dfeec2-cc5f-4eb4-97b8-02201737ff8a',
            );
            await vi.waitFor(() => expect(text(1)).toBe('Another turn'));
            expect(text()).toBe('New answer');
            expect(chat.messages).toHaveLength(2);
            expect(reconciliations).toHaveBeenCalledTimes(1);
        } finally {
            await chat.stop();
            transport.close();
            await completion;
        }
    });

    it('emits only an appended text suffix and rebuilds public parts if canonical attachments/tools are removed', () => {
        const projection = new DurableMessageProjection(initial);
        const first: ConversationEvent = {
            ...event,
            data: { ...message, content: 'First', status: 'streaming' },
        };
        const initialChunks = projection.project(first);
        expect(initialChunks).toContainEqual({
            type: 'text-delta',
            id: 'answer',
            delta: 'First',
        });
        const appended = projection.project({
            ...first,
            id: 3,
            data: { ...first.data, content: 'First second' },
        });
        expect(appended.filter((chunk) => chunk.type === 'text-delta')).toEqual(
            [{ type: 'text-delta', id: 'answer', delta: ' second' }],
        );
        expect(
            appended.some(
                (chunk) =>
                    chunk.type === 'reset-step' ||
                    chunk.type === 'data-reconcile' ||
                    chunk.type === 'start',
            ),
        ).toBe(false);
        const rebuilt = projection.project({
            ...first,
            id: 4,
            data: {
                ...first.data,
                attachments: [],
                toolCalls: [],
                content: 'First second',
            },
        });
        expect(rebuilt).toContainEqual({ type: 'reset-step' });
        expect(rebuilt.filter((chunk) => chunk.type === 'text-delta')).toEqual([
            { type: 'text-delta', id: 'answer', delta: 'First second' },
        ]);
        expect(
            rebuilt.some(
                (chunk) =>
                    chunk.type === 'data-material' ||
                    chunk.type.startsWith('tool-'),
            ),
        ).toBe(false);
    });

    it('reconciles initial readable history then continues its partial assistant without duplicates', async () => {
        const historicalId = 'b4d2e09b-0854-4711-b2b4-1bfdc05477c9';
        const partial = {
            ...message,
            status: 'streaming' as const,
            content: 'Hello',
            toolCalls: [],
        };
        const snapshot = {
            ...initial,
            messages: [
                { ...message, id: historicalId, content: 'Earlier answer' },
                partial,
            ],
        };
        let receive!: (event: ConversationEvent) => void;
        vi.spyOn(conversationApi, 'events').mockImplementation(
            async (_token, _id, _after, onEvent, signal) => {
                receive = onEvent;
                onEvent({
                    id: 2,
                    conversationId,
                    createdAt: date,
                    type: 'snapshot',
                    data: snapshot,
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
        const chat: Chat<ConversationUIMessage> =
            new Chat<ConversationUIMessage>({
                id: conversationId,
                transport,
                onData(part) {
                    if (part.type === 'data-reconcile')
                        chat.messages = conversationUIMessages(part.data);
                },
            });
        const completion = chat.resumeStream();
        try {
            await vi.waitFor(() => expect(chat.messages).toHaveLength(2));
            receive({
                ...event,
                id: 3,
                data: {
                    ...partial,
                    content: 'Hello world',
                    status: 'complete',
                },
            });
            await vi.waitFor(() =>
                expect(chat.messages[1]?.metadata?.status).toBe('complete'),
            );
            expect(chat.messages.map((item) => item.id)).toEqual([
                historicalId,
                messageId,
            ]);
            expect(chat.messages[0]?.parts[0]).toMatchObject({
                text: 'Earlier answer',
            });
            expect(
                chat.messages[1]?.parts.filter((part) => part.type === 'text'),
            ).toEqual([
                expect.objectContaining({ text: 'Hello world', state: 'done' }),
            ]);
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
