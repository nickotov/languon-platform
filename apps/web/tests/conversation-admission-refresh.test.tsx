import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
    ConversationDetailSchema,
    ConversationTurnSchema,
} from '@languon/contracts';
import {
    conversationApi,
    type ConversationSessionRequest,
} from '../src/fsd/entities/conversation';
import { useConversation } from '../src/fsd/widgets/contextual-assistant/hooks/use-conversation';

const id = '11111111-1111-4111-8111-111111111111';
const date = '2026-11-06T00:00:00.000Z';
const request: ConversationSessionRequest = (operation) =>
    operation('synthetic');

afterEach(() => vi.restoreAllMocks());

it('submits once and refreshes the sidebar without refetching detail already owned by SSE', async () => {
    const detail = ConversationDetailSchema.parse({
        conversation: {
            id,
            title: 'Existing chat',
            source: { kind: 'knowledge', id },
            preferences: {},
            version: 1,
            createdAt: date,
            updatedAt: date,
        },
        messages: [],
        turns: [],
        drafts: [],
    });
    const turn = ConversationTurnSchema.parse({
        id,
        conversationId: id,
        modelId: null,
        status: 'queued',
        failureCode: null,
        usage: {
            inputTokens: 0,
            outputTokens: 0,
            chargedCredits: '0',
            estimated: false,
        },
        createdAt: date,
        updatedAt: date,
    });
    const list = vi
        .spyOn(conversationApi, 'list')
        .mockResolvedValue({ conversations: [detail.conversation] });
    const getDetail = vi
        .spyOn(conversationApi, 'detail')
        .mockResolvedValue(detail);
    const submit = vi
        .spyOn(conversationApi, 'submit')
        .mockResolvedValue({ turn });

    vi.spyOn(conversationApi, 'events').mockImplementation(
        async (_token, _id, _after, receive, signal) => {
            receive({
                id: 1,
                conversationId: id,
                createdAt: date,
                type: 'snapshot',
                data: detail,
            });

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

    const { result } = renderHook(
        () => useConversation('owner', { kind: 'knowledge', id }, request),
        { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.detail.data).toBeDefined());
    expect(getDetail).toHaveBeenCalledTimes(1);
    await act(() =>
        result.current.submit.mutateAsync({
            content: 'Make ten shopping words.',
        }),
    );

    expect(submit).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(2);
    expect(getDetail).toHaveBeenCalledTimes(1);
});
