import {
    expect,
    test,
    type Browser,
    type BrowserContext,
    type Page,
    type TestInfo,
} from '@playwright/test';

// @user-flow-revision flashcard-training-web sha256:4dde1a9c6158abb9

const password = 'E2e!Flashcard-password-2026';
const runId =
    process.env.AUTH_E2E_RUN_ID ?? `${Date.now().toString(36)}-${process.pid}`;

function syntheticEmail(testInfo: TestInfo, journey: string): string {
    return `flashcard-e2e-${runId}-${testInfo.workerIndex}-${journey}@example.test`;
}

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
        // Initial anonymous-session probing is an expected application boundary.
        if (path === '/auth/refresh' && response.status() === 401) return;
        errors.push(`${response.status()} ${path}`);
    });
    return () => expect(errors, 'unexpected browser errors').toEqual([]);
}

async function signUpAndVerify(
    page: Page,
    email: string,
    returnTo: string,
): Promise<void> {
    await page.goto(`/signup?returnTo=${encodeURIComponent(returnTo)}`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/verify-email\?/);
    await page.getByLabel('Verification code').fill('0000');
    await page.getByRole('button', { name: 'Verify email' }).click();
    await expect(page).toHaveURL(
        new RegExp(`${returnTo.replaceAll('/', '\\/')}$`),
    );
}

async function signInExistingOrSignUp(
    page: Page,
    email: string,
    returnTo: string,
): Promise<void> {
    await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    try {
        await expect(page).toHaveURL(
            new RegExp(`${returnTo.replaceAll('/', '\\/')}$`),
            { timeout: 3_000 },
        );
    } catch {
        await signUpAndVerify(page, email, returnTo);
    }
}

async function createDictionaryWithCard(
    page: Page,
    name: string,
): Promise<void> {
    await page.goto('/dictionaries');
    await page.getByRole('button', { name: 'New dictionary' }).click();
    await page.getByLabel('Name').fill(name);
    await page
        .getByLabel('Description')
        .fill('Synthetic flashcard journey data.');
    await page.getByLabel('Translate from').selectOption('en');
    await page.getByLabel('Translate to').selectOption('es');
    await page.getByRole('button', { name: 'Create dictionary' }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();

    await page.getByRole('button', { name: 'Add card' }).click();
    await page.getByLabel(/^Source word or phrase \(/).fill('work of art');
    await page.getByLabel(/^Translation \(/).fill('obra de arte');
    await page.getByRole('button', { name: 'Create card' }).click();
    await expect(page.getByText('work of art', { exact: true })).toBeVisible();
}

async function createArabicDictionaryWithLongCard(
    page: Page,
    name: string,
): Promise<void> {
    await page.goto('/dictionaries');
    await page.getByRole('button', { name: 'New dictionary' }).click();
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Description').fill('Synthetic RTL card data.');
    await page.getByLabel('Translate from').selectOption('ar');
    await page.getByLabel('Translate to').selectOption('en');
    await page.getByRole('button', { name: 'Create dictionary' }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await page.getByRole('button', { name: 'Add card' }).click();
    await page
        .getByLabel(/^Source word or phrase \(/)
        .fill('العربية '.repeat(45));
    await page
        .getByLabel(/^Translation \(/)
        .fill('A deliberately long Arabic flashcard.');
    await page.getByRole('button', { name: 'Create card' }).click();
    await expect(page.getByText('Card saved.', { exact: true })).toBeVisible();
    await expect(
        page.getByRole('dialog', { name: 'Add card' }),
    ).not.toBeVisible();
}

async function openCardSetup(page: Page) {
    await page.getByRole('button', { name: 'Train', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Cards', exact: true }).click();
    const setup = page.getByRole('dialog', { name: 'Train with cards' });
    await expect(setup).toBeVisible();
    return setup;
}

async function startPractice(page: Page): Promise<void> {
    const setup = await openCardSetup(page);
    await expect(setup.getByText(/With fallback/i)).toBeVisible();
    await setup.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(
        page.getByRole('dialog', { name: /Card practice/ }),
    ).toBeVisible();
}

async function createSharingLink(
    page: Page,
): Promise<{ shareId: string; shareKey: string }> {
    const rotateResponse = page.waitForResponse(
        (response) =>
            response.url().endsWith('/share-key/rotate') &&
            response.status() === 200,
    );
    await page.getByRole('button', { name: 'More dictionary actions' }).click();
    await page.getByRole('menuitem', { name: 'Sharing', exact: true }).click();
    await page.getByRole('button', { name: 'Create sharing link' }).click();
    const response = await rotateResponse;
    const payload = (await response.json()) as {
        capability: { shareId: string; shareKey: string };
    };
    return payload.capability;
}

async function signedInSharedPage(
    browser: Browser,
    testInfo: TestInfo,
    label: string,
    shareId: string,
    shareKey: string,
): Promise<{ context: BrowserContext; page: Page }> {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signUpAndVerify(
        page,
        syntheticEmail(testInfo, label),
        `/shared/dictionaries/${shareId}`,
    );
    await page.goto(`/shared/dictionaries/${shareId}#${shareKey}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    return { context, page };
}

test.describe('flashcard training journeys', () => {
    // @user-flow flashcard-training-web/owner-sets-up-rates-and-undo
    test('owner configures a session, rates a card, undoes it, and preserves preferences', async ({
        page,
    }, testInfo) => {
        const assertNoBrowserErrors = captureBrowserErrors(page);
        const name = `Owner cards ${runId}`;
        await signUpAndVerify(
            page,
            syntheticEmail(testInfo, 'owner'),
            '/dictionaries',
        );
        await createDictionaryWithCard(page, name);

        const setup = await openCardSetup(page);
        await expect(setup.getByText('Front', { exact: true })).toBeVisible();
        await expect(setup.getByText('Back', { exact: true })).toBeVisible();
        await expect(setup.getByLabel('Shuffle')).toBeChecked();
        await setup.getByLabel('Dictionary order').check();
        await expect(setup.getByLabel(/^All active entries \(/)).toBeChecked();
        await expect(
            setup.getByText('Eligible', { exact: true }),
        ).toBeVisible();
        await expect(setup.getByText('Skipped', { exact: true })).toBeVisible();
        await expect(
            setup.getByText('With fallback', { exact: true }),
        ).toBeVisible();
        await setup.getByRole('button', { name: 'Start', exact: true }).click();

        const practice = page.getByRole('dialog', {
            name: `Card practice · ${name}`,
        });
        await expect(practice).toBeVisible();
        await practice.getByRole('button', { name: 'Show back' }).click();
        await expect(
            practice.getByRole('button', { name: 'Show front' }),
        ).toBeVisible();
        await practice.getByRole('button', { name: 'Dialog view' }).click();
        await expect(practice).toBeVisible();
        await practice
            .getByRole('button', { name: 'Known', exact: true })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Round 1 complete' }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Undo last rating' }).click();
        await expect(practice).toBeVisible();
        await practice
            .getByRole('button', { name: 'Known', exact: true })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Round 1 complete' }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Finish', exact: true }).click();
        await expect(practice).not.toBeVisible();

        await page.reload();
        const restoredSetup = await openCardSetup(page);
        await expect(
            restoredSetup.getByLabel('Dictionary order'),
        ).toBeChecked();
        await restoredSetup
            .getByRole('button', { name: 'Cancel', exact: true })
            .click();
        assertNoBrowserErrors();
    });

    // @user-flow flashcard-training-web/shared-learners-keep-personal-progress
    test('shared signed-in learners keep separate personal progress', async ({
        browser,
        page,
    }, testInfo) => {
        const assertNoOwnerBrowserErrors = captureBrowserErrors(page);
        const name = `Shared cards ${runId}`;
        await signUpAndVerify(
            page,
            syntheticEmail(testInfo, 'shared-owner'),
            '/dictionaries',
        );
        await createDictionaryWithCard(page, name);
        const { shareId, shareKey } = await createSharingLink(page);

        const first = await signedInSharedPage(
            browser,
            testInfo,
            'reader-one',
            shareId,
            shareKey,
        );
        const assertFirstBrowserErrors = captureBrowserErrors(first.page);
        await startPractice(first.page);
        const firstPractice = first.page.getByRole('dialog', {
            name: `Card practice · ${name}`,
        });
        await firstPractice
            .getByRole('button', { name: 'Known', exact: true })
            .click();
        await expect(
            first.page.getByRole('heading', { name: 'Round 1 complete' }),
        ).toBeVisible();
        await first.page
            .getByRole('button', { name: 'Finish', exact: true })
            .click();
        assertFirstBrowserErrors();

        const second = await signedInSharedPage(
            browser,
            testInfo,
            'reader-two',
            shareId,
            shareKey,
        );
        const assertSecondBrowserErrors = captureBrowserErrors(second.page);
        await startPractice(second.page);
        const secondPractice = second.page.getByRole('dialog', {
            name: `Card practice · ${name}`,
        });
        await secondPractice
            .getByRole('button', { name: 'Practise again', exact: true })
            .click();
        await expect(
            second.page.getByRole('img', {
                name: '0 Known, 1 Practise again, 0 Unstudied of 1',
            }),
        ).toBeVisible();
        await second.page
            .getByRole('button', { name: 'Finish', exact: true })
            .click();
        assertSecondBrowserErrors();

        await first.context.close();
        await second.context.close();
        assertNoOwnerBrowserErrors();
    });

    // @user-flow flashcard-training-web/anonymous-practice-does-not-persist
    test('anonymous shared practice stays local and does not write learning state', async ({
        browser,
        page,
    }, testInfo) => {
        const assertNoOwnerBrowserErrors = captureBrowserErrors(page);
        const name = `Anonymous cards ${runId}`;
        await signUpAndVerify(
            page,
            syntheticEmail(testInfo, 'anonymous-owner'),
            '/dictionaries',
        );
        await createDictionaryWithCard(page, name);
        const { shareId, shareKey } = await createSharingLink(page);

        const anonymousContext = await browser.newContext();
        const anonymous = await anonymousContext.newPage();
        const assertAnonymousBrowserErrors = captureBrowserErrors(anonymous);
        const learningWrites: string[] = [];
        anonymous.on('request', (request) => {
            const url = new URL(request.url());
            if (
                request.method() !== 'GET' &&
                /\/learning\/.*\/flashcards\/(preferences|attempts)/.test(
                    url.pathname,
                )
            ) {
                learningWrites.push(`${request.method()} ${url.pathname}`);
            }
        });
        await anonymous.goto(`/shared/dictionaries/${shareId}#${shareKey}`);
        await startPractice(anonymous);
        const practice = anonymous.getByRole('dialog', {
            name: `Card practice · ${name}`,
        });
        await practice
            .getByRole('button', { name: 'Practise again', exact: true })
            .click();
        await expect(
            anonymous.getByRole('heading', { name: 'Round 1 complete' }),
        ).toBeVisible();
        await anonymous
            .getByRole('button', { name: /Practise again \(1\)/ })
            .click();
        await expect(practice).toBeVisible();
        await practice
            .getByRole('button', { name: 'Known', exact: true })
            .click();
        await expect(
            anonymous.getByRole('heading', { name: 'Round 2 complete' }),
        ).toBeVisible();
        expect(learningWrites).toEqual([]);
        await anonymous
            .getByRole('button', { name: 'Finish', exact: true })
            .click();
        assertAnonymousBrowserErrors();
        await anonymousContext.close();
        assertNoOwnerBrowserErrors();
    });

    // @user-flow flashcard-training-web/rtl-touch-reduced-motion-training
    test('renders a long RTL card at 200% zoom and reserves touch swipes for horizontal ratings', async ({
        browser,
    }, testInfo) => {
        const context = await browser.newContext({
            hasTouch: true,
            reducedMotion: 'reduce',
            viewport: { width: 1440, height: 1000 },
        });
        const page = await context.newPage();
        const name = `RTL cards ${runId}`;
        await signInExistingOrSignUp(
            page,
            syntheticEmail(testInfo, 'owner'),
            '/dictionaries',
        );
        const assertNoBrowserErrors = captureBrowserErrors(page);
        await createArabicDictionaryWithLongCard(page, name);
        await page
            .getByRole('button', { name: 'Add card', exact: true })
            .click();
        await page.getByLabel(/^Source word or phrase \(/).fill('التالي');
        await page.getByLabel(/^Translation \(/).fill('Next card');
        await page.getByRole('button', { name: 'Create card' }).click();
        await expect(
            page.getByRole('dialog', { name: 'Add card' }),
        ).not.toBeVisible();
        const setup = await openCardSetup(page);
        await setup.getByLabel('Dictionary order').check();
        const front = setup.getByRole('group', { name: 'Front' });
        await front.getByLabel('Translation').uncheck();
        await front.getByLabel('Source', { exact: true }).check();
        await setup.getByRole('button', { name: 'Start', exact: true }).click();
        await expect(
            page.getByRole('dialog', { name: `Card practice · ${name}` }),
        ).toBeVisible();
        // This is a CSS rendering-scale surrogate for 200% zoom; browser chrome
        // zoom remains outside Playwright's durable page contract.
        await page.evaluate(() => {
            document.documentElement.style.zoom = '2';
        });
        const practice = page.getByRole('dialog', {
            name: `Card practice · ${name}`,
        });
        const card = practice.getByTestId('training-card');
        const rtlText = card.locator('[data-card-text][dir="rtl"]');
        await expect(card.locator('..')).toHaveCSS('animation-name', 'none');
        await expect(rtlText).toBeVisible();
        await expect(rtlText).toHaveAttribute('lang', 'ar');
        await expect(card).toBeInViewport();
        await expect(rtlText).toBeInViewport();
        expect(
            await card.evaluate(
                (element) =>
                    Number.parseFloat(
                        getComputedStyle(element).transitionDuration,
                    ) <= 0.001,
            ),
        ).toBe(true);
        await practice.getByRole('button', { name: 'Show back' }).focus();
        await expect(
            practice.getByRole('button', { name: 'Show back' }),
        ).toBeFocused();
        await expect
            .poll(() =>
                page.evaluate(() => ({
                    effectiveViewport: window.innerWidth / 2,
                    pageOverflows:
                        document.documentElement.scrollWidth / 2 >
                        document.documentElement.clientWidth,
                })),
            )
            .toEqual({ effectiveViewport: 720, pageOverflows: false });
        expect(
            await practice.evaluate(
                (element) => element.scrollWidth / 2 <= element.clientWidth,
            ),
        ).toBe(true);
        expect(
            await rtlText.evaluate(
                (element) =>
                    element.textContent?.length &&
                    element.getBoundingClientRect().height > 0,
            ),
        ).toBeTruthy();

        const cardFace = card.getByLabel('Front of card 1 / 2');
        expect(
            await cardFace.evaluate(
                (element) => element.scrollWidth / 2 <= element.clientWidth,
            ),
        ).toBe(true);
        await testInfo.attach('rtl-200-css-scale', {
            body: await page.screenshot(),
            contentType: 'image/png',
        });

        await page.evaluate(() => {
            document.documentElement.style.zoom = '';
        });
        await practice.getByRole('button', { name: 'Dialog view' }).click();
        await page.setViewportSize({ width: 720, height: 500 });
        await expect(
            practice.getByRole('button', { name: 'End', exact: true }),
        ).toBeInViewport();
        await expect(
            practice.getByRole('button', { name: 'Known', exact: true }),
        ).toBeInViewport();
        await page.setViewportSize({ width: 390, height: 844 });
        const cdp = await context.newCDPSession(page);
        const faceBounds = await cardFace.boundingBox();
        expect(faceBounds).not.toBeNull();
        const scrollTop = await cardFace.evaluate(
            (element) => element.scrollTop,
        );
        await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [
                {
                    x: faceBounds!.x + faceBounds!.width / 2,
                    y: faceBounds!.y + faceBounds!.height / 2,
                    id: 1,
                },
            ],
        });
        await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [
                {
                    x: faceBounds!.x + faceBounds!.width / 2,
                    y: faceBounds!.y + 24,
                    id: 1,
                },
            ],
        });
        await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchEnd',
            touchPoints: [],
        });
        await expect
            .poll(() => cardFace.evaluate((element) => element.scrollTop))
            .toBeGreaterThan(scrollTop);
        await expect(
            page.getByRole('heading', { name: 'Round 1 complete' }),
        ).not.toBeVisible();
        await expect(
            practice.getByRole('button', { name: 'Known', exact: true }),
        ).toBeVisible();
        await testInfo.attach('rtl-mobile-touch', {
            body: await page.screenshot(),
            contentType: 'image/png',
        });
        await page.emulateMedia({ reducedMotion: 'no-preference' });

        const bounds = await card.boundingBox();
        expect(bounds).not.toBeNull();
        let releaseRating!: () => void;
        const ratingGate = new Promise<void>((resolve) => {
            releaseRating = resolve;
        });
        await page.route('**/flashcards/attempts', async (route) => {
            await ratingGate;
            await route.continue();
        });
        const touchY = Math.max(
            bounds!.y + 24,
            Math.min(bounds!.y + bounds!.height - 24, 420),
        );
        await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [
                {
                    x: bounds!.x + 24,
                    y: touchY,
                    id: 2,
                },
            ],
        });
        for (const x of [
            bounds!.x + bounds!.width * 0.4,
            bounds!.x + bounds!.width * 0.7,
            bounds!.x + bounds!.width - 24,
        ]) {
            await cdp.send('Input.dispatchTouchEvent', {
                type: 'touchMove',
                touchPoints: [{ x, y: touchY, id: 2 }],
            });
        }
        // CDP delivery can precede React's final move paint. Sample the actual
        // released position only after that paint, not a coalesced earlier move.
        await expect
            .poll(async () =>
                Math.round(
                    await card.evaluate(
                        (element) =>
                            new DOMMatrix(getComputedStyle(element).transform)
                                .m41,
                    ),
                ),
            )
            .toBe(Math.round(bounds!.width - 48));
        const releaseTransform = await card.evaluate(
            (element) => getComputedStyle(element).transform,
        );
        await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchEnd',
            touchPoints: [],
        });
        await expect(
            practice.getByText('Saving…', { exact: true }),
        ).toBeVisible();
        await expect(card).toHaveCSS('opacity', '0');
        await expect(card).toHaveCSS('transform', releaseTransform);
        releaseRating();
        await expect(card.getByLabel('Front of card 2 / 2')).toBeVisible();
        await expect(card).toHaveCSS('opacity', '1');
        await expect(card).toHaveCSS('transform', 'none');
        await expect(card.locator('..')).toHaveCSS('animation-name', /enter/);
        await page.unroute('**/flashcards/attempts');
        await practice
            .getByRole('button', { name: 'Known', exact: true })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Round 1 complete' }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Finish', exact: true }).click();
        await expect(practice).not.toBeVisible();
        assertNoBrowserErrors();
        await context.close();
    });
});
