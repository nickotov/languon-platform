import { expect, test, type Page } from '@playwright/test';

// @user-flow-revision workbook-guide sha256:5acc44d74c7aa08c
const writes = new WeakMap<Page, string[]>();
const errors = new WeakMap<Page, string[]>();

async function captureViewport(page: Page, name: string) {
    await test.info().attach(name, {
        body: await page.screenshot({ fullPage: false }),
        contentType: 'image/png',
    });
}

test.beforeEach(async ({ page }) => {
    const mutations: string[] = [];
    const failures: string[] = [];
    writes.set(page, mutations);
    errors.set(page, failures);
    page.on('request', (request) => {
        const path = new URL(request.url()).pathname;
        const authentication = /\/(?:api\/)?auth\//u.test(path);
        const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method());
        const modelWork = /\/(?:conversations|jobs|ai)(?:\/|$)/u.test(path);

        if (!authentication && (mutation || modelWork)) {
            mutations.push(`${request.method()} ${path}`);
        }
    });

    page.on('pageerror', (error) => failures.push(error.message));
});

test.afterEach(async ({ page }) => {
    expect(
        writes.get(page),
        'guide must not create content or AI work',
    ).toEqual([]);

    expect(errors.get(page), 'uncaught browser exceptions').toEqual([]);
});

// @user-flow workbook-guide/public-guide-navigation-and-prepared-check
test('guests discover the guide and use real prepared checks without saved attempts', async ({
    page,
}) => {
    await page.goto('/workbook');
    await expect(page).toHaveTitle('Workbook guide');
    const sidebar = page.getByRole('complementary', {
        name: 'Application sidebar',
    });
    const guide = sidebar.getByRole('link', { name: 'Workbook guide' });
    await expect(guide).toHaveAttribute('aria-current', 'page');
    await expect(
        page.getByRole('heading', { name: 'Workbook guide', exact: true }),
    ).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 0));
    await captureViewport(page, 'guide-overview-desktop');

    await page.locator('main a[href="/workbook/exercises"]').first().click();
    await expect(page).toHaveURL(/\/workbook\/exercises$/u);
    const activity = page.getByRole('combobox', {
        name: 'Activity',
        exact: true,
    });

    await expect(activity).toHaveValue('V02');
    const options = await activity
        .locator('option')
        .evaluateAll((items) =>
            items.map((item) => (item as HTMLOptionElement).value),
        );

    expect(options).toHaveLength(19);
    await expect(activity.locator('optgroup')).toHaveCount(4);

    for (const id of options) {
        await activity.selectOption(id);
        await expect(activity).toHaveValue(id);
        await expect(page.getByTestId('workbook-demo')).toHaveCount(1);
    }

    await activity.selectOption('V02');
    const demo = page.getByTestId('workbook-demo');
    await demo.getByText('Buy something new', { exact: true }).click();
    await expect(
        demo.getByRole('radio', { name: 'Buy something new' }),
    ).toBeChecked();

    await demo
        .getByRole('button', { name: 'Check answer', exact: true })
        .click();

    await expect(demo.locator('[data-correct="false"]')).toBeVisible();
    await demo.getByText('Give something back', { exact: true }).click();
    await expect(
        demo.getByRole('radio', { name: 'Give something back' }),
    ).toBeChecked();

    await demo
        .getByRole('button', { name: 'Check answer', exact: true })
        .click();

    await expect(demo.locator('[data-correct="true"]')).toBeVisible();
    await demo.scrollIntoViewIfNeeded();
    await captureViewport(page, 'guide-prepared-desktop');

    await page
        .getByRole('button', { name: 'Reset example', exact: true })
        .click();

    await expect(demo.locator('input:checked')).toHaveCount(0);
    await expect(demo.locator('[data-correct]')).toHaveCount(0);
    await demo.getByText('Give something back', { exact: true }).click();
    await expect(
        demo.getByRole('radio', { name: 'Give something back' }),
    ).toBeChecked();

    await page.reload();
    await expect(
        page.getByTestId('workbook-demo').locator('input:checked'),
    ).toHaveCount(0);

    await page.context().addCookies([
        {
            name: 'languon-locale',
            value: 'fr',
            url: 'http://localhost:3336',
        },
    ]);

    await page.goto('/workbook');
    await expect(page).toHaveTitle('Guide du cahier');
    await page.goto('/workbook/exercises');
    await expect(page).toHaveTitle('Exercices · Guide du cahier');
});

// @user-flow workbook-guide/hybrid-and-illustrative-feedback
test('hybrid alternatives stay unchecked and AI feedback belongs to a preset response', async ({
    page,
}) => {
    await page.goto('/workbook/exercises?activity=V03');
    const activity = page.getByRole('combobox', {
        name: 'Activity',
        exact: true,
    });

    await expect(activity).toHaveValue('V03');
    const demo = page.getByTestId('workbook-demo');
    const answer = demo.getByRole('textbox');
    await answer.fill('invented alternative');
    await demo
        .getByRole('button', { name: 'Check answer', exact: true })
        .click();

    await expect(demo.locator('[data-correct]')).toHaveCount(0);
    await expect(
        demo.getByRole('status').filter({ hasText: /prepared key/u }),
    ).toBeVisible();

    await answer.fill('borrow');
    await demo
        .getByRole('button', { name: 'Check answer', exact: true })
        .click();

    await expect(demo.locator('[data-correct="true"]')).toBeVisible();

    await activity.selectOption('V07');
    const arbitrary = 'My own answer must never receive canned feedback.';
    await demo.getByRole('textbox').fill(arbitrary);
    await expect(
        demo.getByRole('button', { name: 'Check answer', exact: true }),
    ).toHaveCount(0);

    await expect(
        page.getByTestId('sample-feedback').locator('[data-outcome]'),
    ).toHaveCount(0);

    await page
        .getByRole('button', { name: 'Show sample feedback', exact: true })
        .click();

    const feedback = page.getByTestId('sample-feedback');
    await expect(feedback).toBeVisible();
    await expect(feedback).not.toContainText(arbitrary);
    await expect(feedback.locator('[data-outcome]')).toBeVisible();
    await feedback.scrollIntoViewIfNeeded();
    await captureViewport(page, 'guide-preset-feedback-desktop');

    await expect(demo.getByRole('textbox')).toHaveValue(arbitrary);
    await page
        .getByRole('button', { name: 'Reset example', exact: true })
        .click();

    await expect(demo.getByRole('textbox')).toHaveValue('');
    await expect(
        page.getByTestId('sample-feedback').locator('[data-outcome]'),
    ).toHaveCount(0);

    await activity.selectOption('V03');
    await expect(demo.getByRole('textbox')).toHaveValue('');
    await activity.selectOption('R04');
    const incorrectSample = page.getByTestId('sample-feedback');
    await incorrectSample
        .getByRole('combobox', { name: 'Sample response', exact: true })
        .selectOption('incorrect');

    await expect(incorrectSample.getByRole('blockquote')).toHaveText(
        'She drives to a bookshop to buy three books.',
    );

    await incorrectSample
        .getByRole('button', { name: 'Show sample feedback', exact: true })
        .click();

    await expect(
        incorrectSample.locator('[data-outcome="incorrect"]'),
    ).toBeVisible();

    await page.goto('/workbook/exercises?activity=not-an-activity');
    await expect(activity).toHaveValue('V02');
});

// @user-flow workbook-guide/prompt-copy-and-responsive-guide
test('prompts copy useful source text and the guide works in dark narrow and member navigation', async ({
    page,
    context,
}) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await context.addCookies([
        { name: 'languon-theme', value: 'dark', url: 'http://localhost:3336' },
    ]);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/workbook/exercises?activity=V02');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page
        .getByRole('button', { name: 'Copy prompt and source', exact: true })
        .first()
        .click();

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/V02/u);
    expect(copied).toMatch(/borrow|return/u);
    expect(copied.length).toBeGreaterThan(100);
    const knowledge = page.locator('main a[href="/knowledge"]').first();
    await expect(knowledge).toBeVisible();
    await expect(knowledge).toHaveAttribute('href', '/knowledge');
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
    ).toBe(true);

    for (const viewport of [
        { width: 390, height: 844 },
        { width: 768, height: 1024 },
    ]) {
        await page.setViewportSize(viewport);
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
        ).toBe(true);

        await page.evaluate(() => window.scrollTo(0, 0));
        await captureViewport(page, `guide-dark-top-${viewport.width}`);
        await page
            .getByRole('button', { name: 'Copy source', exact: true })
            .scrollIntoViewIfNeeded();

        await captureViewport(page, `guide-dark-source-${viewport.width}`);
        await page.locator('#recipe-specific').scrollIntoViewIfNeeded();
        await captureViewport(page, `guide-dark-recipe-${viewport.width}`);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Open navigation' }).click();
    const drawer = page.getByRole('dialog', { name: 'Main navigation' });
    await drawer.getByRole('link', { name: 'Workbook guide' }).click();
    await expect(page).toHaveURL(/\/workbook$/u);
    await expect(drawer).not.toBeVisible();

    // The same static entry remains outside the private resource library after signup.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/signup?returnTo=%2Fworkbook');
    await page.getByLabel('Email').fill(`guide-${Date.now()}@example.test`);
    await page
        .getByLabel('Password', { exact: true })
        .fill('Synthetic workbook guide password 68!');

    await page
        .getByRole('button', { name: 'Create account', exact: true })
        .click();

    await page.getByLabel('Verification code').fill('0000');
    await page
        .getByRole('button', { name: 'Verify email', exact: true })
        .click();

    await expect(page).toHaveURL(/\/workbook$/u);
    const sidebar = page.getByRole('complementary', {
        name: 'Application sidebar',
    });
    const guide = sidebar.getByRole('link', { name: 'Workbook guide' });
    await expect(guide).toHaveAttribute('aria-current', 'page');
    await expect(
        sidebar.getByRole('button', { name: 'Create new', exact: true }),
    ).toBeVisible();

    await sidebar.getByRole('button', { name: 'Collapse sidebar' }).click();
    await expect(guide).toBeVisible();
    await guide.click();
    await expect(page).toHaveURL(/\/workbook$/u);
});
