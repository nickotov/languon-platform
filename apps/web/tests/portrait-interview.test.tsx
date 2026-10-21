import {
    act,
    cleanup,
    renderHook,
    waitFor,
    render,
    screen,
    fireEvent,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import {
    PortraitItemsSchema,
    type PortraitState,
    type StartPortraitInterviewResponse,
} from '@languon/contracts';
import { useInterviewProposalDraft } from '@/fsd/pages/learner-portrait/hooks/use-interview-proposal-draft';
import { ownerScopedInterviewRequest } from '@/fsd/pages/learner-portrait/lib/interview-owner';
import { portraitApi, portraitQueryKey } from '@/fsd/entities/learner-portrait';
import { useSessionStore } from '@/fsd/entities/session';
import { useInterviewOpening } from '@/fsd/pages/learner-portrait/hooks/use-interview-opening';
import { usePortraitInterview } from '@/fsd/pages/learner-portrait/hooks/use-portrait-interview';
import { PortraitInterviewPage } from '@/fsd/pages/learner-portrait/ui/portrait-interview/portrait-interview-page';
import { InterviewQuestion } from '@/fsd/pages/learner-portrait/ui/portrait-interview/interview-question';
import { InterviewRecovery } from '@/fsd/pages/learner-portrait/ui/portrait-interview/interview-recovery';
import { InterviewPreview } from '@/fsd/pages/learner-portrait/ui/portrait-interview/interview-preview';
import { InterviewComposer } from '@/fsd/pages/learner-portrait/ui/portrait-interview/interview-composer';
const requestWithSession = <T,>(operation: (token: string) => Promise<T>) =>
    operation('test-token');
vi.mock('@/fsd/features/auth', () => ({
    useAuth: () => ({ requestWithSession }),
}));
vi.mock('@/fsd/shared/i18n', () => ({
    useI18n: () => ({ locale: 'en', href: (path: string) => path }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
const items = PortraitItemsSchema.parse({});
const current: PortraitState = {
    version: 1,
    approvedVersion: 0,
    generation: 0,
    useEnabled: false,
    approved: null,
    draft: null,
};
const session: StartPortraitInterviewResponse = {
    interviewId: '00000000-0000-4000-8000-000000000001',
    expiresAt: '2026-12-01T00:00:00.000Z',
    context: {
        locale: 'en',
        approvedItems: null,
        draftItems: null,
        messages: [],
        completedTopics: [],
    },
    initialQuestion: {
        message: 'What helps you learn?',
        topic: 'accommodations',
        options: [],
        multiSelect: true,
    },
    creditsBypass: true,
};
function mount() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    function wrapper({ children }: { children: ReactNode }) {
        return (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        );
    }
    return renderHook(() => usePortraitInterview(), { wrapper });
}
beforeEach(() => {
    useSessionStore.setState({
        status: 'authenticated',
        user: {
            id: 'learner-one',
            primaryEmail: 'learner@example.test',
            handle: null,
            createdAt: '2026-10-01T00:00:00.000Z',
            emailVerified: true,
            status: 'active',
        },
    });
    vi.spyOn(portraitApi, 'read').mockResolvedValue(current);
    vi.spyOn(portraitApi, 'readInterviewStatus').mockResolvedValue({
        interview: {
            id: session.interviewId,
            locale: 'en',
            expiresAt: session.expiresAt,
        },
        creditsBypass: true,
    });
    vi.spyOn(portraitApi, 'startInterview').mockResolvedValue(session);
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    useSessionStore.getState().signOut();
});
it('never creates a missing or deleted interview from a passive view or reconnect', async () => {
    vi.mocked(portraitApi.readInterviewStatus).mockResolvedValue({
        interview: null,
        creditsBypass: true,
    });
    const { result } = mount();
    await waitFor(() => expect(result.current.missing).toBe(true));
    await act(() => result.current.reconnect());
    expect(portraitApi.startInterview).not.toHaveBeenCalled();
});
it('reconnects to an admitted operation without submitting or charging another request', async () => {
    const operation = {
        id: '00000000-0000-4000-8000-000000000002',
        interviewId: session.interviewId,
        state: 'running' as const,
        result: null,
        errorCode: null,
    };
    vi.mocked(portraitApi.startInterview)
        .mockResolvedValueOnce({ ...session, activeOperation: operation })
        .mockResolvedValue(session);
    vi.spyOn(portraitApi, 'readOperation').mockResolvedValue({
        ...operation,
        state: 'succeeded',
        result: session.initialQuestion,
    });
    const submit = vi.spyOn(portraitApi, 'submitInterview');
    const { result } = mount();
    await waitFor(() => expect(portraitApi.readOperation).toHaveBeenCalled());
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(submit).not.toHaveBeenCalled();
});
it('retains one idempotency key when an uncertain network submission is explicitly retried', async () => {
    const submit = vi
        .spyOn(portraitApi, 'submitInterview')
        .mockRejectedValue(new Error('network'));
    const { result } = mount();
    await waitFor(() => expect(result.current.session).not.toBeNull());
    const input = {
        kind: 'chat' as const,
        topic: 'accommodations' as const,
        text: 'Could you explain this question?',
    };
    await act(() => result.current.submit(input));
    await act(() => result.current.submit(input));
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[0]![1].idempotencyKey).toBe(
        submit.mock.calls[1]![1].idempotencyKey,
    );
});
it('asks for explicit paid acknowledgement and leaves drafts and use untouched', async () => {
    const submit = vi
        .spyOn(portraitApi, 'submitInterview')
        .mockRejectedValue({ code: 'billing_notice_required' });
    const approve = vi.spyOn(portraitApi, 'approve');
    const setUse = vi.spyOn(portraitApi, 'setUse');
    const { result } = mount();
    await waitFor(() => expect(result.current.session).not.toBeNull());
    await act(() => result.current.submit({ kind: 'skip', topic: 'goals' }));
    expect(result.current.notice).toBe(true);
    expect(result.current.session?.creditsBypass).toBe(false);
    await act(() => result.current.confirmCost());
    expect(submit.mock.calls[0]![1].paidAcknowledged).toBe(false);
    expect(submit.mock.calls[1]![1].paidAcknowledged).toBe(true);
    expect(approve).not.toHaveBeenCalled();
    expect(setUse).not.toHaveBeenCalled();
});
it('refuses an old proposal after another device changed the portrait', async () => {
    vi.mocked(portraitApi.startInterview).mockResolvedValue({
        ...session,
        latestCompletedOperation: {
            id: '00000000-0000-4000-8000-000000000002',
            interviewId: session.interviewId,
            state: 'succeeded',
            errorCode: null,
            result: {
                ...session.initialQuestion,
                proposedItems: { ...items, goals: ['Travel'] },
            },
            baseVersion: 1,
            baseGeneration: 0,
            stale: false,
        },
    });
    const save = vi.spyOn(portraitApi, 'saveDraft');
    const { result } = mount();
    await waitFor(() => expect(result.current.proposal).not.toBeNull());
    vi.mocked(portraitApi.read).mockResolvedValue({ ...current, version: 2 });
    await act(() => result.current.acceptProposal());
    expect(save).not.toHaveBeenCalled();
    expect(result.current.error).toContain('portrait changed');
});
it('limits custom answers by graphemes without cutting emoji sequences', () => {
    const answer = vi.fn();
    render(
        <InterviewQuestion
            question={session.initialQuestion}
            locale='en'
            busy={false}
            onAnswer={answer}
            onSkip={vi.fn()}
        />,
    );
    const input = screen.getByLabelText('Your own answer (optional)');
    const emoji = '👩🏽‍💻';
    fireEvent.change(input, { target: { value: emoji.repeat(201) } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(answer).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: emoji.repeat(200) } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(answer).toHaveBeenCalledWith({
        selected: [],
        text: emoji.repeat(200),
    });
});
it('keeps a failed chat message in the composer and prevents more than 1000 graphemes', async () => {
    const send = vi.fn().mockResolvedValue(false);
    render(
        <InterviewComposer locale='en' free disabled={false} onSend={send} />,
    );
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'a'.repeat(1001) } });
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    fireEvent.change(input, { target: { value: 'Please clarify' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('Please clarify'));
    expect(input).toHaveValue('Please clarify');
});

it('restores a failed answer as private editable work without automatically retrying', async () => {
    const attempt = {
        id: '00000000-0000-4000-8000-000000000003',
        interviewId: session.interviewId,
        state: 'failed' as const,
        input: {
            kind: 'answer' as const,
            topic: 'goals' as const,
            selected: ['Work'],
            text: 'Meetings',
        },
        errorCode: 'provider_unavailable',
        baseVersion: 1,
        baseGeneration: 0,
        stale: false,
    };
    vi.mocked(portraitApi.startInterview).mockResolvedValue({
        ...session,
        lastAttempt: attempt,
    });
    const submit = vi.spyOn(portraitApi, 'submitInterview');
    const { result } = mount();
    await waitFor(() =>
        expect(result.current.session?.lastAttempt?.input).toEqual(
            attempt.input,
        ),
    );
    expect(submit).not.toHaveBeenCalled();
    const retry = vi.fn().mockResolvedValue(false);
    render(
        <InterviewRecovery
            attempt={attempt}
            locale='en'
            busy={false}
            onSubmit={retry}
            onDismiss={vi.fn()}
        />,
    );
    expect(screen.getByRole('checkbox', { name: 'Work' })).toBeChecked();
    const input = screen.getByRole('textbox', { name: 'Your previous answer' });
    expect(input).toHaveValue('Meetings');
    fireEvent.change(input, { target: { value: 'Presentations' } });
    fireEvent.click(
        screen.getByRole('button', { name: 'Try this answer again' }),
    );
    await waitFor(() =>
        expect(retry).toHaveBeenCalledWith({
            kind: 'answer',
            topic: 'goals',
            selected: ['Work'],
            text: 'Presentations',
        }),
    );
    expect(input).toHaveValue('Presentations');
});
it('does not cancel durable server work when the interview view unmounts', async () => {
    const active = {
        id: '00000000-0000-4000-8000-000000000002',
        interviewId: session.interviewId,
        state: 'running' as const,
        result: null,
        errorCode: null,
    };
    vi.mocked(portraitApi.startInterview).mockResolvedValue({
        ...session,
        activeOperation: active,
    });
    const stop = vi.spyOn(portraitApi, 'stopOperation');
    vi.spyOn(portraitApi, 'readOperation').mockImplementation(
        () => new Promise(() => {}),
    );
    const { result, unmount } = mount();
    await waitFor(() => expect(result.current.busy).toBe(true));
    unmount();
    expect(stop).not.toHaveBeenCalled();
});
it('keeps an admitted chat answer until a successful transcript update confirms it', async () => {
    const send = vi.fn().mockResolvedValue(true);
    const { rerender } = render(
        <InterviewComposer
            locale='en'
            free
            disabled={false}
            clearVersion={0}
            onSend={send}
        />,
    );
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Short steps help' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(input).toHaveValue('Short steps help');
    rerender(
        <InterviewComposer
            locale='en'
            free
            disabled={false}
            clearVersion={2}
            onSend={send}
        />,
    );
    await waitFor(() => expect(input).toHaveValue(''));
});

it('reveals the source opening greeting and question before the first form', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useInterviewOpening(session));
    expect(result.current).toEqual({ revealed: 0, typing: true, done: false });
    act(() => vi.advanceTimersByTime(700));
    expect(result.current).toEqual({ revealed: 1, typing: false, done: false });
    act(() => vi.advanceTimersByTime(250));
    expect(result.current.typing).toBe(true);
    act(() => vi.advanceTimersByTime(650));
    expect(result.current).toEqual({ revealed: 2, typing: false, done: false });
    act(() => vi.advanceTimersByTime(450));
    expect(result.current.done).toBe(true);
});
it('shows resumed history immediately and skips opening delays with reduced motion', () => {
    const resumed = {
        ...session,
        context: {
            ...session.context,
            messages: [{ role: 'user' as const, content: 'Travel' }],
        },
    };
    const first = renderHook(() => useInterviewOpening(resumed));
    expect(first.result.current.done).toBe(true);
    first.unmount();
    const match = window.matchMedia('(prefers-reduced-motion: reduce)');
    vi.spyOn(window, 'matchMedia').mockReturnValue({ ...match, matches: true });
    const reduced = renderHook(() => useInterviewOpening(session));
    expect(reduced.result.current.done).toBe(true);
    expect(reduced.result.current.typing).toBe(false);
});

it('never saves or changes either account cache when identity changes during proposal review', async () => {
    const client = new QueryClient();
    const beforeA = { ...current, version: 3 };
    const beforeB = { ...current, version: 8 };
    client.setQueryData(portraitQueryKey('learner-one'), beforeA);
    client.setQueryData(portraitQueryKey('learner-two'), beforeB);
    let resolveRead!: (value: PortraitState) => void;
    vi.mocked(portraitApi.read).mockImplementationOnce(
        () =>
            new Promise((resolve) => {
                resolveRead = resolve;
            }),
    );
    const save = vi.spyOn(portraitApi, 'saveDraft');
    const onProposal = vi.fn();
    const onSession = vi.fn();
    const onError = vi.fn();
    const proposal = {
        id: '00000000-0000-4000-8000-000000000005',
        interviewId: session.interviewId,
        state: 'succeeded' as const,
        errorCode: null,
        result: {
            ...session.initialQuestion,
            proposedItems: { ...items, goals: ['Private account A goal'] },
        },
        baseVersion: current.version,
        baseGeneration: current.generation,
        stale: false,
    };
    function wrapper({ children }: { children: ReactNode }) {
        return (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        );
    }
    const { result } = renderHook(
        () =>
            useInterviewProposalDraft({
                ownerId: 'learner-one',
                proposal,
                locale: 'en',
                requestWithSession,
                onProposal,
                onSession,
                onError,
            }),
        { wrapper },
    );
    let pending!: Promise<void>;
    act(() => {
        pending = result.current();
    });
    act(() => {
        useSessionStore.setState({
            user: { ...useSessionStore.getState().user!, id: 'learner-two' },
        });
    });
    await act(async () => {
        resolveRead(current);
        await pending;
    });
    expect(save).not.toHaveBeenCalled();
    expect(onProposal).not.toHaveBeenCalled();
    expect(onSession).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(client.getQueryData(portraitQueryKey('learner-one'))).toEqual(
        beforeA,
    );
    expect(client.getQueryData(portraitQueryKey('learner-two'))).toEqual(
        beforeB,
    );
});
it('checks identity again when auth refresh retries an interview callback', async () => {
    const operation = vi.fn().mockResolvedValue('first-account-response');
    const refreshingRequest = async <T,>(
        callback: (token: string) => Promise<T>,
    ) => {
        await callback('first-account-token');
        useSessionStore.setState({
            user: { ...useSessionStore.getState().user!, id: 'learner-two' },
        });
        return callback('second-account-token');
    };
    const guarded = ownerScopedInterviewRequest(
        'learner-one',
        refreshingRequest,
    );
    await expect(guarded(operation)).rejects.toThrow();
    expect(operation).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledWith('first-account-token');
});
it('drops an old account proposal save receipt without updating either cache', async () => {
    const client = new QueryClient();
    client.setQueryData(portraitQueryKey('learner-one'), current);
    client.setQueryData(portraitQueryKey('learner-two'), {
        ...current,
        version: 9,
    });
    let resolveSave!: (value: PortraitState) => void;
    const save = vi.spyOn(portraitApi, 'saveDraft').mockImplementation(
        () =>
            new Promise((resolve) => {
                resolveSave = resolve;
            }),
    );
    const onSession = vi.fn();
    const onProposal = vi.fn();
    const onError = vi.fn();
    const proposal = {
        id: '00000000-0000-4000-8000-000000000005',
        interviewId: session.interviewId,
        state: 'succeeded' as const,
        errorCode: null,
        result: { ...session.initialQuestion, proposedItems: items },
        baseVersion: current.version,
        baseGeneration: current.generation,
        stale: false,
    };
    function wrapper({ children }: { children: ReactNode }) {
        return (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        );
    }
    const { result } = renderHook(
        () =>
            useInterviewProposalDraft({
                ownerId: 'learner-one',
                proposal,
                locale: 'en',
                requestWithSession,
                onProposal,
                onSession,
                onError,
            }),
        { wrapper },
    );
    let pending!: Promise<void>;
    act(() => {
        pending = result.current();
    });
    await waitFor(() => expect(save).toHaveBeenCalled());
    act(() => {
        useSessionStore.setState({
            user: { ...useSessionStore.getState().user!, id: 'learner-two' },
        });
    });
    await act(async () => {
        resolveSave({ ...current, version: 2 });
        await pending;
    });
    expect(onSession).not.toHaveBeenCalled();
    expect(onProposal).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(client.getQueryData(portraitQueryKey('learner-one'))).toEqual(
        current,
    );
    expect(client.getQueryData(portraitQueryKey('learner-two'))).toEqual({
        ...current,
        version: 9,
    });
});

it('keeps retry controls usable and explains unavailable interview models after a response is rejected', async () => {
    const match = window.matchMedia('(prefers-reduced-motion: reduce)');
    vi.spyOn(window, 'matchMedia').mockReturnValue({ ...match, matches: true });
    const submit = vi
        .spyOn(portraitApi, 'submitInterview')
        .mockRejectedValue({ code: 'model_unavailable' });
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    render(
        <QueryClientProvider client={client}>
            <PortraitInterviewPage />
        </QueryClientProvider>,
    );
    const input = await screen.findByRole('textbox', {
        name: 'Ask a question or answer in your own words…',
    });
    fireEvent.change(input, {
        target: { value: 'What does this question mean?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(
        await screen.findByText(
            /The selected model is unavailable for interviews/,
        ),
    ).toHaveTextContent('Auto or DeepSeek Flash');
    expect(
        screen.getByRole('link', {
            name: 'Model settings (opens in a new tab)',
        }),
    ).toHaveAttribute('href', '/profile?tab=account');
    expect(
        screen.getByRole('link', {
            name: 'Model settings (opens in a new tab)',
        }),
    ).toHaveAttribute('target', '_blank');
    expect(input).toHaveValue('What does this question mean?');
    expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    await waitFor(() =>
        expect(
            screen.queryByText(
                /The selected model is unavailable for interviews/,
            ),
        ).not.toBeInTheDocument(),
    );
    expect(input).toHaveValue('What does this question mean?');
    expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled();
});

it('keeps the source composer as one input that accepts both questions and long answers', async () => {
    const send = vi.fn().mockResolvedValue(true);
    render(
        <InterviewComposer locale='en' free disabled={false} onSend={send} />,
    );
    expect(
        screen.queryByRole('combobox', { name: 'Message purpose' }),
    ).not.toBeInTheDocument();
    const input = screen.getByRole('textbox');
    const answer = 'a'.repeat(1000);
    fireEvent.change(input, { target: { value: answer } });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(send).toHaveBeenCalledWith(answer));
    expect(
        screen.getByText('1,000/1,000 characters · free'),
    ).toBeInTheDocument();
});
it('shows the source preview title and a readable cross-device resume expiry', () => {
    const match = window.matchMedia('(max-width: 1023px)');
    vi.spyOn(window, 'matchMedia').mockReturnValue({
        ...match,
        matches: false,
    });
    render(
        <InterviewPreview
            items={items}
            locale='en'
            expiresAt={session.expiresAt}
            pending={0}
            open
            onClose={vi.fn()}
            onReview={vi.fn()}
        />,
    );
    expect(
        screen.getByRole('heading', { name: 'Your portrait so far' }),
    ).toBeInTheDocument();
    expect(
        screen.queryByRole('heading', { name: 'Portrait summary' }),
    ).not.toBeInTheDocument();
    expect(
        screen.getByText(/Paused interviews resume on any device until/),
    ).toHaveTextContent('Dec 1, 2026');
    expect(screen.getByText('Nothing to save yet')).toBeInTheDocument();
});
