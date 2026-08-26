import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// @user-flow-revision dictionary-platform sha256:f582db9e4d60e702

const password = 'E2e!Dictionary-password-2026';
const backendPort = new URL(
    process.env.AUTH_E2E_BACKEND_ORIGIN ?? 'http://localhost:4000',
).port;
const runId =
    process.env.AUTH_E2E_RUN_ID ?? `${Date.now().toString(36)}-${process.pid}`;

function syntheticEmail(testInfo: TestInfo, journey: string): string {
    return `dictionary-e2e-${runId}-${testInfo.workerIndex}-${journey}@example.test`;
}

function captureBrowserErrors(
    page: Page,
    expectedResponse: (path: string, status: number) => boolean = () => false,
) {
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
        const expected =
            (path === '/auth/refresh' && response.status() === 401) ||
            (path.startsWith('/shared/dictionaries/') &&
                response.status() === 404) ||
            expectedResponse(path, response.status());
        if (!expected) errors.push(`${response.status()} ${path}`);
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

async function signUpAndVerifyOrSignInAfterRateLimit(
    page: Page,
    email: string,
    returnTo: string,
    fallbackEmail: string,
): Promise<void> {
    await page.goto(`/signup?returnTo=${encodeURIComponent(returnTo)}`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();

    let outcome = 'pending';
    await expect
        .poll(async () => {
            if (new URL(page.url()).pathname === '/verify-email') {
                outcome = 'verify';
            }
            if (
                outcome === 'pending' &&
                (await page
                    .getByText('Too many attempts', { exact: false })
                    .isVisible())
            ) {
                outcome = 'rate-limited';
            }
            return outcome;
        })
        .not.toBe('pending');

    if (outcome === 'rate-limited') {
        await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
        await page.getByLabel('Email').fill(fallbackEmail);
        await page.getByLabel('Password', { exact: true }).fill(password);
        await page
            .getByRole('button', { name: 'Sign in', exact: true })
            .click();
        await expect(page).toHaveURL(
            new RegExp(`${returnTo.replaceAll('/', '\\/')}$`),
        );
        return;
    }

    await page.getByLabel('Verification code').fill('0000');
    await page.getByRole('button', { name: 'Verify email' }).click();
    await expect(page).toHaveURL(
        new RegExp(`${returnTo.replaceAll('/', '\\/')}$`),
    );
}

async function createDictionary(page: Page, name: string): Promise<void> {
    await page.getByRole('button', { name: 'New dictionary' }).click();
    await page.getByLabel('Name').fill(name);
    await page
        .getByLabel('Description')
        .fill('Vocabulary used in an art studio.');
    await page.getByLabel('Translate from').selectOption('en');
    await page.getByLabel('Translate to').selectOption('es');
    await page.getByRole('button', { name: 'Create dictionary' }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByText('This dictionary is private.')).toBeVisible();
}

async function addPopulatedCard(page: Page): Promise<void> {
    await page.getByLabel('Definition').check();
    await page.getByLabel('Context example').check();
    await page.getByLabel('Example translation').check();
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Dictionary settings saved.')).toBeVisible();

    await page.getByRole('button', { name: 'Add card' }).click();
    await page.getByLabel(/^Source phrase ·/).fill('work of art');
    await page.getByLabel(/^Translation ·/).fill('obra de arte');
    await page
        .getByLabel(/^Definition ·/)
        .fill('An object made for artistic expression.');
    await page
        .getByLabel(/^Context example ·/)
        .fill('The gallery acquired the work of art.');
    await page
        .getByLabel(/^Example translation ·/)
        .fill('La galería adquirió la obra de arte.');
    await page.getByRole('button', { name: 'Save card' }).click();
    await expect(page.getByText('work of art', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Translate from')).toBeDisabled();
}

async function chooseCardAction(
    page: Page,
    source: string,
    action: string,
): Promise<void> {
    const card = page.getByRole('listitem').filter({ hasText: source });
    await card.getByRole('button', { name: /Card actions, card/ }).click();
    await card.getByRole('menuitem', { name: action }).click();
}

test.describe('dictionary platform journeys', () => {
    // @user-flow dictionary-platform/owner-creates-edits-and-restores-dictionary
    test('owner creates, edits, archives, and restores dictionary content', async ({
        page,
    }, testInfo) => {
        const assertNoBrowserErrors = captureBrowserErrors(page);
        const name = `Studio Spanish ${runId}`;
        await signUpAndVerify(page, syntheticEmail(testInfo, 'owner'), '/');
        await page.getByRole('link', { name: 'Dictionaries' }).click();
        await expect(
            page.getByRole('heading', { name: 'My dictionaries' }),
        ).toBeVisible();
        await createDictionary(page, name);
        await addPopulatedCard(page);
        await page.setViewportSize({ width: 320, height: 900 });
        await page.evaluate(() => {
            document.documentElement.style.fontSize = '200%';
        });
        const addCard = page.getByRole('button', { name: 'Add card' });
        await addCard.focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await expect(addCard).toBeFocused();
        expect(
            await addCard.evaluate(
                (element) => getComputedStyle(element).outlineStyle,
            ),
        ).not.toBe('none');
        expect(
            await page.evaluate(
                () =>
                    document.documentElement.scrollWidth <=
                    document.documentElement.clientWidth + 1,
            ),
        ).toBe(true);
        await addCard.click();
        const compactEditor = page.getByRole('dialog', { name: 'Add card' });
        await expect(compactEditor).toBeVisible();
        expect(
            await page.evaluate(
                () =>
                    document.documentElement.scrollWidth <=
                    document.documentElement.clientWidth + 1,
            ),
        ).toBe(true);
        await compactEditor
            .getByRole('button', { name: 'Cancel' })
            .last()
            .click();
        await expect(compactEditor).not.toBeVisible();
        await page.evaluate(() => {
            document.documentElement.style.fontSize = '';
        });
        await page.setViewportSize({ width: 1280, height: 720 });

        await chooseCardAction(page, 'work of art', 'Edit');
        await expect(
            page.getByRole('dialog', { name: 'Edit card' }),
        ).toBeVisible();
        await page.getByLabel(/^Translation ·/).fill('pieza de arte');
        let releaseCardSave: (() => void) | undefined;
        const cardSaveGate = new Promise<void>((resolve) => {
            releaseCardSave = resolve;
        });
        const cardRoute = '**/dictionaries/*/cards/*';
        await page.route(cardRoute, async (route) => {
            if (route.request().method() === 'PATCH') await cardSaveGate;
            await route.continue();
        });
        await page.getByRole('button', { name: 'Save card' }).click();
        const pendingEditor = page.getByRole('dialog', { name: 'Edit card' });
        await expect(
            pendingEditor.getByRole('button', { name: 'Cancel' }).first(),
        ).toBeDisabled();
        await expect(
            pendingEditor.getByRole('button', { name: 'Cancel' }).last(),
        ).toBeDisabled();
        await expect(addCard).toBeDisabled();
        releaseCardSave?.();
        await expect(
            page.getByText('pieza de arte', { exact: true }),
        ).toBeVisible();
        await page.unroute(cardRoute);

        await chooseCardAction(page, 'work of art', 'Archive');
        await expect(page.getByText('Card archived.')).toBeVisible();
        await page.getByLabel('Card status').selectOption('archived');
        await chooseCardAction(page, 'work of art', 'Restore');
        await expect(page.getByText('Card restored.')).toBeVisible();

        await page.getByRole('link', { name: /Back to dictionaries/ }).click();
        const dictionaryRow = page
            .getByRole('listitem')
            .filter({ hasText: name });
        await dictionaryRow.getByRole('button', { name: 'Archive' }).click();
        await expect(page.getByText(/Dictionary archived/)).toBeVisible();
        await page.getByLabel('Dictionary status').selectOption('archived');
        await page
            .getByRole('listitem')
            .filter({ hasText: name })
            .getByRole('button', { name: 'Restore' })
            .click();
        await expect(
            page.getByText('Dictionary restored as private.'),
        ).toBeVisible();
        await page.getByLabel('Dictionary status').selectOption('active');
        await expect(page.getByRole('heading', { name })).toBeVisible();
        assertNoBrowserErrors();
    });

    // @user-flow dictionary-platform/anonymous-reader-forks-unlisted-dictionary
    test('anonymous reader keeps the capability in the fragment and forks privately', async ({
        page,
    }, testInfo) => {
        const assertNoBrowserErrors = captureBrowserErrors(page);
        const requestedUrls: string[] = [];
        page.on('request', (request) => requestedUrls.push(request.url()));
        const name = `Shared studio terms ${runId}`;
        const publisherEmail = syntheticEmail(testInfo, 'publisher');
        await signUpAndVerify(page, publisherEmail, '/dictionaries');
        await createDictionary(page, name);
        await addPopulatedCard(page);
        const sourceEditorUrl = page.url();

        const rotateResponse = page.waitForResponse(
            (response) =>
                response.url().endsWith('/share-key/rotate') &&
                response.status() === 200,
        );
        await page.getByRole('button', { name: 'Create sharing link' }).click();
        const rotated = (await (await rotateResponse).json()) as {
            capability: { shareId: string; shareKey: string };
        };
        const { shareId, shareKey } = rotated.capability;
        await expect(
            page.getByRole('button', { name: 'Copy link' }),
        ).toBeVisible();

        await page.goto('/security');
        await page.getByRole('button', { name: 'Sign out here' }).click();
        await expect(page).toHaveURL(/\/login$/);

        const sharedResponse = page.waitForResponse((response) => {
            const url = new URL(response.url());
            return (
                url.port === backendPort &&
                url.pathname === `/shared/dictionaries/${shareId}` &&
                response.status() === 200
            );
        });
        await page.goto(`/shared/dictionaries/${shareId}#${shareKey}`);
        const publicResponse = await sharedResponse;
        const publicRequest = publicResponse.request();
        expect(publicRequest.headers()['x-languon-share-key']).toBe(shareKey);
        expect(publicResponse.headers()['cache-control']).toBe(
            'private, no-store',
        );
        expect(publicResponse.headers()['referrer-policy']).toBe('no-referrer');
        await expect(page.getByRole('heading', { name })).toBeVisible();
        await expect(
            page.getByText('work of art', { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText('Unlisted · no index', { exact: true }),
        ).toBeVisible();
        await expect(page.getByText(publisherEmail)).toHaveCount(0);
        await page.getByRole('link', { name: 'Sign in to fork' }).click();
        await expect(page).toHaveURL(
            `/login?returnTo=${encodeURIComponent(
                `/shared/dictionaries/${shareId}`,
            )}#${shareKey}`,
        );
        const createAccount = page.getByRole('link', {
            name: 'Create an account',
        });
        await expect(createAccount).toBeVisible();
        const signupHref = new URL(
            (await createAccount.getAttribute('href'))!,
            page.url(),
        );
        expect(signupHref.hash).toBe(`#${shareKey}`);
        expect(signupHref.searchParams.get('returnTo')).toBe(
            `/shared/dictionaries/${shareId}`,
        );
        await createAccount.click();
        await expect(page).toHaveURL(
            `/signup?returnTo=${encodeURIComponent(
                `/shared/dictionaries/${shareId}`,
            )}#${shareKey}`,
        );
        expect(page.url()).toContain(`#${shareKey}`);
        await page.getByLabel('Email').fill(syntheticEmail(testInfo, 'reader'));
        await page.getByLabel('Password', { exact: true }).fill(password);
        await page.getByRole('button', { name: 'Create account' }).click();
        await page.getByLabel('Verification code').fill('0000');
        await page.getByRole('button', { name: 'Verify email' }).click();
        await expect(
            page.getByRole('button', { name: 'Fork privately' }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Fork privately' }).click();
        await expect(page).toHaveURL(/\/dictionaries\/[0-9a-f-]+$/);
        await expect(page.getByRole('heading', { name })).toBeVisible();
        await expect(
            page.getByText('This dictionary is private.'),
        ).toBeVisible();
        expect(requestedUrls.every((url) => !url.includes(shareKey))).toBe(
            true,
        );
        expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(
            [],
        );
        expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual(
            [],
        );

        await page.goto('/security');
        await page.getByRole('button', { name: 'Sign out here' }).click();
        await page.getByLabel('Email').fill(publisherEmail);
        await page.getByLabel('Password', { exact: true }).fill(password);
        await page
            .getByRole('button', { name: 'Sign in', exact: true })
            .click();
        await expect(page).toHaveURL('/');
        await page.goto(sourceEditorUrl);
        const rerotateResponse = page.waitForResponse(
            (response) =>
                response.url().endsWith('/share-key/rotate') &&
                response.status() === 200,
        );
        await page.getByRole('button', { name: 'Rotate sharing link' }).click();
        const rerotated = (await (await rerotateResponse).json()) as {
            capability: { shareId: string; shareKey: string };
        };
        await page.goto(`/shared/dictionaries/${shareId}#${shareKey}`);
        await expect(
            page.getByRole('heading', { name: 'Dictionary unavailable' }),
        ).toBeVisible();
        await page.goto(sourceEditorUrl);
        await page
            .locator('header')
            .filter({ has: page.getByRole('heading', { name }) })
            .getByRole('button', { name: 'Archive', exact: true })
            .click();
        await expect(
            page.getByText('This dictionary is archived'),
        ).toBeVisible();
        await page.goto(
            `/shared/dictionaries/${rerotated.capability.shareId}#${rerotated.capability.shareKey}`,
        );
        await expect(
            page.getByRole('heading', { name: 'Dictionary unavailable' }),
        ).toBeVisible();
        assertNoBrowserErrors();
    });

    // @user-flow dictionary-platform/card-ai-proposal-survives-review-and-conflict
    test('card AI proposal survives reload and recovers from a stale review conflict', async ({
        context,
        page,
    }, testInfo) => {
        const assertNoBrowserErrors = captureBrowserErrors(
            page,
            (path, status) =>
                status === 409 &&
                ((path.endsWith('/accept') &&
                    path.startsWith('/dictionary-generation-jobs/')) ||
                    /^\/dictionaries\/[^/]+\/cards\/[^/]+$/.test(path)),
        );
        const name = `Persistent proposal ${runId}`;
        await signUpAndVerify(
            page,
            syntheticEmail(testInfo, 'generation-owner'),
            '/dictionaries',
        );
        await createDictionary(page, name);
        await addPopulatedCard(page);

        await chooseCardAction(page, 'work of art', 'Edit');
        const staleEditor = page.getByRole('dialog', { name: 'Edit card' });
        await staleEditor
            .getByLabel(/^Translation ·/)
            .fill('edición local obsoleta');
        const manualConcurrentPage = await context.newPage();
        const assertNoManualConcurrentBrowserErrors =
            captureBrowserErrors(manualConcurrentPage);
        await manualConcurrentPage.goto(page.url());
        await expect(
            manualConcurrentPage.getByRole('heading', { name }),
        ).toBeVisible();
        await chooseCardAction(manualConcurrentPage, 'work of art', 'Edit');
        await manualConcurrentPage
            .getByLabel(/^Translation ·/)
            .fill('obra de arte actualizada');
        await manualConcurrentPage
            .getByRole('button', { name: 'Save card' })
            .click();
        await expect(
            manualConcurrentPage.getByText('obra de arte actualizada', {
                exact: true,
            }),
        ).toBeVisible();
        assertNoManualConcurrentBrowserErrors();
        await manualConcurrentPage.close();

        await staleEditor.getByRole('button', { name: 'Save card' }).click();
        await expect(
            staleEditor.getByRole('button', {
                name: 'Reload current version',
            }),
        ).toBeVisible();
        await staleEditor
            .getByRole('button', { name: 'Reload current version' })
            .click();
        await expect(staleEditor).not.toBeVisible();
        await expect(
            page.getByText('obra de arte actualizada', { exact: true }),
        ).toBeVisible();

        await chooseCardAction(page, 'work of art', 'Regenerate with AI');
        let review = page.getByRole('region', {
            name: 'Review generated card',
        });
        await review
            .getByLabel('Custom instruction')
            .fill('Keep the vocabulary suitable for an art studio.');
        await review
            .getByRole('button', { name: 'Regenerate with AI' })
            .click();
        await expect(
            review.getByRole('heading', { name: 'Proposed card' }),
        ).toBeVisible({ timeout: 20_000 });
        await expect(page).toHaveURL(/generationCard=.*generationJob=/);

        await page.reload();
        review = page.getByRole('region', { name: 'Review generated card' });
        await expect(
            review.getByRole('heading', { name: 'Proposed card' }),
        ).toBeVisible({ timeout: 20_000 });
        await expect(review.getByText('Original version 2')).toBeVisible();
        await page.setViewportSize({ width: 320, height: 900 });
        await page.evaluate(() => {
            document.documentElement.style.fontSize = '200%';
        });
        const acceptProposal = review.getByRole('button', {
            name: 'Accept reviewed card',
        });
        await acceptProposal.focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await expect(acceptProposal).toBeFocused();
        expect(
            await page.evaluate(
                () =>
                    document.documentElement.scrollWidth <=
                    document.documentElement.clientWidth + 1,
            ),
        ).toBe(true);
        await page.evaluate(() => {
            document.documentElement.style.fontSize = '';
        });
        await page.setViewportSize({ width: 1280, height: 720 });

        const concurrentPage = await context.newPage();
        const assertNoConcurrentBrowserErrors =
            captureBrowserErrors(concurrentPage);
        const editorUrl = new URL(page.url());
        editorUrl.search = '';
        await concurrentPage.goto(editorUrl.toString());
        await expect(
            concurrentPage.getByRole('heading', { name }),
        ).toBeVisible();
        await chooseCardAction(concurrentPage, 'work of art', 'Edit');
        await concurrentPage
            .getByLabel(/^Translation ·/)
            .fill('obra artística concurrente');
        await concurrentPage.getByRole('button', { name: 'Save card' }).click();
        await expect(
            concurrentPage.getByText('obra artística concurrente', {
                exact: true,
            }),
        ).toBeVisible();
        assertNoConcurrentBrowserErrors();
        await concurrentPage.close();

        const proposedTranslation = review.getByLabel(/^Translation ·/);
        await proposedTranslation.fill('obra de arte revisada');
        await review
            .getByRole('button', { name: 'Accept reviewed card' })
            .click();
        await expect(
            review.getByText('Card changed since generation'),
        ).toBeVisible();
        await review
            .getByRole('button', { name: 'Reload and compare' })
            .click();
        await expect(
            review.getByRole('heading', {
                name: 'Current card after reload',
            }),
        ).toBeVisible();
        await expect(
            review.getByText('obra artística concurrente', { exact: true }),
        ).toBeVisible();
        await expect(proposedTranslation).toHaveValue('obra de arte revisada');

        await review
            .getByLabel('Custom instruction')
            .fill('Use the current card and keep the art context.');
        const previousGenerationUrl = page.url();
        const regenerateResponse = page.waitForResponse(
            (response) =>
                response.url().endsWith('/regenerate') &&
                response.status() === 202,
        );
        await review
            .getByRole('button', { name: 'Regenerate proposal' })
            .click();
        await regenerateResponse;
        await expect(page).not.toHaveURL(previousGenerationUrl);
        await expect(
            review.getByRole('heading', { name: 'Proposed card' }),
        ).toBeVisible({ timeout: 20_000 });
        await review.getByLabel(/^Translation ·/).fill('obra de arte final');
        await review
            .getByRole('button', { name: 'Accept reviewed card' })
            .click();
        await expect(
            review.getByText('The reviewed proposal was accepted.', {
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            page.getByText('obra de arte final', { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText('Human + AI', { exact: true }),
        ).toBeVisible();
        assertNoBrowserErrors();
    });

    // @user-flow dictionary-platform/batch-generation-review-commits-selected-cards
    test('pasted-term review survives reload, retries failures, and commits selected cards atomically', async ({
        context,
        page,
    }, testInfo) => {
        test.setTimeout(90_000);
        const assertNoBrowserErrors = captureBrowserErrors(
            page,
            (path, status) =>
                status === 409 &&
                path.startsWith('/dictionary-generation-jobs/') &&
                path.endsWith('/accept'),
        );
        await signUpAndVerify(
            page,
            syntheticEmail(testInfo, 'batch-owner'),
            '/dictionaries',
        );
        await createDictionary(page, `Batch studio ${runId}`);

        await page
            .getByRole('button', {
                name: 'Generate cards from pasted terms',
            })
            .click();
        let batch = page.getByRole('dialog', {
            name: 'Generate cards from pasted terms',
        });
        const retryableLongTerm = 'a'.repeat(161);
        await batch
            .getByLabel('Terms or phrases')
            .fill(`canvas\nbank\nbank\n${retryableLongTerm}`);
        await batch.getByLabel(/^Context/).fill('Art and finance vocabulary');
        await batch.getByRole('button', { name: 'Generate cards' }).click();
        await expect(
            batch.getByRole('heading', { name: 'Review generated cards' }),
        ).toBeVisible({ timeout: 20_000 });
        await expect(page).toHaveURL(/batchGenerationJob=[0-9a-f-]+/);
        const originalReviewUrl = page.url();

        await page.reload();
        batch = page.getByRole('dialog', {
            name: 'Generate cards from pasted terms',
        });
        await expect(
            batch.getByRole('heading', { name: 'Review generated cards' }),
        ).toBeVisible({ timeout: 20_000 });
        await expect(
            batch.getByText('A matching source appears earlier in this batch.'),
        ).toBeVisible();
        await expect(
            batch.getByRole('checkbox', { name: 'Retry row 4' }),
        ).toBeChecked();

        await page.setViewportSize({ width: 320, height: 900 });
        await page.evaluate(() => {
            document.documentElement.style.fontSize = '200%';
        });
        const includeFirst = batch.getByRole('checkbox', {
            name: 'Include row 1',
        });
        await includeFirst.focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await expect(includeFirst).toBeFocused();
        expect(
            await page.evaluate(
                () =>
                    document.documentElement.scrollWidth <=
                    document.documentElement.clientWidth + 1,
            ),
        ).toBe(true);
        await page.evaluate(() => {
            document.documentElement.style.fontSize = '';
        });
        await page.setViewportSize({ width: 1280, height: 720 });

        const retryResponse = page.waitForResponse(
            (response) =>
                response.url().endsWith('/retry-pasted-terms') &&
                response.status() === 202,
        );
        await batch
            .getByRole('button', { name: 'Retry selected failures' })
            .click();
        await retryResponse;
        await expect(page).not.toHaveURL(originalReviewUrl);
        await expect(
            batch.getByText('No generated cards remain in this review.'),
        ).toBeVisible({ timeout: 20_000 });
        await expect(batch.getByText(retryableLongTerm)).toBeVisible();

        await page.goto(originalReviewUrl);
        batch = page.getByRole('dialog', {
            name: 'Generate cards from pasted terms',
        });
        await expect(
            batch.getByRole('heading', { name: 'Review generated cards' }),
        ).toBeVisible({ timeout: 20_000 });
        await batch.getByLabel('Translation').first().fill('toile révisée');
        await batch.getByRole('button', { name: 'Remove row' }).nth(2).click();
        await batch.getByRole('button', { name: 'Add 2 cards' }).click();
        await expect(
            batch.getByText('The selected cards were added together.'),
        ).toBeVisible();
        await expect(
            batch.getByText('The dictionary changed'),
        ).not.toBeVisible();
        await expect(
            page.getByText('toile révisée', { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText('Human + AI', { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText('AI-generated', { exact: true }),
        ).toBeVisible();
        await batch
            .getByRole('button', { name: 'Close batch generation' })
            .click();

        await page.getByRole('link', { name: /Back to dictionaries/ }).click();
        const conflictName = `Empty batch conflict ${runId}`;
        await createDictionary(page, conflictName);
        await page
            .getByRole('button', {
                name: 'Generate cards from pasted terms',
            })
            .click();
        batch = page.getByRole('dialog', {
            name: 'Generate cards from pasted terms',
        });
        await batch.getByLabel('Terms or phrases').fill('empty pair term');
        await batch.getByRole('button', { name: 'Generate cards' }).click();
        await expect(
            batch.getByRole('heading', { name: 'Review generated cards' }),
        ).toBeVisible({ timeout: 20_000 });

        const concurrentPage = await context.newPage();
        const assertNoConcurrentBrowserErrors =
            captureBrowserErrors(concurrentPage);
        const editorUrl = new URL(page.url());
        editorUrl.search = '';
        await concurrentPage.goto(editorUrl.toString());
        await expect(
            concurrentPage.getByRole('heading', { name: conflictName }),
        ).toBeVisible();
        await concurrentPage.getByLabel('Translate from').selectOption('de');
        await concurrentPage
            .getByRole('button', { name: 'Save settings' })
            .click();
        await expect(
            concurrentPage.getByText('Dictionary settings saved.'),
        ).toBeVisible();
        assertNoConcurrentBrowserErrors();
        await concurrentPage.close();

        await batch.getByRole('button', { name: 'Add 1 cards' }).click();
        await expect(batch.getByText('The dictionary changed')).toBeVisible();
        await batch
            .getByRole('button', { name: 'Reload current versions' })
            .click();
        await expect(batch.getByText('The dictionary changed')).toBeVisible();
        await expect(
            batch.getByRole('button', { name: 'Add 1 cards' }),
        ).toBeDisabled();
        await batch
            .getByRole('button', { name: 'Close batch generation' })
            .click();
        await expect(
            page.getByRole('listitem').filter({ hasText: 'empty pair term' }),
        ).toHaveCount(0);
        assertNoBrowserErrors();
    });

    // @user-flow dictionary-platform/document-generation-cleans-original-and-commits-final-review
    test('document generation cleans the upload before one final editable review', async ({
        page,
    }, testInfo) => {
        test.skip(
            process.env.AUTH_E2E_DOCUMENT_SERVICES !== 'true',
            'Requires the guarded disposable MinIO document service.',
        );
        test.setTimeout(90_000);
        const assertNoBrowserErrors = captureBrowserErrors(
            page,
            (path, status) => path === '/auth/sign-up' && status === 429,
        );
        await signUpAndVerifyOrSignInAfterRateLimit(
            page,
            syntheticEmail(testInfo, 'document-owner'),
            '/dictionaries',
            syntheticEmail(testInfo, 'owner'),
        );
        await createDictionary(page, `Document studio ${runId}`);

        await page
            .getByRole('button', { name: 'Generate cards from a document' })
            .click();
        let review = page.getByRole('dialog', {
            name: 'Generate cards from a document',
        });
        const retryableLongTerm = 'a'.repeat(161);
        await review.getByLabel('Document').setInputFiles({
            buffer: Buffer.from(`canvas\nbank\n${retryableLongTerm}`, 'utf8'),
            mimeType: 'text/plain',
            name: 'terms.txt',
        });
        await review
            .getByLabel(/^Generation instruction/)
            .fill('Use concise studio vocabulary.');
        await review
            .getByRole('button', { name: 'Upload and generate cards' })
            .click();
        await expect(page).toHaveURL(/documentGenerationJob=[0-9a-f-]+/);
        await expect(
            review.getByRole('heading', { name: 'Review generated cards' }),
        ).toBeVisible({ timeout: 30_000 });
        const originalDocumentReviewUrl = page.url();

        await page.reload();
        review = page.getByRole('dialog', {
            name: 'Generate cards from a document',
        });
        await expect(
            review.getByRole('heading', { name: 'Review generated cards' }),
        ).toBeVisible({ timeout: 30_000 });
        await expect(review.getByText('Extracted term: canvas')).toBeVisible();
        await expect(review.getByText('Extracted term: bank')).toBeVisible();
        await expect(
            review.getByRole('checkbox', {
                name: 'Retry extracted term 3',
            }),
        ).toBeChecked();

        const retryResponse = page.waitForResponse(
            (response) =>
                response.url().endsWith('/retry-document-terms') &&
                response.status() === 202,
        );
        await review
            .getByRole('button', { name: 'Retry selected failures' })
            .click();
        await retryResponse;
        await expect(page).toHaveURL(/batchGenerationJob=[0-9a-f-]+/);
        const successor = page.getByRole('dialog', {
            name: 'Generate cards from pasted terms',
        });
        await expect(
            successor.getByText('No generated cards remain in this review.'),
        ).toBeVisible({ timeout: 20_000 });
        await expect(successor.getByText(retryableLongTerm)).toBeVisible();

        await page.goto(originalDocumentReviewUrl);
        review = page.getByRole('dialog', {
            name: 'Generate cards from a document',
        });
        await expect(
            review.getByRole('heading', { name: 'Review generated cards' }),
        ).toBeVisible({ timeout: 20_000 });

        await review.getByLabel('Translation').first().fill('lienzo revisado');
        await review
            .getByRole('button', { name: 'Remove card' })
            .nth(1)
            .click();

        await page.setViewportSize({ width: 320, height: 900 });
        await page.evaluate(() => {
            document.documentElement.style.fontSize = '200%';
        });
        const includeFirst = review.getByRole('checkbox', {
            name: 'Include extracted term 1',
        });
        await includeFirst.focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await expect(includeFirst).toBeFocused();
        expect(
            await page.evaluate(
                () =>
                    document.documentElement.scrollWidth <=
                    document.documentElement.clientWidth + 1,
            ),
        ).toBe(true);
        await page.evaluate(() => {
            document.documentElement.style.fontSize = '';
        });
        await page.setViewportSize({ width: 1280, height: 720 });

        await review.getByRole('button', { name: 'Add 1 cards' }).click();
        await expect(
            review.getByText('Selected document cards were added.'),
        ).toBeVisible();
        await expect(
            page.getByText('lienzo revisado', { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText('Human + AI', { exact: true }),
        ).toBeVisible();
        assertNoBrowserErrors();
    });

    // @user-flow dictionary-platform/quizlet-import-and-export-round-trip
    test('previews a Quizlet import and exports formula-safe ordered CSV', async ({
        page,
    }, testInfo) => {
        await page.addInitScript(() => {
            Object.defineProperty(window, 'showSaveFilePicker', {
                configurable: true,
                value: undefined,
            });
        });
        const assertNoBrowserErrors = captureBrowserErrors(
            page,
            (path, status) => path === '/auth/sign-up' && status === 429,
        );
        await signUpAndVerifyOrSignInAfterRateLimit(
            page,
            syntheticEmail(testInfo, 'interchange-owner'),
            '/dictionaries',
            syntheticEmail(testInfo, 'owner'),
        );

        await page.getByRole('button', { name: 'Import cards' }).click();
        const longUnbrokenSource = 'a'.repeat(200);
        const importer = page.getByRole('dialog', {
            name: 'Preview and import cards',
        });
        await importer
            .getByRole('textbox', { name: /^Name/u })
            .fill(`Quizlet transfer ${runId}`);
        await importer.getByLabel('Column separator').selectOption('comma');
        await importer
            .getByRole('checkbox', {
                name: 'The first row contains column names',
            })
            .check();
        await importer
            .getByLabel('Import text')
            .fill(
                [
                    'source,translation',
                    '"=SUM(1,2)","fórmula"',
                    '"café","coffee"',
                    '"bad"x,value',
                    '"café","coffee house"',
                    `"${longUnbrokenSource}","long source"`,
                ].join('\n'),
            );
        await importer.getByRole('button', { name: 'Preview import' }).click();
        await expect(
            importer.getByText('4 ready, 1 need attention, 5 total'),
        ).toBeVisible();
        await expect(
            importer.getByText(
                '1 duplicate source rows will be imported with warnings.',
            ),
        ).toBeVisible();
        const enrichmentSwitch = importer.getByRole('switch', {
            name: 'Enrich selected pairs with AI',
        });
        await enrichmentSwitch.focus();
        await page.keyboard.press('Space');
        await expect(enrichmentSwitch).toBeChecked();

        await page.setViewportSize({ width: 320, height: 900 });
        await page.evaluate(() => {
            document.documentElement.style.fontSize = '200%';
        });
        await importer
            .getByRole('button', { name: 'Generate 4 card reviews' })
            .focus();
        await expect(
            importer.getByRole('button', {
                name: 'Generate 4 card reviews',
            }),
        ).toBeFocused();
        expect(
            await page.evaluate(
                () =>
                    document.documentElement.scrollWidth <=
                    document.documentElement.clientWidth + 1,
            ),
        ).toBe(true);
        await page.evaluate(() => {
            document.documentElement.style.fontSize = '';
        });
        await page.setViewportSize({ width: 1280, height: 720 });
        await importer
            .getByRole('button', { name: 'Generate 4 card reviews' })
            .click();
        let review = page.getByRole('dialog', {
            name: 'Generate cards from pasted terms',
        });
        await expect(
            review.getByRole('heading', { name: 'Review generated cards' }),
        ).toBeVisible({ timeout: 20_000 });
        await expect(page).toHaveURL(
            /\/dictionaries\/[0-9a-f-]+\?batchGenerationJob=[0-9a-f-]+/u,
        );
        await page.reload();
        review = page.getByRole('dialog', {
            name: 'Generate cards from pasted terms',
        });
        await expect(
            review.getByRole('heading', { name: 'Review generated cards' }),
        ).toBeVisible({ timeout: 20_000 });
        await review.getByRole('button', { name: 'Add 4 cards' }).click();
        await expect(
            review.getByText('The selected cards were added together.'),
        ).toBeVisible();
        await expect(page.getByText('fórmula', { exact: true })).toBeVisible();
        await expect(
            page.getByText('Human + AI', { exact: true }).first(),
        ).toBeVisible();
        await review.getByRole('button', { name: 'Cancel' }).click();

        await page.getByRole('button', { name: 'Export' }).click();
        const exporter = page.getByRole('dialog', {
            name: 'Export active cards',
        });
        const downloadPromise = page.waitForEvent('download');
        await exporter
            .getByRole('button', { name: 'Download Quizlet CSV' })
            .click();
        const download = await downloadPromise;
        const downloadPath = await download.path();
        expect(downloadPath).not.toBeNull();
        const csv = await readFile(downloadPath!, 'utf8');
        expect(csv).toContain('source,translation\r\n');
        expect(csv).toContain('"\'=SUM(1,2)",fórmula\r\n');
        expect(csv.indexOf('fórmula')).toBeLessThan(csv.indexOf('coffee'));
        expect(csv).toContain('café,coffee\r\n');
        expect(csv).toContain('café,coffee house\r\n');
        expect(csv).toContain(`${longUnbrokenSource},long source\r\n`);
        assertNoBrowserErrors();
    });
});
