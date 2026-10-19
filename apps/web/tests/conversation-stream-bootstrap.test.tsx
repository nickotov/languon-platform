import { act, renderHook, waitFor } from '@testing-library/react';
import {
    QueryClient,
    QueryClientProvider,
    useQuery,
} from '@tanstack/react-query';
import { Suspense, startTransition, type PropsWithChildren } from 'react';
import { expect, it, vi } from 'vitest';
import {
    ConversationDetailSchema,
    type ConversationDetail,
    type ConversationEvent,
} from '@languon/contracts';
import {
    conversationApi,
    ConversationApiError,
    type ConversationSessionRequest,
} from '../src/fsd/entities/conversation';
import { useConversationStream } from '../src/fsd/widgets/contextual-assistant/hooks/use-conversation-stream';

const actorId = 'bootstrap-test';
const firstId = '00000000-0000-4000-8000-000000000001';
const secondId = '00000000-0000-4000-8000-000000000002';
const messageId = '00000000-0000-4000-8000-000000000003';
const date = '2026-10-19T10:00:00.000Z';
const request: ConversationSessionRequest = (operation) =>
    operation('synthetic');
function detail(id: string, content?: string): ConversationDetail {
    return ConversationDetailSchema.parse({
        conversation: {
            id,
            source: { kind: 'text', id },
            preferences: {},
            version: 1,
            createdAt: date,
            updatedAt: date,
        },
        messages:
            content === undefined
                ? []
                : [
                      {
                          id: messageId,
                          conversationId: id,
                          role: 'assistant',
                          content,
                          attachments: [],
                          toolCalls: [],
                          status: 'streaming',
                          sourceVersion: '1',
                          sourceProvenance: 'saved',
                          createdAt: date,
                          turnId: null,
                      },
                  ],
        drafts: [],
        turns: [],
    });
}

it('gives stream snapshots bootstrap ownership over delayed detail queries and isolates conversation switches', async () => {
    const pending = new Map<
        string,
        {
            resolve(value: ConversationDetail): void;
            signal: AbortSignal | undefined;
        }
    >();
    vi.spyOn(conversationApi, 'detail').mockImplementation(
        (_token, id, _shareKey, signal) =>
            new Promise((resolve) => pending.set(id, { resolve, signal })),
    );
    const subscriptions = new Map<string, (event: ConversationEvent) => void>();
    vi.spyOn(conversationApi, 'events').mockImplementation(
        async (_token, id, _after, receive, signal) => {
            subscriptions.set(id, receive);
            await new Promise<void>((resolve) =>
                signal.addEventListener('abort', () => resolve(), {
                    once: true,
                }),
            );
        },
    );
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    function Wrapper({ children }: PropsWithChildren) {
        return (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        );
    }
    const hook = renderHook(
        ({ id }) => {
            const query = useQuery({
                queryKey: ['conversation', actorId, id],
                queryFn: ({ signal }) =>
                    request((token) =>
                        conversationApi.detail(token, id, undefined, signal),
                    ),
                retry: false,
                gcTime: 0,
            });
            const stream = useConversationStream(
                actorId,
                id,
                request,
                undefined,
                query.data,
            );
            return { query, stream };
        },
        { initialProps: { id: firstId }, wrapper: Wrapper },
    );
    function snapshot(id: string, content: string) {
        subscriptions.get(id)!({
            id: 1,
            conversationId: id,
            createdAt: date,
            type: 'snapshot',
            data: detail(id, content),
        });
    }
    function append(id: string, content: string) {
        subscriptions.get(id)!({
            id: 2,
            conversationId: id,
            createdAt: date,
            type: 'message',
            data: detail(id, content).messages[0]!,
        });
    }
    const text = () =>
        hook.result.current.stream.messages
            .flatMap((message) =>
                message.parts
                    .filter((part) => part.type === 'text')
                    .map((part) => part.text),
            )
            .join('');
    try {
        await waitFor(() =>
            expect(subscriptions.has(firstId) && pending.has(firstId)).toBe(
                true,
            ),
        );
        await act(async () => {
            snapshot(firstId, 'New');
            append(firstId, 'New streamed answer');
        });
        await waitFor(() => expect(text()).toBe('New streamed answer'));
        await waitFor(() =>
            expect(
                client.getQueryData<ConversationDetail>([
                    'conversation',
                    actorId,
                    firstId,
                ])?.messages[0]?.content,
            ).toBe('New streamed answer'),
        );
        // Simulate a transport which ignores AbortSignal and returns the older GET.
        await act(async () => pending.get(firstId)!.resolve(detail(firstId)));
        expect(text()).toBe('New streamed answer');
        expect(
            client.getQueryData<ConversationDetail>([
                'conversation',
                actorId,
                firstId,
            ])?.messages[0]?.content,
        ).toBe('New streamed answer');
        expect(pending.get(firstId)!.signal?.aborted).toBe(true);
        hook.rerender({ id: secondId });
        await waitFor(() =>
            expect(subscriptions.has(secondId) && pending.has(secondId)).toBe(
                true,
            ),
        );
        await act(async () => {
            snapshot(secondId, 'Second');
            append(secondId, 'Second streamed answer');
            // A late old subscriber cannot publish into the newly selected chat.
            subscriptions.get(firstId)!({
                id: 9,
                conversationId: firstId,
                createdAt: date,
                type: 'snapshot',
                data: detail(firstId, 'Wrong conversation'),
            });
            pending.get(secondId)!.resolve(detail(secondId));
        });
        await waitFor(() => expect(text()).toBe('Second streamed answer'));
        await waitFor(() =>
            expect(
                client.getQueryData<ConversationDetail>([
                    'conversation',
                    actorId,
                    secondId,
                ])?.messages[0]?.content,
            ).toBe('Second streamed answer'),
        );
        expect(
            hook.result.current.stream.messages.every(
                (message) => message.metadata?.conversationId === secondId,
            ),
        ).toBe(true);
        // The second GET settled before its stream callback ran: cancellation
        // need not abort a settled promise, but canonical publication still wins.
    } finally {
        hook.unmount();
        client.clear();
    }
});

it.each([401, 403, 404, 410])(
    'does not republish protected canonical state after terminal access error %s',
    async (status) => {
        const client = new QueryClient();
        client.setQueryData(
            ['conversation', actorId, firstId],
            detail(firstId),
        );
        const cancel = client.cancelQueries.bind(client);
        let releaseCancellation!: () => void;
        const held = new Promise<void>((resolve) => {
            releaseCancellation = resolve;
        });
        vi.spyOn(client, 'cancelQueries').mockImplementation(
            async (...args) => {
                await cancel(...args);
                await held;
            },
        );
        let receive!: (event: ConversationEvent) => void;
        let fail!: (error: Error) => void;
        vi.spyOn(conversationApi, 'events').mockImplementation(
            async (_token, _id, _after, onEvent, signal) => {
                receive = onEvent;
                await new Promise<void>((resolve, reject) => {
                    fail = reject;
                    signal.addEventListener('abort', () => resolve(), {
                        once: true,
                    });
                });
            },
        );
        function Wrapper({ children }: PropsWithChildren) {
            return (
                <QueryClientProvider client={client}>
                    {children}
                </QueryClientProvider>
            );
        }
        const hook = renderHook(
            () =>
                useConversationStream(
                    actorId,
                    firstId,
                    request,
                    undefined,
                    undefined,
                ),
            { wrapper: Wrapper },
        );
        try {
            await waitFor(() => expect(receive).toBeDefined());
            await act(async () =>
                receive({
                    id: 1,
                    conversationId: firstId,
                    createdAt: date,
                    type: 'snapshot',
                    data: detail(firstId, 'Protected answer'),
                }),
            );
            await waitFor(() =>
                expect(hook.result.current.messages).toHaveLength(1),
            );
            await act(async () =>
                fail(
                    new ConversationApiError(status, {
                        code: 'source_access_denied',
                        message: 'Unavailable',
                        correlationId: 'synthetic-terminal',
                    }),
                ),
            );
            await waitFor(() =>
                expect(hook.result.current.unavailable).toBe(true),
            );
            expect(
                client.getQueryState(['conversation', actorId, firstId]),
            ).toBeUndefined();
            expect(hook.result.current.messages).toHaveLength(0);
            await act(async () => {
                releaseCancellation();
                await held;
            });
            expect(
                client.getQueryState(['conversation', actorId, firstId]),
            ).toBeUndefined();
            expect(hook.result.current.unavailable).toBe(true);
            expect(hook.result.current.messages).toHaveLength(0);
        } finally {
            releaseCancellation();
            hook.unmount();
            client.clear();
        }
    },
);

it('rejects a held publication from the previous A session after switching A to B to A', async () => {
    const client = new QueryClient();
    const cancel = client.cancelQueries.bind(client);
    let releaseCancellation!: () => void;
    const held = new Promise<void>((resolve) => {
        releaseCancellation = resolve;
    });
    vi.spyOn(client, 'cancelQueries').mockImplementation(async (...args) => {
        await cancel(...args);
        await held;
    });
    const subscriptions: {
        id: string;
        receive(event: ConversationEvent): void;
    }[] = [];
    vi.spyOn(conversationApi, 'events').mockImplementation(
        async (_token, id, _after, receive, signal) => {
            subscriptions.push({ id, receive });
            await new Promise<void>((resolve) =>
                signal.addEventListener('abort', () => resolve(), {
                    once: true,
                }),
            );
        },
    );
    function Wrapper({ children }: PropsWithChildren) {
        return (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        );
    }
    const hook = renderHook(
        ({ id }) =>
            useConversationStream(actorId, id, request, undefined, undefined),
        { initialProps: { id: firstId }, wrapper: Wrapper },
    );
    try {
        await waitFor(() => expect(subscriptions).toHaveLength(1));
        await act(async () =>
            subscriptions[0]!.receive({
                id: 1,
                conversationId: firstId,
                createdAt: date,
                type: 'snapshot',
                data: detail(firstId, 'Old A answer'),
            }),
        );
        await waitFor(() =>
            expect(hook.result.current.messages).toHaveLength(1),
        );
        hook.rerender({ id: secondId });
        await waitFor(() => expect(subscriptions).toHaveLength(2));
        hook.rerender({ id: firstId });
        await waitFor(() => expect(subscriptions).toHaveLength(3));
        await act(async () => {
            releaseCancellation();
            await held;
        });
        expect(
            client.getQueryState(['conversation', actorId, firstId]),
        ).toBeUndefined();
        expect(hook.result.current.messages).toHaveLength(0);
        // The new A subscription remains able to publish its own fresh state.
        await act(async () =>
            subscriptions[2]!.receive({
                id: 2,
                conversationId: firstId,
                createdAt: date,
                type: 'snapshot',
                data: detail(firstId, 'Fresh A answer'),
            }),
        );
        await waitFor(() =>
            expect(
                client.getQueryData<ConversationDetail>([
                    'conversation',
                    actorId,
                    firstId,
                ])?.messages[0]?.content,
            ).toBe('Fresh A answer'),
        );
    } finally {
        releaseCancellation();
        hook.unmount();
        client.clear();
    }
});

it('keeps a committed A terminal error from purging B during a suspended B render', async () => {
    const client = new QueryClient();
    client.setQueryData(
        ['conversation', actorId, secondId],
        detail(secondId, 'B history'),
    );
    let receive!: (event: ConversationEvent) => void;
    let fail!: (error: Error) => void;
    let firstSignal: AbortSignal | undefined;
    const opened: string[] = [];
    vi.spyOn(conversationApi, 'events').mockImplementation(
        async (_token, id, _after, onEvent, signal) => {
            opened.push(id);
            if (id === firstId) {
                receive = onEvent;
                firstSignal = signal;
            }
            await new Promise<void>((resolve, reject) => {
                fail = reject;
                signal.addEventListener('abort', () => resolve(), {
                    once: true,
                });
            });
        },
    );
    const suspended = new Promise<void>(() => undefined);
    let renderedB = false;
    function Wrapper({ children }: PropsWithChildren) {
        return (
            <Suspense fallback={<div>Pending navigation</div>}>
                <QueryClientProvider client={client}>
                    {children}
                </QueryClientProvider>
            </Suspense>
        );
    }
    const hook = renderHook(
        ({ id }) => {
            const stream = useConversationStream(
                actorId,
                id,
                request,
                undefined,
                undefined,
            );
            if (id === secondId) {
                renderedB = true;
                throw suspended;
            }
            return stream;
        },
        { initialProps: { id: firstId }, wrapper: Wrapper },
    );
    try {
        await waitFor(() => expect(receive).toBeDefined());
        await act(async () =>
            receive({
                id: 1,
                conversationId: firstId,
                createdAt: date,
                type: 'snapshot',
                data: detail(firstId, 'A answer'),
            }),
        );
        await waitFor(() =>
            expect(hook.result.current.messages).toHaveLength(1),
        );
        act(() => startTransition(() => hook.rerender({ id: secondId })));
        await waitFor(() => expect(renderedB).toBe(true));
        expect(firstSignal?.aborted).toBe(false); // A is still committed while B suspends.
        expect(opened).toEqual([firstId]);
        await act(async () =>
            fail(
                new ConversationApiError(403, {
                    code: 'source_access_denied',
                    message: 'Unavailable',
                    correlationId: 'synthetic-suspended-terminal',
                }),
            ),
        );
        await waitFor(() =>
            expect(
                client.getQueryData<ConversationDetail>([
                    'conversation',
                    actorId,
                    secondId,
                ])?.messages[0]?.content,
            ).toBe('B history'),
        );
        expect(
            client.getQueryState(['conversation', actorId, firstId]),
        ).toBeUndefined();
        expect(opened).toEqual([firstId]);
    } finally {
        hook.unmount();
        client.clear();
    }
});

it.each([false, true])(
    'ignores an aborted A request terminal rejection after a committed switch (return to A: %s)',
    async (returnToA) => {
        const client = new QueryClient();
        const subscriptions: {
            id: string;
            receive(event: ConversationEvent): void;
            fail(error: Error): void;
            signal: AbortSignal;
        }[] = [];
        vi.spyOn(conversationApi, 'events').mockImplementation(
            async (_token, id, _after, receive, signal) => {
                await new Promise<void>((resolve, reject) => {
                    const first = subscriptions.length === 0;
                    subscriptions.push({ id, receive, fail: reject, signal });
                    // The first HTTP operation deliberately ignores cancellation, then
                    // rejects late; transport and SDK abort fences must still hold.
                    if (!first)
                        signal.addEventListener('abort', () => resolve(), {
                            once: true,
                        });
                });
            },
        );
        function Wrapper({ children }: PropsWithChildren) {
            return (
                <QueryClientProvider client={client}>
                    {children}
                </QueryClientProvider>
            );
        }
        const hook = renderHook(
            ({ id }) =>
                useConversationStream(
                    actorId,
                    id,
                    request,
                    undefined,
                    undefined,
                ),
            { initialProps: { id: firstId }, wrapper: Wrapper },
        );
        try {
            await waitFor(() => expect(subscriptions).toHaveLength(1));
            hook.rerender({ id: secondId });
            await waitFor(() => expect(subscriptions).toHaveLength(2));
            if (returnToA) {
                hook.rerender({ id: firstId });
                await waitFor(() => expect(subscriptions).toHaveLength(3));
            }
            const current = subscriptions.at(-1)!;
            await act(async () =>
                current.receive({
                    id: 2,
                    conversationId: current.id,
                    createdAt: date,
                    type: 'snapshot',
                    data: detail(current.id, 'Current session answer'),
                }),
            );
            await waitFor(() =>
                expect(
                    client.getQueryData<ConversationDetail>([
                        'conversation',
                        actorId,
                        current.id,
                    ])?.messages[0]?.content,
                ).toBe('Current session answer'),
            );
            expect(subscriptions[0]!.signal.aborted).toBe(true);
            await act(async () =>
                subscriptions[0]!.fail(
                    new ConversationApiError(403, {
                        code: 'source_access_denied',
                        message: 'Unavailable',
                        correlationId: 'synthetic-late-terminal',
                    }),
                ),
            );
            expect(
                client.getQueryData<ConversationDetail>([
                    'conversation',
                    actorId,
                    current.id,
                ])?.messages[0]?.content,
            ).toBe('Current session answer');
            expect(hook.result.current.unavailable).toBe(false);
            expect(hook.result.current.messages[0]?.metadata?.content).toBe(
                'Current session answer',
            );
        } finally {
            hook.unmount();
            client.clear();
        }
    },
);
