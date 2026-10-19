import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ConversationDetailSchema } from '@languon/contracts';
import { conversationApi } from '../src/fsd/entities/conversation';
import { useConversation } from '../src/fsd/widgets/contextual-assistant/hooks/use-conversation';

// Transport behavior has dedicated real SDK and browser coverage. This regression
// isolates composer ownership while the create endpoint is still in flight.
vi.mock(
    '../src/fsd/widgets/contextual-assistant/hooks/use-conversation-stream',
    () => ({ useConversationStream: () => ({}) }),
);
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

it('retains the initial selected passage through delayed creation and restores each conversation composer separately', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const otherId = '00000000-0000-4000-8000-000000000002';
    const date = '2026-10-19T10:00:00.000Z';
    const source = { kind: 'text' as const, id };
    const detail = ConversationDetailSchema.parse({
        conversation: {
            id,
            source,
            preferences: {},
            version: 1,
            createdAt: date,
            updatedAt: date,
        },
        messages: [],
        drafts: [],
        turns: [],
    });
    vi.spyOn(conversationApi, 'list').mockResolvedValue({ conversations: [] });
    vi.spyOn(conversationApi, 'detail').mockImplementation(
        async (_token, conversationId) => ({
            ...detail,
            conversation: { ...detail.conversation, id: conversationId },
        }),
    );
    let resolveCreate!: (value: {
        conversation: typeof detail.conversation;
    }) => void;
    vi.spyOn(conversationApi, 'create').mockImplementation(
        () =>
            new Promise((resolve) => {
                resolveCreate = resolve;
            }),
    );
    const client = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    function Wrapper({ children }: PropsWithChildren) {
        return (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        );
    }
    const request = <T,>(operation: (token: string) => Promise<T>) =>
        operation('synthetic');
    const { result } = renderHook(
        () => useConversation('synthetic-actor', source, request),
        { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    act(() => result.current.create.mutate());
    await waitFor(() => expect(resolveCreate).toBeDefined());
    const attachment = {
        id: otherId,
        label: 'Selected passage',
        content: 'We rested on the bank.',
    };
    act(() => {
        result.current.setAttachments([attachment]);
        result.current.setQuestion('Explain this phrase');
    });
    await act(async () => resolveCreate({ conversation: detail.conversation }));
    await waitFor(() => expect(result.current.id).toBe(id));
    expect(result.current.attachments).toEqual([attachment]);
    expect(result.current.question).toBe('Explain this phrase');
    act(() => result.current.select(otherId));
    expect(result.current.attachments).toEqual([]);
    expect(result.current.question).toBe('');
    act(() => result.current.setQuestion('A separate question'));
    act(() => result.current.select(id));
    expect(result.current.attachments).toEqual([attachment]);
    expect(result.current.question).toBe('Explain this phrase');
    client.clear();
});
