import type {
    AuthUser,
    DictionarySummary,
    LanguagesResponse,
} from '@languon/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
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
                <ApplicationChrome>
                    <main>Page body</main>
                </ApplicationChrome>
            </ThemeProvider>
        </QueryClientProvider>,
    );
}

describe('session-aware global application shell', () => {
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

    it.each([
        '/dictionaries-other',
        '/profile-other',
        '/shared/dictionaries-other',
    ])(
        'does not classify lookalike not-found route %s as a section',
        async (route) => {
            pathname = route;
            renderChrome();
            expect(
                screen.getByTitle('Languon', { exact: true }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('button', {
                    name: 'Dictionaries',
                    exact: true,
                }),
            ).toHaveAttribute('aria-expanded', 'false');
            await userEvent
                .setup()
                .click(
                    screen.getByRole('button', { name: 'Collapse sidebar' }),
                );
            expect(
                screen.getByRole('link', { name: 'Dictionaries', exact: true }),
            ).not.toHaveAttribute('aria-current');
        },
    );

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

    it.each([
        '/',
        '/login',
        '/signup',
        '/shared/dictionaries/example',
        '/missing',
    ])('keeps signed-in navigation and home logos on %s', async (route) => {
        pathname = route;
        renderChrome();
        await userEvent.setup().click(
            screen.getByRole('button', {
                name: 'Dictionaries',
                exact: true,
            }),
        );
        expect(await screen.findByText(dictionary.name)).toBeInTheDocument();
        for (const logo of screen.getAllByRole('link', {
            name: 'Languon home',
        })) {
            expect(logo).toHaveAttribute('href', '/');
        }
        expect(screen.getByText('Page body')).toBeInTheDocument();
    });

    it.each(['/', '/login', '/shared/dictionaries/example', '/missing'])(
        'shows guest preferences without private navigation or queries on %s',
        async (route) => {
            pathname = route;
            useSessionStore.setState({
                status: 'signed-out',
                user: null,
                accessToken: null,
            });
            renderChrome();
            const sidebar = screen.getByRole('complementary', {
                name: 'Application sidebar',
            });
            expect(
                within(sidebar).getByRole('link', { name: 'Sign in' }),
            ).toHaveAttribute('href', '/login');
            expect(
                within(sidebar).getByRole('button', { name: 'Settings' }),
            ).toBeInTheDocument();
            expect(
                screen.queryByRole('link', { name: 'All dictionaries' }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Create a dictionary' }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: /Account menu/ }),
            ).not.toBeInTheDocument();
            await act(async () => {});
            expect(dictionaryApi.listDictionaries).not.toHaveBeenCalled();
            expect(dictionaryApi.listLanguages).not.toHaveBeenCalled();
        },
    );

    it('keeps session restoration pending without sign-in or private queries', async () => {
        useSessionStore.setState({
            status: 'bootstrapping',
            user: null,
            accessToken: null,
        });
        renderChrome();
        expect(screen.getByText('Restoring your account…')).toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'Sign in' }),
        ).not.toBeInTheDocument();
        await act(async () => {});
        expect(dictionaryApi.listDictionaries).not.toHaveBeenCalled();
        expect(dictionaryApi.listLanguages).not.toHaveBeenCalled();
    });

    it('mounts one guest Settings panel inside the native mobile drawer and restores nested focus', async () => {
        useSessionStore.setState({
            status: 'signed-out',
            user: null,
            accessToken: null,
        });
        const interaction = userEvent.setup();
        renderChrome();
        const menu = screen.getByRole('button', { name: 'Open navigation' });
        await interaction.click(menu);
        const drawer = screen.getByRole('dialog', { name: 'Main navigation' });
        const settings = within(drawer).getByRole('button', {
            name: 'Settings',
            exact: true,
        });
        await interaction.click(settings);
        expect(
            screen.getAllByRole('dialog', { name: 'Settings', exact: true }),
        ).toHaveLength(1);
        expect(
            within(drawer).getByRole('combobox', {
                name: 'Interface language',
            }),
        ).toBeInTheDocument();
        await interaction.click(
            within(drawer).getByRole('button', { name: 'Dark', exact: true }),
        );
        expect(
            within(drawer).getByRole('button', { name: 'Dark', exact: true }),
        ).toHaveAttribute('aria-pressed', 'true');
        await interaction.keyboard('{Escape}');
        expect(
            screen.queryByRole('dialog', { name: 'Settings', exact: true }),
        ).not.toBeInTheDocument();
        expect(drawer).toHaveAttribute('open');
        await waitFor(() => expect(settings).toHaveFocus());
    });

    it('replaces private navigation when the authenticated identity changes and clears it on logout', async () => {
        const secondDictionary = {
            ...dictionary,
            id: '20000000-0000-4000-8000-000000000002',
            name: 'Second learner vocabulary',
        };
        vi.mocked(dictionaryApi.listDictionaries)
            .mockResolvedValueOnce({ data: [dictionary], nextCursor: null })
            .mockResolvedValueOnce({
                data: [secondDictionary],
                nextCursor: null,
            });
        renderChrome();
        expect(await screen.findByText(dictionary.name)).toBeInTheDocument();
        act(() =>
            useSessionStore.setState({
                user: {
                    ...user,
                    id: '10000000-0000-4000-8000-000000000002',
                    handle: 'second',
                },
            }),
        );
        expect(screen.queryByText(dictionary.name)).not.toBeInTheDocument();
        expect(
            await screen.findByText(secondDictionary.name),
        ).toBeInTheDocument();
        expect(dictionaryApi.listDictionaries).toHaveBeenCalledTimes(2);
        act(() =>
            useSessionStore.setState({
                status: 'signed-out',
                user: null,
                accessToken: null,
            }),
        );
        expect(
            screen.queryByText(secondDictionary.name),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Sign in' }),
        ).toBeInTheDocument();
        expect(dictionaryApi.listDictionaries).toHaveBeenCalledTimes(2);
    });
});
