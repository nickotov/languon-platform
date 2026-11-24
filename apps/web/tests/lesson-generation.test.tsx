import {
    act,
    fireEvent,
    renderHook,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type PropsWithChildren } from 'react';
import type { GenerationRunSummary } from '@languon/contracts';
import { afterEach, expect, it, vi } from 'vitest';
import { useLessonRunActions } from '../src/fsd/features/lesson-generation/hooks/use-lesson-run-actions';
import { useLessonComposer } from '../src/fsd/widgets/contextual-assistant/hooks/use-lesson-composer';
import { LessonRunCard } from '../src/fsd/features/lesson-generation/ui/lesson-run-card/lesson-run-card';
import { LessonRunRevision } from '../src/fsd/features/lesson-generation/ui/lesson-run-revision/lesson-run-revision';
import { LessonRunQuote } from '../src/fsd/features/lesson-generation/ui/lesson-run-quote/lesson-run-quote';
import { LessonRuns } from '../src/fsd/features/lesson-generation/ui/lesson-runs/lesson-runs';
import { lessonRun, lessonTurn, lessonPlan, runId } from './lesson-run-fixture';
import { render } from './render';

const request = <T,>(operation: (token: string) => Promise<T>) =>
    operation('synthetic-token');
const quote = {
    id: '22222222-2222-4222-8222-222222222222',
    maximumCredits: '2.500',
    approximateOutputTokens: 5000,
    expiresAt: '2099-01-01T00:00:00.000Z',
};

function wrapper({ children }: PropsWithChildren) {
    const [client] = useState(
        () =>
            new QueryClient({
                defaultOptions: { queries: { retry: false } },
            }),
    );

    return (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
}

afterEach(() => vi.unstubAllGlobals());

function capacityHarness(postResponse?: (init: RequestInit) => Response) {
    const refresh = vi.fn(async () => {});
    const adjust = vi.fn();
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
            if (postResponse) {
                return postResponse(init);
            }

            return Response.json(
                {
                    error: {
                        code: 'generation_scope_change',
                        message: 'Revise this lesson plan.',
                    },
                },
                { status: 409 },
            );
        }

        return Response.json({ run: lessonRun, plan: lessonPlan });
    });

    vi.stubGlobal('fetch', fetch);

    function Harness({ run }: { run: GenerationRunSummary }) {
        const actions = useLessonRunActions(
            request,
            refresh,
            'owner:conversation',
            lessonRun.conversationId,
        );

        return (
            <LessonRuns
                state={{
                    runs: [run],
                    isError: false,
                    rechecking: false,
                    refresh,
                    actions,
                }}
                actorId='owner'
                request={request}
                busy={false}
                reconnecting={false}
                onAdjust={adjust}
            />
        );
    }

    return { Harness, refresh, adjust, fetch };
}

it('blocks Continue for a capacity failure while keeping Adjust available, and Refresh clears that failure', async () => {
    const { Harness, refresh, adjust, fetch } = capacityHarness();
    render(<Harness run={lessonRun} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled(),
    );

    await screen.findByText('generation_scope_change');
    expect(screen.getByRole('button', { name: 'Adjust plan' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
        fetch.mock.calls.filter((call) => call[1]?.method === 'POST'),
    ).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Adjust plan' }));
    expect(adjust).toHaveBeenCalledWith(lessonRun);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled(),
    );

    expect(
        screen.queryByRole('button', { name: 'Refresh' }),
    ).not.toBeInTheDocument();

    expect(refresh).toHaveBeenCalled();
});

it.each([
    ['capacity_unavailable', 'The AI service is at capacity.'],
    [
        'provider_capacity_exhausted',
        'The AI provider’s usage limit has been reached.',
    ],
    [
        'operator_capacity_exhausted',
        'The service’s AI spending limit has been reached.',
    ],
])(
    'explains a confirmed quote rejected with %s, keeps the checkpoint and idle controls',
    async (code, message) => {
        const diagnosticReference = '6d286a43-ded1-4819-92fe-47ca51a9da62';
        const { Harness, fetch } = capacityHarness((init) => {
            const command = JSON.parse(String(init.body)) as {
                confirmedQuoteId?: string;
            };

            return command.confirmedQuoteId
                ? Response.json(
                      {
                          error: {
                              code,
                              message: 'Capacity limit.',
                              requestId: diagnosticReference,
                          },
                      },
                      { status: 503 },
                  )
                : Response.json(
                      {
                          error: {
                              code: 'action_confirmation_required',
                              message: 'Confirmation required.',
                              details: { quote },
                          },
                      },
                      { status: 409 },
                  );
        });

        render(<Harness run={lessonRun} />, { wrapper });
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        const dialog = await screen.findByRole('dialog');
        fireEvent.click(
            within(dialog).getByRole('button', { name: 'Continue' }),
        );

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent(message);
        expect(alert).toHaveTextContent(
            'The request was rejected before generation started.',
        );

        expect(alert).toHaveTextContent(diagnosticReference);
        expect(
            within(alert).queryByRole('button', { name: 'Refresh' }),
        ).toBeNull();

        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
        expect(
            fetch.mock.calls.filter(([, init]) => init?.method === 'POST'),
        ).toHaveLength(2);
    },
);

it.each([
    ['provider-capacity', 'Достигнут лимит провайдера ИИ.'],
    ['operator-capacity', 'Достигнут лимит расходов сервиса на ИИ.'],
] as const)(
    'preserves %s recovery guidance in a reopened Russian lesson',
    (admissionReason, message) => {
        const { Harness, fetch } = capacityHarness();
        render(
            <Harness
                run={{
                    ...lessonRun,
                    pauseReason: 'technical-failure',
                    failure: { code: 'admission-blocked', admissionReason },
                }}
            />,
            { wrapper, locale: 'ru' },
        );

        expect(screen.getByText(message, { exact: false })).toBeVisible();
        expect(
            screen.getByRole('button', { name: 'Повторить оставшуюся часть' }),
        ).toBeEnabled();

        expect(
            fetch.mock.calls.filter(([, init]) => init?.method === 'POST'),
        ).toHaveLength(0);
    },
);

it('does not keep a changed plan revision blocked by the previous revision’s capacity failure', async () => {
    const { Harness } = capacityHarness();
    let changeRevision!: (revision: number) => void;
    function RevisedLesson() {
        const [revision, setRevision] = useState(lessonRun.revision);
        changeRevision = setRevision;

        return <Harness run={{ ...lessonRun, revision }} />;
    }

    render(<RevisedLesson />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('generation_scope_change');
    await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled(),
    );

    act(() => changeRevision(2));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Adjust plan' })).toBeEnabled();
});

it('does not render private plan labels or actions for a discarded run', () => {
    const handlers = {
        onContinue: vi.fn(),
        onStop: vi.fn(),
        onAdjust: vi.fn(),
        onDiscard: vi.fn(),
        onKeepSources: vi.fn(),
        onRefreshSources: vi.fn(),
    };
    const { container } = render(
        <LessonRunCard
            run={{ ...lessonRun, state: 'discarded' }}
            busy={false}
            stopping={false}
            reconnecting={false}
            {...handlers}
        />,
    );

    expect(container).toBeEmptyDOMElement();
});

it('requires a fresh explicit budget after expiry and never confirms an expired allowance', () => {
    const confirm = vi.fn();
    const refresh = vi.fn();
    render(
        <LessonRunQuote
            quote={{ ...quote, expiresAt: '2020-01-01T00:00:00.000Z' }}
            busy={false}
            onConfirm={confirm}
            onRefresh={refresh}
            onClose={vi.fn()}
        />,
    );

    expect(screen.getByText('2.500')).toBeVisible();
    expect(
        screen.getByText(/Approximate output tokens per stage:/),
    ).toBeVisible();

    expect(
        screen.queryByRole('button', { name: 'Continue' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh budget' }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();
});

it('does not dispatch on mount; confirms exactly one quoted stage with the same request identity', async () => {
    const fetch = vi
        .fn()
        .mockResolvedValueOnce(
            Response.json(
                {
                    error: {
                        code: 'action_confirmation_required',
                        message: 'Confirm this allowance.',
                        details: { quote },
                    },
                },
                { status: 409 },
            ),
        )
        .mockResolvedValueOnce(Response.json({ turn: lessonTurn }));

    vi.stubGlobal('fetch', fetch);
    const refresh = vi.fn(async () => {});
    const { result } = renderHook(
        () =>
            useLessonRunActions(
                request,
                refresh,
                'owner:conversation',
                lessonRun.conversationId,
            ),
        { wrapper },
    );

    expect(fetch).not.toHaveBeenCalled();
    act(() => result.current.execute({ kind: 'continue', run: lessonRun }));
    await waitFor(() => expect(result.current.quote).toEqual(quote));
    expect(fetch).toHaveBeenCalledTimes(1);
    act(() => {
        result.current.confirm();
        result.current.confirm();
    });

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledTimes(2);
    const first = JSON.parse(fetch.mock.calls[0]![1].body);
    const second = JSON.parse(fetch.mock.calls[1]![1].body);
    expect(first).toMatchObject({ expectedRevision: 1 });
    expect(first.confirmedQuoteId).toBeUndefined();
    expect(second).toEqual({ ...first, confirmedQuoteId: quote.id });
});

it('applies a revision while staying paused without dispatching Continue', async () => {
    const updated = { run: { ...lessonRun, revision: 2 }, plan: lessonPlan };
    const fetch = vi.fn(async () => Response.json(updated));
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(
        () =>
            useLessonRunActions(
                request,
                async () => {},
                'owner:conversation',
                lessonRun.conversationId,
            ),
        { wrapper },
    );

    act(() =>
        result.current.execute({
            kind: 'applyRevision',
            run: lessonRun,
            candidateId: runId,
        }),
    );

    await waitFor(() =>
        expect(result.current.accepted?.kind).toBe('applyRevision'),
    );

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[0]).toContain('/apply-revision');
});

it('sends an explicitly captured selection with the source refresh and keeps the run paused', async () => {
    const fetch = vi.fn(async () =>
        Response.json({ run: { ...lessonRun, revision: 2 }, plan: lessonPlan }),
    );

    vi.stubGlobal('fetch', fetch);
    const editorContext = {
        workingBranch: { id: runId, version: 3 },
        content: 'Current passage.',
        selectedText: 'Current passage.',
        editorTarget: {
            from: 0,
            to: 16,
            originalText: 'Current passage.',
            documentHash: 'a'.repeat(64),
        },
    };
    const { result } = renderHook(
        () =>
            useLessonRunActions(
                request,
                async () => {},
                'owner:conversation',
                lessonRun.conversationId,
            ),
        { wrapper },
    );

    act(() =>
        result.current.execute({
            kind: 'resolveSource',
            run: lessonRun,
            choice: 'refresh',
            sourceId: 'source',
            editorContext,
        }),
    );

    await waitFor(() =>
        expect(result.current.accepted?.kind).toBe('resolveSource'),
    );

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[0]).toContain('/resolve-source');
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toMatchObject({
        expectedRevision: 1,
        choice: 'refresh',
        sourceId: 'source',
        editorContext,
    });
});

it('does not carry a prior conversation’s quote into the next conversation', async () => {
    vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
            Response.json(
                {
                    error: {
                        code: 'action_confirmation_required',
                        message: 'Confirm.',
                        details: { quote },
                    },
                },
                { status: 409 },
            ),
        ),
    );

    const { result, rerender } = renderHook(
        ({ scope }) =>
            useLessonRunActions(
                request,
                async () => {},
                scope,
                lessonRun.conversationId,
            ),
        { wrapper, initialProps: { scope: 'first' } },
    );

    act(() => result.current.execute({ kind: 'continue', run: lessonRun }));
    await waitFor(() => expect(result.current.quote).not.toBeNull());
    rerender({ scope: 'second' });
    expect(result.current.quote).toBeNull();
    expect(result.current.action).toBeUndefined();
});

it('offers Stop only while running; reconnect never permits another action or partial insertion', () => {
    const handlers = {
        onContinue: vi.fn(),
        onStop: vi.fn(),
        onAdjust: vi.fn(),
        onDiscard: vi.fn(),
        onKeepSources: vi.fn(),
        onRefreshSources: vi.fn(),
    };

    render(
        <LessonRunCard
            run={{
                ...lessonRun,
                state: 'running',
                pauseReason: undefined,
                activeTurnId: runId,
            }}
            busy={false}
            stopping={false}
            reconnecting
            {...handlers}
        />,
    );

    expect(screen.getByRole('button', { name: 'Stop' })).toBeDisabled();
    expect(
        screen.queryByRole('button', { name: 'Continue' }),
    ).not.toBeInTheDocument();

    expect(
        screen.queryByRole('button', { name: /Insert/ }),
    ).not.toBeInTheDocument();

    expect(screen.getByText('1 of 2 parts ready')).toBeVisible();
});

it('reviews reused and changed parts before a separate free Apply plan action', () => {
    const apply = vi.fn();
    render(
        <LessonRunRevision
            candidate={{
                id: runId,
                baseRevision: 1,
                plan: lessonPlan,
                keptTaskIds: ['reading'],
                changedTaskIds: ['grammar'],
                addedTaskIds: [],
                removedTaskIds: [],
            }}
            run={lessonRun}
            busy={false}
            onApply={apply}
            onDismiss={vi.fn()}
        />,
    );

    expect(screen.getByText('Kept')).toBeVisible();
    expect(screen.getByText('Updated')).toBeVisible();
    expect(screen.getByText(/Applying this plan is free/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Apply plan' }));
    expect(apply).toHaveBeenCalledOnce();
    expect(
        screen.queryByRole('button', { name: 'Continue' }),
    ).not.toBeInTheDocument();
});

it('fences a stale conversation callback even when both lessons belong to one note', async () => {
    const other = '22222222-2222-4222-8222-222222222222';
    const fetch = vi.fn(async (_url: string) =>
        Response.json({ turn: lessonTurn }),
    );

    vi.stubGlobal('fetch', fetch);
    const hook = renderHook(
        ({ conversationId }) =>
            useLessonRunActions(
                request,
                async () => {},
                'actor:' + conversationId,
                conversationId,
            ),
        { wrapper, initialProps: { conversationId: lessonRun.conversationId } },
    );
    const stale = hook.result.current.execute;
    hook.rerender({ conversationId: other });
    act(() => stale({ kind: 'continue', run: lessonRun }));
    act(() =>
        hook.result.current.execute({ kind: 'continue', run: lessonRun }),
    );

    expect(fetch).not.toHaveBeenCalled();
    act(() =>
        hook.result.current.execute({
            kind: 'continue',
            run: { ...lessonRun, id: other, conversationId: other },
        }),
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(fetch.mock.calls[0]?.[0]).toContain(
        '/conversations/' + other + '/generation-runs/' + other + '/continue',
    );
});

it('reuses an uncertain command after remount despite a newer run timestamp', async () => {
    const fetch = vi.fn(async (_url: string, _options?: RequestInit) => {
        throw new TypeError('lost acknowledgement');
    });

    vi.stubGlobal('fetch', fetch);
    const mount = () =>
        renderHook(
            () =>
                useLessonRunActions(
                    request,
                    async () => {},
                    'retry-owner',
                    lessonRun.conversationId,
                ),
            { wrapper },
        );
    const first = mount();
    act(() =>
        first.result.current.execute({ kind: 'continue', run: lessonRun }),
    );

    await waitFor(() => expect(first.result.current.error).toBeTruthy());
    first.unmount();
    const second = mount();
    act(() =>
        second.result.current.execute({
            kind: 'continue',
            run: { ...lessonRun, updatedAt: '2026-11-17T10:10:10.000Z' },
        }),
    );

    await waitFor(() => expect(second.result.current.error).toBeTruthy());
    const ids = fetch.mock.calls.map(
        ([, options]) => JSON.parse(String(options?.body)).requestId,
    );

    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
    // Progress can change after the first ACK was lost. Exact durable admission
    // distinguishes the next authorized stage from a duplicate HTTP retry.
    act(() =>
        second.result.current.execute({
            kind: 'continue',
            run: {
                ...lessonRun,
                lastCommandRequestId: ids[0],
                tasks: lessonRun.tasks.map((task) =>
                    task.id === 'grammar'
                        ? { ...task, status: 'failed' }
                        : task,
                ),
            },
        }),
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(
        JSON.parse(String(fetch.mock.calls[2]?.[1]?.body)).requestId,
    ).not.toBe(ids[0]);
});

it.each(['provider-outcome-unknown', 'content-invalid'] as const)(
    'requests fresh authority for the durable uncertain turn even when the displayed failure is %s',
    async (code) => {
        const uncertain = {
            ...lessonRun,
            pauseReason: 'technical-failure' as const,
            uncertainTurnId: runId,
            failure: {
                code,
                referenceId: runId,
            },
        };
        const { Harness, fetch } = capacityHarness();
        render(<Harness run={uncertain} />, { wrapper });
        expect(
            screen.getByRole('button', { name: 'Authorize a plan adjustment' }),
        ).toBeEnabled();

        expect(
            screen.getByText(/provider may have processed the last request/i),
        ).toBeVisible();

        expect(
            fetch.mock.calls.filter(
                ([, options]) => options?.method === 'POST',
            ),
        ).toHaveLength(0);

        fireEvent.click(
            screen.getByRole('button', { name: 'Authorize another attempt' }),
        );

        await waitFor(() =>
            expect(
                fetch.mock.calls.filter(
                    ([, options]) => options?.method === 'POST',
                ),
            ).toHaveLength(1),
        );

        const post = fetch.mock.calls.find(
            ([, options]) => options?.method === 'POST',
        );

        expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
            acknowledgedUncertainTurnId: runId,
            expectedRevision: lessonRun.revision,
        });
    },
);

it('restores oversized input guidance from the server and keeps Adjust available after reload', async () => {
    const { Harness, fetch } = capacityHarness();
    const serverRun: GenerationRunSummary = {
        ...lessonRun,
        pauseReason: 'technical-failure',
        failure: {
            code: 'admission-blocked',
            admissionReason: 'context-too-large',
        },
    };

    render(<Harness run={serverRun} />, { wrapper });
    expect(
        screen.getByText(/source material for this step exceeds/i),
    ).toBeVisible();

    expect(
        screen.getByRole('button', { name: 'Retry remaining part' }),
    ).toBeDisabled();

    expect(screen.getByRole('button', { name: 'Adjust plan' })).toBeEnabled();
    expect(
        fetch.mock.calls.filter(([, opts]) => opts?.method === 'POST'),
    ).toHaveLength(0);
});

it('binds plan-adjustment consent to the reviewed uncertainty before sending a revision', async () => {
    let current: GenerationRunSummary = {
        ...lessonRun,
        pauseReason: 'technical-failure',
        uncertainTurnId: runId,
        failure: { code: 'provider-outcome-unknown', referenceId: runId },
    };
    const fetch = vi.fn(async (_url: string, init?: RequestInit) =>
        Response.json(
            init?.method === 'POST'
                ? { turn: lessonTurn }
                : { runs: [current] },
        ),
    );

    vi.stubGlobal('fetch', fetch);
    const send = vi.fn();
    const hook = renderHook(
        () =>
            useLessonComposer({
                actorId: 'revision-owner',
                conversationId: current.conversationId,
                request,
                reconciliations: 0,
                enabled: true,
                question: 'Shorten the reading',
                replaceQuestion: vi.fn(),
                send,
                refresh: async () => {},
            }),
        { wrapper },
    );

    await waitFor(() => expect(hook.result.current.state.runs).toHaveLength(1));
    act(() => hook.result.current.adjust(current));
    expect(hook.result.current.selected?.id).toBe(current.id);
    current = {
        ...current,
        revision: 2,
        uncertainTurnId: '22222222-2222-4222-8222-222222222222',
        updatedAt: '2026-11-17T00:00:00.000Z',
    };

    await act(() => hook.result.current.state.refresh());
    act(() => hook.result.current.submit());
    expect(send).not.toHaveBeenCalled();
    expect(
        fetch.mock.calls.filter(([, opts]) => opts?.method === 'POST'),
    ).toHaveLength(0);

    act(() => hook.result.current.adjust(current));
    act(() => hook.result.current.submit());
    await waitFor(() =>
        expect(
            fetch.mock.calls.filter(([, opts]) => opts?.method === 'POST'),
        ).toHaveLength(1),
    );

    const post = fetch.mock.calls.find(([, opts]) => opts?.method === 'POST');
    expect(post?.[0]).toContain('/revise');
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
        expectedRevision: 2,
        acknowledgedUncertainTurnId: current.uncertainTurnId,
    });
});

it('shows the actual recording ceiling inline and submits the server-issued receipt once on approval', async () => {
    const requestId = '77777777-7777-4777-8777-777777777777';
    const listeningRun: GenerationRunSummary = {
        ...lessonRun,
        state: 'paused',
        pauseReason: 'recording-confirmation',
        recordingApproval: {
            requestId,
            quote: { ...quote, scope: 'listening-lesson' },
        },
    };
    const { Harness, fetch } = capacityHarness(() =>
        Response.json({ run: listeningRun, turn: lessonTurn }),
    );

    render(<Harness run={listeningRun} />, { wrapper });
    const confirm = screen.getByRole('button', { name: 'Generate recording' });
    expect(screen.getByText('Up to 2.5 credits')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
        screen.queryByRole('button', { name: 'Continue' }),
    ).not.toBeInTheDocument();

    expect(
        fetch.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(0);

    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => {
        const posts = fetch.mock.calls.filter(
            ([, init]) => init?.method === 'POST',
        );

        expect(posts).toHaveLength(1);
        expect(JSON.parse(String(posts[0]![1]!.body))).toMatchObject({
            requestId,
            confirmedQuoteId: quote.id,
        });
    });
});

it('refreshes an expired recording estimate inline and requires a fresh click on the updated price', async () => {
    const listeningRun: GenerationRunSummary = {
        ...lessonRun,
        state: 'paused',
        pauseReason: 'recording-confirmation',
        recordingApproval: {
            requestId: runId,
            quote: {
                ...quote,
                scope: 'listening-lesson',
                expiresAt: '2020-01-01T00:00:00.000Z',
            },
        },
    };
    const { Harness, fetch } = capacityHarness(() =>
        Response.json(
            {
                error: {
                    code: 'action_confirmation_required',
                    message: 'Confirm',
                    details: {
                        quote: {
                            ...quote,
                            scope: 'listening-lesson',
                            maximumCredits: '1.25',
                        },
                    },
                },
            },
            { status: 409 },
        ),
    );

    render(<Harness run={listeningRun} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh estimate' }));
    await screen.findByText('Up to 1.25 credits');
    expect(
        screen.getByRole('button', { name: 'Generate recording' }),
    ).toBeEnabled();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const posts = fetch.mock.calls.filter(
        ([, init]) => init?.method === 'POST',
    );

    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0]![1]!.body))).not.toHaveProperty(
        'confirmedQuoteId',
    );
});

it('keeps a capacity error on a pending recording but clears it when another tab starts the same plan', async () => {
    const requestId = '77777777-7777-4777-8777-777777777777';
    const awaiting: GenerationRunSummary = {
        ...lessonRun,
        activeTurnId: null,
        state: 'paused',
        pauseReason: 'recording-confirmation',
        recordingApproval: {
            requestId,
            quote: { ...quote, scope: 'listening-lesson' },
        },
    };
    const { Harness, fetch } = capacityHarness(() =>
        Response.json(
            {
                error: {
                    code: 'capacity_unavailable',
                    message: 'Capacity is occupied.',
                },
            },
            { status: 503 },
        ),
    );
    let reconcile!: (value: GenerationRunSummary) => void;
    function TwoTabs() {
        const [run, setRun] = useState(awaiting);
        reconcile = setRun;

        return <Harness run={run} />;
    }

    render(<TwoTabs />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Generate recording' }));
    await screen.findByText('capacity_unavailable');
    act(() => reconcile({ ...awaiting, updatedAt: new Date().toISOString() }));
    expect(screen.getByText('capacity_unavailable')).toBeVisible();
    const {
        recordingApproval: _approval,
        pauseReason: _reason,
        ...advanced
    } = awaiting;

    act(() =>
        reconcile({
            ...advanced,
            state: 'running',
            activeTurnId: lessonTurn.id,
            lastCommandRequestId: requestId,
        }),
    );

    expect(screen.queryByText('capacity_unavailable')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeVisible();
    expect(
        fetch.mock.calls.filter(([, init]) => init?.method === 'POST'),
    ).toHaveLength(1);
});
