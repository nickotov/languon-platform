// @user-flow-revision learner-portrait sha256:c5635e99218a7ba5
import { expect, test, type Page, type TestInfo } from '@playwright/test';

async function signup(page: Page, info: TestInfo) {
    await page.goto('/signup?returnTo=%2Fportrait');
    await page.getByLabel('Email').fill(`portrait-${Date.now()}-${info.workerIndex}@example.test`);
    await page.getByLabel('Password', { exact: true }).fill('Synthetic portrait password 47!');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.getByLabel('Verification code').fill('0000');
    const verified = page.waitForResponse(
        (response) => response.url().endsWith('/auth/email-verification/verify') && response.status() === 200,
    );
    await page.getByRole('button', { name: 'Verify email', exact: true }).click();
    await verified;
    // A concurrent dev rebuild can preserve the verified page instead of
    // following returnTo; the authenticated portrait route is the assertion.
    await page.goto('/portrait');
    await expect(page).toHaveURL(/\/portrait$/);
}

function runtimeErrors(page: Page) {
    const failures: string[] = [];
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:'))
            failures.push(message.text());
    });
    page.on('response', (response) => {
        const path = new URL(response.url()).pathname;
        if (response.status() >= 500 || (response.status() === 404 && path.includes('/navigation/')))
            failures.push(`${response.status()} ${path}`);
    });
    return () => expect(failures).toEqual([]);
}

async function capture(page: Page, info: TestInfo, name: string) {
    const path = info.outputPath(`${name}.png`);
    await page.screenshot({ path, fullPage: true, animations: 'disabled' });
    await info.attach(name, { path, contentType: 'image/png' });
}

async function noOverflow(page: Page) {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

async function restoredSidebar(page: Page) {
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create new', exact: true })).toBeVisible();
}

async function acknowledgePaidResponse(page: Page) {
    if (process.env.LEARNER_PORTRAIT_TEST_PAID !== 'true') return;
    const notice = page.getByRole('dialog', { name: 'Interviewer responses now use credits' });
    await expect(notice).toBeVisible();
    await notice.getByRole('button', { name: 'Continue with credits', exact: true }).click();
}

async function startInterview(page: Page, info: TestInfo) {
    await signup(page, info);
    await page.goto('/portrait/intro');
    await page.getByRole('button', { name: 'Start interview', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Which languages do you know, and which are you learning?' })).toBeVisible();
}

async function languageDetails(page: Page, info: TestInfo) {
    const choices = page.getByRole('group', { name: 'Languages you know', exact: true });
    await expect(choices.getByRole('checkbox')).toHaveCount(7);
    expect(await choices.getByRole('checkbox').evaluateAll((inputs) =>
        inputs.map((input) => (input as HTMLInputElement).value),
    )).toEqual(['ru', 'en', 'fr', 'es', 'de', 'sr', 'pl']);
    await choices.getByRole('checkbox', { name: 'Russian', exact: true }).check();
    await choices.getByRole('checkbox', { name: 'English', exact: true }).check();
    const details = page.getByRole('list', { name: 'Describe each language', exact: true });
    const russian = details.getByRole('listitem').filter({ hasText: 'Russian' });
    const english = details.getByRole('listitem').filter({ hasText: 'English' });
    await russian.getByRole('combobox').selectOption('native');
    await english.getByRole('combobox').selectOption('intermediate');
    await english.getByRole('checkbox', { name: 'Learning now' }).check();
    for (const row of [russian, english]) {
        const name = await row.locator('strong').boundingBox();
        const level = await row.getByRole('combobox').boundingBox();
        const learning = await row.getByRole('checkbox').boundingBox();
        expect(name && level && learning).toBeTruthy();
        expect(level!.x).toBeGreaterThan(name!.x + name!.width);
        expect(learning!.x).toBeGreaterThan(level!.x + level!.width);
        expect(Math.abs(name!.y + name!.height / 2 - level!.y - level!.height / 2)).toBeLessThan(3);
        expect(Math.abs(learning!.y + learning!.height / 2 - level!.y - level!.height / 2)).toBeLessThan(3);
    }
    await capture(page, info, 'portrait-two-language-details-desktop');
    await page.getByRole('button', { name: 'Show more', exact: true }).click();
    await expect(choices.getByRole('checkbox', { name: 'Turkish', exact: true })).toBeVisible();
    await expect(choices.getByRole('checkbox', { name: 'Hungarian', exact: true })).toBeVisible();
    await expect(choices.getByRole('checkbox')).toHaveCount(48);
    await expect(english.getByRole('combobox')).toHaveValue('intermediate');
    await expect(english.getByRole('checkbox', { name: 'Learning now' })).toBeChecked();
    await choices.getByRole('checkbox', { name: 'English', exact: true }).uncheck();
    await choices.getByRole('checkbox', { name: 'English', exact: true }).check();
    await expect(english.getByRole('combobox')).toHaveValue('intermediate');
    await expect(english.getByRole('checkbox', { name: 'Learning now' })).toBeChecked();
    await page.setViewportSize({ width: 390, height: 844 });
    await english.scrollIntoViewIfNeeded();
    const name = await english.locator('strong').boundingBox();
    const level = await english.getByRole('combobox').boundingBox();
    const learning = await english.getByRole('checkbox').boundingBox();
    expect(name!.y + name!.height).toBeLessThanOrEqual(level!.y);
    expect(level!.y + level!.height).toBeLessThanOrEqual(learning!.y);
    await noOverflow(page);
    await capture(page, info, 'portrait-expanded-language-details-mobile');
    await page.setViewportSize({ width: 1440, height: 900 });
}

// @user-flow learner-portrait/manual-approval-global-off-and-delete-warning
test('manual portrait is approved separately from use, persists, and global off wins', async ({ page }, info) => {
    const assertNoRuntimeErrors = runtimeErrors(page);
    await signup(page, info);
    await restoredSidebar(page);
    await capture(page, info, 'portrait-overview-restored-sidebar-desktop');

    await page.goto('/portrait/manual');
    await restoredSidebar(page);
    await expect(page.getByRole('heading', { name: 'Fill in your portrait' })).toBeVisible();
    await capture(page, info, 'portrait-manual-editor-desktop');
    await page
        .getByRole('region', { name: 'Languages and levels' })
        .getByRole('button', { name: 'French', exact: true })
        .click();
    await page.getByRole('button', { name: 'Travel', exact: true }).click();
    await capture(page, info, 'portrait-manual-editor-populated-desktop');
    await page.getByRole('button', { name: 'Save portrait', exact: true }).click();
    await expect(page).toHaveURL(/\/portrait\?saved=first$/);
    await expect(page.getByText('Chats don’t use it yet.')).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Use my portrait' })).not.toBeChecked();

    await page.reload();
    await expect(page.getByText('French', { exact: true })).toBeVisible();
    await page.getByRole('switch', { name: 'Use my portrait' }).click();
    await expect(page.getByRole('switch', { name: 'Use my portrait' })).toBeChecked();

    // Both tabs start from the same approved version. The second save must
    // retain its local edit and require an explicit field-by-field choice.
    const stale = await page.context().newPage();
    await Promise.all([page.goto('/portrait/manual'), stale.goto('/portrait/manual')]);
    await expect(page.getByRole('heading', { name: 'Edit portrait details' })).toBeVisible();
    await expect(stale.getByRole('heading', { name: 'Edit portrait details' })).toBeVisible();
    await page.getByRole('button', { name: 'Work', exact: true }).click();
    await stale.getByRole('button', { name: 'Exams', exact: true }).click();
    await page.getByRole('button', { name: 'Save portrait', exact: true }).click();
    await expect(page).toHaveURL(/\/portrait\?saved=update$/);
    await stale.getByRole('button', { name: 'Save portrait', exact: true }).click();
    await expect(
        stale.getByRole('heading', { name: 'Your portrait changed elsewhere' }),
    ).toBeVisible();
    const reconcile = stale.getByRole('button', { name: 'Reconcile draft', exact: true });
    await expect(reconcile).toBeDisabled();
    await stale.setViewportSize({ width: 1440, height: 900 });
    await capture(stale, info, 'portrait-conflict-desktop');
    await stale.getByRole('radio', { name: /Use this draft/u }).check();
    await expect(reconcile).toBeEnabled();
    await reconcile.click();
    await stale.getByRole('button', { name: 'Save portrait', exact: true }).click();
    await expect(stale).toHaveURL(/\/portrait\?saved=update$/);
    await stale.close();

    await page.goto('/knowledge');
    await page.getByRole('button', { name: 'New note', exact: true }).click();
    await expect(page).toHaveURL(/\/knowledge\/[0-9a-f-]{36}$/u);
    const workspacePath = new URL(page.url()).pathname;
    await expect(page.getByRole('region', { name: 'Language tutor' })).toBeVisible();
    await page.getByRole('button', { name: 'Response settings' }).click();
    await expect(page.getByText('Use portrait in this chat')).toBeVisible();

    await page.goto('/portrait');
    await page.getByRole('switch', { name: 'Use my portrait' }).click();
    await expect(page.getByText('Earlier messages may still contain personal information.')).toBeVisible();
    await page.goto(workspacePath);
    await page.getByRole('button', { name: 'Response settings' }).click();
    const disabled = page.getByRole('switch', { name: 'Use portrait in this chat' });
    await expect(disabled).toBeDisabled();

    await page.goto('/portrait');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Delete portrait', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Delete your learner portrait?' })).toBeVisible();
    await expect(
        page.getByText(
            'Leaves ordinary chat history unchanged, including personal context in earlier messages.',
        ),
    ).toBeVisible();
    await capture(page, info, 'portrait-delete-mobile');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await noOverflow(page);
    assertNoRuntimeErrors();
});

// @user-flow learner-portrait/resumable-interview-proposal-and-explicit-approval
test('interview resumes, uses a deterministic queued response, and keeps proposal approval explicit', async ({ page }, info) => {
    const assertNoRuntimeErrors = runtimeErrors(page);
    await signup(page, info);
    await page.goto('/portrait/intro');
    const paid = process.env.LEARNER_PORTRAIT_TEST_PAID === 'true';
    await expect(page.getByText(paid
        ? 'AI responses use credits under your current model and usage settings. Reviewing, editing and saving by hand are free.'
        : 'This interview is currently free; it won’t use your credits.')).toBeVisible();
    await capture(page, info, 'portrait-interview-intro-desktop');
    await page.getByRole('button', { name: 'Start interview', exact: true }).click();
    await expect(page).toHaveURL(/\/portrait\/interview$/);
    await expect(page.getByRole('heading', { name: 'Learner portrait interview' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create new', exact: true })).toHaveCount(0);

    await page.reload();
    await expect(
        page.getByRole('heading', {
            name: 'Which languages do you know, and which are you learning?',
        }),
    ).toBeVisible();
    await capture(page, info, 'portrait-interview-desktop');
    await languageDetails(page, info);
    await page.getByRole('button', { name: 'Draft preview', exact: true }).click();
    await expect(page.getByText('Draft preview Not saved')).toBeVisible();
    await capture(page, info, 'portrait-interview-preview-desktop');
    await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await page.getByLabel('Ask a question or answer in your own words…').fill('Je voudrais des exemples courts, avec des explications en русском.');
    const billingNotice = paid ? page.waitForResponse((response) =>
        response.url().includes('/interview/responses') && response.status() === 409,
    ) : undefined;
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    if (paid) {
        expect((await billingNotice!).status()).toBe(409);
        const notice = page.getByRole('dialog', { name: 'Interviewer responses now use credits' });
        await expect(notice).toBeVisible();
        await capture(page, info, 'portrait-paid-credit-confirmation');
        const admitted = page.waitForResponse((response) =>
            response.url().includes('/interview/responses') && response.status() === 202,
        );
        await notice.getByRole('button', { name: 'Continue with credits', exact: true }).click();
        await admitted;
    }
    await expect(page.getByText('Proposed for your draft · not saved yet')).toBeVisible();
    await expect(page.getByText('French travel examples with Russian clarification.')).toBeVisible();
    await page.getByRole('button', { name: 'Add to draft', exact: true }).click();
    await page.getByRole('button', { name: 'Review portrait', exact: true }).click();
    await expect(page).toHaveURL(/\/portrait\/review$/);
    await capture(page, info, 'portrait-interview-review-desktop');
    await page.getByRole('button', { name: 'Save portrait', exact: true }).click();
    await expect(page).toHaveURL(/\/portrait\?saved=first$/);
    await expect(page.getByText('Chats don’t use it yet.')).toBeVisible();
    assertNoRuntimeErrors();
});

for (const action of ['continue', 'chat'] as const) {
    // @user-flow learner-portrait/composer-stop-cancels-active-interview
    test(`${action} response stops only from the composer and keeps unfinished work`, async ({ page }, info) => {
        const assertNoRuntimeErrors = runtimeErrors(page);
        let accepted = 0;
        page.on('response', (response) => {
            if (new URL(response.url()).pathname.endsWith('/interview/responses') && response.status() === 202)
                accepted += 1;
        });
        await startInterview(page, info);
        if (action === 'chat') await page.setViewportSize({ width: 390, height: 844 });
        const running = page.waitForResponse(async (response) =>
            response.request().method() === 'GET' &&
            /\/interview\/responses\/[0-9a-f-]+$/u.test(new URL(response.url()).pathname) &&
            response.status() === 200 && (await response.json()).state === 'running',
        );
        if (action === 'continue') {
            await page.getByLabel('Your own answer (optional)', { exact: true }).fill('[portrait-slow] Short learning steps');
            await page.getByRole('button', { name: 'Continue', exact: true }).click();
        } else {
            await page.getByLabel('Ask a question or answer in your own words…').fill('[portrait-slow] Help me choose a learning approach');
            await page.getByRole('button', { name: 'Send message', exact: true }).click();
        }
        await acknowledgePaidResponse(page);
        await running;
        const composer = page.getByRole('form', { name: 'Message the interviewer' });
        const stop = composer.getByRole('button', { name: 'Stop', exact: true });
        await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(1);
        await expect(stop).toBeEnabled();
        await expect(composer.getByRole('button', { name: 'Send message', exact: true })).toHaveCount(0);
        const input = composer.getByRole('textbox');
        const unsent = action === 'continue' ? 'x'.repeat(1001) : 'Keep this unsent clarification';
        await input.fill(unsent);
        await input.press('Control+Enter');
        await expect(stop).toBeEnabled();
        await capture(page, info, `portrait-${action}-composer-stop-${action === 'chat' ? 'mobile' : 'desktop'}`);
        const stopped = page.waitForResponse((response) => response.url().endsWith('/stop') && response.status() === 200);
        await stop.click();
        expect((await (await stopped).json()).state).toBe('cancelled');
        await expect(stop).toHaveCount(0);
        await expect(input).toHaveValue(unsent);
        await expect(page.getByRole('button', { name: 'Review portrait', exact: true })).toBeEnabled();
        expect(accepted).toBe(1);
        await page.reload();
        await expect(page.getByRole('heading', { name: 'Learner portrait interview', exact: true })).toBeVisible();
        await expect(page.getByText('Proposed for your draft · not saved yet')).toHaveCount(0);
        await noOverflow(page);
        assertNoRuntimeErrors();
    });
}

// @user-flow learner-portrait/invalid-model-output-preserves-interview
test('invalid structured output keeps the answer and does not submit another response automatically', async ({ page }, info) => {
    const assertNoRuntimeErrors = runtimeErrors(page);
    let accepted = 0;
    page.on('response', (response) => {
        if (new URL(response.url()).pathname.endsWith('/interview/responses') && response.status() === 202)
            accepted += 1;
    });
    await startInterview(page, info);
    await page.getByLabel('Ask a question or answer in your own words…').fill('[portrait-invalid] Explain which learning preferences would help');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await acknowledgePaidResponse(page);
    await expect(page.getByText('The interviewer returned a response we couldn’t use. Your answer and draft are kept. Retry when you’re ready, or edit your portrait by hand.').first()).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Your previous answer', exact: true })).toHaveValue('[portrait-invalid] Explain which learning preferences would help');
    await expect(page.getByText('Proposed for your draft · not saved yet')).toHaveCount(0);
    await capture(page, info, 'portrait-invalid-structured-output-kept');
    expect(accepted).toBe(1);
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Your previous answer', exact: true })).toHaveValue('[portrait-invalid] Explain which learning preferences would help');
    expect(accepted).toBe(1);
    assertNoRuntimeErrors();
});
