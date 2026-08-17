import { expect, test, type Page } from '@playwright/test';

// @user-flow-revision web-ui-kit sha256:07aa1f77b967b8ea

function captureBrowserErrors(page: Page) {
    const errors: string[] = [];
    page.on('console', (message) => {
        if (
            message.type() === 'error' &&
            !message.text().startsWith('Failed to load resource:')
        ) {
            errors.push(message.text());
        }
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
        if (response.status() < 400) return;
        const path = new URL(response.url()).pathname;
        if (path === '/auth/refresh' && response.status() === 401) return;
        errors.push(`${response.status()} ${path}`);
    });
    return () => expect(errors, 'unexpected browser errors').toEqual([]);
}

test.describe('web UI kit journeys', () => {
    // @user-flow web-ui-kit/theme-preference-persistence
    test('persists an accessible global theme preference without changing the route', async ({
        page,
    }) => {
        const assertNoBrowserErrors = captureBrowserErrors(page);
        await page.goto('/login?returnTo=%2Fsecurity');

        await expect(page.locator('html')).toHaveAttribute(
            'data-theme',
            'system',
        );
        const selector = page.getByRole('combobox', { name: 'Theme' });
        await expect(selector).toHaveValue('system');

        await selector.selectOption('dark');
        await expect(page).toHaveURL(/\/login\?returnTo=%2Fsecurity$/);
        await expect(page.locator('html')).toHaveAttribute(
            'data-theme',
            'dark',
        );

        const themeCookie = (await page.context().cookies()).find(
            (cookie) => cookie.name === 'languon-theme',
        );
        expect(themeCookie).toMatchObject({
            path: '/',
            sameSite: 'Lax',
            value: 'dark',
        });

        await page.reload();
        await expect(page.locator('html')).toHaveAttribute(
            'data-theme',
            'dark',
        );
        await expect(page.getByRole('combobox', { name: 'Theme' })).toHaveValue(
            'dark',
        );

        await page
            .getByRole('combobox', { name: 'Theme' })
            .selectOption('system');
        await expect(page.locator('html')).toHaveAttribute(
            'data-theme',
            'system',
        );
        await expect(page).toHaveURL(/\/login\?returnTo=%2Fsecurity$/);
        assertNoBrowserErrors();
    });
});
