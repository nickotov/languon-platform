import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
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
    for (const value of Object.values(values)) {
        expect(screen.getAllByText(value).length).toBeGreaterThan(0);
    }

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(screen.getByRole('button', { name: 'Append' })).toBeDisabled();
    await user.click(
        screen.getByRole('checkbox', { name: 'Select card 2: die Birne' }),
    );

    await user.click(screen.getByRole('button', { name: 'Prepend' }));
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
    await user.click(screen.getByRole('button', { name: 'Append' }));
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

    await user.click(screen.getByRole('button', { name: 'Append' }));
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
    await user.click(screen.getByRole('button', { name: 'Replace' }));
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
    await user.click(screen.getByRole('button', { name: 'Replace' }));
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
    await user.click(screen.getByRole('button', { name: 'Append' }));
    expect(screen.getByRole('button', { name: 'Append' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Prepend' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Select all' })).toBeDisabled();
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

it('loads retained snippets on reopening chat and refreshes turn completions without replacing old output', async () => {
    const client = new QueryClient();
    const second = {
        ...snippet,
        id: '18d712f4-2204-49fe-8564-bb7291100175',
        title: 'More fruit',
    };

    function History() {
        const [completionKey, setCompletionKey] = useState(turnId);
        function completeTurn() {
            setCompletionKey(`${turnId},new-turn`);
        }

        return (
            <QueryClientProvider client={client}>
                <DictionarySnippets
                    context={context}
                    actorId='actor'
                    completionKey={completionKey}
                    reconciliationKey={0}
                >
                    <DictionarySnippetsForTurn turnId={turnId} />
                    <button onClick={completeTurn}>Complete turn</button>
                </DictionarySnippets>
            </QueryClientProvider>
        );
    }

    const user = userEvent.setup();
    render(<History />);
    expect(
        await screen.findByRole('region', { name: 'Fruit vocabulary' }),
    ).toBeVisible();

    vi.mocked(dictionarySnippetsApi.list).mockResolvedValue({
        snippets: [snippet, second],
    });

    await user.click(screen.getByRole('button', { name: 'Complete turn' }));
    expect(
        await screen.findByRole('region', { name: 'More fruit' }),
    ).toBeVisible();

    expect(
        screen.getByRole('region', { name: 'Fruit vocabulary' }),
    ).toBeVisible();
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
    await user.click(screen.getByRole('button', { name: 'Append' }));
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
        screen.getByRole('button', { name: 'Replace', exact: true }),
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
                />
            </TutorShell>
        </QueryClientProvider>,
    );

    const user = userEvent.setup();
    await user.click(
        screen.getByRole('button', { name: 'Replace', exact: true }),
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
