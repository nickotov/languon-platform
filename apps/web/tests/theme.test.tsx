import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { ThemeSwitcher, ThemeToggle } from '@/fsd/features/change-theme';
import {
    preferredTheme,
    ThemeProvider,
    themePreferences,
} from '@/fsd/shared/theme';

import { render } from './render';

describe('theme preference', () => {
    beforeEach(() => {
        document.cookie = 'languon-theme=; Max-Age=0; Path=/';
        document.documentElement.removeAttribute('data-theme');
    });

    it('allowlists persisted values and falls back to system', () => {
        expect(themePreferences).toEqual(['light', 'dark', 'system']);
        expect(preferredTheme('dark')).toBe('dark');
        expect(preferredTheme('unexpected')).toBe('system');
        expect(preferredTheme(undefined)).toBe('system');
    });

    it('updates the document theme and stores the selected preference', async () => {
        const user = userEvent.setup();
        render(
            <ThemeProvider preference='system'>
                <ThemeSwitcher />
            </ThemeProvider>,
        );

        const selector = screen.getByRole('combobox', { name: 'Theme' });
        expect(selector).toHaveValue('system');

        await user.selectOptions(selector, 'dark');

        expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
        expect(document.cookie).toContain('languon-theme=dark');
    });

    it('toggles the effective theme with the compact header control', async () => {
        const user = userEvent.setup();
        render(
            <ThemeProvider preference='light'>
                <ThemeToggle />
            </ThemeProvider>,
        );

        await user.click(
            screen.getByRole('button', { name: 'Switch to dark theme' }),
        );

        expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
        expect(document.cookie).toContain('languon-theme=dark');
        expect(
            screen.getByRole('button', { name: 'Switch to light theme' }),
        ).toBeInTheDocument();
    });
});
