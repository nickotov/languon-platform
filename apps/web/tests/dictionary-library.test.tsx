import type { DictionarySummary, LanguagesResponse } from '@languon/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { dictionaryApi } from '@/fsd/entities/dictionary';
import { DictionaryLibrary } from '@/fsd/features/dictionary-library';
import { DictionaryImportPanel } from '@/fsd/features/dictionary-interchange';

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
                    importPanel={DictionaryImportPanel}
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
                        importPanel={DictionaryImportPanel}
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
