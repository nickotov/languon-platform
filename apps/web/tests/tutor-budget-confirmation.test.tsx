import {
    act,
    renderHook,
    waitFor,
    screen,
    cleanup,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRef, useState, type PropsWithChildren } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type {
    CopiedAttachment,
    SubmitConversationTurnRequest,
} from '@languon/contracts';
import {
    ConversationApiError,
    conversationApi,
} from '@/fsd/entities/conversation';
import { useConversationAdmission } from '@/fsd/widgets/contextual-assistant/hooks/use-conversation-admission';
import { ActionBudgetConfirmation } from '@/fsd/widgets/contextual-assistant/ui/contextual-assistant/action-budget-confirmation';
import { ResponseLimitNotice } from '@/fsd/widgets/contextual-assistant/ui/contextual-assistant/response-limit-notice';
import { render } from './render';

const firstQuote = {
    id: '00000000-0000-4000-8000-000000000001',
    maximumCredits: '0.125',
    approximateOutputTokens: 12,
    expiresAt: '2026-10-22T12:05:00Z',
};
const secondQuote = {
    ...firstQuote,
    id: '00000000-0000-4000-8000-000000000002',
    maximumCredits: '0.025',
    approximateOutputTokens: 2,
};
function denied(quote = firstQuote) {
    return new ConversationApiError(409, {
        code: 'action_confirmation_required',
        message: 'Confirm',
        correlationId: 'test',
        details: { quote },
    });
}
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});
it('preserves the validated quote through the real API error boundary', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
            JSON.stringify({
                error: {
                    code: 'action_confirmation_required',
                    message: 'Confirm',
                    details: { quote: firstQuote },
                },
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
    );
    await expect(
        conversationApi.submit('synthetic-token', firstQuote.id, {
            requestId: firstQuote.id,
            content: 'Question',
            attachments: [],
        }),
    ).rejects.toMatchObject({
        detail: {
            code: 'action_confirmation_required',
            details: { quote: firstQuote },
        },
    });
});

it('preserves the original request/content across explicit confirmations and requires confirmation of a further reduction', async () => {
    const submitTurn = vi
        .fn()
        .mockRejectedValueOnce(denied())
        .mockRejectedValueOnce(denied(secondQuote))
        .mockResolvedValue({ turn: { conversationId: 'conversation' } });
    const refresh = vi.fn();
    const onAccepted = vi.fn();
    const client = new QueryClient({
        defaultOptions: { mutations: { retry: false } },
    });
    function Provider({ children }: PropsWithChildren) {
        return (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        );
    }
    const { result } = renderHook(
        () => {
            const pendingRequest = useRef<SubmitConversationTurnRequest | null>(
                null,
            );
            const [question, setQuestion] = useState('Original question');
            const [attachments, setAttachments] = useState<CopiedAttachment[]>(
                [],
            );
            return {
                ...useConversationAdmission({
                    id: 'conversation',
                    attachments,
                    pendingRequest,
                    submitTurn,
                    setQuestion,
                    setAttachments,
                    refresh,
                }),
                question,
                setQuestion,
            };
        },
        { wrapper: Provider },
    );
    await act(async () => {
        await result.current.submit
            .mutateAsync({
                content: 'Original question',
                draftContext: 'frozen document',
                onAccepted,
            })
            .catch(() => undefined);
    });
    await waitFor(() => expect(result.current.quote?.id).toBe(firstQuote.id));
    expect(submitTurn).toHaveBeenCalledTimes(1);
    act(() => result.current.setQuestion('Changed unsent draft'));
    act(() => {
        result.current.confirmQuote();
        result.current.confirmQuote();
    });
    await waitFor(() => expect(result.current.quote?.id).toBe(secondQuote.id));
    expect(submitTurn).toHaveBeenCalledTimes(2);
    expect(submitTurn.mock.calls[1]![0]).toMatchObject({
        ...submitTurn.mock.calls[0]![0],
        confirmedQuoteId: firstQuote.id,
    });
    act(() => result.current.confirmQuote());
    await waitFor(() => expect(submitTurn).toHaveBeenCalledTimes(3));
    expect(submitTurn.mock.calls[2]![0]).toMatchObject({
        ...submitTurn.mock.calls[0]![0],
        confirmedQuoteId: secondQuote.id,
    });
    await waitFor(() => expect(result.current.quote).toBeNull());
    expect(result.current.question).toBe('Changed unsent draft');
    expect(onAccepted).toHaveBeenCalledTimes(1);
});

it('shows the quoted allowance and explicit Send, Top up and keep editing choices', async () => {
    const send = vi.fn();
    const close = vi.fn();
    const user = userEvent.setup();
    render(
        <ActionBudgetConfirmation
            quote={firstQuote}
            onSend={send}
            onClose={close}
        />,
    );
    expect(screen.getByRole('dialog')).toHaveTextContent(
        'Approximate output tokens: 12',
    );
    expect(screen.getByRole('link', { name: 'Top up' })).toHaveAttribute(
        'href',
        '/profile?tab=credits',
    );
    expect(send).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(send).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(close).toHaveBeenCalled();
});

it('never continues a limited response until the learner explicitly requests a new action', async () => {
    const next = vi.fn();
    const user = userEvent.setup();
    render(<ResponseLimitNotice onContinue={next} disabled={false} />);
    expect(
        screen.getByText(/new action within your saved maximum budget/),
    ).toBeInTheDocument();
    expect(next).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(next).toHaveBeenCalledTimes(1);
});
