import type { AuthUser, NavigationResource } from '@languon/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dictionaryApi } from '@/fsd/entities/dictionary';
import { knowledgeApi } from '@/fsd/entities/knowledge';
import { useSessionStore } from '@/fsd/entities/session';
import { navigationApi } from '@/fsd/features/library-navigation';
import { useNavigationLayout } from '@/fsd/shared/lib/navigation/use-navigation-layout';
import { registerNavigationGuard } from '@/fsd/shared/lib/navigation/guarded-navigation';
import { ThemeProvider } from '@/fsd/shared/theme';
import { ApplicationChrome } from '@/fsd/widgets/app-shell';
import { render } from './render';

const push = vi.fn();
const signOutHere = vi.fn();
let pathname = '/dictionaries';
vi.mock('next/navigation', () => ({
    usePathname: () => pathname,
    useRouter: () => ({ push, refresh: vi.fn() }),
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
const resource: NavigationResource = {
    id: '20000000-0000-4000-8000-000000000001',
    kind: 'dictionary',
    title: 'French A2 Vocabulary',
    href: '/dictionaries/20000000-0000-4000-8000-000000000001',
    description: 'EN → FR',
    language: 'en',
    pinned: false,
    lastOpenedAt: '2026-10-20T12:00:00.000Z',
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

describe('session-aware contextual sidebar', () => {
    it('gives the portrait interview its supplied focused layout without the app sidebar', () => {
        pathname = '/portrait/interview';
        renderChrome();
        expect(screen.getByRole('main')).toHaveTextContent('Page body');
        expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });

    it.each(['/portrait', '/portrait/manual', '/profile', '/texts/new'])(
        'preserves the contextual sidebar on %s',
        (route) => {
            pathname = route;
            renderChrome();
            expect(
                screen.getByRole('complementary', {
                    name: 'Application sidebar',
                }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Create new', exact: true }),
            ).toBeInTheDocument();
        },
    );

    beforeEach(() => {
        pathname = '/dictionaries';
        useNavigationLayout.setState({
            editorOpen: false,
            tutorOpen: false,
            companions: new Map(),
        });
        push.mockReset();
        signOutHere.mockReset();
        window.localStorage.clear();
        window.sessionStorage.clear();
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            value: 1440,
        });
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            value: vi.fn().mockReturnValue({
                addEventListener: vi.fn(),
                matches: false,
                removeEventListener: vi.fn(),
            }),
        });
        vi.spyOn(dictionaryApi, 'listLanguages').mockResolvedValue({
            catalogVersion: 1,
            languages: [],
        });
        vi.spyOn(dictionaryApi, 'listDictionaries').mockResolvedValue({
            data: [],
            nextCursor: null,
        });
        vi.spyOn(navigationApi, 'resources').mockImplementation(
            async (_token, input) => ({
                resources:
                    input.kind && input.kind !== 'dictionary' ? [] : [resource],
            }),
        );
        vi.spyOn(navigationApi, 'recent').mockResolvedValue({
            resources: [resource],
        });
        vi.spyOn(navigationApi, 'opened').mockResolvedValue({ resource });
        vi.spyOn(navigationApi, 'pin').mockResolvedValue({
            resource: { ...resource, pinned: true },
        });
        HTMLDialogElement.prototype.showModal = function showModal() {
            this.setAttribute('open', '');
        };
        HTMLDialogElement.prototype.close = function close() {
            this.removeAttribute('open');
        };
        useSessionStore.setState({
            accessToken: 'token',
            accessTokenExpiresAt: '2026-10-20T13:00:00.000Z',
            session: null,
            status: 'authenticated',
            user,
        });
    });

    it('uses bounded quick access and persists the desktop rail per user', async () => {
        const interaction = userEvent.setup();
        renderChrome();
        expect(
            await screen.findByRole('link', {
                name: 'Dictionaries',
                exact: true,
            }),
        ).toHaveAttribute('aria-current', 'page');
        expect(
            await screen.findByRole('link', { name: /French A2 Vocabulary/ }),
        ).toBeInTheDocument();
        expect(dictionaryApi.listDictionaries).not.toHaveBeenCalled();
        expect(navigationApi.opened).not.toHaveBeenCalled();
        expect(navigationApi.resources).toHaveBeenCalledWith(
            'token',
            { kind: 'dictionary', limit: 5 },
            expect.any(AbortSignal),
        );
        await interaction.click(
            screen.getByRole('button', { name: 'Collapse sidebar' }),
        );
        expect(
            screen.getByRole('button', { name: 'Expand sidebar' }),
        ).toBeInTheDocument();
        expect(
            JSON.parse(
                window.localStorage.getItem(`languon:sidebar:${user.id}`)!,
            ),
        ).toMatchObject({ collapsed: true });
    });

    it('shows five section shortcuts and retains the whole-library count', async () => {
        const resources = Array.from({ length: 6 }, (_, index) => ({
            ...resource,
            id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
            title: `Recent dictionary ${index + 1}`,
            href: `/dictionaries/20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        }));
        vi.mocked(navigationApi.resources).mockImplementation(
            async (_token, input) => ({
                resources: input.kind === 'dictionary' ? resources : [],
                total: input.kind === 'dictionary' ? 6 : 0,
            }),
        );
        renderChrome();
        expect(
            await screen.findByRole('link', { name: /Recent dictionary 5/ }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: /Recent dictionary 6/ }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'View all · 6' }),
        ).toHaveAttribute('href', '/dictionaries');
    });

    it('shows real Home and Create tooltips on the rail while keeping the create menu usable', async () => {
        const interaction = userEvent.setup();
        renderChrome();
        await interaction.click(
            screen.getByRole('button', { name: 'Collapse sidebar' }),
        );
        const home = screen.getByRole('link', { name: 'Home', exact: true });
        act(() => home.focus());
        expect(
            await screen.findByRole('tooltip', { name: 'Home' }),
        ).toBeVisible();
        expect(home).not.toHaveAttribute('title');
        const create = screen.getByRole('button', {
            name: 'Create new',
            exact: true,
        });
        act(() => create.focus());
        expect(
            await screen.findByRole('tooltip', { name: 'Create new' }),
        ).toBeVisible();
        await interaction.keyboard('{Enter}');
        expect(
            await screen.findByRole('menuitem', { name: 'New dictionary' }),
        ).toBeVisible();
    });

    it('opens the real dictionary creation form independently of disclosure', async () => {
        renderChrome();
        await userEvent
            .setup()
            .click(screen.getByRole('button', { name: 'New dictionary' }));
        expect(
            screen.getByRole('dialog', { name: 'Create a dictionary' }),
        ).toBeInTheDocument();
    });

    it('shows honest empty shortcuts with create and View all links', async () => {
        vi.mocked(navigationApi.resources).mockResolvedValue({ resources: [] });
        renderChrome();
        expect(await screen.findByText('No recent dictionaries')).toBeVisible();
        expect(screen.getAllByRole('link', { name: 'View all' })).toHaveLength(
            2,
        );
    });

    it('shows whole-library View all counts without treating four shortcuts as the total', async () => {
        vi.mocked(navigationApi.resources).mockImplementation(
            async (_token, input) => ({
                resources: input.kind === 'dictionary' ? [resource] : [],
                total: input.kind === 'dictionary' ? 7 : 0,
            }),
        );
        renderChrome();
        const dictionaryLink = await screen.findByRole('link', {
            name: 'View all · 7',
        });
        expect(dictionaryLink).toHaveAttribute('href', '/dictionaries');
        expect(dictionaryLink).toHaveTextContent('· 7');
    });

    it('discloses each library independently and keeps preferences user scoped', async () => {
        const interaction = userEvent.setup();
        renderChrome();
        await screen.findByText(resource.title);
        await interaction.click(
            screen.getByRole('button', { name: 'Hide recent: Dictionaries' }),
        );
        expect(screen.queryByText(resource.title)).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Show recent: Texts' }),
        ).toHaveAttribute('aria-expanded', 'false');
        act(() =>
            useSessionStore.setState({
                user: { ...user, id: '10000000-0000-4000-8000-000000000002' },
            }),
        );
        expect(
            await screen.findByRole('button', {
                name: 'Hide recent: Dictionaries',
            }),
        ).toHaveAttribute('aria-expanded', 'true');
    });

    it('searches beyond shortcuts by title and invokes the selected result with keyboard', async () => {
        const hidden = {
            ...resource,
            id: '20000000-0000-4000-8000-000000000002',
            title: 'Hidden library title',
            href: '/dictionaries/20000000-0000-4000-8000-000000000002',
        };
        vi.mocked(navigationApi.resources).mockImplementation(
            async (_token, input) => ({
                resources: input.q
                    ? [hidden]
                    : input.kind === 'dictionary'
                      ? [resource]
                      : [],
            }),
        );
        const interaction = userEvent.setup();
        renderChrome();
        await interaction.keyboard('{Control>}k{/Control}');
        const dialog = screen.getByRole('dialog', { name: 'Search' });
        const search = within(dialog).getByRole('combobox', { name: 'Search' });
        await interaction.type(search, 'hidden');
        expect(
            await within(dialog).findByRole('button', {
                name: 'Hidden library title',
                exact: true,
            }),
        ).toBeInTheDocument();
        expect(navigationApi.resources).toHaveBeenCalledWith(
            'token',
            { q: 'hidden', limit: 8 },
            expect.any(AbortSignal),
        );
        await interaction.keyboard('{Enter}');
        expect(push).toHaveBeenCalledWith(hidden.href);
        expect(navigationApi.opened).not.toHaveBeenCalled();
    });

    it('exposes palette resource rows as a grid with reachable pin actions', async () => {
        const interaction = userEvent.setup();
        renderChrome();
        await interaction.keyboard('{Control>}k{/Control}');
        const dialog = screen.getByRole('dialog', { name: 'Search' });
        const search = within(dialog).getByRole('combobox', { name: 'Search' });
        expect(search).toHaveAttribute('aria-haspopup', 'grid');
        const grid = within(dialog).getByRole('grid');
        const row = await within(grid).findByRole('row', {
            name: resource.title,
        });
        expect(row).toHaveAttribute('aria-selected', 'true');
        expect(search).toHaveAttribute('aria-activedescendant', row.id);
        expect(within(row).getAllByRole('gridcell')).toHaveLength(2);
        await interaction.keyboard('{ArrowDown}');
        expect(
            within(grid).getByRole('row', { name: 'New dictionary' }),
        ).toHaveAttribute('aria-selected', 'true');
        await interaction.keyboard('{ArrowUp}');
        expect(row).toHaveAttribute('aria-selected', 'true');
        await interaction.tab();
        const menu = within(row).getByRole('button', {
            name: `Resource actions: ${resource.title}`,
        });
        expect(menu).toHaveFocus();
        await interaction.keyboard('{Enter}');
        expect(
            await screen.findByRole('menuitem', { name: 'Pin' }),
        ).toHaveFocus();
    });

    it('honors the dirty-work guard for palette navigation and Create', async () => {
        const guard = vi.fn();
        const remove = registerNavigationGuard(guard);
        try {
            const interaction = userEvent.setup();
            renderChrome();
            await interaction.click(
                screen.getByRole('button', { name: 'New dictionary' }),
            );
            expect(guard).toHaveBeenCalledOnce();
            expect(
                screen.queryByRole('dialog', { name: 'Create a dictionary' }),
            ).not.toBeInTheDocument();
            await interaction.keyboard('{Control>}k{/Control}');
            const dialog = screen.getByRole('dialog', { name: 'Search' });
            await interaction.click(
                await within(dialog).findByRole('button', {
                    name: 'French A2 Vocabulary',
                    exact: true,
                }),
            );
            expect(guard).toHaveBeenCalledTimes(2);
            expect(push).not.toHaveBeenCalled();
        } finally {
            remove();
        }
    });

    it('pins resources from their navigation action menu and refreshes quick access', async () => {
        const interaction = userEvent.setup();
        renderChrome();
        const menu = await screen.findByRole('button', {
            name: `Resource actions: ${resource.title}`,
        });
        await interaction.click(menu);
        await interaction.click(screen.getByRole('menuitem', { name: 'Pin' }));
        await waitFor(() =>
            expect(navigationApi.pin).toHaveBeenCalledWith(
                'token',
                'dictionary',
                resource.id,
                true,
            ),
        );
        await waitFor(() =>
            expect(
                vi
                    .mocked(navigationApi.resources)
                    .mock.calls.filter(
                        ([, input]) => input.kind === 'dictionary',
                    ).length,
            ).toBeGreaterThan(1),
        );
    });

    it('opens a keyboard-pinned rail flyout with bounded section filtering', async () => {
        const interaction = userEvent.setup();
        renderChrome();
        await interaction.click(
            screen.getByRole('button', { name: 'Collapse sidebar' }),
        );
        const trigger = screen.getByRole('button', {
            name: 'Dictionaries',
            exact: true,
        });
        trigger.focus();
        await interaction.keyboard('{ArrowRight}');
        const flyout = await screen.findByRole('dialog', {
            name: 'Dictionaries',
        });
        expect(
            within(flyout).getByRole('textbox', { name: 'Filter' }),
        ).toHaveFocus();
        await interaction.type(
            within(flyout).getByRole('textbox', { name: 'Filter' }),
            'French',
        );
        await waitFor(() =>
            expect(navigationApi.resources).toHaveBeenCalledWith(
                'token',
                { kind: 'dictionary', q: 'French', limit: 8 },
                expect.any(AbortSignal),
            ),
        );
        await interaction.keyboard('{Escape}');
        expect(
            screen.queryByRole('dialog', { name: 'Dictionaries' }),
        ).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
    });

    it('temporarily collapses for editor and tutor below1280 and respects explicit session expansion', async () => {
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            value: 1100,
        });
        useNavigationLayout.setState({ editorOpen: true, tutorOpen: true });
        const interaction = userEvent.setup();
        renderChrome();
        await interaction.click(
            screen.getByRole('button', { name: 'Expand sidebar' }),
        );
        expect(
            screen.getByRole('button', { name: 'Collapse sidebar' }),
        ).toBeInTheDocument();
        act(() => useNavigationLayout.setState({ tutorOpen: false }));
        act(() => useNavigationLayout.setState({ tutorOpen: true }));
        expect(
            screen.getByRole('button', { name: 'Collapse sidebar' }),
        ).toBeInTheDocument();
    });

    it('opens a drawer from the tablet rail without changing the desktop preference', async () => {
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            value: 900,
        });
        const interaction = userEvent.setup();
        renderChrome();
        await interaction.click(
            screen.getByRole('button', { name: 'Expand sidebar' }),
        );
        expect(
            screen.getByRole('dialog', { name: 'Main navigation' }),
        ).toHaveAttribute('open');
        expect(
            window.localStorage.getItem(`languon:sidebar:${user.id}`),
        ).toBeNull();
    });

    it('opens the account menu with real links, preferences and pending sign-out', async () => {
        let resolve: (() => void) | undefined;
        signOutHere.mockImplementation(
            () =>
                new Promise<void>((done) => {
                    resolve = done;
                }),
        );
        const interaction = userEvent.setup();
        renderChrome();
        await interaction.click(
            screen.getByRole('button', { name: 'Account menu, @learner' }),
        );
        expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute(
            'href',
            '/profile',
        );
        expect(
            screen.getByRole('link', { name: 'AI preferences' }),
        ).toHaveAttribute('href', '/profile#ai-preferences');
        expect(screen.getByLabelText('Interface language')).toBeInTheDocument();
        await interaction.click(
            screen.getByRole('button', { name: 'Sign out' }),
        );
        expect(
            screen.getByRole('button', { name: 'Signing out…' }),
        ).toBeDisabled();
        resolve?.();
    });

    it('opens the mobile drawer and restores menu focus on dismissal', async () => {
        const interaction = userEvent.setup();
        renderChrome();
        const trigger = screen.getByRole('button', { name: 'Open navigation' });
        await interaction.click(trigger);
        expect(
            screen.getByRole('dialog', { name: 'Main navigation' }),
        ).toHaveAttribute('open');
        await interaction.click(
            screen.getByRole('button', { name: 'Close navigation' }),
        );
        await waitFor(() => expect(trigger).toHaveFocus());
    });

    it.each(['/', '/login', '/shared/dictionaries/example', '/missing'])(
        'keeps guest preferences and performs no private requests on %s',
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
                screen.queryByRole('button', { name: 'Create new' }),
            ).not.toBeInTheDocument();
            await act(async () => {});
            expect(navigationApi.resources).not.toHaveBeenCalled();
            expect(dictionaryApi.listLanguages).not.toHaveBeenCalled();
        },
    );

    it('keeps restoring sessions pending without guest actions', async () => {
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
        expect(navigationApi.resources).not.toHaveBeenCalled();
    });

    it('replaces private cached resources on identity change and removes them on logout', async () => {
        const second = { ...resource, title: 'Second learner vocabulary' };
        vi.mocked(navigationApi.resources).mockImplementation(
            async (_token, input) => ({
                resources:
                    input.kind === 'dictionary'
                        ? [
                              useSessionStore.getState().user?.id === user.id
                                  ? resource
                                  : second,
                          ]
                        : [],
            }),
        );
        renderChrome();
        expect(await screen.findByText(resource.title)).toBeInTheDocument();
        act(() =>
            useSessionStore.setState({
                user: { ...user, id: '10000000-0000-4000-8000-000000000002' },
            }),
        );
        expect(screen.queryByText(resource.title)).not.toBeInTheDocument();
        expect(await screen.findByText(second.title)).toBeInTheDocument();
        act(() =>
            useSessionStore.setState({
                status: 'signed-out',
                user: null,
                accessToken: null,
            }),
        );
        expect(screen.queryByText(second.title)).not.toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Sign in' }),
        ).toBeInTheDocument();
    });

    it('creates a real knowledge draft from the universal Create menu', async () => {
        vi.spyOn(knowledgeApi, 'createDraft').mockResolvedValue({
            noteId: resource.id,
        } as Awaited<ReturnType<typeof knowledgeApi.createDraft>>);
        const interaction = userEvent.setup();
        renderChrome();
        await interaction.click(
            screen.getByRole('button', { name: 'Create new' }),
        );
        await interaction.click(
            screen.getByRole('menuitem', { name: 'New knowledge document' }),
        );
        await waitFor(() =>
            expect(push).toHaveBeenCalledWith(`/knowledge/${resource.id}`),
        );
    });
});
