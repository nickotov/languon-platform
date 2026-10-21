import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSessionStore } from '@/fsd/entities/session';
import { HomePage } from '@/fsd/pages/home/ui/home-page';

import { render } from './render';

vi.mock('@/fsd/features/auth', () => ({
    useAuth: () => ({
        requestWithSession: <T,>(operation: (token: string) => Promise<T>) =>
            operation('local-test-token'),
    }),
}));

const clients: QueryClient[] = [];
const greetings = {
    en: 'Welcome back',
    es: 'Te damos la bienvenida',
    fr: 'Bon retour',
    ru: 'С возвращением',
};

function renderHome(locale: keyof typeof greetings = 'en') {
    const client = new QueryClient();
    clients.push(client);
    return render(
        <QueryClientProvider client={client}>
            <HomePage dateLabel='21 October 2026' />
        </QueryClientProvider>,
        { locale },
    );
}

beforeEach(() => useSessionStore.getState().signOut());
afterEach(() => {
    clients.forEach((client) => client.clear());
    clients.length = 0;
    useSessionStore.getState().signOut();
    vi.unstubAllGlobals();
});

describe('home dashboard', () => {
    it.each(['en', 'es', 'fr', 'ru'] as const)(
        'renders the real localized guest heading in %s without private actions',
        (locale) => {
            const fetcher = vi.fn();
            vi.stubGlobal('fetch', fetcher);
            renderHome(locale);
            expect(
                screen.getByRole('heading', {
                    level: 1,
                    name: greetings[locale],
                    exact: true,
                }),
            ).toBeVisible();
            expect(screen.getByText('21 October 2026')).toBeVisible();
            expect(screen.queryByRole('link')).not.toBeInTheDocument();
            expect(fetcher).not.toHaveBeenCalled();
        },
    );

    it('shows the signed-in learner portrait entry and only a real handle', async () => {
        useSessionStore.setState({
            status: 'authenticated',
            user: {
                id: '10000000-0000-4000-8000-000000000001',
                handle: 'learner',
                primaryEmail: 'home@example.test',
                emailVerified: true,
                status: 'active',
                createdAt: '2026-10-21T00:00:00.000Z',
            },
        });
        const fetcher = vi.fn().mockImplementation((url: string) => {
            const body = url.endsWith('/interview/status')
                ? { interview: null, creditsBypass: false }
                : {
                      version: 0,
                      approvedVersion: 0,
                      generation: 0,
                      useEnabled: false,
                      approved: null,
                      draft: null,
                  };
            return Promise.resolve(
                new Response(JSON.stringify(body), { status: 200 }),
            );
        });
        vi.stubGlobal('fetch', fetcher);
        renderHome();
        expect(
            screen.getByRole('heading', {
                level: 1,
                name: 'Welcome back, @learner',
            }),
        ).toBeVisible();
        expect(
            await screen.findByRole('link', { name: 'Start interview' }),
        ).toHaveAttribute('href', '/portrait/intro');
        expect(
            screen.getByRole('link', { name: 'Fill it in myself' }),
        ).toHaveAttribute('href', '/portrait/manual');
        expect(fetcher).toHaveBeenCalledTimes(2);
    });
});
