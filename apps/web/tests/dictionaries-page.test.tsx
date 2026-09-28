import type {
    AuthUser,
    DictionarySummary,
    OwnedDictionary,
} from '@languon/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dictionaryApi } from '@/fsd/entities/dictionary';
import { useSessionStore } from '@/fsd/entities/session';
import { DictionariesPage } from '@/fsd/pages/dictionaries';

import { render } from './render';

const push = vi.fn();
const replace = vi.fn();
const originalShowModal = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push, replace }),
}));

vi.mock('@/fsd/features/auth', () => ({
    useAuth: () => ({
        requestWithSession: <T,>(operation: (token: string) => Promise<T>) =>
            operation('token'),
    }),
}));

const id = '10000000-0000-4000-8000-000000000010';
const summary: DictionarySummary = {
    activeCardCount: 3,
    archivedAt: null,
    createdAt: '2026-09-28T10:00:00.000Z',
    description: null,
    id,
    languagePairLocked: false,
    lifecycle: 'active',
    name: 'Library settings example',
    settingsVersion: 1,
    sourceLanguage: 'en',
    targetLanguage: 'es',
    updatedAt: '2026-09-28T10:00:00.000Z',
    version: 1,
    visibility: 'private',
};
const dictionary: OwnedDictionary = {
    ...summary,
    settings: {
        updatedAt: summary.updatedAt,
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
        version: 1,
    },
    sourceDictionaryId: null,
};
const user: AuthUser = {
    createdAt: '2026-09-28T09:00:00.000Z',
    emailVerified: true,
    handle: null,
    id: '10000000-0000-4000-8000-000000000001',
    primaryEmail: 'library-settings@example.test',
    status: 'active',
};

describe('dictionaries page settings', () => {
    beforeEach(() => {
        push.mockReset();
        replace.mockReset();
        HTMLDialogElement.prototype.showModal = function showModal() {
            this.setAttribute('open', '');
        };
        HTMLDialogElement.prototype.close = function close() {
            this.removeAttribute('open');
        };
        useSessionStore.setState({
            accessToken: 'token',
            accessTokenExpiresAt: '2026-09-28T11:00:00.000Z',
            session: null,
            status: 'authenticated',
            user,
        });
        vi.spyOn(dictionaryApi, 'listLanguages').mockResolvedValue({
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
        });
        vi.spyOn(dictionaryApi, 'listDictionaries').mockResolvedValue({
            data: [summary],
            nextCursor: null,
        });
        vi.spyOn(dictionaryApi, 'readDictionary').mockResolvedValue({
            dictionary,
        });
    });

    afterEach(() => {
        HTMLDialogElement.prototype.showModal = originalShowModal;
        HTMLDialogElement.prototype.close = originalClose;
    });

    it('keeps the library visible while opening dictionary settings', async () => {
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        const interaction = userEvent.setup();
        render(
            <QueryClientProvider client={client}>
                <DictionariesPage />
            </QueryClientProvider>,
        );

        await interaction.click(
            await screen.findByRole('button', {
                name: 'Actions for Library settings example',
            }),
        );
        await interaction.click(
            screen.getByRole('menuitem', { name: 'Dictionary settings' }),
        );

        expect(
            await screen.findByRole('dialog', { name: 'Dictionary settings' }),
        ).toBeVisible();
        expect(
            screen.getByRole('heading', { name: 'My dictionaries' }),
        ).toBeVisible();
        expect(push).not.toHaveBeenCalled();
    });
});
