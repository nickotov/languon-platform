import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
    ConversationDetailSchema,
    ConversationTurnSchema,
    type ConversationPromptMention,
} from '@languon/contracts';
import { conversationApi } from '../src/fsd/entities/conversation';
import { useConversation } from '../src/fsd/widgets/contextual-assistant/hooks/use-conversation';
const stream = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock(
    '../src/fsd/widgets/contextual-assistant/hooks/use-conversation-stream',
    () => ({ useConversationStream: () => stream }),
);

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    stream.submit.mockReset();
});

const id = '00000000-0000-4000-8000-000000000001';
const sourceB = '00000000-0000-4000-8000-000000000002';
const date = '2026-11-15T10:00:00.000Z';
const content = 'Generate Words';
const original: ConversationPromptMention[] = [
    { kind: 'block', blockId: id, start: 9, end: 14 },
];

it.each(['different-source', 'cloned-same-pair', 'different-content'] as const)(
    'clears the admitted prompt atomically: %s',
    async (change) => {
        const detail = ConversationDetailSchema.parse({
            conversation: {
                id,
                title: 'Chat',
                source: { kind: 'knowledge', id },
                preferences: {},
                version: 1,
                createdAt: date,
                updatedAt: date,
            },
            messages: [],
            drafts: [],
            turns: [],
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

        vi.spyOn(conversationApi, 'list').mockResolvedValue({
            conversations: [detail.conversation],
        });

        vi.spyOn(conversationApi, 'detail').mockResolvedValue(detail);
        let finish!: (value: { turn: typeof turn }) => void;
        stream.submit.mockImplementation(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
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
            () => useConversation('actor', { kind: 'knowledge', id }, request),
            { wrapper: Wrapper },
        );

        await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));
        act(() => {
            result.current.setQuestion(content);
            result.current.setPromptMentions(original);
        });

        act(() =>
            result.current.submit.mutate({ content, promptMentions: original }),
        );

        await waitFor(() => expect(stream.submit).toHaveBeenCalledTimes(1));
        const newer: ConversationPromptMention[] = [
            {
                end: 14,
                kind: 'block',
                blockId: change === 'different-source' ? sourceB : id,
                start: 9,
            },
        ];
        const question =
            change === 'different-content'
                ? 'A newer question about Words'
                : content;

        act(() => {
            result.current.setQuestion(question);
            result.current.setPromptMentions(newer);
        });

        await act(async () => finish({ turn }));
        await waitFor(() => expect(result.current.submit.isSuccess).toBe(true));
        if (change === 'cloned-same-pair') {
            expect(result.current.question).toBe('');
            expect(result.current.promptMentions).toEqual([]);
        } else {
            expect(result.current.question).toBe(question);
            expect(result.current.promptMentions).toEqual(newer);
        }

        client.clear();
    },
);
