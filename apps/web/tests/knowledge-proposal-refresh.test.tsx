import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, type PropsWithChildren } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
    ConversationDetailSchema,
    KnowledgeBlockProposalSchema,
} from '@languon/contracts';
import { blockProposalCompletionKey } from '../src/fsd/features/knowledge-notes/lib/proposal-completions';
import { useBlockProposals } from '../src/fsd/features/knowledge-notes/hooks/use-block-proposals';

const id = '11111111-1111-4111-8111-111111111111';
const request = <T,>(operation: (token: string) => Promise<T>) =>
    operation('synthetic');

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

function fixture(strict = false) {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });

    function Wrapper({ children }: PropsWithChildren) {
        return (
            <QueryClientProvider client={client}>
                {strict ? <StrictMode>{children}</StrictMode> : children}
            </QueryClientProvider>
        );
    }

    return { client, Wrapper };
}

it('coalesces initial reads and refreshes only successful publication, explicit Apply or reconnect', async () => {
    const fetch = vi.fn(async () => Response.json({ proposals: [] }));
    vi.stubGlobal('fetch', fetch);
    const { Wrapper } = fixture(true);
    const { result, rerender } = renderHook(
        ({ completionKey, reconciliationKey }) =>
            useBlockProposals({
                actorId: 'owner',
                conversationId: id,
                request,
                completionKey,
                reconciliationKey,
            }),
        {
            wrapper: Wrapper,
            initialProps: { completionKey: '', reconciliationKey: 0 },
        },
    );

    await waitFor(() => expect(result.current.data).toEqual({ proposals: [] }));
    expect(fetch).toHaveBeenCalledTimes(1);

    // Ordinary renders and queued/running/failed turns do not change publication identity.
    rerender({ completionKey: '', reconciliationKey: 0 });
    rerender({ completionKey: '', reconciliationKey: 0 });
    vi.useFakeTimers();
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.useRealTimers();

    rerender({ completionKey: 'successful-turn', reconciliationKey: 0 });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    rerender({ completionKey: 'successful-turn', reconciliationKey: 0 });
    expect(fetch).toHaveBeenCalledTimes(2);

    await act(() => result.current.refresh());
    expect(fetch).toHaveBeenCalledTimes(3);
    rerender({ completionKey: 'successful-turn', reconciliationKey: 1 });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
});

it('waits for an earlier history snapshot before one completion reconciliation', async () => {
    let resolveInitial!: (response: Response) => void;
    const fetch = vi
        .fn()
        .mockImplementationOnce(
            () =>
                new Promise<Response>((resolve) => {
                    resolveInitial = resolve;
                }),
        )
        .mockImplementation(async () => Response.json({ proposals: [] }));

    vi.stubGlobal('fetch', fetch);
    const { Wrapper } = fixture();
    const { result, rerender } = renderHook(
        ({ completionKey }) =>
            useBlockProposals({
                actorId: 'owner',
                conversationId: id,
                request,
                completionKey,
                reconciliationKey: 0,
            }),
        { wrapper: Wrapper, initialProps: { completionKey: '' } },
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    rerender({ completionKey: 'successful-turn' });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => resolveInitial(Response.json({ proposals: [] })));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.data).toEqual({ proposals: [] }));
});

it('isolates proposal caches by actor even for the same conversation ID', async () => {
    const fetch = vi.fn(async () => Response.json({ proposals: [] }));
    vi.stubGlobal('fetch', fetch);
    const { Wrapper, client } = fixture();
    const { rerender } = renderHook(
        ({ actorId }) =>
            useBlockProposals({
                actorId,
                conversationId: id,
                request,
                completionKey: '',
                reconciliationKey: 0,
            }),
        { wrapper: Wrapper, initialProps: { actorId: 'owner-one' } },
    );

    await waitFor(() =>
        expect(
            client.getQueryData(['knowledge-block-proposals', 'owner-one', id]),
        ).toEqual({ proposals: [] }),
    );

    rerender({ actorId: 'owner-two' });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await waitFor(() =>
        expect(
            client.getQueryData(['knowledge-block-proposals', 'owner-two', id]),
        ).toEqual({ proposals: [] }),
    );
});

it('uses one reconnect reconciliation when its snapshot already includes the completed publication', async () => {
    let resolveReconnect!: (response: Response) => void;
    const proposal = KnowledgeBlockProposalSchema.parse({
        id,
        turnId: id,
        conversationId: id,
        noteId: id,
        branchId: id,
        baseBranchVersion: 1,
        blocks: [{ id, type: 'grammar', language: 'en', rule: 'A rule.' }],
        createdAt: '2026-11-06T00:00:00.000Z',
        appliedAt: null,
        appliedBranchVersion: null,
    });
    const fetch = vi
        .fn()
        .mockResolvedValueOnce(Response.json({ proposals: [] }))
        .mockImplementationOnce(
            () =>
                new Promise<Response>((resolve) => {
                    resolveReconnect = resolve;
                }),
        );

    vi.stubGlobal('fetch', fetch);
    const { Wrapper } = fixture();
    const { result, rerender } = renderHook(
        ({ completionKey, reconciliationKey }) =>
            useBlockProposals({
                actorId: 'owner',
                conversationId: id,
                request,
                completionKey,
                reconciliationKey,
            }),
        {
            wrapper: Wrapper,
            initialProps: { completionKey: '', reconciliationKey: 0 },
        },
    );

    await waitFor(() => expect(result.current.data).toEqual({ proposals: [] }));
    rerender({ completionKey: '', reconciliationKey: 1 });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    rerender({ completionKey: id, reconciliationKey: 1 });
    await act(async () =>
        resolveReconnect(Response.json({ proposals: [proposal] })),
    );

    await waitFor(() =>
        expect(result.current.data?.proposals).toEqual([proposal]),
    );

    expect(fetch).toHaveBeenCalledTimes(2);
});

it('only successful durable proposal outcomes alter publication identity', () => {
    const date = '2026-11-06T00:00:00.000Z';
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
        messages: [
            {
                id,
                conversationId: id,
                turnId: id,
                role: 'assistant',
                content: '',
                attachments: [],
                toolCalls: [],
                status: 'complete',
                sourceVersion: '1',
                sourceProvenance: 'draft',
                createdAt: date,
                responseMetadata: { kind: 'generation', documentUse: false },
            },
        ],
        turns: [
            {
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
            },
        ],
        drafts: [],
    });

    for (const status of [
        'queued',
        'running',
        'failed',
        'cancelled',
    ] as const) {
        detail.turns[0]!.status = status;
        expect(blockProposalCompletionKey(detail)).toBe('');
    }

    detail.turns[0]!.status = 'succeeded';
    expect(blockProposalCompletionKey(detail)).toBe(id);
    detail.messages[0]!.responseMetadata = {
        kind: 'revision',
        documentUse: true,
    };

    expect(blockProposalCompletionKey(detail)).toBe('');
    detail.messages[0]!.responseMetadata = {
        kind: 'clarification',
        documentUse: false,
    };

    expect(blockProposalCompletionKey(detail)).toBe('');
});
