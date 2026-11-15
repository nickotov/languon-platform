import { expect, test, type Page } from '@playwright/test';

// @user-flow-revision workbook-guide sha256:5de6bfaafbfb1e8e
const writes = new WeakMap<Page, string[]>();
const errors = new WeakMap<Page, string[]>();

async function captureViewport(page: Page, name: string) {
    await test.info().attach(name, {
        body: await page.screenshot({ fullPage: false }),
        contentType: 'image/png',
    });
}

function activityButton(page: Page, id: string) {
    return page
        .getByRole('navigation', { name: 'Activities', exact: true })
        .getByRole('button', { name: new RegExp(`^${id}\\s`, 'u') });
}

async function selectDesktopActivity(page: Page, id: string) {
    const button = activityButton(page, id);
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(new RegExp(`[?&]activity=${id}(?:&|$)`, 'u'));
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
    const navigation = page.getByRole('navigation', {
        name: 'Activities',
        exact: true,
    });

    await expect(navigation).toBeVisible();
    await expect(
        page.getByRole('combobox', { name: 'Activity', exact: true }),
    ).toBeHidden();

    await expect(activityButton(page, 'V02')).toHaveAttribute(
        'aria-pressed',
        'true',
    );

    const asideBounds = await navigation.locator('..').boundingBox();
    const heroBounds = await page
        .getByRole('heading', { name: 'Exercises', level: 1, exact: true })
        .locator('..')
        .boundingBox();

    expect(asideBounds).not.toBeNull();
    expect(heroBounds).not.toBeNull();
    expect(asideBounds!.y).toBeCloseTo(heroBounds!.y, 0);
    expect(asideBounds!.height).toBeLessThanOrEqual(
        page.viewportSize()!.height * 0.7 + 1,
    );

    const navigationBounds = await navigation.boundingBox();
    const exampleBounds = await page.getByTestId('workbook-demo').boundingBox();

    expect(navigationBounds).not.toBeNull();
    expect(exampleBounds).not.toBeNull();
    expect(navigationBounds!.x).toBeGreaterThanOrEqual(
        exampleBounds!.x + exampleBounds!.width,
    );

    const options = await navigation
        .getByRole('button')
        .evaluateAll((items) =>
            items.map(
                (item) => item.textContent!.trim().match(/^[A-Z]\d{2}/u)![0],
            ),
        );

    expect(options).toHaveLength(19);
    for (const category of ['Vocabulary', 'Grammar', 'Reading', 'Writing']) {
        await expect(
            navigation.getByText(category, { exact: true }),
        ).toBeVisible();
    }

    for (const id of options) {
        await selectDesktopActivity(page, id);
        await expect(page.getByTestId('workbook-demo')).toHaveCount(1);
    }

    // Native buttons remain keyboard operable, including after scrolling the TOC.
    await activityButton(page, 'V02').focus();
    await activityButton(page, 'V02').press('Enter');
    await expect(activityButton(page, 'V02')).toBeFocused();
    await expect(activityButton(page, 'V02')).toHaveAttribute(
        'aria-pressed',
        'true',
    );

    await page.evaluate(() => window.scrollTo(0, 500));
    const stickyNavigation = page
        .getByTestId('workbook-activity-navigation')
        .locator('..');
    const firstScroll = await page.evaluate(() => window.scrollY);
    const stickyTop = await stickyNavigation.evaluate(
        (element) => element.getBoundingClientRect().top,
    );

    await page.evaluate(() => window.scrollBy(0, 350));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(
        firstScroll + 300,
    );

    await expect
        .poll(() =>
            stickyNavigation.evaluate(
                (element) => element.getBoundingClientRect().top,
            ),
        )
        .toBeCloseTo(stickyTop, 0);

    await captureViewport(page, 'guide-sticky-navigation-desktop');

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
    await page.setViewportSize({ width: 1440, height: 620 });
    await page.goto('/workbook/exercises?activity=W01');
    const selectedTranslation = activityButton(page, 'W01');

    await expect(selectedTranslation).toHaveAttribute('aria-pressed', 'true');
    // Observe internal reveal before clicking or scrolling any activity button.
    await expect
        .poll(() =>
            selectedTranslation.evaluate((element) => {
                const bounds = element
                    .closest('aside')!
                    .getBoundingClientRect();
                const active = element.getBoundingClientRect();

                return Math.min(
                    active.top - bounds.top,
                    bounds.bottom - active.bottom,
                );
            }),
        )
        .toBeGreaterThanOrEqual(-1);

    await expect
        .poll(() =>
            page
                .getByTestId('workbook-activity-navigation')
                .locator('..')
                .evaluate((element) => element.scrollTop),
        )
        .toBeGreaterThan(0);

    // Bring the sticky navigator into the viewport without changing its internal scroll.
    await page
        .getByTestId('workbook-activity-navigation')
        .locator('..')
        .evaluate((element) =>
            window.scrollBy(0, element.getBoundingClientRect().top - 24),
        );

    await expect(selectedTranslation).toBeInViewport({ ratio: 1 });
    await captureViewport(page, 'guide-deep-link-short-desktop');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/workbook/exercises?activity=V03');
    await expect(activityButton(page, 'V03')).toHaveAttribute(
        'aria-pressed',
        'true',
    );

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

    await selectDesktopActivity(page, 'V07');
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

    await selectDesktopActivity(page, 'V03');
    await expect(demo.getByRole('textbox')).toHaveValue('');
    await selectDesktopActivity(page, 'R04');
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
    await expect(activityButton(page, 'V02')).toHaveAttribute(
        'aria-pressed',
        'true',
    );
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

    for (const theme of ['dark', 'light']) {
        await context.addCookies([
            {
                name: 'languon-theme',
                value: theme,
                url: 'http://localhost:3336',
            },
        ]);

        for (const viewport of [
            { width: 390, height: 844 },
            { width: 768, height: 1024 },
        ]) {
            await page.setViewportSize(viewport);
            await page.goto('/workbook/exercises?activity=V02');
            await expect(page.locator('html')).toHaveAttribute(
                'data-theme',
                theme,
            );

            const activity = page.getByRole('combobox', {
                name: 'Activity',
                exact: true,
            });
            const dock = page.getByTestId('workbook-activity-dock');
            await expect(activity).toBeVisible();
            await expect(
                page.getByTestId('workbook-activity-navigation'),
            ).toBeHidden();

            await expect(activity.locator('option')).toHaveCount(19);
            await expect(activity.locator('optgroup')).toHaveCount(4);
            await activity.focus();
            await expect(activity).toBeFocused();
            // Native type-ahead works without depending on the OS popup's arrow handling.
            await activity.press('w');
            await expect(activity).toHaveValue('W01');
            await expect(page).toHaveURL(/[?&]activity=W01(?:&|$)/u);
            await activity.press('Tab');
            await expect(activity).not.toBeFocused();

            await activity.selectOption('V02');
            await expect(activity).toHaveValue('V02');
            if (viewport.width === 390) {
                const identity = page
                    .getByRole('heading', {
                        name: 'Choose the meaning',
                        exact: true,
                        level: 2,
                    })
                    .locator('xpath=ancestor::section[1]');

                await identity.evaluate((element) =>
                    window.scrollBy(
                        0,
                        element.getBoundingClientRect().top - 24,
                    ),
                );

                await expect
                    .poll(() =>
                        identity.evaluate(
                            (element) => element.getBoundingClientRect().top,
                        ),
                    )
                    .toBeCloseTo(24, 0);

                // Keep the identity partially behind the fixed header before switching.
                await activity.selectOption('V03');
                const nextIdentity = page
                    .getByRole('heading', {
                        name: 'Complete the sentence',
                        exact: true,
                        level: 2,
                    })
                    .locator('xpath=ancestor::section[1]');

                await expect
                    .poll(() =>
                        nextIdentity.evaluate(
                            (element) => element.getBoundingClientRect().top,
                        ),
                    )
                    .toBeGreaterThanOrEqual(56);

                await captureViewport(
                    page,
                    `guide-${theme}-switch-header-clearance-${viewport.width}`,
                );

                await activity.selectOption('V02');
            }

            expect(
                await page.evaluate(
                    () =>
                        document.documentElement.scrollWidth <=
                        window.innerWidth,
                ),
            ).toBe(true);

            await page.evaluate(() => window.scrollTo(0, 0));
            await captureViewport(page, `guide-${theme}-top-${viewport.width}`);
            const dockTop = await dock.evaluate(
                (element) => element.getBoundingClientRect().top,
            );

            await page
                .getByRole('button', { name: 'Copy source', exact: true })
                .scrollIntoViewIfNeeded();

            await expect
                .poll(() =>
                    dock.evaluate(
                        (element) => element.getBoundingClientRect().top,
                    ),
                )
                .toBeCloseTo(dockTop, 0);

            await captureViewport(
                page,
                `guide-${theme}-source-${viewport.width}`,
            );

            await page.locator('#recipe-specific').scrollIntoViewIfNeeded();
            await captureViewport(
                page,
                `guide-${theme}-recipe-${viewport.width}`,
            );

            await page.evaluate(() =>
                window.scrollTo(0, document.documentElement.scrollHeight),
            );

            const lastCopy = page
                .getByRole('button', {
                    name: 'Copy prompt and source',
                    exact: true,
                })
                .last();

            await expect(lastCopy).toBeInViewport();
            const copyBounds = await lastCopy.boundingBox();
            const dockBounds = await dock.boundingBox();
            expect(copyBounds).not.toBeNull();
            expect(dockBounds).not.toBeNull();
            expect(copyBounds!.y + copyBounds!.height).toBeLessThanOrEqual(
                dockBounds!.y,
            );

            expect(dockBounds!.y + dockBounds!.height).toBeLessThanOrEqual(
                viewport.height + 1,
            );

            await lastCopy.click();
            await captureViewport(
                page,
                `guide-${theme}-last-recipe-${viewport.width}`,
            );
        }
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
