import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    act,
    renderHook,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
    DictionaryChatSnippet,
    OwnedDictionary,
} from '@languon/contracts';
import { dictionaryApi } from '../src/fsd/entities/dictionary';
import { dictionarySnippetsApi } from '../src/fsd/features/dictionary-chat-snippets/api/dictionary-snippets-api';
import { DictionarySnippetCard } from '../src/fsd/features/dictionary-chat-snippets/ui/snippet-card/snippet-card';
import { useSnippetDisclosure } from '../src/fsd/features/dictionary-chat-snippets/hooks/use-snippet-disclosure';
import {
    DictionarySnippets,
    DictionarySnippetsForTurn,
} from '../src/fsd/features/dictionary-chat-snippets';
import { ToastHost, clearToasts } from '../src/fsd/shared/ui';
import { render } from './render';

const dictionaryId = '12d712f4-2204-49fe-8564-bb7291100175';
const conversationId = '13d712f4-2204-49fe-8564-bb7291100175';
const turnId = '14d712f4-2204-49fe-8564-bb7291100175';
const settings = {
    transcriptionEnabled: true,
    transcriptionNotation: 'ipa' as const,
    transcriptionCustomLabel: null,
    definitionEnabled: true,
    definitionLanguage: 'source' as const,
    exampleEnabled: true,
    exampleLanguage: 'source' as const,
    exampleTranslationEnabled: true,
};
const values = {
    source: 'der Apfel',
    translation: 'the apple',
    transcription: '/ˈapfl̩/',
    definition: 'Eine Frucht.',
    example: 'Ich esse einen Apfel.',
    exampleTranslation: 'I eat an apple.',
};
const snippet: DictionaryChatSnippet = {
    id: '15d712f4-2204-49fe-8564-bb7291100175',
    conversationId,
    turnId,
    dictionaryId,
    title: 'Fruit vocabulary',
    createdAt: '2026-11-11T10:00:00.000Z',
    generationContext: {
        sourceLanguage: 'de',
        targetLanguage: 'en',
        translationContext: null,
        settings,
        settingsVersion: 1,
        dictionaryVersion: 1,
    },
    cards: [
        values,
        { ...values, source: 'die Birne', translation: 'the pear' },
    ],
};
const current = {
    id: dictionaryId,
    version: 9,
    settingsVersion: 5,
    activeCardCount: 17,
} as OwnedDictionary;
const requestWithSession = async <T,>(
    operation: (token: string) => Promise<T>,
) => operation('fake-token');
const context = { dictionaryId, conversationId, requestWithSession };
const success = {
    operationId: '16d712f4-2204-49fe-8564-bb7291100175',
    dictionaryId,
    cardIds: ['17d712f4-2204-49fe-8564-bb7291100175'],
    addedCount: 1,
    archivedCount: 0,
    duplicateCount: 0,
    dictionaryVersion: 10,
    settingsVersion: 5,
};

function setupCard() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });

    render(
        <QueryClientProvider client={client}>
            <DictionarySnippetCard
                snippet={snippet}
                context={context}
                onApplying={vi.fn()}
                defaultExpanded
            />
            <ToastHost label='Notifications' />
        </QueryClientProvider>,
    );

    return userEvent.setup();
}

beforeEach(() => {
    clearToasts();
    vi.spyOn(dictionaryApi, 'readDictionary').mockResolvedValue({
        dictionary: current,
    });

    vi.spyOn(dictionarySnippetsApi, 'apply').mockResolvedValue(success);
    vi.spyOn(dictionarySnippetsApi, 'list').mockResolvedValue({
        snippets: [snippet],
    });
});

afterEach(() => vi.unstubAllGlobals());

it('renders every generation-enabled field as plain read-only text and requires a selection', async () => {
    const user = setupCard();
    expect(screen.queryByRole('term')).not.toBeInTheDocument();
    await user.click(
        screen.getByRole('button', { name: 'Card details 1: der Apfel' }),
    );

    for (const value of Object.values(values)) {
        expect(screen.getAllByText(value).length).toBeGreaterThan(0);
    }

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(
        within(
            screen.getByRole('group', { name: 'Insert selected cards' }),
        ).getByRole('button', { name: 'Append' }),
    ).toBeDisabled();

    await user.click(
        screen.getByRole('checkbox', { name: 'Select card 2: die Birne' }),
    );

    await user.click(
        within(
            screen.getByRole('group', { name: 'Insert selected cards' }),
        ).getByRole('button', { name: 'Prepend' }),
    );

    await waitFor(() =>
        expect(dictionarySnippetsApi.apply).toHaveBeenCalledOnce(),
    );

    expect(
        vi.mocked(dictionarySnippetsApi.apply).mock.calls[0]?.[2],
    ).toMatchObject({
        mode: 'prepend',
        selectedIndices: [1],
        expectedDictionaryVersion: 9,
        expectedSettingsVersion: 5,
    });
});

it('retains the exact operation on retry, permits later deliberate application, and reports duplicates', async () => {
    vi.mocked(dictionarySnippetsApi.apply)
        .mockRejectedValueOnce(new TypeError('network'))
        .mockResolvedValue({ ...success, duplicateCount: 1 });

    const user = setupCard();
    await user.click(
        within(
            screen.getByRole('group', { name: 'Insert selected cards' }),
        ).getByRole('button', { name: 'Append' }),
    );

    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() =>
        expect(dictionarySnippetsApi.apply).toHaveBeenCalledTimes(2),
    );

    const first = vi.mocked(dictionarySnippetsApi.apply).mock.calls[0]?.[2];
    expect(vi.mocked(dictionarySnippetsApi.apply).mock.calls[1]?.[2]).toEqual(
        first,
    );

    expect(
        await screen.findByText(
            'Added 1 cards to the dictionary. 1 duplicate cards are included.',
        ),
    ).toBeVisible();

    await user.click(
        within(
            screen.getByRole('group', { name: 'Insert selected cards' }),
        ).getByRole('button', { name: 'Append' }),
    );

    await waitFor(() =>
        expect(dictionarySnippetsApi.apply).toHaveBeenCalledTimes(3),
    );

    expect(
        vi.mocked(dictionarySnippetsApi.apply).mock.calls[2]?.[2].operationId,
    ).not.toBe(first?.operationId);

    expect(
        screen.getByRole('region', { name: 'Fruit vocabulary' }),
    ).toBeVisible();
});

it('confirms Replace using the current active count and cancels without applying', async () => {
    const user = setupCard();
    await user.click(
        within(
            screen.getByRole('group', { name: 'Insert selected cards' }),
        ).getByRole('button', { name: 'Replace' }),
    );

    const dialog = await screen.findByRole('dialog', {
        name: 'Replace active cards?',
    });

    expect(
        within(dialog).getByText(/Archive all 17 current active cards/),
    ).toBeVisible();

    await user.click(
        within(dialog).getByRole('button', { name: 'Cancel', exact: true }),
    );

    expect(dictionarySnippetsApi.apply).not.toHaveBeenCalled();
    await user.click(
        within(
            screen.getByRole('group', { name: 'Insert selected cards' }),
        ).getByRole('button', { name: 'Replace' }),
    );

    await user.click(
        within(await screen.findByRole('dialog')).getByRole('button', {
            name: 'Replace',
            exact: true,
        }),
    );

    await waitFor(() =>
        expect(dictionarySnippetsApi.apply).toHaveBeenCalledOnce(),
    );

    expect(
        vi.mocked(dictionarySnippetsApi.apply).mock.calls[0]?.[2],
    ).toMatchObject({
        mode: 'replace',
        selectedIndices: [0, 1],
        expectedDictionaryVersion: 9,
    });
});

it('disables repeated actions while an apply is pending and shows a retryable error', async () => {
    let rejectApply!: (reason: unknown) => void;
    vi.mocked(dictionarySnippetsApi.apply).mockImplementation(
        () =>
            new Promise((_, reject) => {
                rejectApply = reject;
            }),
    );

    const user = setupCard();
    await user.click(
        within(
            screen.getByRole('group', { name: 'Insert selected cards' }),
        ).getByRole('button', { name: 'Append' }),
    );

    expect(
        within(
            screen.getByRole('group', { name: 'Insert selected cards' }),
        ).getByRole('button', { name: 'Append' }),
    ).toBeDisabled();

    expect(
        within(
            screen.getByRole('group', { name: 'Insert selected cards' }),
        ).getByRole('button', { name: 'Prepend' }),
    ).toBeDisabled();

    expect(screen.getByRole('checkbox', { name: 'Select all' })).toBeDisabled();
    await user.click(
        screen.getByRole('button', { name: 'Review cards: Fruit vocabulary' }),
    );

    expect(
        within(
            screen.getByRole('region', { name: 'Fruit vocabulary' }),
        ).getByRole('status'),
    ).toHaveTextContent('Adding cards…');

    rejectApply(new TypeError('network'));
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
});

it('does not fetch snippets without the owned dictionary context', () => {
    const client = new QueryClient();
    render(
        <QueryClientProvider client={client}>
            <DictionarySnippets
                actorId='actor'
                completionKey=''
                reconciliationKey={0}
            >
                <DictionarySnippetsForTurn turnId={turnId} />
            </DictionarySnippets>
        </QueryClientProvider>,
    );

    expect(dictionarySnippetsApi.list).not.toHaveBeenCalled();
    expect(
        screen.queryByRole('button', { name: 'Append' }),
    ).not.toBeInTheDocument();
});

it('keeps history compact, opens a new completion once, and folds on chat reopen without refetch overriding choice', async () => {
    const client = new QueryClient();
    const newTurn = '19d712f4-2204-49fe-8564-bb7291100175';
    const second = {
        ...snippet,
        id: '18d712f4-2204-49fe-8564-bb7291100175',
        turnId: newTurn,
        title: 'More fruit',
    };

    function History() {
        const [completionKey, setCompletionKey] = useState(
            `${turnId}:succeeded`,
        );
        const [visible, setVisible] = useState(true);
        const [revision, setRevision] = useState(0);
        function completeTurn() {
            setCompletionKey(`${turnId}:succeeded,${newTurn}:snippet:tool`);
        }

        function toggleChat() {
            setVisible((current) => !current);
        }

        function reconcile() {
            setRevision((current) => current + 1);
        }

        return (
            <QueryClientProvider client={client}>
                <DictionarySnippets
                    context={context}
                    actorId='actor'
                    completionKey={completionKey}
                    reconciliationKey={revision}
                    visible={visible}
                >
                    <DictionarySnippetsForTurn turnId={turnId} />
                    <DictionarySnippetsForTurn turnId={newTurn} />
                    <button onClick={completeTurn}>Complete turn</button>
                    <button onClick={toggleChat}>Toggle chat</button>
                    <button onClick={reconcile}>Reconnect</button>
                </DictionarySnippets>
            </QueryClientProvider>
        );
    }

    const user = userEvent.setup();
    render(<History />);
    const oldToggle = await screen.findByRole('button', {
        name: 'Review cards: Fruit vocabulary',
    });

    expect(oldToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    vi.mocked(dictionarySnippetsApi.list).mockResolvedValue({
        snippets: [snippet, second],
    });

    await user.click(screen.getByRole('button', { name: 'Reconnect' }));
    const earlyToggle = await screen.findByRole('button', {
        name: 'Review cards: More fruit',
    });

    expect(earlyToggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(screen.getByRole('button', { name: 'Complete turn' }));
    const freshToggle = await screen.findByRole('button', {
        name: 'Review cards: More fruit',
    });

    await waitFor(() =>
        expect(freshToggle).toHaveAttribute('aria-expanded', 'true'),
    );

    expect(oldToggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(
        screen.getByRole('checkbox', { name: 'Select card 2: die Birne' }),
    );

    await user.click(freshToggle);
    await user.click(screen.getByRole('button', { name: 'Reconnect' }));
    await waitFor(() =>
        expect(dictionarySnippetsApi.list).toHaveBeenCalledTimes(4),
    );

    expect(freshToggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(freshToggle);
    expect(
        screen.getByRole('checkbox', { name: 'Select card 2: die Birne' }),
    ).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Toggle chat' }));
    await user.click(screen.getByRole('button', { name: 'Toggle chat' }));
    expect(freshToggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(freshToggle);
    expect(
        screen.getByRole('checkbox', { name: 'Select card 2: die Birne' }),
    ).not.toBeChecked();
});

it('discloses complete fields independently of row selection', async () => {
    const user = setupCard();
    const details = screen.getByRole('button', {
        name: 'Card details 1: der Apfel',
    });
    const checkbox = screen.getByRole('checkbox', {
        name: 'Select card 1: der Apfel',
    });

    await user.click(details);
    expect(checkbox).toBeChecked();
    expect(details).toHaveAttribute('aria-expanded', 'true');
    await user.click(checkbox);
    expect(details).toHaveAttribute('aria-expanded', 'true');
    await user.click(
        screen.getByRole('button', { name: 'Review cards: Fruit vocabulary' }),
    );

    await user.click(
        screen.getByRole('button', { name: 'Review cards: Fruit vocabulary' }),
    );

    expect(checkbox).not.toBeChecked();
    expect(details).toHaveAttribute('aria-expanded', 'true');
});

it('shows all100 cards without pagination while preserving selection and source indices', async () => {
    const many = {
        ...snippet,
        cards: Array.from({ length: 100 }, (_, index) => ({
            ...values,
            source: `card ${index + 1}`,
        })),
    };
    const client = new QueryClient();
    render(
        <QueryClientProvider client={client}>
            <DictionarySnippetCard
                snippet={many}
                context={context}
                onApplying={vi.fn()}
                defaultExpanded
            />
        </QueryClientProvider>,
    );

    const user = userEvent.setup();
    expect(screen.getAllByRole('checkbox')).toHaveLength(101);
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await user.click(
        screen.getByRole('checkbox', { name: 'Select card 2: card 2' }),
    );

    expect(
        screen.queryByRole('button', { name: 'Next', exact: true }),
    ).not.toBeInTheDocument();

    expect(
        screen.getByRole('list', { name: 'Dictionary cards' }),
    ).toHaveAttribute('tabindex', '0');

    await user.click(
        screen.getByRole('checkbox', { name: 'Select card 100: card 100' }),
    );

    await user.click(
        within(
            screen.getByRole('group', { name: 'Insert selected cards' }),
        ).getByRole('button', { name: 'Append', exact: true }),
    );

    await waitFor(() =>
        expect(dictionarySnippetsApi.apply).toHaveBeenCalledOnce(),
    );

    expect(
        vi.mocked(dictionarySnippetsApi.apply).mock.calls[0]![2]
            .selectedIndices,
    ).toEqual([1, 99]);
});

it('does not offer redundant detail expansion when only source and translation are enabled', () => {
    const onlyRequired = {
        ...snippet,
        generationContext: {
            ...snippet.generationContext,
            settings: {
                ...settings,
                transcriptionEnabled: false,
                definitionEnabled: false,
                exampleEnabled: false,
                exampleTranslationEnabled: false,
            },
        },
    };
    const client = new QueryClient();
    render(
        <QueryClientProvider client={client}>
            <DictionarySnippetCard
                snippet={onlyRequired}
                context={context}
                onApplying={vi.fn()}
                defaultExpanded
            />
        </QueryClientProvider>,
    );

    expect(
        screen.queryByRole('button', { name: /Card details/ }),
    ).not.toBeInTheDocument();

    expect(screen.getByText('the apple')).toBeVisible();
});

it('honors manual review before a late event and keeps hidden completions compact on return', () => {
    const initial = {
        scope: 'actor:conversation',
        snippets: [] as DictionaryChatSnippet[],
        key: '',
        visible: true,
    };
    const { result, rerender } = renderHook(
        (props) =>
            useSnippetDisclosure(
                props.scope,
                props.snippets,
                true,
                props.key,
                props.visible,
            ),
        { initialProps: initial },
    );

    rerender({ ...initial, snippets: [snippet] });
    act(() => result.current.toggle(snippet.id));
    act(() => result.current.toggle(snippet.id));
    const completed = {
        ...initial,
        snippets: [snippet],
        key: `${turnId}:snippet:tool`,
    };

    rerender(completed);
    expect(result.current.expandedIds.has(snippet.id)).toBe(false);
    const hidden = {
        ...snippet,
        id: '1ad712f4-2204-49fe-8564-bb7291100175',
        turnId: '1bd712f4-2204-49fe-8564-bb7291100175',
    };
    const hiddenCompletion = {
        ...completed,
        snippets: [snippet, hidden],
        key: `${completed.key},${hidden.turnId}:succeeded`,
        visible: false,
    };

    rerender(hiddenCompletion);
    rerender({ ...hiddenCompletion, visible: true });
    expect(result.current.expandedIds.has(hidden.id)).toBe(false);
    expect(result.current.expandedIds.has(snippet.id)).toBe(false);
});

it('retries a definitive append conflict with fresh dictionary versions and a new operation', async () => {
    const { DictionaryApiError } =
        await import('../src/fsd/entities/dictionary');

    vi.mocked(dictionarySnippetsApi.apply).mockRejectedValueOnce(
        new DictionaryApiError(409, {
            code: 'version_conflict',
            message: 'Dictionary changed.',
            correlationId: 'synthetic-conflict',
        }),
    );

    const user = setupCard();
    await user.click(
        within(
            screen.getByRole('group', { name: 'Insert selected cards' }),
        ).getByRole('button', { name: 'Append' }),
    );

    const retry = await screen.findByRole('button', { name: 'Retry' });
    const first = vi.mocked(dictionarySnippetsApi.apply).mock.calls[0]![2];
    vi.mocked(dictionaryApi.readDictionary).mockResolvedValue({
        dictionary: { ...current, version: 10, settingsVersion: 6 },
    });

    await user.click(retry);
    await waitFor(() =>
        expect(dictionarySnippetsApi.apply).toHaveBeenCalledTimes(2),
    );

    const second = vi.mocked(dictionarySnippetsApi.apply).mock.calls[1]![2];
    expect(second).toMatchObject({
        mode: 'append',
        selectedIndices: [0, 1],
        expectedDictionaryVersion: 10,
        expectedSettingsVersion: 6,
    });

    expect(second.operationId).not.toBe(first.operationId);
    expect(dictionaryApi.readDictionary).toHaveBeenCalledTimes(2);
});

it('requires a new Replace confirmation with the updated active count after a definitive conflict', async () => {
    const { DictionaryApiError } =
        await import('../src/fsd/entities/dictionary');

    vi.mocked(dictionarySnippetsApi.apply).mockRejectedValueOnce(
        new DictionaryApiError(409, {
            code: 'version_conflict',
            message: 'Dictionary changed.',
            correlationId: 'synthetic-replace-conflict',
        }),
    );

    const user = setupCard();
    await user.click(
        within(
            screen.getByRole('group', { name: 'Insert selected cards' }),
        ).getByRole('button', { name: 'Replace', exact: true }),
    );

    const firstDialog = await screen.findByRole('dialog', {
        name: 'Replace active cards?',
    });

    await user.click(
        within(firstDialog).getByRole('button', {
            name: 'Replace',
            exact: true,
        }),
    );

    const retry = await screen.findByRole('button', { name: 'Retry' });
    const first = vi.mocked(dictionarySnippetsApi.apply).mock.calls[0]![2];
    vi.mocked(dictionaryApi.readDictionary).mockResolvedValue({
        dictionary: {
            ...current,
            version: 11,
            settingsVersion: 7,
            activeCardCount: 23,
        },
    });

    await user.click(retry);
    const confirmation = await screen.findByRole('dialog', {
        name: 'Replace active cards?',
    });

    expect(
        within(confirmation).getByText(/Archive all 23 current active cards/),
    ).toBeVisible();

    expect(dictionarySnippetsApi.apply).toHaveBeenCalledTimes(1);
    await user.click(
        within(confirmation).getByRole('button', {
            name: 'Replace',
            exact: true,
        }),
    );

    await waitFor(() =>
        expect(dictionarySnippetsApi.apply).toHaveBeenCalledTimes(2),
    );

    const second = vi.mocked(dictionarySnippetsApi.apply).mock.calls[1]![2];
    expect(second).toMatchObject({
        mode: 'replace',
        expectedDictionaryVersion: 11,
        expectedSettingsVersion: 7,
    });

    expect(second.operationId).not.toBe(first.operationId);
});

it('maps the current conversation endpoint conflict envelope to standard dictionary error guidance', async () => {
    const { DictionaryApiError } =
        await import('../src/fsd/entities/dictionary');

    vi.mocked(dictionarySnippetsApi.apply).mockRestore();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
            JSON.stringify({
                error: {
                    code: 'version_conflict',
                    message: 'Dictionary changed.',
                    requestId: 'synthetic-endpoint-conflict',
                },
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    const outcome = dictionarySnippetsApi.apply(context, snippet.id, {
        operationId: '16d712f4-2204-49fe-8564-bb7291100175',
        mode: 'append',
        selectedIndices: [0],
        expectedDictionaryVersion: 9,
        expectedSettingsVersion: 5,
    });

    await expect(outcome).rejects.toBeInstanceOf(DictionaryApiError);
    await expect(outcome).rejects.toMatchObject({
        status: 409,
        detail: {
            code: 'version_conflict',
            correlationId: 'synthetic-endpoint-conflict',
        },
    });
});

it('lets native Replace dialog handle Escape before the tutor fold shortcut', async () => {
    vi.stubGlobal(
        'ResizeObserver',
        class {
            observe = vi.fn();
            unobserve = vi.fn();
            disconnect = vi.fn();
        },
    );

    const { TutorShell } =
        await import('../src/fsd/widgets/contextual-assistant/ui/tutor-shell/tutor-shell');
    const { fireEvent } = await import('@testing-library/react');
    const onFold = vi.fn();
    const client = new QueryClient();
    render(
        <QueryClientProvider client={client}>
            <TutorShell
                folded={false}
                onFold={onFold}
                onExpand={vi.fn()}
                active={false}
                interrupted={false}
                unread={false}
                sourceKind='dictionary'
                useDraft={false}
                hasDraft={false}
                onUseDraft={vi.fn()}
                onNew={vi.fn()}
                onHistory={vi.fn()}
                onDelete={vi.fn()}
            >
                <DictionarySnippetCard
                    snippet={snippet}
                    context={context}
                    onApplying={vi.fn()}
                    defaultExpanded
                />
            </TutorShell>
        </QueryClientProvider>,
    );

    const user = userEvent.setup();
    await user.click(
        within(
            screen.getByRole('group', { name: 'Insert selected cards' }),
        ).getByRole('button', { name: 'Replace', exact: true }),
    );

    const dialog = await screen.findByRole('dialog', {
        name: 'Replace active cards?',
    });
    const confirm = within(dialog).getByRole('button', {
        name: 'Replace',
        exact: true,
    });

    expect(fireEvent.keyDown(confirm, { key: 'Escape' })).toBe(true);
    expect(onFold).not.toHaveBeenCalled();
    await user.click(
        within(dialog).getByRole('button', { name: 'Cancel', exact: true }),
    );

    fireEvent.keyDown(
        screen.getByRole('region', { name: 'Language tutor', exact: true }),
        { key: 'Escape' },
    );

    expect(onFold).toHaveBeenCalledOnce();
});
