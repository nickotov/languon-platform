import type { DictionarySummary, LanguagesResponse } from '@languon/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { dictionaryApi } from '@/fsd/entities/dictionary';
import { DictionaryLibrary } from '@/fsd/features/dictionary-library';

import { render } from './render';

const push = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push }),
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
    const openSettings = vi.fn();

    beforeEach(() => {
        openSettings.mockReset();
        push.mockReset();
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
                    onOpenSettings={openSettings}
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

    it('opens settings through the library owner without navigating to the dictionary', async () => {
        const dictionary = summary(
            '10000000-0000-4000-8000-000000000008',
            'Stay in library',
        );
        vi.spyOn(dictionaryApi, 'listDictionaries').mockResolvedValue({
            data: [dictionary],
            nextCursor: null,
        });
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        const user = userEvent.setup();
        render(
            <QueryClientProvider client={client}>
                <DictionaryLibrary
                    onOpenSettings={openSettings}
                    requestWithSession={(operation) => operation('token')}
                />
            </QueryClientProvider>,
        );

        await user.click(
            await screen.findByRole('button', {
                name: 'Actions for Stay in library',
            }),
        );
        await user.click(
            screen.getByRole('menuitem', { name: 'Dictionary settings' }),
        );

        expect(openSettings).toHaveBeenCalledWith(dictionary);
        expect(push).not.toHaveBeenCalled();
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
                    onOpenSettings={openSettings}
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

    it('deletes selected archived dictionaries only after typed confirmation', async () => {
        const dictionary = {
            ...summary(
                '10000000-0000-4000-8000-000000000004',
                'Old vocabulary',
            ),
            lifecycle: 'archived' as const,
            version: 4,
        };
        vi.spyOn(dictionaryApi, 'listDictionaries').mockImplementation(
            async (_token, query) => ({
                data: query.lifecycle === 'archived' ? [dictionary] : [],
                nextCursor: null,
            }),
        );
        const remove = vi
            .spyOn(dictionaryApi, 'deleteDictionaries')
            .mockResolvedValue({
                operationId: '30000000-0000-4000-8000-000000000001',
                targetKind: 'dictionary',
                deletedCount: 1,
                resultingDictionaryVersion: null,
            });
        const showModal = HTMLDialogElement.prototype.showModal;
        const close = HTMLDialogElement.prototype.close;
        HTMLDialogElement.prototype.showModal = function show() {
            this.setAttribute('open', '');
        };
        HTMLDialogElement.prototype.close = function closeDialog() {
            this.removeAttribute('open');
        };
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        const unrelatedDictionaryId = '10000000-0000-4000-8000-000000000099';
        client.setQueryData(['dictionary', dictionary.id], {
            dictionary: { id: dictionary.id, name: dictionary.name },
        });
        client.setQueryData(['dictionary-cards', dictionary.id, 'active'], {
            data: [{ dictionaryId: dictionary.id, values: { source: 'old' } }],
        });
        client.setQueryData(
            ['dictionary-card-authoring-job', 'cached-deletion-job'],
            { dictionaryId: dictionary.id, source: 'old' },
        );
        client.setQueryData(['dictionary', unrelatedDictionaryId], {
            dictionary: { id: unrelatedDictionaryId, name: 'Keep me' },
        });
        const user = userEvent.setup();

        render(
            <QueryClientProvider client={client}>
                <DictionaryLibrary
                    onOpenSettings={openSettings}
                    requestWithSession={(operation) => operation('token')}
                />
            </QueryClientProvider>,
        );

        await user.click(
            screen.getByRole('button', { name: 'Archived', exact: true }),
        );
        await user.click(
            await screen.findByRole('checkbox', {
                name: 'Select Old vocabulary',
            }),
        );
        await user.click(
            screen.getByRole('button', { name: 'Delete selected' }),
        );
        const confirm = screen.getByRole('button', {
            name: 'Delete permanently',
        });
        expect(confirm).toBeDisabled();
        await user.type(
            screen.getByLabelText('Type “Old vocabulary” to confirm'),
            'Old vocabulary',
        );
        await user.click(confirm);

        await waitFor(() =>
            expect(remove).toHaveBeenCalledWith(
                'token',
                {
                    scope: {
                        kind: 'selected',
                        targets: [
                            {
                                dictionaryId: dictionary.id,
                                expectedVersion: 4,
                            },
                        ],
                    },
                },
                expect.any(String),
            ),
        );
        expect(
            await screen.findByText('Dictionaries permanently deleted: 1.'),
        ).toBeInTheDocument();
        expect(
            client.getQueryData(['dictionary', dictionary.id]),
        ).toBeUndefined();
        expect(
            client.getQueryData(['dictionary-cards', dictionary.id, 'active']),
        ).toBeUndefined();
        expect(
            client.getQueryData([
                'dictionary-card-authoring-job',
                'cached-deletion-job',
            ]),
        ).toBeUndefined();
        expect(
            client.getQueryData(['dictionary', unrelatedDictionaryId]),
        ).toBeDefined();
        HTMLDialogElement.prototype.showModal = showModal;
        HTMLDialogElement.prototype.close = close;
    });

    it('hides destructive bulk controls when the archived view is empty', async () => {
        vi.spyOn(dictionaryApi, 'listDictionaries').mockResolvedValue({
            data: [],
            nextCursor: null,
        });
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        const user = userEvent.setup();
        render(
            <QueryClientProvider client={client}>
                <DictionaryLibrary
                    onOpenSettings={openSettings}
                    requestWithSession={(operation) => operation('token')}
                />
            </QueryClientProvider>,
        );

        await user.click(
            screen.getByRole('button', { name: 'Archived', exact: true }),
        );
        expect(
            await screen.findByText('No archived dictionaries'),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('checkbox', { name: 'Select loaded items' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Delete all archived' }),
        ).not.toBeInTheDocument();
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
                        onOpenSettings={openSettings}
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
