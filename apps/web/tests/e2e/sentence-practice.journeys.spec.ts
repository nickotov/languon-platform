// @user-flow-revision sentence-practice-web sha256:10ce631498e40ee5

import {
    expect,
    test,
    type Page,
    type Locator,
    type TestInfo,
} from '@playwright/test';

const password = 'E2e!Sentence-password-2026';
const runId = process.env.AUTH_E2E_RUN_ID!;
const apiOrigin =
    process.env.AUTH_E2E_BACKEND_ORIGIN ?? 'http://localhost:4000';
const verifiedOwners = new Set<number>();
function email(info: TestInfo, role: string) {
    return `sentence-e2e-${runId}-${info.workerIndex}-${role}@example.test`;
}
function observeErrors(page: Page, expectedBlocked?: RegExp) {
    const failures: string[] = [];
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('console', (message) => {
        if (
            message.type() === 'error' &&
            !message.text().startsWith('Failed to load resource:')
        )
            failures.push(message.text());
    });
    page.on('requestfailed', (request) => {
        if (expectedBlocked?.test(new URL(request.url()).pathname)) return;
        if (!request.failure()?.errorText.includes('ERR_ABORTED'))
            failures.push(
                `${request.method()} ${new URL(request.url()).pathname}`,
            );
    });
    page.on('response', (response) => {
        const path = new URL(response.url()).pathname;
        if (response.status() >= 500)
            failures.push(`${response.status()} ${path}`);
    });
    return () =>
        expect(
            failures,
            'unexpected browser errors or failed requests',
        ).toEqual([]);
}
async function capture(
    page: Page,
    info: TestInfo,
    name: string,
    element?: Locator,
) {
    const path = info.outputPath(`${name}.png`);
    await (element ?? page).screenshot({ path });
    await info.attach(name, { path, contentType: 'image/png' });
}
async function containedFocus(dialog: Locator) {
    await expect
        .poll(() =>
            dialog.evaluate((element) =>
                element.contains(document.activeElement),
            ),
        )
        .toBe(true);
}
async function horizontallyContained(page: Page, element: Locator) {
    const box = await element.boundingBox();
    expect(box).not.toBeNull();
    const width = await page.evaluate(() => window.innerWidth);
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
}
async function setDarkTheme(page: Page) {
    await page.getByRole('button', { name: /^Account menu,/ }).click();
    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
}
async function signup(
    page: Page,
    identity: string,
    returnTo = '/dictionaries',
) {
    // Production email-send limits permit five signups/client/hour. Reuse a
    // verified synthetic owner through real UI login; dictionary fixtures and
    // the two reader identities remain isolated. No rate-limit policy is changed.
    const worker = test.info().workerIndex;
    const owner = /-owner@example\.test$/.test(identity);
    if (owner) identity = `sentence-e2e-${runId}-${worker}-owner@example.test`;
    if (owner && verifiedOwners.has(worker)) {
        await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
        await page.getByLabel('Email').fill(identity);
        await page.getByLabel('Password', { exact: true }).fill(password);
        const loggedIn = page.waitForResponse(
            (response) =>
                response.url().endsWith('/auth/login/password') &&
                response.status() === 200,
        );
        await page
            .getByRole('button', { name: 'Sign in', exact: true })
            .click();
        const auth = (await (await loggedIn).json()) as { accessToken: string };
        await expect(page).toHaveURL(
            new RegExp(`${returnTo.replaceAll('/', '\\/')}$`),
        );
        return auth.accessToken;
    }
    await page.goto(`/signup?returnTo=${encodeURIComponent(returnTo)}`);
    await page.getByLabel('Email').fill(identity);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/verify-email\?/);
    await page.getByLabel('Verification code').fill('0000');
    const verified = page.waitForResponse(
        (response) =>
            response.url().endsWith('/auth/email-verification/verify') &&
            response.status() === 200,
    );
    await page.getByRole('button', { name: 'Verify email' }).click();
    const auth = (await (await verified).json()) as { accessToken: string };
    await expect(page).toHaveURL(
        new RegExp(`${returnTo.replaceAll('/', '\\/')}$`),
    );
    if (owner) verifiedOwners.add(worker);
    return auth.accessToken;
}
async function createDictionary(
    page: Page,
    name: string,
    vocabulary = {
        sourceLanguage: 'en',
        targetLanguage: 'es',
        source: 'book',
        translation: 'libro',
    },
) {
    await page.getByRole('button', { name: 'New dictionary' }).click();
    await page.getByLabel('Name').fill(name);
    await page
        .getByLabel('Translate from')
        .selectOption(vocabulary.sourceLanguage);
    await page
        .getByLabel('Translate to')
        .selectOption(vocabulary.targetLanguage);
    await page.getByRole('button', { name: 'Create dictionary' }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await page.getByRole('button', { name: 'Add card' }).click();
    await page.getByLabel(/^Source word or phrase \(/).fill(vocabulary.source);
    await page.getByLabel(/^Translation \(/).fill(vocabulary.translation);
    await page.getByRole('button', { name: 'Create card' }).click();
    await expect(
        page.getByText(vocabulary.source, { exact: true }),
    ).toBeVisible();
    return new URL(page.url()).pathname.split('/').at(-1)!;
}
async function startSentence(page: Page, info?: TestInfo, sourceWord = 'book') {
    await page.getByRole('button', { name: 'Train', exact: true }).click();
    await page
        .getByRole('menuitem', { name: 'Sentence practice', exact: true })
        .click();
    const setup = page.getByRole('dialog', { name: /Sentence practice/ });
    await expect(setup).toBeVisible();
    const dialogStart = setup.getByRole('button', {
        name: /Start in a dialog/,
    });
    const start = (await dialogStart.isVisible())
        ? dialogStart
        : setup.getByRole('button', { name: /Start in full screen/ });
    await expect(start).toBeEnabled();
    await containedFocus(setup);
    if (info) await capture(page, info, 'sentence-setup');
    await start.click();
    const practice = page.getByRole('dialog', { name: /Sentence practice/ });
    await expect(
        practice.getByRole('button', { name: `${sourceWord}: show hint` }),
    ).toBeVisible();
    return practice;
}
async function shareDictionary(page: Page) {
    const sharing = page.waitForResponse(
        (response) =>
            response.url().endsWith('/share-key/rotate') &&
            response.status() === 200,
    );
    await page.getByRole('button', { name: 'More dictionary actions' }).click();
    await page.getByRole('menuitem', { name: 'Sharing', exact: true }).click();
    await page.getByRole('button', { name: 'Create sharing link' }).click();
    const payload = (await (await sharing).json()) as {
        capability: { shareId: string; shareKey: string };
    };
    return payload.capability;
}

test.describe('sentence practice and model preferences', () => {
    // @user-flow sentence-practice-web/model-preference-persistence
    test('persists model preference and preserves a stale-tab draft during a real conflict', async ({
        page,
        context,
    }, info) => {
        const assertErrors = observeErrors(page);
        await signup(page, email(info, 'preference-owner'));
        await page.setViewportSize({ width: 1280, height: 1600 });
        await page.goto('/profile');
        const modelCard = page
            .getByRole('heading', { name: 'AI model', exact: true })
            .locator('..')
            .locator('..');
        const explicit = page.getByRole('radio', { name: /^DeepSeek/ }).first();
        await expect(explicit).toBeEnabled();
        await page
            .getByRole('group', { name: 'Model for new requests' })
            .scrollIntoViewIfNeeded();
        await capture(page, info, 'profile-model-auto', modelCard);
        const other = await context.newPage();
        await other.setViewportSize({ width: 1280, height: 1600 });
        await other.goto('/profile');
        await expect(other.getByRole('radio', { name: /^Auto/ })).toBeChecked();
        await explicit.check();
        await page.getByRole('button', { name: /Save preference/ }).click();
        await expect(page.getByText(/Preference saved/)).toBeVisible();
        await capture(page, info, 'profile-model-saved', modelCard);
        await other
            .getByRole('radio', { name: /^DeepSeek/ })
            .first()
            .check();
        const conflict = other.waitForResponse(
            (response) =>
                response.url().endsWith('/users/me/ai-model-preference') &&
                response.status() === 409,
        );
        await other.getByRole('button', { name: /Save preference/ }).click();
        await conflict;
        await expect(
            other.getByRole('radio', { name: /^DeepSeek/ }).first(),
        ).toBeChecked();
        await expect(
            other.getByText(/Your saved preference changed/),
        ).toBeVisible();
        await capture(
            other,
            info,
            'profile-model-conflict',
            other
                .getByRole('heading', { name: 'AI model', exact: true })
                .locator('..')
                .locator('..'),
        );
        await other.getByRole('button', { name: /Use latest/ }).click();
        await page.reload();
        await expect(
            page.getByRole('radio', { name: /^DeepSeek/ }).first(),
        ).toBeChecked();
        await setDarkTheme(page);
        await capture(page, info, 'profile-model-dark', modelCard);
        await page.setViewportSize({ width: 390, height: 844 });
        await page
            .getByRole('heading', { name: 'AI model', exact: true })
            .scrollIntoViewIfNeeded();
        await capture(page, info, 'profile-model-mobile-dark');
        await page.getByRole('radio', { name: /^Auto/ }).check();
        await expect(page.getByRole('radio', { name: /^Auto/ })).toBeFocused();
        const saveMobile = page.getByRole('button', {
            name: 'Save preference',
            exact: true,
        });
        await saveMobile.scrollIntoViewIfNeeded();
        await expect(saveMobile).toBeEnabled();
        await expect(saveMobile).toBeInViewport();
        await capture(page, info, 'profile-model-mobile-actions-dark');
        await page
            .getByRole('button', { name: 'Cancel changes', exact: true })
            .click();
        await expect
            .poll(() =>
                page.evaluate(
                    () =>
                        document.documentElement.scrollWidth <=
                        window.innerWidth + 1,
                ),
            )
            .toBe(true);
        await other.close();
        assertErrors();
    });

    // @user-flow sentence-practice-web/owner-reader-reference-practice
    test('checks owner practice and gives a zero-credit reader a free personal saved reference', async ({
        browser,
        page,
    }, info) => {
        const assertErrors = observeErrors(page);
        const token = await signup(page, email(info, 'practice-owner'));
        const name = `Sentence practice ${runId}`;
        const dictionaryId = await createDictionary(page, name);
        await setDarkTheme(page);
        const practice = await startSentence(page, info);
        await practice.getByRole('button', { name: 'book: show hint' }).click();
        await expect(
            page.getByText('libro', { exact: true }).last(),
        ).toBeVisible();
        await page.keyboard.press('Escape');
        const draft = practice.getByLabel(/^Your translation/);
        await draft.fill('libro es útil.');
        await containedFocus(practice);
        await capture(page, info, 'sentence-dialog-draft-dark');
        await practice.getByRole('button', { name: /Fullscreen/ }).click();
        await expect(draft).toHaveValue('libro es útil.');
        await practice
            .getByRole('button', { name: /Switch to dialog/ })
            .click();
        await expect(draft).toHaveValue('libro es útil.');
        await practice.getByRole('button', { name: /Check with AI/ }).click();
        await expect(draft).toBeDisabled();
        await capture(page, info, 'sentence-check-pending-dark');
        await practice.getByRole('button', { name: /Fullscreen/ }).click();
        await expect(draft).toHaveValue('libro es útil.');
        await expect(
            practice.getByRole('region', { name: 'AI feedback' }),
        ).toBeVisible();
        await expect(practice.getByText('100%', { exact: true })).toBeVisible();
        await capture(page, info, 'sentence-fullscreen-feedback-dark');
        await practice
            .getByRole('button', { name: /Switch to dialog/ })
            .click();
        await expect(
            practice.getByRole('region', { name: 'AI feedback' }),
        ).toBeVisible();
        await expect(
            practice.getByRole('region', { name: 'Reference translation' }),
        ).not.toBeVisible();
        const ownerBase = `${apiOrigin}/learning/dictionaries/${dictionaryId}/sentences`;
        const ownerHeaders = { Authorization: `Bearer ${token}` };
        const attempts = await page.request.get(`${ownerBase}/attempts`, {
            headers: ownerHeaders,
        });
        expect(attempts.status()).toBe(200);
        expect((await attempts.json()).attempts).toHaveLength(1);
        await practice.getByRole('button', { name: /Close practice/ }).click();
        const leavePractice = page.getByRole('button', {
            name: 'Leave practice',
            exact: true,
        });
        if (await leavePractice.isVisible()) await leavePractice.click();
        await expect(practice).not.toBeVisible();
        const sharing = page.waitForResponse(
            (response) =>
                response.url().endsWith('/share-key/rotate') &&
                response.status() === 200,
        );
        await page
            .getByRole('button', { name: 'More dictionary actions' })
            .click();
        await page
            .getByRole('menuitem', { name: 'Sharing', exact: true })
            .click();
        await page.getByRole('button', { name: 'Create sharing link' }).click();
        const { capability } = (await (await sharing).json()) as {
            capability: { shareId: string; shareKey: string };
        };
        const readerContext = await browser.newContext({
            viewport: { width: 390, height: 844 },
        });
        const reader = await readerContext.newPage();
        const refreshPaths =
            /\/learning\/shared-dictionaries\/[^/]+\/sentences\/(?:attempts|reviews|prepare|progress)/;
        const assertReaderErrors = observeErrors(reader, refreshPaths);
        const readerToken = await signup(
            reader,
            email(info, 'reader-one'),
            `/shared/dictionaries/${capability.shareId}`,
        );
        await reader.goto(
            `/shared/dictionaries/${capability.shareId}#${capability.shareKey}`,
        );
        const paidRequests: string[] = [];
        reader.on('request', (request) => {
            if (
                request.method() === 'POST' &&
                /\/sentences\/(next|exercises\/[^/]+\/checks)$/.test(
                    new URL(request.url()).pathname,
                )
            )
                paidRequests.push(new URL(request.url()).pathname);
        });
        const savedNext = reader.waitForResponse(
            (response) =>
                response.url().endsWith('/sentences/next') &&
                response.status() === 200,
        );
        const readerPractice = await startSentence(reader);
        expect((await (await savedNext).json()).kind).toBe('exercise');
        const readerDraft = readerPractice.getByLabel(/^Your translation/);
        const overLimit = '書'.repeat(4001);
        await readerDraft.fill(overLimit);
        await expect(readerDraft).toHaveValue(overLimit);
        await expect(
            readerPractice.getByText('4001 / 4000', { exact: true }),
        ).toBeVisible();
        await expect(
            readerPractice.getByRole('button', { name: /Check with AI/ }),
        ).toBeDisabled();
        await capture(reader, info, 'sentence-over-limit-draft');
        await readerDraft.fill('libro es útil.');
        const deniedCheck = reader.waitForResponse(
            (response) =>
                response.url().endsWith('/checks') && response.status() === 402,
        );
        await readerPractice
            .getByRole('button', { name: /Check with AI/ })
            .click();
        expect((await (await deniedCheck).json()).error.code).toBe(
            'ai_credits_exhausted',
        );
        await expect(
            readerPractice.getByRole('region', {
                name: 'Reference translation',
            }),
        ).not.toBeVisible();
        await capture(reader, info, 'sentence-zero-credit-check-denied');
        await readerPractice
            .getByRole('button', { name: /Close practice/ })
            .click();
        const draftGuard = reader.getByRole('dialog', {
            name: 'Leave practice?',
        });
        await expect(draftGuard).toBeVisible();
        await capture(reader, info, 'sentence-failed-check-close-guard');
        await draftGuard
            .getByRole('button', { name: 'Keep practising', exact: true })
            .click();
        await expect(readerDraft).toHaveValue('libro es útil.');

        const reveal = reader.waitForResponse(
            (response) =>
                response.url().endsWith('/reference-answer') &&
                response.status() === 200,
        );
        await readerPractice
            .getByRole('button', { name: /Show reference/ })
            .click();
        const reference = (await (await reveal).json()) as {
            review: { id: string; referenceTranslation: string };
        };
        await expect(
            readerPractice.getByRole('region', {
                name: 'Reference translation',
            }),
        ).toContainText(reference.review.referenceTranslation);
        await expect(
            readerPractice.getByText(/Manually reviewed/),
        ).toBeVisible();
        await expect(
            readerPractice.getByRole('region', { name: 'AI feedback' }),
        ).not.toBeVisible();
        // The only check was explicitly rejected before admission; revealing a reference never retries paid work.
        expect(
            paidRequests.filter((path) => path.endsWith('/checks')),
        ).toHaveLength(1);
        const sharedBase = `${apiOrigin}/learning/shared-dictionaries/${capability.shareId}/sentences`;
        const readerHeaders = {
            Authorization: `Bearer ${readerToken}`,
            'X-Languon-Share-Key': capability.shareKey,
        };
        const readerAttempts = await reader.request.get(
            `${sharedBase}/attempts`,
            { headers: readerHeaders },
        );
        expect(readerAttempts.status()).toBe(200);
        expect((await readerAttempts.json()).attempts).toEqual([]);
        const progress = await reader.request.get(
            `${sharedBase}/progress?direction=source-to-target`,
            { headers: readerHeaders },
        );
        expect(await progress.json()).toMatchObject({
            manualReviewCount: 1,
            completedCheckCount: 0,
            usedCount: 1,
        });
        const ownerReviews = await page.request.get(`${ownerBase}/reviews`, {
            headers: ownerHeaders,
        });
        expect((await ownerReviews.json()).reviews).toEqual([]);
        await test.step('narrow viewport keeps reference and controls visible', async () => {
            await readerPractice
                .getByRole('region', { name: 'Reference translation' })
                .scrollIntoViewIfNeeded();
            await expect(
                readerPractice.getByRole('button', { name: /Next sentence/ }),
            ).toBeInViewport();
            await reader.screenshot({
                path: info.outputPath('sentence-mobile-reference.png'),
            });
            await expect
                .poll(() =>
                    reader.evaluate(
                        () =>
                            document.documentElement.scrollWidth <=
                            window.innerWidth + 1,
                    ),
                )
                .toBe(true);
            await info.attach('sentence-mobile-reference', {
                path: info.outputPath('sentence-mobile-reference.png'),
                contentType: 'image/png',
            });
        });
        await readerPractice
            .getByRole('button', { name: 'History', exact: true })
            .click();
        const history = reader.getByRole('dialog', {
            name: 'My practice history',
        });
        await history
            .getByRole('button', { name: 'Manual reviews', exact: true })
            .click();
        await expect(
            history.getByText('book is useful.', { exact: true }),
        ).toBeVisible();
        await history.getByText('View details', { exact: true }).click();
        await expect(
            history.getByRole('region', { name: 'Reference translation' }),
        ).toContainText(reference.review.referenceTranslation);
        await containedFocus(history);
        await history
            .getByRole('region', { name: 'Reference translation' })
            .scrollIntoViewIfNeeded();
        await capture(reader, info, 'sentence-mobile-history');
        await history
            .getByRole('button', { name: 'Close dialog', exact: true })
            .click();
        await reader.route(
            /\/learning\/shared-dictionaries\/[^/]+\/sentences\/(?:attempts|reviews|prepare|progress)/,
            (route) => route.abort('failed'),
        );
        const dictionary = await page.request.get(
            `${apiOrigin}/dictionaries/${dictionaryId}`,
            { headers: ownerHeaders },
        );
        const live = (await dictionary.json()) as {
            dictionary: { version: number };
        };
        const rotate = await page.request.post(
            `${apiOrigin}/dictionaries/${dictionaryId}/share-key/rotate`,
            {
                headers: {
                    ...ownerHeaders,
                    Origin:
                        process.env.AUTH_E2E_WEB_ORIGIN ??
                        'http://localhost:3333',
                },
                data: { expectedDictionaryVersion: live.dictionary.version },
            },
        );
        expect(rotate.status()).toBe(200);
        const revoked = reader.waitForResponse(
            (response) =>
                response.url().endsWith('/sentences/next') &&
                response.status() === 404,
        );
        await readerPractice
            .getByRole('button', { name: /Next sentence/ })
            .click();
        await revoked;
        await expect(
            readerPractice.getByRole('region', {
                name: 'Reference translation',
            }),
        ).not.toBeVisible();
        await expect(
            readerPractice.getByLabel(/^Your translation/),
        ).not.toBeVisible();
        await expect(
            reader.getByText('book is useful.', { exact: true }),
        ).not.toBeVisible();
        await expect(
            reader.getByRole('button', { name: 'History', exact: true }),
        ).not.toBeVisible();
        await expect(
            reader.getByRole('dialog', { name: 'My practice history' }),
        ).not.toBeVisible();
        await capture(reader, info, 'sentence-access-loss-no-cached-content');
        assertReaderErrors();
        await readerContext.close();
        assertErrors();
    });
});

// @user-flow sentence-practice-web/anonymous-share-sign-in-continuation
test('retains a shared capability through the sentence sign-in entrypoint', async ({
    browser,
    page,
}, info) => {
    const assertErrors = observeErrors(page);
    await signup(page, email(info, 'continuation-owner'));
    await createDictionary(page, `Shared continuation ${runId}`);
    const ownerPractice = await startSentence(page);
    await ownerPractice.getByRole('button', { name: /Close practice/ }).click();
    const capability = await shareDictionary(page);
    const provision = await browser.newContext();
    const provisionPage = await provision.newPage();
    const identity = email(info, 'reader-continuation');
    await signup(provisionPage, identity);
    await provision.close();
    const anonymous = await browser.newContext();
    const reader = await anonymous.newPage();
    const assertReaderErrors = observeErrors(reader);
    await reader.goto(
        `/shared/dictionaries/${capability.shareId}#${capability.shareKey}`,
    );
    await reader.getByRole('button', { name: 'Train', exact: true }).click();
    await reader
        .getByRole('menuitem', { name: 'Sentence practice', exact: true })
        .click();
    const signInPrompt = reader.getByRole('dialog', {
        name: 'Sign in to practise sentences',
    });
    await expect(signInPrompt).toBeVisible();
    await signInPrompt
        .getByRole('link', { name: 'Sign in', exact: true })
        .click();
    await expect(reader).toHaveURL(/\/login\?/);
    // Boolean comparisons avoid printing the capability in assertion diagnostics.
    expect(new URL(reader.url()).hash.slice(1) === capability.shareKey).toBe(
        true,
    );
    await reader.getByLabel('Email').fill(identity);
    await reader.getByLabel('Password', { exact: true }).fill(password);
    await reader.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(reader).toHaveURL(
        new RegExp(`/shared/dictionaries/${capability.shareId}`),
    );
    expect(new URL(reader.url()).hash.slice(1) === capability.shareKey).toBe(
        true,
    );
    const practice = await startSentence(reader);
    await expect(
        practice.getByRole('button', { name: 'book: show hint' }),
    ).toBeVisible();
    await capture(reader, info, 'sentence-signed-in-share-continuation');
    assertReaderErrors();
    await anonymous.close();
    assertErrors();
});

// @user-flow sentence-practice-web/cancellation-requested
test('shows stopping while a real running generation is being cancelled', async ({
    page,
}, info) => {
    const assertErrors = observeErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signup(page, email(info, 'cancel-owner'));
    await createDictionary(page, `Cancel sentence ${runId}`, {
        sourceLanguage: 'en',
        targetLanguage: 'es',
        source: 'slowbook',
        translation: 'libro',
    });
    await page.getByRole('button', { name: 'Train', exact: true }).click();
    await page
        .getByRole('menuitem', { name: 'Sentence practice', exact: true })
        .click();
    const setup = page.getByRole('dialog', { name: 'Sentence practice' });
    const running = page.waitForResponse(
        async (response) =>
            response.url().includes('/sentences/jobs/') &&
            response.status() === 200 &&
            ((await response.json()) as { state: string }).state === 'running',
    );
    await setup
        .getByRole('button', { name: 'Start in a dialog', exact: true })
        .click();
    await running;
    const practice = page.getByRole('dialog', { name: 'Sentence practice' });
    await expect(
        practice.getByText('AI task running', { exact: true }),
    ).toBeVisible();
    await expect
        .poll(() =>
            practice.evaluate(
                (element) =>
                    element
                        .getAnimations({ subtree: true })
                        .filter(
                            (animation) => animation.playState === 'running',
                        ).length,
            ),
        )
        .toBe(0);
    const cancelling = page.waitForResponse(
        (response) =>
            response.url().endsWith('/cancel') && response.status() === 200,
    );
    await practice
        .getByRole('button', { name: 'Cancel task', exact: true })
        .click();
    expect((await (await cancelling).json()).cancellationRequested).toBe(true);
    await expect(
        practice.getByRole('button', { name: 'Stopping…', exact: true }),
    ).toBeDisabled();
    await capture(page, info, 'sentence-cancellation-requested-reduced-motion');
    await expect(
        practice.getByText(/Task cancelled\. Credits depend/),
    ).toBeVisible();
    await expect(
        practice.getByRole('button', { name: 'slowbook: show hint' }),
    ).not.toBeVisible();
    assertErrors();
});

// @user-flow sentence-practice-web/rtl-non-latin-accessibility
test('renders RTL and Japanese content with reduced motion, zoom viewport and compact sheets', async ({
    page,
}, info) => {
    const assertErrors = observeErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signup(page, email(info, 'rtl-owner'));
    await createDictionary(page, `Arabic Japanese ${runId}`, {
        sourceLanguage: 'ar',
        targetLanguage: 'ja',
        source: 'كتاب',
        translation: '本',
    });
    const practice = await startSentence(page, undefined, 'كتاب');
    const source = practice
        .getByRole('button', { name: 'كتاب: show hint' })
        .locator('xpath=ancestor::p[1]');
    await expect(source).toHaveAttribute('dir', 'rtl');
    await expect(source).toHaveAttribute('lang', 'ar');
    await practice.getByRole('button', { name: 'كتاب: show hint' }).click();
    await expect(page.getByText('本', { exact: true }).last()).toBeVisible();
    await page.keyboard.press('Escape');
    const answer = practice.getByLabel(/^Your translation/);
    await expect(answer).toHaveAttribute('lang', 'ja');
    await expect(answer).toHaveAttribute('dir', 'ltr');
    await answer.fill('本は役に立ちます。');
    // Halving the CSS viewport models the layout pressure of 200% desktop
    // browser zoom. This is a viewport simulation, not browser UI zoom.
    const originalViewport = page.viewportSize()!;
    await page.setViewportSize({
        width: Math.floor(originalViewport.width / 2),
        height: Math.floor(originalViewport.height / 2),
    });
    await expect(
        practice.getByRole('button', { name: /Check with AI/ }),
    ).toBeInViewport();
    await expect(answer).toHaveValue('本は役に立ちます。');
    await horizontallyContained(page, source);
    await horizontallyContained(page, answer);
    await horizontallyContained(
        page,
        practice.getByRole('button', { name: /Check with AI/ }),
    );
    await horizontallyContained(
        page,
        practice.getByRole('button', { name: /Show reference answer/ }),
    );
    await capture(
        page,
        info,
        'sentence-rtl-japanese-200-percent-viewport-simulation',
    );
    await page.setViewportSize(originalViewport);
    await practice
        .getByRole('button', { name: /Show reference answer/ })
        .click();
    await expect(
        practice.getByRole('region', { name: 'Reference translation' }),
    ).toContainText('本は役に立ちます。');
    await page.setViewportSize({ width: 390, height: 844 });
    await practice
        .getByRole('button', { name: 'Summary', exact: true })
        .click();
    const summary = page.getByRole('dialog', { name: 'Session summary' });
    await containedFocus(summary);
    await expect
        .poll(async () => {
            const box = await summary.boundingBox();
            return Math.abs((box?.y ?? 0) + (box?.height ?? 0) - 844);
        })
        .toBeLessThanOrEqual(2);
    await capture(page, info, 'sentence-compact-summary-sheet');
    await summary
        .getByRole('button', { name: 'Keep practising', exact: true })
        .click();
    await practice
        .getByRole('button', { name: 'History', exact: true })
        .click();
    const history = page.getByRole('dialog', { name: 'My practice history' });
    await history
        .getByRole('button', { name: 'Manual reviews', exact: true })
        .click();
    await expect(
        history.getByText('كتاب مفيد.', { exact: true }),
    ).toHaveAttribute('dir', 'rtl');
    await containedFocus(history);
    await expect
        .poll(async () => {
            const box = await history.boundingBox();
            return Math.abs((box?.y ?? 0) + (box?.height ?? 0) - 844);
        })
        .toBeLessThanOrEqual(2);
    await capture(page, info, 'sentence-compact-rtl-history-sheet');
    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    document.documentElement.scrollWidth <=
                    window.innerWidth + 1,
            ),
        )
        .toBe(true);
    await history
        .getByRole('button', { name: 'Close dialog', exact: true })
        .click();
    await answer.focus();
    await page.setViewportSize({ width: 393, height: 430 });
    await expect(answer).toHaveValue('本は役に立ちます。');
    await expect(
        practice.getByRole('button', { name: /Check (with AI|new answer)/ }),
    ).toBeInViewport();
    await expect(
        practice.getByRole('button', { name: /Show reference answer/ }),
    ).toBeInViewport();
    await expect(
        practice.getByRole('button', { name: 'Next sentence', exact: true }),
    ).toBeInViewport();
    await capture(page, info, 'sentence-keyboard-viewport-simulation');
    assertErrors();
});

// @user-flow sentence-practice-web/model-preference-back-fallback
test('keeps dirty model preferences across Back without the Navigation API', async ({
    page,
}, info) => {
    await page.addInitScript(() => {
        Object.defineProperty(window, 'navigation', {
            value: undefined,
            configurable: true,
        });
    });
    const assertErrors = observeErrors(page);
    await signup(page, email(info, 'back-owner'));
    await page.getByRole('button', { name: /^Account menu,/ }).click();
    await page.getByRole('link', { name: 'Profile', exact: true }).click();
    await expect(page).toHaveURL(/\/profile$/);
    const automatic = page.getByRole('radio', { name: /^Auto/ });
    await expect(
        page.getByText('Saved preference', { exact: true }),
    ).toBeVisible();
    await expect(automatic).toBeEnabled();
    if (!(await automatic.isChecked())) {
        await automatic.check();
        await page
            .getByRole('button', { name: 'Save preference', exact: true })
            .click();
        await expect(page.getByText(/Preference saved/)).toBeVisible();
    }
    const explicit = page.getByRole('radio', { name: /^DeepSeek/ }).first();
    const length = await page.evaluate(() => history.length);
    await explicit.check();
    // Immediate traversal must not race passive dirty-state propagation.
    await page.evaluate(() => history.back());
    const guard = page.getByRole('alertdialog', {
        name: 'Discard unsaved model preference?',
    });
    await expect(guard).toBeVisible();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(explicit).toBeChecked();
    await capture(page, info, 'profile-back-fallback-keep-draft');
    await guard
        .getByRole('button', { name: 'Keep editing', exact: true })
        .click();
    await expect(guard).not.toBeVisible();
    await expect(page).toHaveURL(/\/profile$/);
    await page.evaluate(() => history.back());
    await expect(guard).toBeVisible();
    await guard
        .getByRole('button', { name: 'Discard changes', exact: true })
        .click();
    await expect(page).toHaveURL(/\/dictionaries$/);
    await page.evaluate(() => history.forward());
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole('radio', { name: /^Auto/ })).toBeChecked();
    expect(await page.evaluate(() => history.length)).toBe(length);
    assertErrors();
});
