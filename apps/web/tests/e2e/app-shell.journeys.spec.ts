import { expect, test, type Page, type TestInfo } from '@playwright/test';

// @user-flow-revision global-app-shell sha256:bda4f902cf35d0cf

const runId =
    process.env.AUTH_E2E_RUN_ID ?? `${Date.now().toString(36)}-${process.pid}`;
const password = 'E2e!Global-shell-password-2026';
const missingRoutes = [
    '/definitely-missing-shell-route',
    '/dictionaries-other',
    '/profile-other',
    '/shared/dictionaries-other',
];

function observeBrowser(page: Page) {
    const errors: string[] = [];
    const privateRequests: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        if (
            message.type() === 'error' &&
            !message.text().startsWith('Failed to load resource:')
        )
            errors.push(message.text());
    });
    page.on('request', (request) => {
        const url = new URL(request.url());
        if (
            url.origin === new URL(page.url()).origin &&
            url.pathname === '/api/dictionaries' &&
            request.method() === 'GET'
        )
            privateRequests.push(request.url());
    });
    page.on('response', (response) => {
        if (response.status() < 400) return;
        const path = new URL(response.url()).pathname.replace(
            /^\/api(?=\/)/,
            '',
        );
        if (path === '/auth/refresh' && response.status() === 401) return;
        if (missingRoutes.includes(path) && response.status() === 404) return;
        errors.push(`${response.status()} ${path}`);
    });
    return {
        assertNoErrors: () => expect(errors).toEqual([]),
        privateRequests,
    };
}

async function signUp(page: Page, testInfo: TestInfo, identity: string) {
    const email = `shell-${runId}-${testInfo.workerIndex}-${identity}@example.test`;
    await page.goto('/signup?returnTo=%2Fdictionaries');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByLabel('Verification code').fill('0000');
    await page.getByRole('button', { name: 'Verify email' }).click();
    await expect(page).toHaveURL(/\/dictionaries$/);
    return email;
}

async function createDictionary(page: Page, name: string) {
    await page.getByRole('button', { name: 'New dictionary' }).click();
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Translate from').selectOption('en');
    await page.getByLabel('Translate to').selectOption('es');
    await page
        .getByRole('button', { name: 'Create dictionary', exact: true })
        .click();
    await expect(
        page.getByRole('heading', { name, exact: true }),
    ).toBeVisible();
}

// @user-flow global-app-shell/guest-settings-persistence
test('guest settings persist across pages and reload, including the native mobile drawer', async ({
    page,
}) => {
    const observed = observeBrowser(page);
    await page.goto('/login?returnTo=%2Fsecurity');
    const originalUrl = page.url();
    const sidebar = page.getByRole('complementary', {
        name: 'Application sidebar',
    });
    await expect(
        sidebar.getByRole('link', { name: 'Sign in', exact: true }),
    ).toHaveAttribute('href', '/login');
    await expect(
        sidebar.getByRole('link', { name: 'All dictionaries' }),
    ).toHaveCount(0);
    await expect(
        sidebar.getByRole('button', { name: /Account menu/ }),
    ).toHaveCount(0);
    await expect(
        sidebar.getByRole('button', { name: 'Create a dictionary' }),
    ).toHaveCount(0);
    await sidebar
        .getByRole('button', { name: 'Settings', exact: true })
        .click();
    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page
        .getByRole('combobox', { name: 'Interface language' })
        .selectOption('es');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page).toHaveURL(originalUrl);
    const cookies = await page.context().cookies();
    for (const [name, value] of [
        ['languon-theme', 'dark'],
        ['languon-locale', 'es'],
    ]) {
        expect(cookies.find((cookie) => cookie.name === name)).toMatchObject({
            path: '/',
            sameSite: 'Lax',
            value,
        });
    }
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page).toHaveURL(originalUrl);
    await page
        .getByRole('button', { name: 'Configuración', exact: true })
        .click();
    await expect(
        page.getByRole('combobox', { name: 'Idioma de la interfaz' }),
    ).toHaveValue('es');
    await page
        .getByRole('combobox', { name: 'Idioma de la interfaz' })
        .selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.keyboard.press('Escape');
    await expect(
        page.getByRole('button', { name: 'Settings', exact: true }),
    ).toBeFocused();
    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(
        page.getByRole('combobox', { name: 'Interface language' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Expand sidebar' }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    const menu = page.getByRole('button', { name: 'Open navigation' });
    await menu.click();
    const drawer = page.getByRole('dialog', { name: 'Main navigation' });
    const settings = drawer.getByRole('button', {
        name: 'Settings',
        exact: true,
    });
    await settings.click();
    await expect(
        page.getByRole('dialog', { name: 'Settings', exact: true }),
    ).toHaveCount(1);
    await drawer.getByRole('button', { name: 'Light', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.keyboard.press('Escape');
    await expect(drawer).toBeVisible();
    await expect(settings).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
    await expect(menu).toBeFocused();
    await page
        .locator('header')
        .getByRole('link', { name: 'Languon home' })
        .click();
    await expect(page.locator('#main-content')).toHaveText('WIP');
    await expect(page).toHaveURL(/\/$/);
    for (const route of missingRoutes) {
        await page.goto(route);
        await expect(menu).toBeVisible();
        await expect(page.getByTitle('Languon', { exact: true })).toBeVisible();
        await expect(
            page.getByRole('heading', { name: 'This page could not be found' }),
        ).toBeVisible();
    }
    await page.goto(
        '/shared/dictionaries/20000000-0000-4000-8000-000000000099',
    );
    await expect(menu).toBeVisible();
    await menu.click();
    await expect(
        drawer.getByRole('button', { name: 'Settings', exact: true }),
    ).toBeVisible();
    expect(observed.privateRequests).toEqual([]);
    observed.assertNoErrors();
});

// @user-flow global-app-shell/session-aware-global-navigation
test('global navigation follows login, logout and a different authenticated identity', async ({
    page,
}, testInfo) => {
    const observed = observeBrowser(page);
    const firstEmail = await signUp(page, testInfo, 'first');
    const firstName = `First shell dictionary ${runId}`;
    await createDictionary(page, firstName);
    const sidebar = page.getByRole('complementary', {
        name: 'Application sidebar',
    });
    await expect(sidebar.getByRole('link', { name: firstName })).toBeVisible();
    await sidebar.getByRole('link', { name: 'Languon home' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('#main-content')).toHaveText('WIP');
    await sidebar
        .getByRole('button', { name: 'Dictionaries', exact: true })
        .click();
    await expect(sidebar.getByRole('link', { name: firstName })).toBeVisible();
    await expect(sidebar.getByText(firstEmail, { exact: true })).toBeVisible();
    await expect(
        sidebar.getByRole('button', { name: 'Settings', exact: true }),
    ).toHaveCount(0);
    await sidebar
        .getByRole('button', { name: 'Account menu, Your account' })
        .click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(
        sidebar.getByRole('link', { name: 'Sign in', exact: true }),
    ).toBeVisible();
    await expect(sidebar.getByRole('link', { name: firstName })).toHaveCount(0);
    const secondEmail = await signUp(page, testInfo, 'second');
    await expect(sidebar.getByRole('link', { name: firstName })).toHaveCount(0);
    const secondName = `Second shell dictionary ${runId}`;
    await createDictionary(page, secondName);
    await expect(sidebar.getByRole('link', { name: secondName })).toBeVisible();
    await expect(sidebar.getByText(secondEmail, { exact: true })).toBeVisible();
    await page.goto('/login');
    if (
        (await sidebar
            .getByRole('button', { name: 'Dictionaries', exact: true })
            .getAttribute('aria-expanded')) === 'false'
    )
        await sidebar
            .getByRole('button', { name: 'Dictionaries', exact: true })
            .click();
    await expect(sidebar.getByRole('link', { name: secondName })).toBeVisible();
    await sidebar.getByRole('link', { name: 'Languon home' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.reload();
    await expect(sidebar.getByRole('link', { name: secondName })).toBeVisible();
    await expect(sidebar.getByRole('link', { name: firstName })).toHaveCount(0);
    observed.assertNoErrors();
});
