import {
    DictionaryCardSchema,
    DictionaryLanguageTagSchema,
    LanguagesResponseSchema,
    ListDictionaryCardsResponseSchema,
    OwnedDictionarySchema,
} from '@languon/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';

import { dictionaryApi } from '@/fsd/entities/dictionary';
import { useSessionStore } from '@/fsd/entities/session';
import { navigationApi } from '@/fsd/features/library-navigation';
import { DictionaryEditor } from '@/fsd/widgets/dictionary-editor';
import { render } from './render';

const timestamp = '2026-11-12T10:00:00.000Z';
const settings = {
    definitionEnabled: false,
    definitionLanguage: 'source',
    exampleEnabled: false,
    exampleLanguage: 'source',
    exampleTranslationEnabled: false,
    transcriptionCustomLabel: null,
    transcriptionEnabled: false,
    transcriptionNotation: 'ipa',
};
const dictionary = OwnedDictionarySchema.parse({
    activeCardCount: 2,
    archivedAt: null,
    createdAt: timestamp,
    description: null,
    id: '10000000-0000-4000-8000-000000000001',
    languagePairLocked: true,
    lifecycle: 'active',
    name: 'Search practice',
    settings: { updatedAt: timestamp, values: settings, version: 1 },
    settingsVersion: 1,
    sourceDictionaryId: null,
    sourceLanguage: 'fr',
    targetLanguage: 'en',
    translationContext: null,
    updatedAt: timestamp,
    version: 1,
    visibility: 'private',
});

function card(source: string, suffix = '1') {
    return DictionaryCardSchema.parse({
        archivedAt: null,
        authorship: 'human',
        createdAt: timestamp,
        dictionaryId: dictionary.id,
        effectiveSettings: {
            ...settings,
            exampleTranslationLanguage: 'target',
        },
        id: `20000000-0000-4000-8000-00000000000${suffix}`,
        lifecycle: 'active',
        overrides: Object.fromEntries(
            Object.keys(settings).map((key) => [key, null]),
        ),
        position: suffix,
        settingsVersion: 1,
        translationContext: null,
        updatedAt: timestamp,
        values: {
            definition: null,
            example: null,
            exampleTranslation: null,
            source,
            transcription: null,
            translation: 'hello',
        },
        version: 1,
    });
}

function page(source = 'bonjour', nextCursor: string | null = null) {
    return ListDictionaryCardsResponseSchema.parse({
        data: source ? [card(source)] : [],
        dictionaryVersion: 1,
        settingsVersion: 1,
        nextCursor,
    });
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });

    return { promise, resolve, reject };
}

async function advance(milliseconds: number) {
    await act(() => vi.advanceTimersByTimeAsync(milliseconds));
}

function noTraining() {
    return null;
}

const router = {
    back() {},
    forward() {},
    refresh() {},
    hmrRefresh() {},
    push() {},
    replace() {},
    prefetch() {},
};

async function setup() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });

    render(
        <QueryClientProvider client={client}>
            <AppRouterContext.Provider value={router}>
                <DictionaryEditor
                    dictionaryId={dictionary.id}
                    requestWithSession={(operation) => operation('fake-token')}
                    renderTraining={noTraining}
                />
            </AppRouterContext.Provider>
        </QueryClientProvider>,
    );

    const input = await screen.findByRole<HTMLInputElement>('searchbox');
    await screen.findByText('bonjour');
    input.focus();
    vi.useFakeTimers();

    return { input, client };
}

beforeEach(() => {
    window.history.replaceState({}, '', '/dictionaries');
    vi.spyOn(dictionaryApi, 'readDictionary').mockResolvedValue({ dictionary });
    vi.spyOn(dictionaryApi, 'listLanguages').mockResolvedValue(
        LanguagesResponseSchema.parse({
            catalogVersion: 1,
            languages: DictionaryLanguageTagSchema.options.map((tag) => ({
                direction: 'ltr',
                displayNames: { en: tag, es: tag, fr: tag, ru: tag },
                tag,
            })),
        }),
    );

    vi.spyOn(dictionaryApi, 'readGenerationCapabilities').mockResolvedValue({
        singleCardGeneration: { available: false },
        cardAuthoringGeneration: { available: false },
        pastedTermsGeneration: { available: false },
        importPairsGeneration: { available: false },
        documentTermsGeneration: { available: false },
        documentOcr: { available: false },
    });

    vi.spyOn(dictionaryApi, 'listCards').mockResolvedValue(page());
});

afterEach(() => {
    useSessionStore.getState().signOut();
    vi.useRealTimers();
});

it('commits only the latest trimmed term after 300ms idle and ignores whitespace variants', async () => {
    const { input } = await setup();
    const list = vi.mocked(dictionaryApi.listCards);

    fireEvent.change(input, { target: { value: '   ' } });
    await advance(500);
    expect(list).toHaveBeenCalledTimes(1);

    for (const value of ['b', 'bo', ' bon ']) {
        fireEvent.change(input, { target: { value } });
        await advance(100);
        expect(input).toHaveFocus();
        expect(list).toHaveBeenCalledTimes(1);
    }

    await advance(199);
    expect(list).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls[1]?.[2]).toEqual({
        lifecycle: 'active',
        limit: 50,
        search: 'bon',
    });

    fireEvent.change(input, { target: { value: 'bon  ' } });
    await advance(500);
    expect(list).toHaveBeenCalledTimes(2);
    expect(input).toHaveFocus();
});

it('records the page open once without navigation writes for search transitions', async () => {
    useSessionStore.setState({
        status: 'authenticated',
        user: {
            id: '30000000-0000-4000-8000-000000000001',
            handle: null,
            primaryEmail: 'search@example.test',
            status: 'active',
            emailVerified: true,
            createdAt: timestamp,
        },
    });

    const opened = vi.spyOn(navigationApi, 'opened').mockResolvedValue({
        resource: {
            kind: 'dictionary',
            id: dictionary.id,
            title: dictionary.name,
            href: `/dictionaries/${dictionary.id}`,
            pinned: false,
            lastOpenedAt: timestamp,
        },
    });
    const { input } = await setup();
    expect(opened).toHaveBeenCalledOnce();

    const pending = deferred<ReturnType<typeof page>>();
    vi.mocked(dictionaryApi.listCards).mockReturnValueOnce(pending.promise);
    fireEvent.change(input, { target: { value: 'bon' } });
    await advance(301);
    pending.resolve(page());
    await advance(1);

    expect(opened).toHaveBeenCalledOnce();
    fireEvent.change(input, { target: { value: '' } });
    await advance(301);
    expect(opened).toHaveBeenCalledOnce();
});

it('keeps the same focused input through pending, failed, empty and cleared searches', async () => {
    const { input } = await setup();
    const pending = deferred<ReturnType<typeof page>>();
    const list = vi.mocked(dictionaryApi.listCards);
    list.mockReturnValueOnce(pending.promise);

    fireEvent.change(input, { target: { value: 'bon' } });
    input.setSelectionRange(1, 1);
    await advance(301);
    expect(screen.getByRole('searchbox')).toBe(input);
    expect(input).toHaveFocus();
    expect(input.selectionStart).toBe(1);
    expect(screen.queryByText('bonjour')).not.toBeInTheDocument();

    pending.reject(new Error('offline'));
    await advance(1);
    expect(screen.getByRole('searchbox')).toBe(input);
    expect(input).toHaveFocus();
    expect(input.selectionStart).toBe(1);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();

    list.mockResolvedValueOnce(page(''));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await advance(1);
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeVisible();
    expect(input).toHaveFocus();

    fireEvent.change(input, { target: { value: '   ' } });
    await advance(301);
    await advance(1);
    expect(list.mock.lastCall?.[2]).toEqual({ lifecycle: 'active', limit: 50 });
    expect(screen.getByRole('searchbox')).toBe(input);
    expect(input).toHaveFocus();
    expect(screen.getByText('bonjour')).toBeVisible();
});

it('starts each committed filter at page one, including returning to a cached filter', async () => {
    const list = vi.mocked(dictionaryApi.listCards);
    list.mockResolvedValueOnce(page('bonjour', 'next-page'));
    const { input } = await setup();
    list.mockResolvedValueOnce({
        ...page(),
        data: [card('salut', '2')],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Load more cards' }));
    await advance(1);
    expect(list.mock.calls[1]?.[2]).toEqual({
        lifecycle: 'active',
        limit: 50,
        cursor: 'next-page',
    });

    expect(screen.getByText('salut')).toBeVisible();
    fireEvent.change(input, { target: { value: 'bon' } });
    await advance(301);
    expect(list.mock.lastCall?.[2]).toEqual({
        lifecycle: 'active',
        limit: 50,
        search: 'bon',
    });

    fireEvent.change(input, { target: { value: '' } });
    await advance(301);
    await advance(1);
    expect(list).toHaveBeenCalledTimes(4);
    expect(list.mock.lastCall?.[2]).toEqual({ lifecycle: 'active', limit: 50 });
    expect(screen.queryByText('salut')).not.toBeInTheDocument();
    expect(input).toHaveFocus();
});

it('cancels an obsolete request and ignores its late response after the latest search', async () => {
    const { input } = await setup();
    const obsolete = deferred<ReturnType<typeof page>>();
    const list = vi.mocked(dictionaryApi.listCards);
    list.mockReturnValueOnce(obsolete.promise);

    fireEvent.change(input, { target: { value: 'bon' } });
    await advance(301);
    const signal = list.mock.lastCall?.[3];
    expect(signal?.aborted).toBe(false);

    list.mockResolvedValueOnce(page('salut'));
    fireEvent.change(input, { target: { value: 'sal' } });
    await advance(301);
    await advance(1);
    expect(signal?.aborted).toBe(true);
    expect(screen.getByText('salut')).toBeVisible();

    obsolete.resolve(page('obsolete bonjour'));
    await advance(1);
    expect(screen.queryByText('obsolete bonjour')).not.toBeInTheDocument();
    expect(screen.getByText('salut')).toBeVisible();
    expect(input).toHaveFocus();
    expect(list).toHaveBeenCalledTimes(3);
});

it('preserves lifecycle isolation and clears archived selection as soon as raw search changes', async () => {
    const { input } = await setup();
    const list = vi.mocked(dictionaryApi.listCards);
    const archivedPage = {
        ...page(),
        data: [
            {
                ...card('bonjour'),
                lifecycle: 'archived' as const,
                archivedAt: timestamp,
            },
        ],
    };

    list.mockResolvedValue(archivedPage);

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    await advance(1);
    expect(list.mock.lastCall?.[2]).toEqual({
        lifecycle: 'archived',
        limit: 50,
    });

    fireEvent.click(
        screen.getByRole('checkbox', { name: 'Select card bonjour' }),
    );

    expect(
        screen.getByRole('button', { name: 'Delete selected' }),
    ).toBeEnabled();

    fireEvent.change(input, { target: { value: ' bon ' } });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
    await advance(301);
    await advance(1);
    expect(list.mock.lastCall?.[2]).toEqual({
        lifecycle: 'archived',
        limit: 50,
        search: 'bon',
    });

    expect(
        screen.getByRole('checkbox', { name: 'Select card bonjour' }),
    ).not.toBeChecked();

    expect(
        screen.getByRole('button', { name: 'Delete selected' }),
    ).toBeDisabled();

    expect(input).toHaveFocus();
});
