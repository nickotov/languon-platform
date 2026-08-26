import type { LanguagesResponse, PublicDictionary } from '@languon/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { dictionaryApi, DictionaryApiError } from '@/fsd/entities/dictionary';
import { SharedDictionaryPage } from '@/fsd/pages/shared-dictionary';

import { render } from './render';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/fsd/entities/session', () => ({
    useSessionStore: (selector: (state: { status: string }) => unknown) =>
        selector({ status: 'anonymous' }),
}));
vi.mock('@/fsd/features/auth', () => ({
    useAuth: () => ({
        requestWithSession: (operation: (token: string) => unknown) =>
            operation('token'),
    }),
}));

const languages = {
    catalogVersion: 1,
    languages: [
        {
            direction: 'ltr',
            displayNames: {
                en: 'English',
                es: 'Inglés',
                fr: 'Anglais',
                ru: 'Английский',
            },
            tag: 'en',
        },
        {
            direction: 'rtl',
            displayNames: {
                en: 'Hebrew',
                es: 'Hebreo',
                fr: 'Hébreu',
                ru: 'Иврит',
            },
            tag: 'he',
        },
    ],
} as LanguagesResponse;

function publicDictionary(cardId: string, source = 'שלום'): PublicDictionary {
    return {
        activeCardCount: 2,
        archivedAt: null,
        cards: [
            {
                authorship: 'human',
                createdAt: '2026-08-21T10:00:00.000Z',
                effectiveSettings: {
                    definitionEnabled: false,
                    definitionLanguage: 'source',
                    exampleEnabled: false,
                    exampleLanguage: 'source',
                    exampleTranslationEnabled: false,
                    exampleTranslationLanguage: 'target',
                    transcriptionCustomLabel: null,
                    transcriptionEnabled: false,
                    transcriptionNotation: 'ipa',
                },
                id: cardId,
                position: '1024',
                updatedAt: '2026-08-21T10:00:00.000Z',
                values: {
                    source,
                    translation: 'hello',
                    transcription: null,
                    definition: null,
                    example: null,
                    exampleTranslation: null,
                },
                version: 1,
            },
        ],
        createdAt: '2026-08-21T10:00:00.000Z',
        description: null,
        id: '10000000-0000-4000-8000-000000000001',
        languagePairLocked: true,
        name: 'Public words',
        settings: {
            definitionEnabled: false,
            definitionLanguage: 'source',
            exampleEnabled: false,
            exampleLanguage: 'source',
            exampleTranslationEnabled: false,
            transcriptionCustomLabel: null,
            transcriptionEnabled: false,
            transcriptionNotation: 'ipa',
        },
        sourceLanguage: 'he',
        targetLanguage: 'en',
        updatedAt: '2026-08-21T10:00:00.000Z',
        version: 1,
        visibility: 'unlisted',
    };
}

function renderPage() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return render(
        <QueryClientProvider client={client}>
            <SharedDictionaryPage shareId='share-locator-1234' />
        </QueryClientProvider>,
    );
}

describe('shared dictionary page', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        window.history.replaceState(
            {},
            '',
            '/shared/dictionaries/share-locator-1234',
        );
        vi.spyOn(dictionaryApi, 'listLanguages').mockResolvedValue(languages);
    });

    it('shows the unavailable state immediately when the fragment key is absent', async () => {
        const read = vi.spyOn(dictionaryApi, 'readSharedDictionary');
        renderPage();
        expect(
            await screen.findByRole('heading', {
                name: 'Dictionary unavailable',
            }),
        ).toBeInTheDocument();
        expect(read).not.toHaveBeenCalled();
    });

    it('refetches when a non-secret fragment revision changes', async () => {
        window.history.replaceState({}, '', '#valid-key');
        const read = vi
            .spyOn(dictionaryApi, 'readSharedDictionary')
            .mockResolvedValueOnce({
                dictionary: publicDictionary(
                    '20000000-0000-4000-8000-000000000001',
                ),
                nextCursor: null,
            })
            .mockRejectedValueOnce(
                new DictionaryApiError(404, {
                    code: 'shared_dictionary_not_found',
                    correlationId: 'test',
                    message: 'Unavailable',
                }),
            );
        renderPage();
        expect(await screen.findByText('שלום')).toHaveAttribute('dir', 'rtl');
        window.history.replaceState({}, '', '#wrong-key');
        window.dispatchEvent(new HashChangeEvent('hashchange'));
        expect(
            await screen.findByRole('heading', {
                name: 'Dictionary unavailable',
            }),
        ).toBeInTheDocument();
        expect(read).toHaveBeenCalledTimes(2);
    });

    it('preserves loaded cards and offers retry after a later page fails', async () => {
        window.history.replaceState({}, '', '#valid-key');
        vi.spyOn(dictionaryApi, 'readSharedDictionary')
            .mockResolvedValueOnce({
                dictionary: publicDictionary(
                    '20000000-0000-4000-8000-000000000001',
                ),
                nextCursor: 'next-page',
            })
            .mockRejectedValueOnce(
                new DictionaryApiError(503, {
                    code: 'service_unavailable',
                    correlationId: 'test',
                    message: 'Unavailable',
                }),
            );
        const user = userEvent.setup();
        renderPage();
        expect(await screen.findByText('שלום')).toBeInTheDocument();
        await user.click(
            screen.getByRole('button', { name: 'Load more cards' }),
        );
        await waitFor(() =>
            expect(
                screen.getByText(/More cards could not be loaded/),
            ).toBeInTheDocument(),
        );
        expect(screen.getByText('שלום')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Load more cards' }),
        ).toBeInTheDocument();
    });

    it('reloads from the first page when a continuation cursor is stale', async () => {
        window.history.replaceState({}, '', '#valid-key');
        vi.spyOn(dictionaryApi, 'readSharedDictionary')
            .mockResolvedValueOnce({
                dictionary: publicDictionary(
                    '20000000-0000-4000-8000-000000000001',
                    'old page',
                ),
                nextCursor: 'old-snapshot-cursor',
            })
            .mockRejectedValueOnce(
                new DictionaryApiError(409, {
                    code: 'version_conflict',
                    correlationId: 'test',
                    message: 'Dictionary changed',
                }),
            )
            .mockResolvedValueOnce({
                dictionary: publicDictionary(
                    '20000000-0000-4000-8000-000000000002',
                    'new page',
                ),
                nextCursor: null,
            });
        const user = userEvent.setup();
        renderPage();
        expect(await screen.findByText('old page')).toBeInTheDocument();
        await user.click(
            screen.getByRole('button', { name: 'Load more cards' }),
        );
        await user.click(
            await screen.findByRole('button', {
                name: 'Reload current version',
            }),
        );
        expect(await screen.findByText('new page')).toBeInTheDocument();
        expect(screen.queryByText('old page')).not.toBeInTheDocument();
    });
});
