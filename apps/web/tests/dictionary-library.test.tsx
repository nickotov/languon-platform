import type { DictionarySummary, LanguagesResponse } from '@languon/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { dictionaryApi } from '@/fsd/entities/dictionary';
import { DictionaryLibrary } from '@/fsd/features/dictionary-library';

import { render } from './render';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
}));

const languageResponse = {
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
            direction: 'ltr',
            displayNames: {
                en: 'Spanish',
                es: 'Español',
                fr: 'Espagnol',
                ru: 'Испанский',
            },
            tag: 'es',
        },
    ],
} as LanguagesResponse;

function summary(id: string, name: string): DictionarySummary {
    return {
        activeCardCount: 0,
        archivedAt: null,
        createdAt: '2026-08-21T10:00:00.000Z',
        description: null,
        id,
        languagePairLocked: false,
        lifecycle: 'active',
        name,
        settingsVersion: 1,
        sourceLanguage: 'en',
        targetLanguage: 'es',
        updatedAt: '2026-08-21T10:00:00.000Z',
        version: 1,
        visibility: 'private',
    };
}

describe('dictionary library', () => {
    beforeEach(() => {
        vi.spyOn(dictionaryApi, 'listLanguages').mockResolvedValue(
            languageResponse,
        );
    });

    it('loads subsequent cursor pages without losing current results', async () => {
        const list = vi
            .spyOn(dictionaryApi, 'listDictionaries')
            .mockResolvedValueOnce({
                data: [
                    summary('10000000-0000-4000-8000-000000000001', 'First'),
                ],
                nextCursor: 'next-page',
            })
            .mockResolvedValueOnce({
                data: [
                    summary('10000000-0000-4000-8000-000000000002', 'Second'),
                ],
                nextCursor: null,
            });
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        const user = userEvent.setup();
        render(
            <QueryClientProvider client={client}>
                <DictionaryLibrary
                    requestWithSession={(operation) => operation('token')}
                />
            </QueryClientProvider>,
        );

        expect(await screen.findByText('First')).toBeInTheDocument();
        await user.click(
            screen.getByRole('button', { name: 'Load more dictionaries' }),
        );
        expect(await screen.findByText('Second')).toBeInTheDocument();
        expect(screen.getByText('First')).toBeInTheDocument();
        await waitFor(() =>
            expect(list.mock.calls[1]?.[1]).toMatchObject({
                cursor: 'next-page',
                limit: 25,
            }),
        );
    });

    it('filters archived dictionaries and restores from the row menu with its current version', async () => {
        const dictionary = {
            ...summary(
                '10000000-0000-4000-8000-000000000003',
                'Archived vocabulary',
            ),
            lifecycle: 'archived' as const,
            version: 7,
        };
        const list = vi
            .spyOn(dictionaryApi, 'listDictionaries')
            .mockImplementation(async (_token, query) => ({
                data: query.lifecycle === 'archived' ? [dictionary] : [],
                nextCursor: null,
            }));
        const restore = vi
            .spyOn(dictionaryApi, 'setDictionaryLifecycle')
            .mockResolvedValue({
                dictionary: {
                    ...dictionary,
                    lifecycle: 'active',
                    sourceDictionaryId: null,
                    settings: {
                        version: 1,
                        updatedAt: dictionary.updatedAt,
                        values: {
                            definitionEnabled: false,
                            definitionLanguage: 'source',
                            exampleEnabled: false,
                            exampleLanguage: 'source',
                            exampleTranslationEnabled: false,
                            transcriptionCustomLabel: null,
                            transcriptionEnabled: false,
                            transcriptionNotation: 'ipa',
                        },
                    },
                },
            });
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        const user = userEvent.setup();
        render(
            <QueryClientProvider client={client}>
                <DictionaryLibrary
                    requestWithSession={(operation) => operation('token')}
                />
            </QueryClientProvider>,
        );
        await user.click(
            screen.getByRole('button', { name: 'Archived', exact: true }),
        );
        expect(
            await screen.findByText('Archived vocabulary'),
        ).toBeInTheDocument();
        expect(list).toHaveBeenCalledWith(
            'token',
            expect.objectContaining({ lifecycle: 'archived' }),
            expect.anything(),
        );
        await user.click(
            screen.getByRole('button', {
                name: 'Actions for Archived vocabulary',
            }),
        );
        expect(
            screen.getByRole('menuitem', { name: 'Dictionary settings' }),
        ).toBeDisabled();
        await user.click(screen.getByRole('menuitem', { name: 'Restore' }));
        await waitFor(() =>
            expect(restore).toHaveBeenCalledWith(
                'token',
                dictionary.id,
                'active',
                { expectedDictionaryVersion: 7 },
            ),
        );
    });

    it('keeps the intended language defaults when the catalog arrives asynchronously', async () => {
        const showModal = HTMLDialogElement.prototype.showModal;
        const close = HTMLDialogElement.prototype.close;
        HTMLDialogElement.prototype.showModal = function showModalForTest() {
            this.setAttribute('open', '');
        };
        HTMLDialogElement.prototype.close = function closeForTest() {
            this.removeAttribute('open');
            this.dispatchEvent(new Event('close'));
        };
        vi.spyOn(dictionaryApi, 'listDictionaries').mockResolvedValue({
            data: [],
            nextCursor: null,
        });
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        const user = userEvent.setup();
        try {
            render(
                <QueryClientProvider client={client}>
                    <DictionaryLibrary
                        requestWithSession={(operation) => operation('token')}
                    />
                </QueryClientProvider>,
            );

            await user.click(
                await screen.findByRole('button', {
                    name: 'New dictionary',
                }),
            );
            expect(screen.getByLabelText('Translate from')).toHaveValue('en');
            expect(screen.getByLabelText('Translate to')).toHaveValue('es');
        } finally {
            HTMLDialogElement.prototype.showModal = showModal;
            HTMLDialogElement.prototype.close = close;
        }
    });
});
