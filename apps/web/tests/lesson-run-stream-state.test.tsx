import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type {
    ConversationEvent,
    GenerationRunSummary,
} from '@languon/contracts';
import {
    conversationApi,
    type ConversationSessionRequest,
} from '../src/fsd/entities/conversation';
import { useConversationStream } from '../src/fsd/widgets/contextual-assistant/hooks/use-conversation-stream';
import { useLessonRuns } from '../src/fsd/features/lesson-generation/hooks/use-lesson-runs';
import { lessonRunsApi } from '../src/fsd/features/lesson-generation/api/lesson-runs-api';
import {
    applyLessonRunEvent,
    shareLessonRunCache,
} from '../src/fsd/features/lesson-generation/lib/lesson-run-cache';
import { lessonRun, lessonTurn } from './lesson-run-fixture';

const actorId = 'streamed-lessons';
const request: ConversationSessionRequest = (operation) =>
    operation('synthetic');
const changed = vi.fn(async () => {});
const running: GenerationRunSummary = {
    ...lessonRun,
    state: 'running',
    pauseReason: undefined,
    activeTurnId: lessonTurn.id,
};
const failed: GenerationRunSummary = {
    ...lessonRun,
    pauseReason: 'technical-failure',
    failure: { code: 'content-invalid', taskId: 'grammar' },
};

function createProvider() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });

    function Provider({ children }: PropsWithChildren) {
        return (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        );
    }

    return { client, Provider };
}

function subscribe() {
    let receive: ((event: ConversationEvent) => void) | undefined;
    vi.spyOn(conversationApi, 'events').mockImplementation(
        async (_token, _id, _after, onEvent, signal) => {
            receive = onEvent;
            await new Promise<void>((resolve) =>
                signal.addEventListener('abort', () => resolve(), {
                    once: true,
                }),
            );
        },
    );

    return {
        ready: () => waitFor(() => expect(receive).toBeDefined()),
        emit(run: GenerationRunSummary, id = 1) {
            receive!({
                id,
                conversationId: run.conversationId,
                createdAt: run.updatedAt,
                type: 'generation-run',
                data: run,
            });
        },
    };
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

it('merges an event-created head with a late first GET without losing history or equal-timestamp failure state', async () => {
    let resolveList!: (value: { runs: GenerationRunSummary[] }) => void;
    const list = vi.spyOn(lessonRunsApi, 'list').mockImplementation(
        () =>
            new Promise((resolve) => {
                resolveList = resolve;
            }),
    );
    const transport = subscribe();
    const { client, Provider } = createProvider();
    const hook = renderHook(
        () => {
            const stream = useConversationStream(
                actorId,
                lessonRun.conversationId,
                request,
                undefined,
                undefined,
            );
            const lessons = useLessonRuns({
                actorId,
                conversationId: lessonRun.conversationId,
                request,
                reconciliations: stream.reconciliations,
                onChanged: changed,
            });

            return lessons;
        },
        { wrapper: Provider },
    );

    await transport.ready();
    await waitFor(() => expect(list).toHaveBeenCalledOnce());
    await act(async () => transport.emit(failed));
    await waitFor(() =>
        expect(hook.result.current.runs[0]?.failure?.code).toBe(
            'content-invalid',
        ),
    );

    const history = {
        ...lessonRun,
        id: '99999999-9999-4999-8999-999999999999',
        updatedAt: '2026-11-15T00:00:00.000Z',
    };

    await act(async () => resolveList({ runs: [running, history] }));
    await waitFor(() => expect(hook.result.current.runs).toHaveLength(2));
    expect(
        hook.result.current.runs.find((run) => run.id === lessonRun.id),
    ).toMatchObject({ state: 'paused', failure: { code: 'content-invalid' } });

    expect(hook.result.current.runs.some((run) => run.id === history.id)).toBe(
        true,
    );

    expect(
        client.getQueryState(['lesson-runs', actorId, lessonRun.conversationId])
            ?.fetchStatus,
    ).toBe('idle');

    hook.unmount();
});

it('uses streamed run updates without periodic list GETs while generation is active', async () => {
    const list = vi
        .spyOn(lessonRunsApi, 'list')
        .mockResolvedValue({ runs: [running] });
    const transport = subscribe();
    const { Provider } = createProvider();
    const hook = renderHook(
        () => {
            const stream = useConversationStream(
                actorId,
                lessonRun.conversationId,
                request,
                undefined,
                undefined,
            );

            return useLessonRuns({
                actorId,
                conversationId: lessonRun.conversationId,
                request,
                reconciliations: stream.reconciliations,
                onChanged: changed,
            });
        },
        { wrapper: Provider },
    );

    await transport.ready();
    await waitFor(() => expect(hook.result.current.runs).toHaveLength(1));
    vi.useFakeTimers();
    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(list).toHaveBeenCalledOnce();
    vi.useRealTimers();
    await act(async () => transport.emit(failed));
    await waitFor(() =>
        expect(hook.result.current.runs[0]?.state).toBe('paused'),
    );

    expect(hook.result.current.runs[0]?.failure?.code).toBe('content-invalid');
    expect(list).toHaveBeenCalledOnce();
    hook.unmount();
});

it('repairs once per actual stream reconciliation and does not dispatch or refetch again on rerender', async () => {
    const list = vi
        .spyOn(lessonRunsApi, 'list')
        .mockResolvedValue({ runs: [running] });
    const { Provider } = createProvider();
    const hook = renderHook(
        ({ reconciliations }) =>
            useLessonRuns({
                actorId,
                conversationId: lessonRun.conversationId,
                request,
                reconciliations,
                onChanged: changed,
            }),
        { wrapper: Provider, initialProps: { reconciliations: 0 } },
    );

    await waitFor(() => expect(hook.result.current.runs).toHaveLength(1));
    hook.rerender({ reconciliations: 1 });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    hook.rerender({ reconciliations: 1 });
    vi.useFakeTimers();
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(list).toHaveBeenCalledTimes(2);
    expect(changed).not.toHaveBeenCalled();
    hook.unmount();
});

it('protects the final TanStack publication even when a GET resolved before a newer event was committed', () => {
    const current = applyLessonRunEvent({ runs: [running] }, failed);
    const shared = shareLessonRunCache(current, {
        runs: [running],
        publication: 'snapshot',
    });

    expect(shared).toMatchObject({
        runs: [{ state: 'paused', failure: { code: 'content-invalid' } }],
    });

    const newer = {
        ...running,
        revision: 2,
        updatedAt: '2026-11-16T00:02:00.000Z',
    };

    expect(applyLessonRunEvent({ runs: [newer] }, failed).runs[0]).toBe(newer);
});

it('keeps actions gated after a failed repair read and unlocks on manual refresh', async () => {
    const list = vi
        .spyOn(lessonRunsApi, 'list')
        .mockResolvedValueOnce({ runs: [failed] })
        .mockRejectedValueOnce(new TypeError('network'))
        .mockResolvedValue({ runs: [failed] });
    const { Provider } = createProvider();
    const hook = renderHook(
        ({ reconciliations }) =>
            useLessonRuns({
                actorId,
                conversationId: lessonRun.conversationId,
                request,
                reconciliations,
                onChanged: changed,
            }),
        { wrapper: Provider, initialProps: { reconciliations: 0 } },
    );

    await waitFor(() => expect(hook.result.current.runs).toHaveLength(1));
    hook.rerender({ reconciliations: 1 });
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.rechecking).toBe(true);
    await act(() => hook.result.current.refresh());
    expect(hook.result.current.rechecking).toBe(false);
    expect(hook.result.current.isError).toBe(false);
    expect(list).toHaveBeenCalledTimes(3);
    hook.unmount();
});
