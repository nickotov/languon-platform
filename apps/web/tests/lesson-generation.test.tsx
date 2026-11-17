import {
    act,
    fireEvent,
    renderHook,
    screen,
    waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type PropsWithChildren } from 'react';
import type { GenerationRunSummary } from '@languon/contracts';
import { afterEach, expect, it, vi } from 'vitest';
import { useLessonRunActions } from '../src/fsd/features/lesson-generation/hooks/use-lesson-run-actions';
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

function capacityHarness() {
    const refresh = vi.fn(async () => {});
    const adjust = vi.fn();
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
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
        );

        return (
            <LessonRuns
                state={{ runs: [run], isError: false, refresh, actions }}
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
        () => useLessonRunActions(request, refresh, 'owner:conversation'),
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
            useLessonRunActions(request, async () => {}, 'owner:conversation'),
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
            useLessonRunActions(request, async () => {}, 'owner:conversation'),
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
        ({ scope }) => useLessonRunActions(request, async () => {}, scope),
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
