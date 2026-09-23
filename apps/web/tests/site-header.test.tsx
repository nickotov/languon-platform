import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/fsd/shared/theme';
import { SiteHeader } from '@/fsd/widgets/site-header';

import { render } from './render';

const refresh = vi.fn();
let pathname = '/';

vi.mock('next/navigation', () => ({
    usePathname: () => pathname,
    useRouter: () => ({ refresh }),
}));

describe('SiteHeader', () => {
    beforeEach(() => {
        refresh.mockReset();
        pathname = '/';
        document.cookie = 'languon-locale=; Max-Age=0; Path=/';
    });

    it('combines home, locale, and theme controls in the shared shell', async () => {
        const user = userEvent.setup();
        render(
            <ThemeProvider preference='light'>
                <SiteHeader />
            </ThemeProvider>,
        );

        expect(
            screen.getByRole('link', { name: 'Languon home' }),
        ).toHaveAttribute('href', '/');
        expect(
            screen.getByRole('button', { name: 'Switch to dark theme' }),
        ).toBeInTheDocument();

        await user.selectOptions(
            screen.getByRole('combobox', { name: 'Language' }),
            'ru',
        );
        expect(document.cookie).toContain('languon-locale=ru');
        expect(refresh).toHaveBeenCalledOnce();
    });

    it.each([
        '/dictionaries',
        '/dictionaries/example',
        '/ru/dictionaries',
        '/fr/dictionaries/example',
    ])('provides real dictionary navigation and preferences on %s', (route) => {
        pathname = route;
        render(
            <ThemeProvider preference='light'>
                <SiteHeader />
            </ThemeProvider>,
        );

        expect(
            screen.getByRole('navigation', { name: 'Dictionaries' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Skip to main content' }),
        ).toHaveAttribute('href', '#dictionary-content');
        expect(
            screen.getByRole('link', { name: 'Dictionaries' }),
        ).toHaveAttribute('href', '/dictionaries');
        expect(
            screen.getByRole('link', { name: 'Dictionaries' }),
        ).toHaveAttribute('aria-current', 'page');
        expect(
            screen.getByRole('combobox', { name: 'Language' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Switch to dark theme' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: /states|coverage/i }),
        ).not.toBeInTheDocument();
    });

    it.each([
        '/profile',
        '/ru/profile',
        '/shared/dictionaries/example',
        '/dictionaries-other',
    ])(
        'retains the global header outside owner dictionary routes at %s',
        (route) => {
            pathname = route;
            render(
                <ThemeProvider preference='light'>
                    <SiteHeader />
                </ThemeProvider>,
            );

            expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
            expect(
                screen.getByRole('link', { name: 'Languon home' }),
            ).toHaveAttribute('href', '/');
            expect(
                screen.getByRole('combobox', { name: 'Language' }),
            ).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Switch to dark theme' }),
            ).toBeInTheDocument();
        },
    );
});
