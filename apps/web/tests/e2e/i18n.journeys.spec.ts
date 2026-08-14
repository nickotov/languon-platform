import { expect, test, type Page } from '@playwright/test';

// @user-flow-revision web-i18n-support sha256:4be2bcfe7bdd625f

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

test.describe('web internationalization journeys', () => {
    // @user-flow web-i18n-support/ssr-locale-routing
    test('server-renders each supported request language without changing the URL', async ({
        browser,
    }) => {
        const expectations = [
            [
                'en-US,en;q=0.9',
                'en',
                'AI-first language learning',
                'Sign in · Languon',
                'This page could not be found',
                'Page not found · Languon',
            ],
            [
                'ru-RU,ru;q=0.9',
                'ru',
                'Изучение языков с помощью ИИ',
                'Вход · Languon',
                'Страница не найдена',
                'Страница не найдена · Languon',
            ],
            [
                'fr-CA,fr;q=0.9',
                'fr',
                'Apprentissage des langues avec l’IA',
                'Connexion · Languon',
                'Cette page est introuvable',
                'Page introuvable · Languon',
            ],
            [
                'es-ES,es;q=0.9',
                'es',
                'Aprendizaje de idiomas con IA',
                'Iniciar sesión · Languon',
                'No se encontró esta página',
                'Página no encontrada · Languon',
            ],
        ] as const;

        for (const [
            browserLocale,
            locale,
            copy,
            loginTitle,
            notFoundCopy,
            notFoundTitle,
        ] of expectations) {
            const context = await browser.newContext({
                javaScriptEnabled: false,
                locale: browserLocale.split(',')[0],
            });
            const page = await context.newPage();
            try {
                await page.goto('/');
                await expect(page).toHaveURL(/\/$/);
                await expect(page.locator('html')).toHaveAttribute(
                    'lang',
                    locale,
                );
                await expect(
                    page.getByText(copy, { exact: true }),
                ).toBeVisible();

                await page.goto('/login');
                await expect(page).toHaveURL(/\/login$/);
                await expect(page).toHaveTitle(loginTitle);

                await page.goto('/definitely-missing-i18n-route');
                await expect(page).toHaveURL(
                    /\/definitely-missing-i18n-route$/,
                );
                await expect(page).toHaveTitle(notFoundTitle);
                await expect(
                    page.getByRole('heading', { name: notFoundCopy }),
                ).toBeVisible();
            } finally {
                await context.close();
            }
        }
    });

    // @user-flow web-i18n-support/language-switch-persistence
    test('switches language by cookie while preserving the current URL', async ({
        page,
    }) => {
        const assertNoBrowserErrors = captureBrowserErrors(page);
        await page.goto('/login?returnTo=%2Fsecurity');
        await page.getByLabel('Email').fill('invalid');
        await page.locator('input[name="password"]').fill('short');
        await page
            .locator('form')
            .evaluate((form) =>
                form.dispatchEvent(
                    new Event('submit', { bubbles: true, cancelable: true }),
                ),
            );
        await expect(
            page.getByText('Check your sign-in details.'),
        ).toBeVisible();

        await page
            .getByRole('combobox', { name: 'Language' })
            .selectOption('es');

        await expect(page).toHaveURL(/\/login\?returnTo=%2Fsecurity$/);
        await expect(
            page.getByRole('heading', { name: 'Iniciar sesión' }),
        ).toBeVisible();
        await expect(
            page.getByText('Check your sign-in details.'),
        ).not.toBeVisible();
        await expect(page.locator('input[name="email"]')).toHaveValue(
            'invalid',
        );
        await expect(page.locator('input[name="password"]')).toHaveValue(
            'short',
        );
        await expect(page.locator('html')).toHaveAttribute('lang', 'es');

        const localeCookie = (await page.context().cookies()).find(
            (cookie) => cookie.name === 'languon-locale',
        );
        expect(localeCookie).toMatchObject({
            path: '/',
            sameSite: 'Lax',
            value: 'es',
        });

        await page.reload();
        await expect(page).toHaveURL(/\/login\?returnTo=%2Fsecurity$/);
        await expect(
            page.getByRole('combobox', { name: 'Idioma' }),
        ).toHaveValue('es');
        assertNoBrowserErrors();
    });
});
