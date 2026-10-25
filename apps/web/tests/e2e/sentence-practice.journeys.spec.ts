// @user-flow-revision shared-pronunciation-playback sha256:9803b0d1d5f5c89e
// @user-flow-revision sentence-practice-web sha256:30e6921701e3a8f5

import { speechCreditFixture } from './support/speech-credit-fixture';

import {
    expect,
    test,
    type Page,
    type Locator,
    type TestInfo,
} from '@playwright/test';

import {
    installSpeechAudioProbe,
    playSpeechControl,
} from './support/speech-browser-audio';

const password = 'E2e!Sentence-password-2026';
const runId = process.env.AUTH_E2E_RUN_ID!;
const apiOrigin =
    process.env.AUTH_E2E_BACKEND_ORIGIN ?? 'http://localhost:4000';
const verifiedOwners = new Set<number>();
const ownerActorIds = new Map<number, string>();
function email(info: TestInfo, role: string) {
    return `sentence-e2e-${runId}-${info.workerIndex}-${role}@example.test`;
}
function observeErrors(
    page: Page,
    expectedBlocked?: RegExp | ((path: string) => boolean),
) {
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
        const path = new URL(request.url()).pathname.replace(
            /^\/api(?=\/)/,
            '',
        );
        if (
            typeof expectedBlocked === 'function'
                ? expectedBlocked(path)
                : expectedBlocked?.test(path)
        )
            return;
        if (!request.failure()?.errorText.includes('ERR_ABORTED'))
            failures.push(
                `${request.method()} ${new URL(request.url()).pathname.replace(/^\/api(?=\/)/, '')}`,
            );
    });
    page.on('response', (response) => {
        const path = new URL(response.url()).pathname.replace(
            /^\/api(?=\/)/,
            '',
        );
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
async function waitForRetryableReady(
    ready: () => Promise<void>,
    retry: Locator,
) {
    for (let recovery = 0; recovery < 2; recovery++) {
        const needsRetry = await Promise.race([
            ready().then(() => false),
            retry.waitFor({ state: 'visible' }).then(() => true),
        ]);
        if (!needsRetry) return;
        await expect(retry).toBeEnabled({ timeout: 70_000 });
        await retry.click();
    }
    await ready();
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
    const { AuthenticationSuccessResponseSchema } =
        await import('@languon/contracts');
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
        const auth = AuthenticationSuccessResponseSchema.parse(
            await (await loggedIn).json(),
        );
        if (owner) ownerActorIds.set(worker, auth.user.id);
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
    const auth = AuthenticationSuccessResponseSchema.parse(
        await (await verified).json(),
    );
    if (owner) ownerActorIds.set(worker, auth.user.id);
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
    await page
        .getByRole('main')
        .getByRole('button', { name: 'New dictionary', exact: true })
        .click();
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
    await page.getByLabel(/^Source word or phrase/).fill(vocabulary.source);
    await page.getByLabel(/^Translation/).fill(vocabulary.translation);
    await page.getByRole('button', { name: 'Create card' }).click();
    await expect(
        page.getByText(vocabulary.source, { exact: true }),
    ).toBeVisible();
    return new URL(page.url()).pathname.split('/').at(-1)!;
}
async function startSentence(
    page: Page,
    info?: TestInfo,
    sourceWord = 'book',
    options: {
        direction?: 'source-to-target' | 'target-to-source';
        mode?: 'saved-first' | 'new-only';
        repeat?: boolean;
    } = {},
) {
    await page.getByRole('button', { name: 'Train', exact: true }).click();
    await page
        .getByRole('menuitem', { name: 'Sentence practice', exact: true })
        .click();
    const setup = page.getByRole('dialog', { name: /Sentence practice/ });
    await expect(setup).toBeVisible();
    await expect(
        setup.getByText(
            'Each round uses up to 100 words. A dictionary batch uses the first eligible words. Choose entries to practise other words.',
            { exact: true },
        ),
    ).toBeVisible();
    if (info) await capture(page, info, 'sentence-batch-guidance');
    if (!options.repeat) {
        await expect(
            setup.locator('input[value="target-to-source"]'),
        ).toBeChecked();
    }
    await setup
        .locator(`input[value="${options.direction ?? 'source-to-target'}"]`)
        .check();
    if (options.mode)
        await setup.locator(`input[value="${options.mode}"]`).check();
    const dialogStart = setup.getByRole('button', {
        name: /Start in a dialog/,
    });
    const start = (await dialogStart.isVisible())
        ? dialogStart
        : setup.getByRole('button', { name: /Start in full screen/ });
    const retry = setup.getByRole('button', { name: /^Try again/ });
    await waitForRetryableReady(
        () => expect(start).toBeEnabled({ timeout: 70_000 }),
        retry,
    );
    await containedFocus(setup);
    if (info) await capture(page, info, 'sentence-setup');
    await start.click();
    const practice = page.getByRole('dialog', { name: /Sentence practice/ });
    const requiredHint = practice.getByRole('button', {
        name: `${sourceWord}: show hint · Required word`,
    });
    await waitForRetryableReady(
        () => requiredHint.waitFor({ state: 'visible', timeout: 70_000 }),
        retry,
    );
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
    test('unavailable provider model keeps the answer and opens AI preferences', async ({
        page,
    }, info) => {
        const assertErrors = observeErrors(page);
        await signup(page, email(info, 'unavailable-owner'));
        await createDictionary(page, `Unavailable sentence model ${runId}`);
        const practice = await startSentence(page);
        const draft = practice.getByLabel(/^Your translation/);
        const answer = '[fixture-model-unavailable]';
        await draft.fill(answer);
        await practice.getByRole('button', { name: /Check with AI/ }).click();
        await expect(
            practice.getByText(
                'Your selected AI model is unavailable. Choose another model or continue with saved reference answers.',
                { exact: true },
            ),
        ).toBeVisible();
        await expect(draft).toHaveValue(answer);
        await expect(draft).toBeEnabled();
        await capture(page, info, 'sentence-model-unavailable');
        await practice
            .getByRole('button', { name: 'AI preferences', exact: true })
            .click();
        const preferences = page.getByRole('dialog', { name: 'AI settings' });
        await expect(
            preferences.getByRole('group', { name: 'Model for new requests' }),
        ).toBeVisible();
        await preferences
            .getByRole('button', { name: 'Back to practice' })
            .click();
        await expect(draft).toHaveValue(answer);
        assertErrors();
    });

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
    // @user-flow shared-pronunciation-playback/sentence-surfaces-playback
    test('checks owner practice and gives a zero-credit reader a free personal saved reference', async ({
        browser,
        page,
    }, info) => {
        test.setTimeout(120_000);
        const assertErrors = observeErrors(page);
        await installSpeechAudioProbe(page.context());
        const token = await signup(page, email(info, 'practice-owner'));
        const ownerActorId = ownerActorIds.get(info.workerIndex);
        if (!ownerActorId) throw new Error('Missing verified synthetic owner');
        await speechCreditFixture(ownerActorId, 'setup-provider');
        const name = `Sentence practice ${runId}`;
        const dictionaryId = await createDictionary(page, name);
        await setDarkTheme(page);
        const practice = await startSentence(page, info);
        await expect(
            practice.getByRole('button', {
                name: 'Play pronunciation',
                exact: true,
            }),
        ).toHaveCount(1);
        await playSpeechControl(
            page,
            practice.getByRole('button', {
                name: 'Play pronunciation',
                exact: true,
            }),
            'sentence-practice',
        );
        const requiredHint = practice.getByRole('button', {
            name: 'book: show hint · Required word',
        });
        const contextualHint = practice.getByRole('button', {
            name: 'is useful.: show hint · Extra help',
        });
        await expect(requiredHint).toHaveCSS(
            'text-decoration-thickness',
            '2px',
        );
        await expect(requiredHint).toHaveCSS('text-decoration-style', 'solid');
        await expect(contextualHint).toHaveCSS(
            'text-decoration-style',
            'dashed',
        );
        await requiredHint.click();
        await expect(
            page.getByText('libro', { exact: true }).last(),
        ).toBeVisible();
        await page.keyboard.press('Escape');
        await contextualHint.hover();
        await page.waitForTimeout(350);
        const contextualPopover = page.getByRole('dialog', {
            name: 'Hint: is useful.',
        });
        await expect(contextualPopover).toContainText('Extra help');
        await expect(contextualPopover).toContainText(
            'Hints are free and never lower your score.',
        );
        await capture(page, info, 'sentence-contextual-hover-hint');
        await page.keyboard.press('Escape');
        await expect(contextualHint).toBeFocused();
        await requiredHint.focus();
        await page.keyboard.press('Enter');
        await expect(
            page.getByRole('dialog', { name: 'Hint: book' }),
        ).toContainText('Required word');
        await page.keyboard.press('Escape');
        await expect(requiredHint).toBeFocused();
        const draft = practice.getByLabel(/^Your translation/);
        await draft.fill('libro es útil.');
        await expect(
            practice.getByRole('button', { name: /Close practice/ }),
        ).toBeInViewport();
        const bounds = await practice.boundingBox();
        expect(bounds?.x).toBe(0);
        expect(bounds?.y).toBe(0);
        expect(bounds?.width).toBe(page.viewportSize()!.width);
        expect(bounds?.height).toBe(page.viewportSize()!.height);
        const preferenceButtons = practice.getByRole('button', {
            name: 'AI settings',
            exact: true,
        });
        await expect(preferenceButtons).toHaveCount(1);
        await preferenceButtons.click();
        await expect(page.locator('dialog[open]')).toHaveCount(1);
        const preferences = page.getByRole('dialog', {
            name: 'AI settings',
        });
        await expect(
            preferences.getByRole('heading', {
                name: 'AI settings',
                exact: true,
                level: 2,
            }),
        ).toBeVisible();
        await capture(page, info, 'sentence-inline-ai-preferences');
        const desktopViewport = page.viewportSize()!;
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(
            preferences.getByRole('button', { name: /Close practice/ }),
        ).toBeInViewport();
        await expect(
            preferences.getByRole('button', { name: 'Back to practice' }),
        ).toBeVisible();
        await capture(page, info, 'sentence-inline-ai-preferences-mobile');
        const auto = preferences.getByRole('radio', { name: /^Auto/ });
        const explicit = preferences
            .getByRole('radio', { name: /^DeepSeek/ })
            .first();
        await expect(
            preferences.getByText('Saved preference', { exact: true }),
        ).toBeVisible();
        if (await auto.isChecked()) await explicit.check();
        else await auto.check();
        await preferences
            .getByRole('button', { name: 'Back to practice' })
            .click();
        const dirtyChoice = page.getByRole('dialog', {
            name: 'Discard your unsaved model choice?',
        });
        await expect(dirtyChoice).toBeVisible();
        await dirtyChoice.getByRole('button', { name: 'Keep editing' }).click();
        await expect(
            preferences.getByRole('heading', {
                name: 'AI settings',
                exact: true,
                level: 2,
            }),
        ).toBeVisible();
        await preferences
            .getByRole('button', { name: 'Back to practice' })
            .click();
        await dirtyChoice
            .getByRole('button', { name: 'Discard changes' })
            .click();
        await expect(draft).toBeVisible();
        await expect(draft).toHaveValue('libro es útil.');
        await page.setViewportSize(desktopViewport);
        await expect(preferenceButtons).toHaveCount(1);
        await preferenceButtons.click();
        await expect(
            preferences.getByText('Saved preference', { exact: true }),
        ).toBeVisible();
        if (await auto.isChecked()) await explicit.check();
        else await auto.check();
        await preferences
            .getByRole('button', { name: 'Close practice', exact: true })
            .click();
        await expect(dirtyChoice).toBeVisible();
        await dirtyChoice.getByRole('button', { name: 'Keep editing' }).click();
        await expect(
            preferences.getByRole('button', { name: 'Back to practice' }),
        ).toBeInViewport();
        await preferences
            .getByRole('button', { name: 'Close practice', exact: true })
            .click();
        await dirtyChoice
            .getByRole('button', { name: 'Discard changes' })
            .click();
        const closeGuard = page.getByRole('dialog', {
            name: 'Leave practice?',
        });
        await expect(closeGuard).toBeVisible();
        await closeGuard
            .getByRole('button', { name: 'Keep practising' })
            .click();
        await expect(draft).toHaveValue('libro es útil.');
        await containedFocus(practice);
        await capture(page, info, 'sentence-dialog-draft-dark');
        await practice
            .getByRole('button', { name: /Enter full screen/ })
            .click();
        await expect(draft).toHaveValue('libro es útil.');
        await practice
            .getByRole('button', { name: /Exit full screen/ })
            .click();
        await expect(draft).toHaveValue('libro es útil.');
        await practice.getByRole('button', { name: /Check with AI/ }).click();
        await expect(draft).toBeDisabled();
        await expect(practice.getByText(/^Checking your answer/)).toBeVisible();
        await capture(page, info, 'sentence-check-pending-dark');
        await practice
            .getByRole('button', { name: /Enter full screen/ })
            .click();
        await expect(draft).toHaveValue('libro es útil.');
        await expect(
            practice.getByRole('region', { name: 'AI feedback' }),
        ).toBeVisible();
        await expect(practice.getByText('100%', { exact: true })).toBeVisible();
        await capture(page, info, 'sentence-fullscreen-feedback-dark');
        await practice
            .getByRole('button', { name: /Exit full screen/ })
            .click();
        await expect(
            practice.getByRole('region', { name: 'AI feedback' }),
        ).toBeVisible();
        await expect(
            practice.getByRole('region', { name: 'Reference translation' }),
        ).not.toBeVisible();
        await playSpeechControl(
            page,
            practice
                .getByRole('region', { name: 'AI feedback' })
                .getByRole('button', {
                    name: 'Play pronunciation',
                    exact: true,
                }),
            'checked-answer',
        );
        await practice
            .getByRole('button', { name: 'My practice history', exact: true })
            .click();
        const ownerHistory = page.getByRole('dialog', {
            name: 'My practice history',
            exact: true,
        });
        await ownerHistory
            .getByRole('button', { name: 'AI checks', exact: true })
            .click();
        await ownerHistory
            .locator('summary')
            .filter({ hasText: 'View details' })
            .click();
        await playSpeechControl(
            page,
            ownerHistory
                .getByRole('region', { name: 'AI feedback' })
                .getByRole('button', {
                    name: 'Play pronunciation',
                    exact: true,
                }),
            'checked-answer',
        );
        await ownerHistory
            .getByRole('button', { name: 'Back to practice', exact: true })
            .click();
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
        await installSpeechAudioProbe(readerContext);
        const reader = await readerContext.newPage();
        const refreshPaths =
            /\/learning\/shared-dictionaries\/[^/]+\/sentences\/(?:attempts|reviews|prepare|progress)/;
        const assertReaderErrors = observeErrors(reader, refreshPaths);
        const readerToken = await signup(
            reader,
            email(info, 'reader-one'),
            `/shared/dictionaries/${capability.shareId}`,
        );
        let readerAuthorization = `Bearer ${readerToken}`;
        reader.on('request', (request) => {
            const requestUrl = new URL(request.url());
            const sameOriginApi =
                requestUrl.origin === new URL(reader.url()).origin &&
                requestUrl.pathname.startsWith('/api/');
            if (requestUrl.origin !== apiOrigin && !sameOriginApi) return;
            const authorization = request.headers()['authorization'];
            if (authorization) readerAuthorization = authorization;
        });
        await reader.goto(
            `/shared/dictionaries/${capability.shareId}#${capability.shareKey}`,
        );
        const sharedActions = reader.getByRole('button', {
            name: 'More dictionary actions',
            exact: true,
        });
        await sharedActions.click();
        await expect(reader.getByRole('menuitem')).toHaveText([
            'Sentences',
            'My practice history',
        ]);
        await expect(
            reader
                .getByRole('menuitem', { name: 'Sentences', exact: true })
                .locator('svg'),
        ).toHaveCount(1);
        await horizontallyContained(reader, reader.getByRole('menu'));
        await capture(reader, info, 'shared-secondary-actions-mobile');
        await reader
            .getByRole('menuitem', { name: 'Sentences', exact: true })
            .click();
        await expect(reader).toHaveURL(
            new RegExp(`/shared/dictionaries/${capability.shareId}/sentences#`),
        );
        expect(new URL(reader.url()).hash.length).toBeGreaterThan(1);
        await expect(
            reader.getByRole('heading', {
                name: 'Saved sentences',
                exact: true,
            }),
        ).toBeVisible();
        await reader
            .getByRole('button', { name: /Filters/, exact: false })
            .click();
        const sharedFilters = reader.getByRole('dialog', {
            name: 'Filters',
            exact: true,
        });
        await sharedFilters
            .getByLabel('Translation direction', { exact: true })
            .selectOption('source-to-target');
        await sharedFilters
            .getByRole('button', { name: 'Close', exact: true })
            .click();
        await expect(
            reader.getByText('book is useful.', { exact: true }),
        ).toBeVisible();
        await capture(reader, info, 'shared-sentence-library-mobile');
        await reader.setViewportSize({ width: 1280, height: 720 });
        await reader.getByRole('button', { name: 'View', exact: true }).click();
        const preview = reader.getByRole('dialog', {
            name: 'Sentence preview',
            exact: true,
        });
        await expect(
            preview.getByRole('button', {
                name: 'Play pronunciation',
                exact: true,
            }),
        ).toHaveCount(1);
        await playSpeechControl(
            reader,
            preview.getByRole('button', {
                name: 'Play pronunciation',
                exact: true,
            }),
            'sentence-library',
        );
        await preview
            .getByRole('button', { name: 'Example translation', exact: true })
            .click();
        await expect(
            preview.getByRole('button', {
                name: 'Play pronunciation',
                exact: true,
            }),
        ).toHaveCount(2);
        await playSpeechControl(
            reader,
            preview
                .getByRole('button', {
                    name: 'Play pronunciation',
                    exact: true,
                })
                .last(),
            'sentence-library',
        );
        await preview
            .getByRole('button', { name: 'Close', exact: true })
            .click();
        await reader.setViewportSize({ width: 390, height: 844 });

        await reader
            .getByRole('navigation', { name: 'Breadcrumb', exact: true })
            .getByRole('link', { name, exact: true })
            .click();
        await sharedActions.click();
        await reader
            .getByRole('menuitem', { name: 'My practice history', exact: true })
            .click();
        const sharedHistory = reader.getByRole('dialog', {
            name: 'My practice history',
            exact: true,
        });
        await expect(
            sharedHistory.getByRole('img', {
                name: '0 Known, 0 Practise again, 1 Unstudied of 1',
            }),
        ).toBeVisible();
        await sharedHistory
            .getByRole('tab', { name: 'Sentences', exact: true })
            .click();
        await expect(
            sharedHistory.getByText('No AI checks yet', { exact: true }),
        ).toBeVisible();
        await expect(
            sharedHistory.getByRole('region', {
                name: 'English → Spanish',
                exact: true,
            }),
        ).toBeVisible();
        await sharedHistory
            .getByRole('button', { name: 'Close dialog', exact: true })
            .click();
        await expect(sharedActions).toBeFocused();
        const paidRequests: string[] = [];
        reader.on('request', (request) => {
            if (
                request.method() === 'POST' &&
                /\/sentences\/(next|exercises\/[^/]+\/checks)$/.test(
                    new URL(request.url()).pathname.replace(/^\/api(?=\/)/, ''),
                )
            )
                paidRequests.push(
                    new URL(request.url()).pathname.replace(/^\/api(?=\/)/, ''),
                );
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
        await readerDraft.fill(' LIBRO  es útil! ');
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
        await expect(readerDraft).toHaveValue(' LIBRO  es útil! ');

        const reveal = reader.waitForResponse(
            (response) =>
                response.url().endsWith('/reference-answer') &&
                response.status() === 200,
        );
        await readerPractice
            .getByRole('button', { name: 'Compare with reference — free' })
            .click();
        const reference = (await (await reveal).json()) as {
            review: { id: string; referenceTranslation: string };
        };
        await expect(
            readerPractice.getByRole('region', { name: 'Free comparison' }),
        ).toContainText(reference.review.referenceTranslation);
        await playSpeechControl(
            reader,
            readerPractice
                .getByRole('region', { name: 'Free comparison' })
                .getByRole('button', {
                    name: 'Play pronunciation',
                    exact: true,
                }),
            'sentence-practice',
        );
        await expect(
            readerPractice.getByText(
                'Matches the saved example after normalization.',
                { exact: true },
            ),
        ).toBeVisible();
        await expect(
            readerPractice.getByText('Manually reviewed · No AI score', {
                exact: true,
            }),
        ).toBeVisible();
        // The only check was explicitly rejected before admission; free comparison never retries paid work.
        expect(
            paidRequests.filter((path) => path.endsWith('/checks')),
        ).toHaveLength(1);
        const sharedBase = `${apiOrigin}/learning/shared-dictionaries/${capability.shareId}/sentences`;
        const readerHeaders = {
            Authorization: readerAuthorization,
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
                .getByRole('region', { name: 'Free comparison' })
                .scrollIntoViewIfNeeded();
            const repeatExact = readerPractice.getByRole('button', {
                name: 'Repeat these exact examples',
            });
            const generateNew = readerPractice.getByRole('button', {
                name: 'Generate new examples',
            });
            await repeatExact.scrollIntoViewIfNeeded();
            await expect(repeatExact).toBeInViewport();
            await generateNew.scrollIntoViewIfNeeded();
            await expect(generateNew).toBeInViewport();
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
            .getByRole('button', { name: 'My practice history', exact: true })
            .click();
        const history = reader.getByRole('dialog', {
            name: 'My practice history',
        });
        await history
            .getByRole('button', { name: 'Manual reviews', exact: true })
            .click();
        const viewDetails = history.locator('summary').filter({
            hasText: 'View details',
        });
        await expect(viewDetails).toBeVisible();
        await viewDetails.click();
        await expect(
            history.getByRole('region', { name: 'Reference translation' }),
        ).toContainText(reference.review.referenceTranslation);
        await containedFocus(history);
        await history
            .getByRole('region', { name: 'Reference translation' })
            .scrollIntoViewIfNeeded();
        await capture(reader, info, 'sentence-mobile-history');
        await history
            .getByRole('button', { name: 'Back to practice', exact: true })
            .click();
        await reader.route(
            /\/learning\/shared-dictionaries\/[^/]+\/sentences\/(?:attempts|reviews|prepare|progress)/,
            (route) => route.abort('blockedbyclient'),
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
        await reader.unroute(
            /\/learning\/shared-dictionaries\/[^/]+\/sentences\/(?:attempts|reviews|prepare|progress)/,
        );
        const revoked = reader.waitForResponse(
            (response) =>
                response.url().endsWith('/sentences/prepare') &&
                response.status() === 404,
        );
        await readerPractice
            .getByRole('button', {
                name: 'Repeat these exact examples',
                exact: true,
            })
            .click();
        await revoked;
        await expect(
            readerPractice.getByRole('region', { name: 'Free comparison' }),
        ).not.toBeVisible();
        await expect(
            readerPractice.getByLabel(/^Your translation/),
        ).not.toBeVisible();
        await expect(
            reader.getByText('book is useful.', { exact: true }),
        ).not.toBeVisible();
        await expect(
            reader.getByRole('button', {
                name: 'My practice history',
                exact: true,
            }),
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

// @user-flow sentence-practice-web/finite-round-saved-reentry
test('finishes a five-word Russian to French round and reuses completed examples unless new examples are selected', async ({
    page,
}, info) => {
    test.setTimeout(300_000);
    const assertErrors = observeErrors(page);
    await signup(page, email(info, 'round-owner'));
    await createDictionary(page, `Finite round ${runId}`, {
        sourceLanguage: 'fr',
        targetLanguage: 'ru',
        source: 'livre',
        translation: 'книга',
    });
    for (const [source, translation] of [
        ['maison', 'дом'],
        ['travail', 'работа'],
        ['ami', 'друг'],
        ['voiture', 'машина'],
    ]) {
        await page.getByRole('button', { name: 'Add card' }).click();
        await page.getByLabel(/^Source word or phrase/).fill(source!);
        await page.getByLabel(/^Translation/).fill(translation!);
        await page.getByRole('button', { name: 'Create card' }).click();
        await expect(page.getByText(source!, { exact: true })).toBeVisible();
    }
    const admissions: {
        kind: string;
        exercise?: {
            id: string;
            sourceText: string;
            hints: { text: string }[];
        };
    }[] = [];
    const generatedExerciseIds: string[] = [];
    const exactPrepareIds: string[][] = [];
    const exactNextIds: string[] = [];
    page.on('response', async (response) => {
        if (response.url().endsWith('/sentences/next') && response.ok())
            admissions.push(await response.json());
        if (
            !/\/sentences\/jobs\/[^/]+$/.test(
                new URL(response.url()).pathname.replace(/^\/api(?=\/)/, ''),
            )
        )
            return;
        const job = (await response.json()) as {
            state?: string;
            result?: { kind?: string; exercise?: { id?: string } } | null;
        };
        if (
            job.state === 'completed' &&
            job.result?.kind === 'exercise' &&
            job.result.exercise?.id
        )
            generatedExerciseIds.push(job.result.exercise.id);
    });
    page.on('request', (request) => {
        const path = new URL(request.url()).pathname.replace(
            /^\/api(?=\/)/,
            '',
        );
        if (request.method() !== 'POST') return;
        const body = request.postDataJSON() as {
            replayExerciseIds?: string[];
            replayExerciseId?: string;
        } | null;
        if (path.endsWith('/sentences/prepare') && body?.replayExerciseIds)
            exactPrepareIds.push(body.replayExerciseIds);
        if (path.endsWith('/sentences/next') && body?.replayExerciseId)
            exactNextIds.push(body.replayExerciseId);
    });
    const ready = async (practice: Locator) => {
        // The real learner limiter covers preparation and advancement; honor its countdown.
        const nextHint = practice.getByRole('button', {
            name: /: show hint · Required word$/,
        });
        const retry = practice.getByRole('button', { name: /^Try again/ });
        await Promise.race([
            nextHint.waitFor({ state: 'visible' }),
            retry.waitFor({ state: 'visible' }),
        ]);
        if (await retry.isVisible()) {
            await expect(retry).toBeEnabled({ timeout: 70_000 });
            await retry.click();
        }
        await expect(nextHint).toBeVisible();
    };
    const begin = async (mode: 'saved-first' | 'new-only', repeat = false) => {
        await page.getByRole('button', { name: 'Train', exact: true }).click();
        await page
            .getByRole('menuitem', { name: 'Sentence practice', exact: true })
            .click();
        const setup = page.getByRole('dialog', { name: /Sentence practice/ });
        if (!repeat)
            await expect(
                setup.locator('input[value="target-to-source"]'),
            ).toBeChecked();
        await expect(
            setup.getByText(
                'Each round uses up to 100 words. A dictionary batch uses the first eligible words. Choose entries to practise other words.',
                { exact: true },
            ),
        ).toBeVisible();
        if (!repeat) await capture(page, info, 'finite-round-batch-setup');
        await setup.locator('input[value="target-to-source"]').check();
        await setup.locator(`input[value="${mode}"]`).check();
        const start = setup.getByRole('button', {
            name: 'Start in a dialog',
            exact: true,
        });
        const retry = setup.getByRole('button', { name: /^Try again/ });
        await waitForRetryableReady(
            () => expect(start).toBeEnabled({ timeout: 70_000 }),
            retry,
        );
        await start.click();
        const practice = page.getByRole('dialog', {
            name: /Sentence practice/,
        });
        await expect(practice).toBeVisible();
        await ready(practice);
        return practice;
    };
    const completeRound = async (
        practice: Locator,
        manuallyReview: boolean,
        round: string,
        close = true,
        heading = 'Round complete',
    ) => {
        const seen = new Set<string>();
        for (let index = 0; index < 5; index++) {
            const hint = practice.getByRole('button', {
                name: /: show hint · Required word$/,
            });
            const phrase = await hint.getAttribute('aria-label');
            expect(phrase).toMatch(/[А-Яа-яЁё]/);
            seen.add(phrase!);
            if (index === 0 && manuallyReview) {
                await practice
                    .getByRole('button', { name: /Show reference — free/ })
                    .click();
                await expect(
                    practice.getByRole('region', { name: 'Free comparison' }),
                ).toContainText(
                    /(?:livre|maison|travail|ami|voiture) est utile\./,
                );
                await expect(
                    practice.getByText('Reference read without an answer.', {
                        exact: true,
                    }),
                ).toBeVisible();
            }
            await practice
                .getByRole('button', {
                    name:
                        index === 4
                            ? 'Skip and finish'
                            : /^(?:Skip|Next sentence)$/,
                })
                .click();
            if (index < 4) {
                await ready(practice);
                await expect(
                    practice.getByRole('button', {
                        name: /: show hint · Required word$/,
                    }),
                ).not.toHaveAttribute('aria-label', phrase!);
            }
        }
        expect(seen.size).toBe(5);
        await expect(
            practice.getByRole('heading', { name: heading, exact: true }),
        ).toBeVisible();
        const count = admissions.length;
        await capture(page, info, `finite-round-${round}-complete`);
        await expect(
            practice.getByText('Examples presented', { exact: true }),
        ).toBeVisible();
        await expect(
            practice.getByText('Selected words seen', { exact: true }),
        ).toBeVisible();
        await expect(
            practice.getByRole('button', {
                name: 'This round’s examples (5)',
            }),
        ).toBeVisible();
        expect(admissions).toHaveLength(count);
        await capture(page, info, `finite-round-${round}-results`);
        if (close) {
            await practice
                .getByRole('button', { name: 'Close practice', exact: true })
                .click();
            await expect(practice).not.toBeVisible();
        }
    };
    const firstResults = await begin('saved-first');
    await completeRound(firstResults, true, 'first', false);
    expect(
        admissions.filter((response) => response.kind === 'job'),
    ).toHaveLength(5);
    expect(generatedExerciseIds).toHaveLength(5);
    await firstResults
        .getByRole('button', {
            name: 'Repeat these exact examples',
            exact: true,
        })
        .click();
    await ready(firstResults);
    await completeRound(firstResults, false, 'exact', true, 'Replay complete');
    expect(exactPrepareIds).toEqual([generatedExerciseIds]);
    expect(exactNextIds).toEqual(generatedExerciseIds);
    expect(
        admissions.filter((response) => response.kind === 'job'),
    ).toHaveLength(5);
    const generated = admissions.length;
    await completeRound(await begin('saved-first', true), false, 'saved');
    const reused = admissions.slice(generated);
    expect(reused).toHaveLength(5);
    expect(reused.every((response) => response.kind === 'exercise')).toBe(true);
    for (const response of reused) {
        expect(response.exercise?.sourceText).toMatch(/[А-Яа-яЁё]/);
        expect(response.exercise?.hints[0]?.text).toMatch(
            /^(?:livre|maison|travail|ami|voiture)$/,
        );
    }
    const freshResults = await begin('new-only', true);
    await completeRound(freshResults, false, 'new', false);
    expect(
        admissions.filter((response) => response.kind === 'job'),
    ).toHaveLength(10);
    let releaseFirstFreshStatus!: () => void;
    const firstFreshStatusReleased = new Promise<void>((resolve) => {
        releaseFirstFreshStatus = resolve;
    });
    let firstFreshStatusSeen!: () => void;
    const firstFreshStatus = new Promise<void>((resolve) => {
        firstFreshStatusSeen = resolve;
    });
    let heldFreshStatus = false;
    await page.route(
        /\/learning\/dictionaries\/[^/]+\/sentences\/jobs\/[^/]+$/,
        async (route) => {
            if (!heldFreshStatus) {
                heldFreshStatus = true;
                firstFreshStatusSeen();
                await firstFreshStatusReleased;
            }
            await route.continue();
        },
    );
    await freshResults
        .getByRole('button', { name: 'Generate new examples', exact: true })
        .click();
    await firstFreshStatus;
    await expect(
        freshResults.getByRole('heading', {
            name: 'Round complete',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        freshResults.getByText('Examples presented', { exact: true }),
    ).toBeVisible();
    await expect(
        freshResults.getByRole('button', { name: 'Stop request', exact: true }),
    ).toBeVisible();
    releaseFirstFreshStatus();
    await ready(freshResults);
    await expect(
        freshResults.getByRole('heading', {
            name: 'Round complete',
            exact: true,
        }),
    ).not.toBeVisible();
    await freshResults
        .getByRole('button', { name: 'Close practice', exact: true })
        .click();
    assertErrors();
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
        practice.getByRole('button', {
            name: 'book: show hint · Required word',
        }),
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
    test.setTimeout(120_000);
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
    await expect(
        setup.getByText(
            'Each round uses up to 100 words. A dictionary batch uses the first eligible words. Choose entries to practise other words.',
            { exact: true },
        ),
    ).toBeVisible();
    if (info) await capture(page, info, 'sentence-batch-guidance');
    await setup.locator('input[value="source-to-target"]').check();
    const start = setup.getByRole('button', {
        name: 'Start in a dialog',
        exact: true,
    });
    const retry = setup.getByRole('button', { name: /^Try again/ });
    await waitForRetryableReady(
        () => expect(start).toBeEnabled({ timeout: 70_000 }),
        retry,
    );
    const running = page.waitForResponse(
        async (response) =>
            response.url().includes('/sentences/jobs/') &&
            response.status() === 200 &&
            ((await response.json()) as { state: string }).state === 'running',
    );
    await start.click();
    await waitForRetryableReady(() => running.then(() => undefined), retry);
    await running;
    const practice = page.getByRole('dialog', { name: 'Sentence practice' });
    await expect(
        practice.getByText('Preparing a sentence', { exact: true }),
    ).toBeVisible();
    await capture(page, info, 'sentence-generating-source');
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
        .getByRole('button', { name: 'Stop request', exact: true })
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
        practice.getByRole('button', {
            name: 'slowbook: show hint · Required word',
        }),
    ).not.toBeVisible();
    assertErrors();
});

// @user-flow sentence-practice-web/rtl-non-latin-accessibility
test('renders RTL and Japanese content with reduced motion, zoom viewport and compact sheets', async ({
    page,
}, info) => {
    test.setTimeout(120_000);
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
        .getByRole('button', { name: 'كتاب: show hint · Required word' })
        .locator('xpath=ancestor::p[1]');
    await expect(source).toHaveAttribute('dir', 'rtl');
    await expect(source).toHaveAttribute('lang', 'ar');
    await practice
        .getByRole('button', { name: 'كتاب: show hint · Required word' })
        .click();
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
        practice.getByRole('button', { name: /Compare with reference — free/ }),
    );
    await capture(
        page,
        info,
        'sentence-rtl-japanese-200-percent-viewport-simulation',
    );
    await page.setViewportSize(originalViewport);
    await answer.focus();
    await page.setViewportSize({ width: 393, height: 430 });
    await expect(answer).toHaveValue('本は役に立ちます。');
    await expect(
        practice.getByRole('button', { name: /Check (with AI|new answer)/ }),
    ).toBeInViewport();
    await expect(
        practice.getByRole('button', { name: /Compare with reference — free/ }),
    ).toBeInViewport();
    await capture(page, info, 'sentence-keyboard-viewport-simulation');
    await page.setViewportSize({ width: 390, height: 844 });
    await practice
        .getByRole('button', { name: /Compare with reference — free/ })
        .click();
    await expect(
        practice.getByRole('region', { name: 'Free comparison' }),
    ).toContainText('本は役に立ちます。');
    await expect(
        practice.getByText('Matches the saved example after normalization.', {
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        practice.getByRole('heading', { name: 'Round complete', exact: true }),
    ).toBeVisible();
    await practice
        .getByRole('button', { name: 'My practice history', exact: true })
        .click();
    const history = page.getByRole('dialog', { name: 'My practice history' });
    await history
        .getByRole('button', { name: 'Manual reviews', exact: true })
        .click();
    const historySentence = history
        .getByRole('list')
        .getByText('هذا كتاب مفيد.', { exact: true });
    await expect(historySentence).toBeVisible();
    await expect(historySentence).toHaveAttribute('dir', 'rtl');
    await containedFocus(history);
    await expect
        .poll(async () => {
            const box = await history.boundingBox();
            return Math.abs((box?.y ?? 0) + (box?.height ?? 0) - 844);
        })
        .toBeLessThanOrEqual(2);
    await capture(page, info, 'sentence-compact-rtl-inline-history');
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
        .getByRole('button', { name: 'Back to practice', exact: true })
        .click();
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
// @user-flow sentence-practice-web/saved-library-preview-archive-restore
test('previews saved hints and archives or restores an example without a review', async ({
    page,
}, info) => {
    test.setTimeout(120_000);
    let expectedLibraryFault = false;
    let expectedHistoryFault = false;
    const assertErrors = observeErrors(
        page,
        (path) =>
            (expectedLibraryFault && path.includes('/sentences/library')) ||
            (expectedHistoryFault && path.includes('/sentences/progress')),
    );
    const token = await signup(page, email(info, 'library-owner'));
    const headers = { Authorization: `Bearer ${token}` };
    page.on('request', (request) => {
        if (!request.url().startsWith(apiOrigin)) return;
        const authorization = request.headers()['authorization'];
        if (authorization) headers.Authorization = authorization;
    });
    const dictionaryId = await createDictionary(page, `Saved library ${runId}`);
    await page.getByRole('button', { name: 'Train', exact: true }).click();
    await expect(page.getByRole('menuitem')).toHaveText([
        'Cards',
        'Sentence practice',
    ]);
    await page.keyboard.press('Escape');
    const secondary = page.getByRole('button', {
        name: 'More dictionary actions',
    });
    await secondary.click();
    const actions = page.getByRole('menuitem');
    await expect(actions).toHaveText([
        'Sentences',
        'My practice history',
        'Generate cards from pasted terms',
        'Generate cards from a document',
        'Import cards',
        'Export',
        'Sharing',
    ]);
    for (const action of await actions.all())
        await expect(action.locator('svg')).toHaveCount(1);
    await expect(page.getByRole('separator')).toHaveCount(2);
    await expect(
        page.getByText('Bulk and sharing', { exact: true }),
    ).toBeVisible();
    await expect(actions.first()).toBeFocused();
    await capture(page, info, 'editor-secondary-actions-wide');
    await page
        .getByRole('menuitem', { name: 'Sentences', exact: true })
        .click();
    await expect(page).toHaveURL(
        new RegExp(`/dictionaries/${dictionaryId}/sentences$`),
    );
    await expect(
        page.getByText('No saved sentences yet', { exact: true }),
    ).toBeVisible();
    await capture(page, info, 'saved-sentence-library-empty');
    await page.goto(`/dictionaries/${dictionaryId}`);
    const practice = await startSentence(page);
    await practice
        .getByRole('button', { name: /Show reference — free/ })
        .click();
    await expect(
        practice.getByRole('region', { name: 'Free comparison' }),
    ).toContainText('libro es útil.');
    await practice
        .getByRole('button', { name: 'Close practice', exact: true })
        .click();
    // The first statistics read is deliberately interrupted; retry uses the real API.
    expectedHistoryFault = true;
    const statisticsPattern = `${apiOrigin}/learning/dictionaries/${dictionaryId}/sentences/progress?direction=source-to-target`;
    await page.route(statisticsPattern, (route) =>
        route.abort('blockedbyclient'),
    );
    // Standalone history uses true saved aggregates, not totals from paginated history.
    await page.getByRole('button', { name: 'More dictionary actions' }).click();
    await page
        .getByRole('menuitem', { name: 'My practice history', exact: true })
        .click();
    const standaloneHistory = page.getByRole('dialog', {
        name: 'My practice history',
        exact: true,
    });
    await expect(
        standaloneHistory.getByRole('tab', { name: 'Flashcards', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
        standaloneHistory.getByRole('img', {
            name: '0 Known, 0 Practise again, 1 Unstudied of 1',
        }),
    ).toBeVisible();
    await standaloneHistory
        .getByRole('tab', { name: 'Sentences', exact: true })
        .click();
    const statistics = standaloneHistory.getByRole('region', {
        name: 'Saved sentence statistics',
        exact: true,
    });
    await expect(
        statistics.getByRole('region', {
            name: 'English → Spanish',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        statistics.getByRole('region', {
            name: 'Spanish → English',
            exact: true,
        }),
    ).toBeVisible();
    const forwardStatistics = statistics.getByRole('region', {
        name: 'English → Spanish',
        exact: true,
    });
    await expect(
        forwardStatistics.getByText('Could not load saved statistics', {
            exact: true,
        }),
    ).toBeVisible();
    await capture(page, info, 'practice-history-statistics-retry');
    await page.unroute(statisticsPattern);
    expectedHistoryFault = false;
    await forwardStatistics
        .getByRole('button', { name: 'Retry', exact: true })
        .click();
    await expect(forwardStatistics.locator('dl').first()).toContainText(
        'Manual reviews1',
    );
    await expect(forwardStatistics.locator('dl').first()).toContainText(
        'AI checks0',
    );

    await expect(
        standaloneHistory.getByText('No AI checks yet', { exact: true }),
    ).toBeVisible();
    await standaloneHistory
        .getByRole('button', { name: 'Manual reviews', exact: true })
        .click();
    await expect(
        standaloneHistory
            .locator('summary')
            .filter({ hasText: 'View details' }),
    ).toHaveCount(1);
    await standaloneHistory
        .locator('summary')
        .filter({ hasText: 'View details' })
        .click();
    await expect(
        standaloneHistory.getByRole('region', {
            name: 'Reference translation',
        }),
    ).toContainText('libro es útil.');
    await standaloneHistory
        .getByRole('tab', { name: 'Sentences', exact: true })
        .scrollIntoViewIfNeeded();
    await capture(page, info, 'practice-history-sentences-wide');
    await page.setViewportSize({ width: 390, height: 844 });
    await horizontallyContained(page, standaloneHistory);
    await containedFocus(standaloneHistory);
    await standaloneHistory
        .getByRole('tab', { name: 'Flashcards', exact: true })
        .click();
    await page.keyboard.press('ArrowRight');
    await expect(
        standaloneHistory.getByRole('tab', { name: 'Sentences', exact: true }),
    ).toBeFocused();
    await capture(page, info, 'practice-history-sentences-mobile-loading');
    await expect(forwardStatistics.locator('dl').first()).toContainText(
        'Manual reviews1',
    );
    await standaloneHistory
        .getByRole('button', { name: 'Manual reviews', exact: true })
        .click();
    await expect(
        standaloneHistory
            .locator('summary')
            .filter({ hasText: 'View details' }),
    ).toHaveCount(1);
    await standaloneHistory
        .getByRole('tab', { name: 'Sentences', exact: true })
        .scrollIntoViewIfNeeded();
    await capture(page, info, 'practice-history-sentences-mobile');
    await standaloneHistory
        .locator('summary')
        .filter({ hasText: 'View details' })
        .click();
    const mobileReference = standaloneHistory.getByRole('region', {
        name: 'Reference translation',
    });
    await mobileReference.scrollIntoViewIfNeeded();
    await expect(mobileReference).toContainText('libro es útil.');
    await capture(page, info, 'practice-history-review-details-mobile');
    await standaloneHistory
        .getByRole('button', { name: 'Close dialog', exact: true })
        .click();
    const historyTrigger = page.getByRole('button', {
        name: 'More dictionary actions',
        exact: true,
    });
    await expect(historyTrigger).toBeFocused();
    expect(new URL(page.url()).searchParams.has('practice')).toBe(false);
    await historyTrigger.click();
    await page
        .getByRole('menuitem', { name: 'My practice history', exact: true })
        .click();
    await expect(
        standaloneHistory.getByRole('tab', { name: 'Flashcards', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await standaloneHistory
        .getByRole('button', { name: 'Close dialog', exact: true })
        .click();
    await expect(historyTrigger).toBeFocused();
    await historyTrigger.click();
    await horizontallyContained(page, page.getByRole('menu'));
    await capture(page, info, 'editor-secondary-actions-mobile');
    await page.keyboard.press('Escape');
    await expect(
        page.getByRole('button', { name: 'More dictionary actions' }),
    ).toBeFocused();
    await page.getByRole('button', { name: 'Train', exact: true }).click();
    await expect(page.getByRole('menuitem')).toHaveText([
        'Cards',
        'Sentence practice',
    ]);
    await capture(page, info, 'training-launcher-mobile');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1280, height: 720 });
    const progressPath = `${apiOrigin}/learning/dictionaries/${dictionaryId}/sentences/progress?direction=source-to-target`;
    const before = await page.request.get(progressPath, { headers });
    expect(before.status()).toBe(200);
    const initialProgress = await before.json();
    await page.goto(`/dictionaries/${dictionaryId}/sentences`);
    await page
        .getByLabel('Translation direction', { exact: true })
        .selectOption('source-to-target');
    await expect(
        page.getByRole('heading', { name: 'Saved sentences', exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText('book is useful.', { exact: true }),
    ).toBeVisible();
    await page
        .getByLabel('Currentness', { exact: true })
        .selectOption('outdated');
    await expect(
        page.getByText('No examples match these filters', { exact: true }),
    ).toBeVisible();
    await capture(page, info, 'saved-sentence-library-no-match');
    await page.getByLabel('Currentness', { exact: true }).selectOption('all');
    await expect(
        page.getByText('book is useful.', { exact: true }),
    ).toBeVisible();
    const libraryPattern = `${apiOrigin}/learning/dictionaries/${dictionaryId}/sentences/library?*`;
    let intercepted = 0;
    expectedLibraryFault = true;
    await page.route(
        libraryPattern,
        (route) => {
            intercepted++;
            return route.abort('blockedbyclient');
        },
        { times: 1 },
    );
    await page.reload();
    await expect(
        page.getByText('Saved sentences didn’t load', { exact: true }),
    ).toBeVisible();
    expectedLibraryFault = false;
    expect(intercepted).toBe(1);
    await capture(page, info, 'saved-sentence-library-retryable-error');
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(
        page.getByText('book is useful.', { exact: true }),
    ).toBeVisible();
    await capture(page, info, 'saved-sentence-library-wide');
    await page
        .getByRole('checkbox', { name: 'Select: book is useful.', exact: true })
        .check();
    await page.getByRole('button', { name: 'View', exact: true }).click();
    const preview = page.getByRole('dialog', {
        name: 'Sentence preview',
        exact: true,
    });
    await preview
        .getByRole('button', { name: 'Example translation', exact: true })
        .click();
    await expect(preview).toContainText('libro es útil.');
    await expect(preview).toContainText('useful');
    const desktopPreview = await preview.boundingBox();
    expect(desktopPreview).not.toBeNull();
    expect(desktopPreview!.width).toBeCloseTo(480, 0);
    expect(desktopPreview!.x + desktopPreview!.width).toBeCloseTo(
        await page.evaluate(() => innerWidth),
        0,
    );
    await capture(page, info, 'saved-sentence-preview-wide');
    await preview.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(
        page.getByRole('checkbox', {
            name: 'Select: book is useful.',
            exact: true,
        }),
    ).toBeChecked();
    await page
        .getByRole('checkbox', { name: 'Select: book is useful.', exact: true })
        .uncheck();
    await page
        .getByRole('checkbox', { name: 'Select all on this page', exact: true })
        .check();
    await page
        .getByRole('button', {
            name: 'Everything matching these filters',
            exact: true,
        })
        .click();
    await capture(page, info, 'saved-sentence-library-selection-all-matching');
    const snapshotResponse = page.waitForResponse(
        (response) =>
            response.url().endsWith('/sentences/library/snapshots') &&
            response.request().method() === 'POST' &&
            response.status() === 200,
    );
    await page
        .getByRole('button', { name: 'Remove from my practice', exact: true })
        .click();
    const snapshot = (await (await snapshotResponse).json()) as {
        matchingCount: number;
    };
    expect(snapshot.matchingCount).toBe(1);
    const confirmation = page.getByRole('dialog', {
        name: 'Remove 1 sentence from your practice?',
        exact: true,
    });
    await expect(confirmation).toContainText('Your learning history stays.');
    await capture(page, info, 'saved-sentence-archive-confirmation-wide');
    await confirmation
        .getByRole('button', { name: 'Remove from my practice', exact: true })
        .click();
    await expect(
        page.getByText('book is useful.', { exact: true }),
    ).not.toBeVisible();
    await page.reload();
    await expect(
        page.getByRole('heading', { name: 'Saved sentences', exact: true }),
    ).toBeVisible();
    await page
        .getByLabel('Translation direction', { exact: true })
        .selectOption('source-to-target');
    await page
        .getByLabel('In my practice', { exact: true })
        .selectOption('archived');
    await expect(
        page.getByText('book is useful.', { exact: true }),
    ).toBeVisible();
    await page
        .getByRole('button', { name: /^Restore/ })
        .first()
        .click();
    const restoration = page.getByRole('dialog', {
        name: 'Restore 1 sentence to your practice?',
        exact: true,
    });
    await restoration
        .getByRole('button', { name: 'Restore', exact: true })
        .click();
    await expect(
        page.getByText('book is useful.', { exact: true }),
    ).not.toBeVisible();
    await page
        .getByLabel('In my practice', { exact: true })
        .selectOption('active');
    await expect(
        page.getByText('book is useful.', { exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, info, 'saved-sentence-library-narrow');
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
    ).toBe(true);
    await page.getByRole('button', { name: /^Filters/ }).click();
    const filters = page.getByRole('dialog', { name: 'Filters', exact: true });
    await expect(
        filters.getByLabel('Translation direction', { exact: true }),
    ).toBeVisible();
    await capture(page, info, 'saved-sentence-filters-narrow');
    await filters.getByRole('button', { name: 'Close', exact: true }).click();
    await page
        .getByRole('button', {
            name: 'Actions for: book is useful.',
            exact: true,
        })
        .click();
    await page
        .getByRole('menuitemradio', { name: 'View', exact: true })
        .click();
    await expect(preview).toBeVisible();
    await preview
        .getByRole('button', { name: 'Example translation', exact: true })
        .click();
    await expect(preview).toContainText('libro es útil.');
    const viewportGeometry = await preview.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
            matchingCss: Array.from(document.styleSheets).flatMap((sheet) => {
                try {
                    return Array.from(sheet.cssRules).flatMap((rule) => {
                        if (!('selectorText' in rule) || !('style' in rule))
                            return [];
                        const selector = String(rule.selectorText);
                        try {
                            return element.matches(selector)
                                ? [rule.cssText]
                                : [];
                        } catch {
                            return [];
                        }
                    });
                } catch {
                    return [];
                }
            }),
            inlineStyle: element.getAttribute('style'),
            computed: {
                position: getComputedStyle(element).position,
                top: getComputedStyle(element).top,
                inset: getComputedStyle(element).inset,
                margin: getComputedStyle(element).margin,
                transform: getComputedStyle(element).transform,
                className: element.className,
            },
            bodyRect: {
                y: document.body.getBoundingClientRect().y,
                height: document.body.getBoundingClientRect().height,
            },
            scrollY,
            visualOffsetTop: visualViewport?.offsetTop,
        };
    });
    expect(viewportGeometry.x).toBeCloseTo(0, 0);
    expect(viewportGeometry.y, JSON.stringify(viewportGeometry)).toBeCloseTo(
        0,
        0,
    );
    expect(viewportGeometry.width).toBeCloseTo(
        viewportGeometry.viewportWidth,
        0,
    );
    expect(viewportGeometry.height).toBeCloseTo(
        viewportGeometry.viewportHeight,
        0,
    );
    await capture(page, info, 'saved-sentence-preview-narrow');
    await preview.getByRole('button', { name: 'Back', exact: true }).click();
    const after = await page.request.get(progressPath, { headers });
    expect(after.status()).toBe(200);
    expect(await after.json()).toEqual(initialProgress);
    assertErrors();
});

// @user-flow sentence-practice-web/background-preparation-ready-reconnect
test('reconnects to background preparation and practises the saved batch without regeneration', async ({
    page,
}, info) => {
    test.setTimeout(120_000);
    const { SentencePreparationResponseSchema } =
        await import('@languon/contracts');
    const assertErrors = observeErrors(page);
    let completedSnapshot: unknown;
    page.on('response', async (response) => {
        if (
            !/\/sentences\/preparations\/[^/]+$/.test(response.url()) ||
            response.request().method() !== 'GET' ||
            response.status() !== 200
        )
            return;
        const parsed = SentencePreparationResponseSchema.parse(
            await response.json(),
        );
        if (parsed.preparation.state === 'completed')
            completedSnapshot = parsed;
    });

    await signup(page, email(info, 'preparation-owner'));
    const dictionaryId = await createDictionary(
        page,
        `Prepared sentences ${runId}`,
    );
    await page.getByRole('button', { name: 'Train', exact: true }).click();
    await page
        .getByRole('menuitem', { name: 'Sentence practice', exact: true })
        .click();
    const setup = page.getByRole('dialog', {
        name: 'Sentence practice',
        exact: true,
    });
    const preparationSwitch = setup.getByRole('switch', {
        name: /Prepare.*dictionary.*advance/i,
    });
    await expect(preparationSwitch).not.toBeChecked();
    await preparationSwitch.check();
    const started = page.waitForResponse(
        (response) =>
            response.url().endsWith('/sentences/preparations') &&
            response.status() < 300 &&
            response.request().method() === 'POST',
    );
    await setup
        .getByRole('button', { name: 'Start preparation', exact: true })
        .click();
    const payload = (await (await started).json()) as {
        preparation: { id: string };
    };
    await expect(
        page.getByRole('heading', {
            name: 'Sentence preparation',
            exact: true,
        }),
    ).toBeVisible();
    await capture(page, info, 'sentence-preparation-started');
    await page.goto(`/dictionaries/${dictionaryId}`);
    await page.reload();
    await page.getByRole('button', { name: /\. View progress$/ }).click();
    await expect(
        page.getByRole('heading', {
            name: 'Sentence preparation',
            exact: true,
        }),
    ).toBeVisible();
    const ready = page.getByRole('button', {
        name: 'Start with ready examples',
        exact: true,
    });
    await expect(ready).toBeEnabled({ timeout: 50_000 });
    await expect(
        page.getByText('1 of 1 words ready', { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
        page.getByText('All words are covered', { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await capture(page, info, 'sentence-preparation-reconnected-ready-wide');
    let generatedJobs = 0;
    const nextBatchIds: string[] = [];
    page.on('response', async (response) => {
        if (
            !response.url().endsWith('/sentences/next') ||
            response.status() >= 300
        )
            return;
        const data = (await response.json()) as { kind: string };
        if (data.kind === 'job') generatedJobs++;
        const input = response.request().postDataJSON() as {
            preparedBatchId?: string;
        };
        if (input.preparedBatchId) nextBatchIds.push(input.preparedBatchId);
    });
    await ready.click();
    const practice = page.getByRole('dialog', {
        name: 'Sentence practice',
        exact: true,
    });
    await waitForRetryableReady(
        () =>
            expect(
                practice.getByRole('button', {
                    name: /: show hint · Required word$/,
                }),
            ).toBeVisible({ timeout: 30_000 }),
        practice.getByRole('button', { name: /^Try again/ }),
    );
    expect(nextBatchIds).toHaveLength(1);
    expect(nextBatchIds[0]).not.toBe(payload.preparation.id);
    expect(generatedJobs).toBe(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, info, 'prepared-sentence-practice-narrow');
    await practice
        .getByRole('button', { name: 'Close practice', exact: true })
        .click();
    await page.goto(`/dictionaries/${dictionaryId}/sentences`);
    const preparationChip = page.getByRole('button', {
        name: 'Preparation complete. View progress',
        exact: true,
    });
    await expect(preparationChip).toBeVisible();
    await capture(page, info, 'saved-sentence-library-prepared-chip-narrow');
    await preparationChip.click();
    await expect(
        page.getByRole('heading', {
            name: 'Sentence preparation',
            exact: true,
        }),
    ).toBeVisible();

    // Presentation-only fault injection: schema-validated copies of the real completed
    // response exercise rare UI states without changing saved data or sending commands.
    // The real preparation, reconnect and prepared practice above prove the business flow;
    // backend integration coverage proves the actual pause/stop/expiration transitions.
    const baseline = SentencePreparationResponseSchema.parse(completedSnapshot);
    const statusUrl = `${apiOrigin}/learning/dictionaries/${dictionaryId}/sentences/preparations/${baseline.preparation.id}`;
    const states = [
        {
            key: 'credits',
            state: 'paused',
            pauseReason: 'credits',
            title: 'Not enough AI credits',
        },
        {
            key: 'capacity',
            state: 'paused',
            pauseReason: 'capacity',
            title: 'The service is busy right now',
        },
        {
            key: 'provider',
            state: 'paused',
            pauseReason: 'provider',
            title: 'An example couldn’t be generated',
        },
        {
            key: 'model',
            state: 'paused',
            pauseReason: 'model',
            title: 'Your selected AI model is unavailable',
        },
        {
            key: 'stale',
            state: 'paused',
            pauseReason: 'stale',
            title: 'Preparation is outdated',
        },
        {
            key: 'access',
            state: 'paused',
            pauseReason: 'access',
            title: 'Access to this dictionary was removed',
        },
        {
            key: 'stopping',
            state: 'stopping',
            pauseReason: null,
            title: 'Stopping… The current example will finish and no next one will start.',
        },
        {
            key: 'partial',
            state: 'completed',
            pauseReason: null,
            eligibleCount: 2,
            title: 'Preparation complete',
        },
    ] as const;
    for (const state of states) {
        const injected = SentencePreparationResponseSchema.parse({
            preparation: {
                ...baseline.preparation,
                state: state.state,
                pauseReason: state.pauseReason,
                eligibleCount:
                    'eligibleCount' in state
                        ? state.eligibleCount
                        : baseline.preparation.eligibleCount,
            },
        });
        await page.route(statusUrl, (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(injected),
            }),
        );
        await page.reload();
        await page.getByRole('button', { name: /\. View progress$/ }).click();
        const sheet = page.getByRole('dialog', {
            name: 'Sentence preparation',
            exact: true,
        });
        await expect(
            sheet.getByText(
                state.key === 'stopping'
                    ? new RegExp('^Stopping… The current example will finish')
                    : state.title,
                { exact: state.key !== 'stopping' },
            ),
        ).toBeVisible();
        if (state.key === 'model')
            await expect(
                sheet.getByRole('button', {
                    name: 'Open AI settings',
                    exact: true,
                }),
            ).toBeVisible();
        await capture(
            page,
            info,
            `sentence-preparation-rendered-${state.key}-narrow`,
        );
        await page.unroute(statusUrl);
    }
    assertErrors();
});
