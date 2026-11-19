import { fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type {
    GenerationRunPreview,
    GenerationRunSummary,
    KnowledgeBody,
} from '@languon/contracts';
import { KnowledgeDocumentView } from '../src/fsd/features/knowledge-notes';
import { I18nProvider } from '../src/fsd/shared/i18n';
import { en } from '../src/fsd/shared/i18n/messages/en';
import { LessonRun } from '../src/fsd/features/lesson-generation/ui/lesson-run/lesson-run';
import { LessonRunCard } from '../src/fsd/features/lesson-generation/ui/lesson-run-card/lesson-run-card';
import { LessonRunPreview } from '../src/fsd/features/lesson-generation/ui/lesson-run-preview/lesson-run-preview';
import { useLessonRunActions } from '../src/fsd/features/lesson-generation/hooks/use-lesson-run-actions';
import { lessonRun, lessonPlan } from './lesson-run-fixture';
import { render } from './render';

const prepared: GenerationRunPreview = {
    runId: lessonRun.id,
    revision: 1,
    parts: [
        {
            taskId: 'reading',
            complete: true,
            completedUnitCount: 1,
            totalUnitCount: 1,
            body: {
                schemaVersion: 2,
                document: {
                    type: 'doc',
                    content: [
                        {
                            type: 'paragraph',
                            content: [
                                {
                                    type: 'text',
                                    text: 'La démocratie française repose sur le débat public.',
                                },
                            ],
                        },
                    ],
                },
            },
        },
    ],
};
const running: GenerationRunSummary = {
    ...lessonRun,
    state: 'running',
    pauseReason: undefined,
    activeTurnId: lessonRun.id,
    automation: { enabled: true, maximumCredits: '5', remainingCredits: '4' },
};

function advancedRun(
    updatedAt: string,
    completedUnitCount = 1,
): GenerationRunSummary {
    return {
        ...running,
        updatedAt,
        tasks: running.tasks.map((task, index) =>
            index === 1
                ? {
                      ...task,
                      kind: 'exercises',
                      status: 'running',
                      completedUnitCount,
                      totalUnitCount: 4,
                  }
                : task,
        ),
    };
}

const request = <T,>(operation: (token: string) => Promise<T>) =>
    operation('synthetic-token');

function wrapper({ children }: PropsWithChildren) {
    const [client] = useState(
        () =>
            new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    );

    return (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
}

function renderBody(body: KnowledgeBody) {
    return <KnowledgeDocumentView body={body} />;
}

const handlers = {
    onContinue: vi.fn(),
    onStop: vi.fn(),
    onAdjust: vi.fn(),
    onDiscard: vi.fn(),
    onKeepSources: vi.fn(),
    onRefreshSources: vi.fn(),
};

afterEach(() => vi.unstubAllGlobals());

it('exposes saved work and per-exercise progress while automatic preparation is running', () => {
    const preview = vi.fn();
    render(
        <LessonRunCard
            run={{
                ...running,
                tasks: [
                    running.tasks[0]!,
                    {
                        ...running.tasks[1]!,
                        kind: 'exercises',
                        status: 'running',
                        completedUnitCount: 2,
                        totalUnitCount: 4,
                    },
                ],
            }}
            busy
            stopping={false}
            reconnecting={false}
            onPreview={preview}
            {...handlers}
        />,
    );

    expect(
        screen.getByText(
            'Continues automatically within your approved budget. You can leave this page and return later.',
        ),
    ).toBeVisible();

    expect(screen.getAllByText('2 of 4 exercises ready')).toHaveLength(2);
    expect(
        screen.queryByRole('button', { name: 'Continue' }),
    ).not.toBeInTheDocument();

    fireEvent.click(
        screen.getByRole('button', { name: 'View prepared content' }),
    );

    expect(preview).toHaveBeenCalledOnce();
});

it.each([
    [
        'en',
        'Exercise 3 of 4',
        'Automatically correcting',
        'We could not produce a valid result',
        'Adjust plan',
        'View prepared content',
        'Stop',
    ],
    [
        'ru',
        'Упражнение 3 из 4',
        'Автоматически исправляем',
        'После автоматических попыток',
        'Изменить план',
        'Посмотреть готовое',
        'Остановить',
    ],
] as const)(
    'keeps checkpoint previews available during repair and after exhaustion in %s',
    (locale, ordinal, repairing, exhausted, adjust, preview, stop) => {
        const progress = advancedRun(lessonRun.updatedAt, 2);
        const repairingRun: GenerationRunSummary = {
            ...progress,
            state: 'paused',
            activeTurnId: null,
            pauseReason: 'budget',
            automation: {
                enabled: true,
                maximumCredits: '5',
                remainingCredits: '4',
                recoveringTaskId: 'grammar',
            },
            tasks: progress.tasks.map((task) =>
                task.id === 'grammar' ? { ...task, status: 'pending' } : task,
            ),
        };
        const props = {
            ...handlers,
            onPreview: vi.fn(),
            busy: false,
            stopping: false,
            reconnecting: false,
        };
        const view = render(<LessonRunCard run={repairingRun} {...props} />, {
            locale,
        });

        expect(screen.getByText(ordinal)).toBeVisible();
        expect(screen.getByText(repairing, { exact: false })).toBeVisible();
        expect(screen.getByRole('button', { name: stop })).toBeEnabled();
        expect(screen.getByRole('button', { name: preview })).toBeEnabled();
        expect(
            screen.queryByRole('button', {
                name: /continue|resume|продолжить/i,
            }),
        ).toBeNull();

        view.unmount();

        const exhaustedRun: GenerationRunSummary = {
            ...repairingRun,
            pauseReason: 'technical-failure',
            automation: undefined,
            failure: {
                code: 'schema-invalid',
                taskId: 'grammar',
                recoveryExhausted: true,
            },
        };

        render(<LessonRunCard run={exhaustedRun} {...props} />, { locale });
        expect(screen.getByText(exhausted, { exact: false })).toBeVisible();
        expect(screen.getAllByText(ordinal)[0]).toBeVisible();
        expect(screen.getByRole('button', { name: adjust })).toBeEnabled();
        expect(screen.getByRole('button', { name: preview })).toBeEnabled();
        expect(
            screen.queryByRole('button', {
                name: /continue|retry|resume|повторить|продолжить/i,
            }),
        ).toBeNull();
    },
);

it('offers an actionable retry and preview for an invalid exercise without restarting it', () => {
    const retry = vi.fn();
    render(
        <LessonRunCard
            run={{
                ...lessonRun,
                pauseReason: 'technical-failure',
                failure: { code: 'content-invalid', taskId: 'grammar' },
            }}
            busy={false}
            stopping={false}
            reconnecting={false}
            onPreview={vi.fn()}
            {...handlers}
            onContinue={retry}
        />,
    );

    expect(
        screen.getByText(/An exercise did not pass validation/),
    ).toBeVisible();

    expect(
        screen.getByRole('button', { name: 'View prepared content' }),
    ).toBeVisible();

    expect(retry).not.toHaveBeenCalled();
    fireEvent.click(
        screen.getByRole('button', { name: 'Retry remaining part' }),
    );

    expect(retry).toHaveBeenCalledOnce();
});

it('keeps Stop and saved preview available between automatic stages without offering a second Continue', () => {
    const stop = vi.fn();
    render(
        <LessonRunCard
            run={{
                ...lessonRun,
                automation: {
                    enabled: true,
                    maximumCredits: '5',
                    remainingCredits: '4',
                },
            }}
            busy={false}
            stopping={false}
            reconnecting={false}
            onPreview={vi.fn()}
            {...handlers}
            onStop={stop}
        />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(stop).toHaveBeenCalledOnce();
    expect(
        screen.getByRole('button', { name: 'View prepared content' }),
    ).toBeVisible();

    expect(
        screen.queryByRole('button', { name: 'Continue' }),
    ).not.toBeInTheDocument();

    expect(
        screen.queryByRole('button', { name: 'Adjust plan' }),
    ).not.toBeInTheDocument();
});

it('keeps the real document preview open across run updates and only makes read requests', async () => {
    const fetch = vi.fn(async (url: string, _init?: RequestInit) =>
        Response.json(
            url.endsWith('/preview')
                ? prepared
                : { run: lessonRun, plan: lessonPlan },
        ),
    );

    vi.stubGlobal('fetch', fetch);
    const action = vi.fn();
    const props = {
        actorId: 'synthetic',
        request,
        busy: false,
        reconnecting: false,
        failed: false,
        continueBlocked: false,
        onAction: action,
        onAdjust: vi.fn(),
        renderPreparedBody: renderBody,
    };
    const view = render(<LessonRun run={running} {...props} />, { wrapper });
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(
        screen.getByRole('button', { name: 'View prepared content' }),
    );

    await screen.findByText(
        'La démocratie française repose sur le débat public.',
    );

    const dialog = screen.getByRole('dialog', { name: 'Prepared content' });
    dialog.scrollTop = 80;
    view.rerender(
        <I18nProvider locale='en' messages={en}>
            <LessonRun
                run={advancedRun('2026-11-16T00:02:00.000Z')}
                {...props}
            />
        </I18nProvider>,
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('dialog', { name: 'Prepared content' })).toBe(
        dialog,
    );

    expect(dialog.scrollTop).toBe(80);
    expect(action).not.toHaveBeenCalled();
    expect(fetch.mock.calls.every((call) => call[1]?.method === 'GET')).toBe(
        true,
    );

    expect(
        screen.queryByRole('button', { name: /Insert|Save|Check with AI/ }),
    ).not.toBeInTheDocument();
});

it('retries a failed preview fetch without submitting a generation action', async () => {
    const fetch = vi
        .fn()
        .mockResolvedValueOnce(
            Response.json(
                {
                    error: {
                        code: 'internal_error',
                        message: 'Temporary failure',
                    },
                },
                { status: 500 },
            ),
        )
        .mockResolvedValueOnce(Response.json(prepared));

    vi.stubGlobal('fetch', fetch);
    const action = vi.fn();
    render(
        <LessonRun
            run={running}
            actorId='synthetic'
            request={request}
            busy={false}
            reconnecting={false}
            failed={false}
            continueBlocked={false}
            onAction={action}
            onAdjust={vi.fn()}
            renderPreparedBody={renderBody}
        />,
        { wrapper },
    );

    fireEvent.click(
        screen.getByRole('button', { name: 'View prepared content' }),
    );

    fireEvent.click(
        await screen.findByRole('button', { name: 'Retry preview' }),
    );

    await screen.findByText(
        'La démocratie française repose sur le débat public.',
    );

    expect(action).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
});

it('stops a run between automatic stages using the run-level fence', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
        Response.json({
            run: { ...lessonRun, pauseReason: 'stopped' },
            plan: lessonPlan,
        }),
    );

    vi.stubGlobal('fetch', fetch);
    function Harness() {
        const actions = useLessonRunActions(
            request,
            async () => {},
            'owner:conversation',
            lessonRun.conversationId,
        );

        function stop() {
            actions.execute({
                kind: 'stop',
                run: {
                    ...lessonRun,
                    automation: {
                        enabled: true,
                        maximumCredits: '5',
                        remainingCredits: '4',
                    },
                },
            });
        }

        return <button onClick={stop}>Stop run</button>;
    }

    render(<Harness />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Stop run' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(fetch.mock.calls[0]?.[0]).toContain('/generation-runs/');
    expect(fetch.mock.calls[0]?.[0]).toContain('/stop');
});

it('keeps only Close and local expansion actions in a prepared-content preview', () => {
    render(
        <LessonRunPreview
            run={lessonRun}
            preview={prepared}
            open
            loading={false}
            failed={false}
            onClose={vi.fn()}
            onRetry={vi.fn()}
            renderBody={renderBody}
        />,
    );

    expect(
        screen.getByText('La démocratie française repose sur le débat public.'),
    ).toBeVisible();

    expect(
        screen.getByText('This part is still being prepared.'),
    ).toBeVisible();

    expect(
        screen.queryByRole('button', { name: /Insert|Save|Check with AI/ }),
    ).not.toBeInTheDocument();
});

it('offers partial vocabulary preview before any logical part has completed', () => {
    const preview = vi.fn();
    render(
        <LessonRunCard
            run={{
                ...running,
                completedTaskCount: 0,
                totalTaskCount: 1,
                tasks: [
                    {
                        id: 'vocabulary',
                        kind: 'vocabulary',
                        status: 'running',
                        label: 'Two hundred words',
                        completedUnitCount: 20,
                        totalUnitCount: 200,
                    },
                ],
            }}
            busy={false}
            stopping={false}
            reconnecting={false}
            onPreview={preview}
            {...handlers}
        />,
    );

    expect(
        screen.getAllByText('20 of 200 vocabulary entries ready'),
    ).toHaveLength(2);

    fireEvent.click(
        screen.getByRole('button', { name: 'View prepared content' }),
    );

    expect(preview).toHaveBeenCalledOnce();
});

it('renders canonical plan order with a pending section between prepared parts', () => {
    const tasks: GenerationRunSummary['tasks'] = [
        {
            id: 'closing',
            kind: 'prose',
            status: 'completed',
            label: 'Closing first in requested order',
        },
        {
            id: 'pending',
            kind: 'grammar',
            status: 'pending',
            label: 'Pending middle section',
        },
        {
            id: 'reading',
            kind: 'prose',
            status: 'completed',
            label: 'Reading last in requested order',
        },
    ];
    const preview: GenerationRunPreview = {
        ...prepared,
        parts: [
            prepared.parts[0]!,
            { ...prepared.parts[0]!, taskId: 'closing' },
        ],
    };

    render(
        <LessonRunPreview
            run={{
                ...lessonRun,
                tasks,
                completedTaskCount: 2,
                totalTaskCount: 3,
            }}
            preview={preview}
            open
            loading={false}
            failed={false}
            onClose={vi.fn()}
            onRetry={vi.fn()}
            renderBody={renderBody}
        />,
    );

    expect(
        screen
            .getAllByRole('heading', {
                level: 2,
                name: /requested order|Pending middle section/,
            })
            .map((heading) => heading.textContent),
    ).toEqual([
        'Closing first in requested order',
        'Pending middle section',
        'Reading last in requested order',
    ]);
});

it.each([401, 403, 404])(
    'purges prepared content after an access-denied %s refetch and stops automatic retries',
    async (status) => {
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

        const fetch = vi
            .fn()
            .mockResolvedValueOnce(Response.json(prepared))
            .mockResolvedValue(new Response('Access denied', { status }));

        vi.stubGlobal('fetch', fetch);
        const action = vi.fn();
        const props = {
            actorId: 'synthetic',
            request,
            busy: false,
            reconnecting: false,
            failed: false,
            continueBlocked: false,
            onAction: action,
            onAdjust: vi.fn(),
            renderPreparedBody: renderBody,
        };
        const view = render(<LessonRun run={running} {...props} />, {
            wrapper: Provider,
        });

        fireEvent.click(
            screen.getByRole('button', { name: 'View prepared content' }),
        );

        await screen.findByText(
            'La démocratie française repose sur le débat public.',
        );

        view.rerender(
            <I18nProvider locale='en' messages={en}>
                <LessonRun
                    run={advancedRun('2026-11-16T00:02:00.000Z')}
                    {...props}
                />
            </I18nProvider>,
        );

        await screen.findByText(
            'Prepared content is no longer available to this account.',
        );

        expect(
            screen.queryByText(
                'La démocratie française repose sur le débat public.',
            ),
        ).not.toBeInTheDocument();

        expect(
            client.getQueryData([
                'lesson-preview',
                'synthetic',
                running.conversationId,
                running.id,
                running.revision,
            ]),
        ).toBeUndefined();

        expect(
            screen.queryByRole('button', { name: 'Retry preview' }),
        ).not.toBeInTheDocument();

        view.rerender(
            <I18nProvider locale='en' messages={en}>
                <LessonRun
                    run={advancedRun('2026-11-16T00:03:00.000Z', 2)}
                    {...props}
                />
            </I18nProvider>,
        );

        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
        expect(action).not.toHaveBeenCalled();
    },
);

it('preserves prepared preview during a transient server failure and offers only a read retry', async () => {
    const fetch = vi
        .fn()
        .mockResolvedValueOnce(Response.json(prepared))
        .mockResolvedValueOnce(
            Response.json(
                {
                    error: {
                        code: 'internal_error',
                        message: 'Temporary failure',
                    },
                },
                { status: 500 },
            ),
        )
        .mockResolvedValueOnce(Response.json(prepared));

    vi.stubGlobal('fetch', fetch);
    const props = {
        actorId: 'synthetic',
        request,
        busy: false,
        reconnecting: false,
        failed: false,
        continueBlocked: false,
        onAction: vi.fn(),
        onAdjust: vi.fn(),
        renderPreparedBody: renderBody,
    };
    const view = render(<LessonRun run={running} {...props} />, { wrapper });
    fireEvent.click(
        screen.getByRole('button', { name: 'View prepared content' }),
    );

    await screen.findByText(
        'La démocratie française repose sur le débat public.',
    );

    view.rerender(
        <I18nProvider locale='en' messages={en}>
            <LessonRun
                run={advancedRun('2026-11-16T00:02:00.000Z')}
                {...props}
            />
        </I18nProvider>,
    );

    const retry = await screen.findByRole('button', { name: 'Retry preview' });
    expect(
        screen.getByText('La démocratie française repose sur le débat public.'),
    ).toBeVisible();

    fireEvent.click(retry);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    expect(props.onAction).not.toHaveBeenCalled();
});

it('closes the prepared preview with native Escape cancellation without bubbling a tutor Stop', () => {
    const stop = vi.fn();
    function Harness() {
        const [open, setOpen] = useState(true);
        function close() {
            setOpen(false);
        }

        return (
            <div onKeyDown={stop}>
                <button>Tutor</button>
                <LessonRunPreview
                    run={running}
                    preview={prepared}
                    open={open}
                    loading={false}
                    failed={false}
                    onClose={close}
                    onRetry={vi.fn()}
                    renderBody={renderBody}
                />
            </div>
        );
    }

    render(<Harness />);
    const dialog = screen.getByRole('dialog', { name: 'Prepared content' });
    const close = screen.getAllByRole('button', { name: 'Close' })[0]!;

    // JSDOM does not perform native dialog cancellation after keydown.
    // Preserve the browser default, then dispatch its native cancel event explicitly.
    expect(fireEvent.keyDown(close, { key: 'Escape' })).toBe(true);
    expect(stop).not.toHaveBeenCalled();
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(
        screen.queryByRole('dialog', { name: 'Prepared content' }),
    ).not.toBeInTheDocument();

    expect(stop).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Tutor' }), {
        key: 'Escape',
    });

    expect(stop).toHaveBeenCalledOnce();
});

it.each([
    {
        locale: 'en' as const,
        notice: 'An unexpected error interrupted preparation. Completed work is saved; the failed attempt was not charged. Retry the remaining part.',
        retry: 'Retry remaining part',
        details: 'Plan and details',
        referenceLabel: 'Support reference',
    },
    {
        locale: 'ru' as const,
        notice: 'Подготовка прервалась из-за непредвиденной ошибки. Готовые материалы сохранены; неудачная попытка не оплачивается. Повторите оставшуюся часть.',
        retry: 'Повторить оставшуюся часть',
        details: 'План и подробности',
        referenceLabel: 'Код для поддержки',
    },
])(
    'explains an unclassified failure without guessing its cause in $locale and exposes its support reference',
    ({ locale, notice, retry, details, referenceLabel }) => {
        const referenceId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
        const resume = vi.fn();
        render(
            <LessonRunCard
                run={{
                    ...lessonRun,
                    pauseReason: 'technical-failure',
                    failure: { code: 'unknown', referenceId },
                }}
                busy={false}
                stopping={false}
                reconnecting={false}
                {...handlers}
                onContinue={resume}
            />,
            { locale },
        );

        expect(screen.getByText(notice)).toBeVisible();
        expect(resume).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText(details));
        expect(screen.getByText(`${referenceLabel}:`)).toBeVisible();
        expect(screen.getByText(referenceId)).toBeVisible();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: retry }));
        expect(resume).toHaveBeenCalledOnce();
    },
);

it('shows the failed exercise and its partial progress before reconnect status while keeping retry disabled', () => {
    render(
        <LessonRunCard
            run={{
                ...lessonRun,
                pauseReason: 'technical-failure',
                failure: { code: 'content-invalid', taskId: 'grammar' },
                tasks: [
                    lessonRun.tasks[0]!,
                    {
                        ...lessonRun.tasks[1]!,
                        kind: 'exercises',
                        status: 'pending',
                        completedUnitCount: 2,
                        totalUnitCount: 4,
                    },
                ],
            }}
            busy={false}
            stopping={false}
            reconnecting
            {...handlers}
        />,
    );

    expect(
        screen.getByText(
            'An exercise did not pass validation. Completed work is saved; the failed attempt was not charged.',
        ),
    ).toBeVisible();

    expect(
        screen.getByText(
            'Reconnecting… Checking the latest progress before another action.',
        ),
    ).toBeVisible();

    fireEvent.click(screen.getByText('Plan and details'));
    expect(
        screen.getAllByText('Exercise 3 of 4 needs another attempt')[0],
    ).toBeVisible();

    expect(
        screen.getByRole('button', { name: 'Resume from exercise 3' }),
    ).toBeDisabled();
});

it('does not refetch prepared bodies for timestamp-only run changes', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(prepared));
    vi.stubGlobal('fetch', fetch);
    const props = {
        actorId: 'synthetic',
        request,
        busy: false,
        reconnecting: false,
        failed: false,
        continueBlocked: false,
        onAction: vi.fn(),
        onAdjust: vi.fn(),
        renderPreparedBody: renderBody,
    };
    const view = render(<LessonRun run={running} {...props} />, { wrapper });
    fireEvent.click(
        screen.getByRole('button', { name: 'View prepared content' }),
    );

    await screen.findByText(
        'La démocratie française repose sur le débat public.',
    );

    view.rerender(
        <I18nProvider locale='en' messages={en}>
            <LessonRun
                run={{ ...running, updatedAt: '2026-11-16T00:05:00.000Z' }}
                {...props}
            />
        </I18nProvider>,
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
});

it.each([
    {
        locale: 'en' as const,
        notice: 'The generated answer key is invalid. Resume from this exercise; completed exercises are saved and the failed attempt was not charged.',
        retry: 'Resume from exercise 3',
        failed: 'Exercise 3 of 4 needs another attempt',
    },
    {
        locale: 'ru' as const,
        notice: 'Готовый ключ ответа некорректен. Продолжите с этого упражнения; готовые упражнения сохранены, неудачная попытка не оплачивается.',
        retry: 'Продолжить с упражнения №3',
        failed: 'Упражнение 3 из 4 нужно повторить',
    },
])(
    'explains an exact answer-key validation failure and identifies only the next missing exercise in $locale',
    ({ locale, notice, retry, failed }) => {
        const resume = vi.fn();
        render(
            <LessonRunCard
                run={{
                    ...lessonRun,
                    pauseReason: 'technical-failure',
                    failure: {
                        code: 'schema-invalid',
                        taskId: 'grammar',
                        paths: ['tasks.0.blocks.0.semantics.checking.key.gaps'],
                    },
                    tasks: [
                        lessonRun.tasks[0]!,
                        {
                            ...lessonRun.tasks[1]!,
                            kind: 'exercises',
                            completedUnitCount: 2,
                            totalUnitCount: 4,
                        },
                    ],
                }}
                busy={false}
                stopping={false}
                reconnecting={false}
                {...handlers}
                onContinue={resume}
            />,
            { locale },
        );

        expect(screen.getByText(notice)).toBeVisible();
        expect(screen.getAllByText(failed)[0]).toBeVisible();
        expect(resume).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: retry }));
        expect(resume).toHaveBeenCalledOnce();
    },
);

it('does not invent a failed exercise ordinal when the failure has no verified task', () => {
    render(
        <LessonRunCard
            run={{
                ...lessonRun,
                pauseReason: 'technical-failure',
                failure: {
                    code: 'schema-invalid',
                    paths: ['tasks.0.blocks.0.semantics.checking.key'],
                },
                tasks: [
                    lessonRun.tasks[0]!,
                    {
                        ...lessonRun.tasks[1]!,
                        kind: 'exercises',
                        completedUnitCount: 2,
                        totalUnitCount: 4,
                    },
                ],
            }}
            busy={false}
            stopping={false}
            reconnecting={false}
            {...handlers}
        />,
    );

    expect(
        screen.getByRole('button', { name: 'Retry remaining part' }),
    ).toBeVisible();

    expect(
        screen.queryByRole('button', { name: 'Resume from exercise 3' }),
    ).not.toBeInTheDocument();

    expect(
        screen.queryByText('Exercise 3 of 4 needs another attempt'),
    ).not.toBeInTheDocument();
});

it.each([
    [
        'en',
        'The provider declined this part under its content policy. Adjust the plan before continuing.',
        'Adjust plan',
        'Retry remaining part',
    ],
    [
        'ru',
        'Провайдер ИИ отклонил эту часть из-за ограничений на содержимое. Измените план, чтобы продолжить.',
        'Изменить план',
        'Повторить оставшуюся часть',
    ],
] as const)(
    'offers plan adjustment for a confirmed filtered response in %s',
    (locale, notice, adjust, retry) => {
        const resume = vi.fn();
        render(
            <LessonRunCard
                {...handlers}
                busy={false}
                reconnecting={false}
                stopping={false}
                onContinue={resume}
                run={{
                    ...lessonRun,
                    pauseReason: 'technical-failure',
                    failure: {
                        code: 'provider-rejected',
                        finishReason: 'content-filter',
                        phase: 'decode',
                    },
                }}
            />,
            { locale },
        );

        expect(screen.getByText(notice)).toBeVisible();
        expect(screen.getByRole('button', { name: adjust })).toBeEnabled();
        const retryButton = screen.getByRole('button', { name: retry });
        expect(retryButton).toBeDisabled();
        fireEvent.click(retryButton);
        expect(resume).not.toHaveBeenCalled();
    },
);

it.each([
    [
        { code: 'content-invalid', phase: 'validation', taskId: 'reading' },
        'The returned reading could not be added to the lesson because its format was invalid. Resume from the reading.',
    ],
    [
        { code: 'schema-invalid', phase: 'decode', taskId: 'reading' },
        'The returned reading could not be added to the lesson because its format was invalid. Resume from the reading.',
    ],
    [
        { code: 'publication', phase: 'checkpoint' },
        'The lesson could not save this part. You can resume from the last saved part.',
    ],
    [
        { code: 'unknown', phase: 'receipt' },
        'The service could not record the result of this attempt. Use the support reference if this happens again.',
    ],
] as const)(
    'explains the recorded failure without claiming a provider disconnection',
    (failure, notice) => {
        render(
            <LessonRunCard
                {...handlers}
                busy={false}
                reconnecting={false}
                stopping={false}
                run={{
                    ...lessonRun,
                    tasks: [
                        {
                            id: 'reading',
                            kind: 'prose',
                            status: 'failed',
                            label: 'Prepare reading',
                        },
                    ],
                    totalTaskCount: 1,
                    completedTaskCount: 0,
                    pauseReason: 'technical-failure',
                    failure,
                }}
            />,
        );

        expect(screen.getByText(notice)).toBeVisible();
    },
);
