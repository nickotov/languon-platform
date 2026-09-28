import type {
    AuthUser,
    DictionarySummary,
    LanguagesResponse,
} from '@languon/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { dictionaryApi } from '@/fsd/entities/dictionary';
import { useSessionStore } from '@/fsd/entities/session';
import { ThemeProvider } from '@/fsd/shared/theme';
import { ApplicationChrome } from '@/fsd/widgets/app-shell';

import { render } from './render';

const refresh = vi.fn();
const push = vi.fn();
const signOutHere = vi.fn();
let pathname = '/dictionaries';

vi.mock('next/navigation', () => ({
    usePathname: () => pathname,
    useRouter: () => ({ push, refresh }),
}));

vi.mock('@/fsd/features/auth', () => ({
    useAuth: () => ({
        requestWithSession: <T,>(operation: (token: string) => Promise<T>) =>
            operation('token'),
        signOutHere,
    }),
}));

const user: AuthUser = {
    createdAt: '2026-09-28T10:00:00.000Z',
    emailVerified: true,
    handle: 'learner',
    id: '10000000-0000-4000-8000-000000000001',
    primaryEmail: 'learner@example.test',
    status: 'active',
};

const languageResponse: LanguagesResponse = {
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
                en: 'French',
                es: 'Francés',
                fr: 'Français',
                ru: 'Французский',
            },
            tag: 'fr',
        },
    ],
};

const dictionary: DictionarySummary = {
    activeCardCount: 12,
    archivedAt: null,
    createdAt: '2026-09-20T10:00:00.000Z',
    description: null,
    id: '20000000-0000-4000-8000-000000000001',
    languagePairLocked: true,
    lifecycle: 'active',
    name: 'French A2 Vocabulary',
    settingsVersion: 1,
    sourceLanguage: 'en',
    targetLanguage: 'fr',
    updatedAt: '2026-09-27T10:00:00.000Z',
    version: 1,
    visibility: 'private',
};

function renderChrome() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return render(
        <QueryClientProvider client={client}>
            <ThemeProvider preference='light'>
                <ApplicationChrome publicHeader={<div>Public header</div>}>
                    <main>Page body</main>
                </ApplicationChrome>
            </ThemeProvider>
        </QueryClientProvider>,
    );
}

describe('authenticated application shell', () => {
    beforeEach(() => {
        pathname = '/dictionaries';
        push.mockReset();
        refresh.mockReset();
        signOutHere.mockReset();
        window.sessionStorage.clear();
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: vi.fn().mockReturnValue({
                addEventListener: vi.fn(),
                matches: false,
                removeEventListener: vi.fn(),
            }),
        });
        vi.spyOn(dictionaryApi, 'listLanguages').mockResolvedValue(
            languageResponse,
        );
        vi.spyOn(dictionaryApi, 'listDictionaries').mockResolvedValue({
            data: [dictionary],
            nextCursor: null,
        });
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
    });

    it('renders real dictionary navigation and toggles the desktop rail', async () => {
        const interaction = userEvent.setup();
        renderChrome();

        expect(
            await screen.findByRole('navigation', { name: 'Main navigation' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'All dictionaries' }),
        ).toHaveAttribute('aria-current', 'page');
        expect(await screen.findByText(dictionary.name)).toBeInTheDocument();

        await interaction.click(
            screen.getByRole('button', { name: 'Collapse sidebar' }),
        );
        expect(
            screen.getByRole('button', { name: 'Expand sidebar' }),
        ).toBeInTheDocument();
        expect(window.sessionStorage.getItem('languon:app-shell-rail')).toBe(
            'true',
        );
    });

    it('opens the existing create-dictionary dialog from the sidebar', async () => {
        const interaction = userEvent.setup();
        renderChrome();
        const sidebar = screen.getByRole('complementary', {
            name: 'Application sidebar',
        });

        await interaction.click(
            await within(sidebar).findByRole('button', {
                name: 'Create a dictionary',
            }),
        );

        expect(
            screen.getByRole('dialog', { name: 'Create a dictionary' }),
        ).toBeInTheDocument();
    });

    it('shows the empty dictionary navigation state', async () => {
        vi.mocked(dictionaryApi.listDictionaries).mockResolvedValueOnce({
            data: [],
            nextCursor: null,
        });
        renderChrome();
        expect(await screen.findByText('No dictionaries yet')).toBeVisible();
    });

    it('opens the account menu with preferences and a pending sign-out state', async () => {
        let resolveSignOut: (() => void) | undefined;
        signOutHere.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    resolveSignOut = resolve;
                }),
        );
        const interaction = userEvent.setup();
        renderChrome();

        await interaction.click(
            await screen.findByRole('button', {
                name: 'Account menu, @learner',
            }),
        );
        expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute(
            'href',
            '/profile',
        );
        expect(screen.getByLabelText('Interface language')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Dark' }),
        ).toBeInTheDocument();

        await interaction.click(
            screen.getByRole('button', { name: 'Sign out' }),
        );
        expect(
            screen.getByRole('button', { name: 'Signing out…' }),
        ).toBeDisabled();
        resolveSignOut?.();
        await waitFor(() => expect(signOutHere).toHaveBeenCalledOnce());
    });

    it('opens and dismisses the mobile drawer while restoring menu focus', async () => {
        const interaction = userEvent.setup();
        renderChrome();
        const menu = screen.getByRole('button', { name: 'Open navigation' });

        await interaction.click(menu);
        expect(
            screen.getByRole('dialog', { name: 'Main navigation' }),
        ).toHaveAttribute('open');
        await interaction.click(
            screen.getByRole('button', { name: 'Close navigation' }),
        );
        await waitFor(() => expect(menu).toHaveFocus());
    });

    it('keeps public routes on the standalone header even when signed in', () => {
        pathname = '/';
        renderChrome();
        expect(screen.getByText('Public header')).toBeInTheDocument();
        expect(
            screen.queryByRole('navigation', { name: 'Main navigation' }),
        ).not.toBeInTheDocument();
    });
});
