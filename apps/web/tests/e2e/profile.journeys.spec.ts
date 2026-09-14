import { expect, test, type Page, type TestInfo } from '@playwright/test';

// @user-flow-revision magic-profile-page sha256:e39e2ad1b943cb76

const password = 'E2e!Profile-password-2026';
const runId = process.env.AUTH_E2E_RUN_ID ?? `${Date.now().toString(36)}-${process.pid}`;

function syntheticEmail(testInfo: TestInfo): string {
    return `profile-e2e-${runId}-${testInfo.workerIndex}@example.test`;
}

function captureBrowserErrors(page: Page) {
    const errors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text());
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

// @user-flow magic-profile-page/profile-empty-coming-soon-and-header-navigation
test('shows truthful account placeholders and the shared application header', async ({ page }, testInfo) => {
    const assertNoBrowserErrors = captureBrowserErrors(page);
    const email = syntheticEmail(testInfo);

    await page.goto('/signup?returnTo=%2Fprofile');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByLabel('Verification code').fill('0000');
    await page.getByRole('button', { name: 'Verify email' }).click();

    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Account settings' })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.locator('dl').getByText('Not available yet')).toHaveCount(2);

    await page.getByRole('tab', { name: /Billing/ }).click();
    await expect(page.getByText('No payment method is stored. Billing is coming soon.').first()).toBeVisible();
    await page.getByRole('button', { name: 'Compare plans' }).click();
    await expect(page.getByText('Subscription is coming soon.')).toBeVisible();

    const html = page.locator('html');
    const themeToggle = page.getByTestId('theme-toggle');
    await themeToggle.click();
    await expect(html).toHaveAttribute('data-theme', /^(light|dark)$/);
    expect((await page.context().cookies()).some((cookie) => cookie.name === 'languon-theme')).toBe(true);

    await page.setViewportSize({ height: 800, width: 320 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.setViewportSize({ height: 900, width: 640 });
    await page.evaluate(() => {
        document.body.style.zoom = '200%';
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.evaluate(() => {
        document.body.style.zoom = '';
    });

    await page.getByRole('link', { name: 'Languon home' }).click();
    await expect(page).toHaveURL(/\/$/);
    assertNoBrowserErrors();
});
