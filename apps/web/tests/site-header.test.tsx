import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/fsd/shared/theme';
import { SiteHeader } from '@/fsd/widgets/site-header';

import { render } from './render';

const refresh = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh }),
}));

describe('SiteHeader', () => {
    beforeEach(() => {
        refresh.mockReset();
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
});
