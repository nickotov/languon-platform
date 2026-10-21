// @user-flow-revision learner-portrait sha256:34bac194f709f508
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
        if (response.status() >= 500)
            failures.push(`${response.status()} ${new URL(response.url()).pathname}`);
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

// @user-flow learner-portrait/manual-approval-global-off-and-delete-warning
test('manual portrait is approved separately from use, persists, and global off wins', async ({ page }, info) => {
    const assertNoRuntimeErrors = runtimeErrors(page);
    await signup(page, info);

    await page.goto('/portrait/manual');
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
    await expect(page.getByText('This interview is currently free; it won’t use your credits.')).toBeVisible();
    await capture(page, info, 'portrait-interview-intro-desktop');
    await page.getByRole('button', { name: 'Start interview', exact: true }).click();
    await expect(page).toHaveURL(/\/portrait\/interview$/);
    await expect(page.getByRole('heading', { name: 'Learner portrait interview' })).toBeVisible();

    await page.reload();
    await expect(
        page.getByRole('heading', {
            name: 'Which languages do you know, and which are you learning?',
        }),
    ).toBeVisible();
    await capture(page, info, 'portrait-interview-desktop');
    await page.getByRole('button', { name: 'Draft preview', exact: true }).click();
    await expect(page.getByText('Draft preview Not saved')).toBeVisible();
    await capture(page, info, 'portrait-interview-preview-desktop');
    await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
    await page.getByLabel('Ask a question or answer in your own words…').fill('Je voudrais des exemples courts, avec des explications en русском.');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
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
