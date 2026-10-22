import {
    expect,
    test,
    type Page,
    type TestInfo,
    type Locator,
} from '@playwright/test';
import { customerBalance } from './support/action-accounting-fixture';

// @user-flow-revision ai-accounting sha256:e65c3d670d67fa18
async function signup(page: Page, info: TestInfo) {
    await page.goto('/signup?returnTo=%2Fdictionaries');
    await page
        .getByLabel('Email')
        .fill(`allowance-${Date.now()}-${info.workerIndex}@example.test`);
    await page
        .getByLabel('Password', { exact: true })
        .fill('Synthetic allowance password 47!');
    await page
        .getByRole('button', { name: 'Create account', exact: true })
        .click();
    await page.getByLabel('Verification code').fill('0000');
    const verified = page.waitForResponse(
        (r) =>
            r.url().endsWith('/auth/email-verification/verify') &&
            r.status() === 200,
    );
    await page
        .getByRole('button', { name: 'Verify email', exact: true })
        .click();
    const auth = await (await verified).json();
    await expect(page).toHaveURL(/\/dictionaries$/);
    return auth.user.id as string;
}
async function budget(page: Page, amount = '100') {
    await page.goto('/profile#ai-preferences');
    await page
        .getByRole('textbox', { name: 'Maximum credits per action' })
        .fill(amount.includes('.') ? amount : `${amount}.000`);
    await page
        .getByRole('button', { name: 'Save preference', exact: true })
        .click();
    await expect(
        page.getByText('Preference saved. New requests will use it.'),
    ).toBeVisible();
}
async function dictionary(page: Page, count = 1, marker = '') {
    await page.goto('/dictionaries');
    await page
        .getByRole('main')
        .getByRole('button', { name: 'New dictionary', exact: true })
        .click();
    await page.getByLabel('Name').fill('Budget practice');
    await page.getByLabel('Translate from').selectOption('en');
    await page.getByLabel('Translate to').selectOption('es');
    await page.getByRole('button', { name: 'Create dictionary' }).click();
    await expect(
        page.getByRole('heading', { name: 'Budget practice' }),
    ).toBeVisible();
    for (let i = 0; i < count; i++) {
        await page
            .getByRole('button', { name: 'Add card', exact: true })
            .click();
        await page
            .getByLabel(/^Source word or phrase \(/)
            .fill(`book${i ? ` ${i}` : ''}${marker}`);
        await page
            .getByLabel(/^Translation \(/)
            .fill(`libro${i ? ` ${i}` : ''}`);
        await page
            .getByRole('button', { name: 'Create card', exact: true })
            .click();
        await expect(
            page.getByRole('dialog', { name: 'Add card', exact: true }),
        ).not.toBeVisible();
        await expect(
            page.getByText(`book${i ? ` ${i}` : ''}${marker}`, { exact: true }),
        ).toBeVisible();
    }
}
function observe(page: Page) {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
        if (
            m.type() === 'error' &&
            !m.text().startsWith('Failed to load resource:')
        )
            errors.push(m.text());
    });
    page.on('response', (r) => {
        if (r.status() >= 500)
            errors.push(`${r.status()} ${new URL(r.url()).pathname}`);
    });
    return () => expect(errors).toEqual([]);
}
async function quote(page: Page) {
    const dialog = page.getByRole('dialog', {
        name: 'Review this action’s budget',
    });
    await expect(dialog).toContainText('Approximate output tokens:');
    await expect(dialog.getByRole('link', { name: 'Top up' })).toHaveAttribute(
        'target',
        '_blank',
    );
    return dialog;
}
async function exactBilling(scope: Locator, amount: string) {
    await expect(scope.getByText('Completed', { exact: true })).toBeVisible();
    await expect(
        scope.getByText(amount === '0' ? 'No charge' : 'Charged: <0.01', {
            exact: true,
        }),
    ).toBeVisible();
    await scope.getByText('Exact amounts', { exact: true }).click();
    await expect(
        scope.getByText(`Charged credits: ${amount}`, { exact: true }),
    ).toBeVisible();
}

// @user-flow ai-accounting/legacy-dictionary-quote-and-billing
test('paid dictionary confirms each reduced allowance and reloads exact billing', async ({
    page,
}, info) => {
    const clean = observe(page);
    const actor = await signup(page, info);
    await budget(page);
    await customerBalance(actor, '40', 'dictionary-generation');
    await dictionary(page);
    const card = page
        .getByRole('listitem')
        .filter({ has: page.getByText('book', { exact: true }) });
    await card.getByRole('button', { name: /Card actions, card/ }).click();
    await page
        .getByRole('menuitem', {
            name: 'Rewrite full card with AI',
            exact: true,
        })
        .click();
    const review = page.getByRole('dialog', {
        name: 'Regenerate card with AI',
    });
    await expect(
        review.getByText('Maximum: 100.00', { exact: true }),
    ).toBeVisible();
    const requests: {
        body: Record<string, unknown>;
        key: string | undefined;
    }[] = [];
    page.on('request', (r) => {
        if (
            r.method() === 'POST' &&
            /\/cards\/[^/]+\/generations$/.test(new URL(r.url()).pathname)
        )
            requests.push({
                body: r.postDataJSON(),
                key: r.headers()['idempotency-key'],
            });
    });
    await review
        .getByRole('button', { name: 'Generate proposal', exact: true })
        .click();
    const dialog = await quote(page);
    expect(requests).toHaveLength(1);
    await customerBalance(actor, '39', 'dictionary-generation');
    const revisedOffer = page.waitForResponse(
        (r) =>
            r.request().method() === 'POST' &&
            /\/cards\/[^/]+\/generations$/.test(new URL(r.url()).pathname) &&
            r.status() === 409,
    );
    await dialog.getByRole('button', { name: 'Send', exact: true }).click();
    expect((await (await revisedOffer).json()).error.code).toBe(
        'action_confirmation_required',
    );
    await quote(page);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual({
        body: { ...requests[0]!.body, confirmedQuoteId: expect.any(String) },
        key: requests[0]!.key,
    });
    await dialog.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(
        review.getByRole('button', { name: 'Accept and update card' }),
    ).toBeVisible({ timeout: 30000 });
    expect(requests).toHaveLength(3);
    const { confirmedQuoteId: firstQuote, ...firstBody } = requests[1]!
        .body as Record<string, unknown>;
    expect(requests[2]).toEqual({
        body: { ...firstBody, confirmedQuoteId: expect.any(String) },
        key: requests[0]!.key,
    });
    expect(
        (requests[2]!.body as Record<string, unknown>).confirmedQuoteId,
    ).not.toBe(firstQuote);
    await exactBilling(review, '0');
    await expect(
        review.getByText('Usage unknown', { exact: true }),
    ).toBeVisible();
    await page.reload();
    await exactBilling(review, '0');
    await expect(
        review.getByText('Usage unknown', { exact: true }),
    ).toBeVisible();
    await page.screenshot({
        path: info.outputPath('legacy-dictionary-exact-billing.png'),
    });
    clean();
});

// @user-flow ai-accounting/legacy-text-quote-and-billing
test('paid text preserves the draft and operation while confirming its allowance', async ({
    page,
}, info) => {
    const clean = observe(page);
    const actor = await signup(page, info);
    await budget(page);
    await customerBalance(actor, '20', 'text-translation');
    await page.goto('/texts/new');
    await page
        .getByLabel('Title', { exact: true })
        .fill('Allowance translation');
    await page
        .getByLabel('Source language', { exact: true })
        .selectOption('en');
    await page
        .getByLabel('Translation language', { exact: true })
        .selectOption('es');
    await page.getByLabel('Source text', { exact: true }).fill('Hello world.');
    const requests: Record<string, unknown>[] = [];
    page.on('request', (r) => {
        if (
            r.method() === 'POST' &&
            new URL(r.url()).pathname.endsWith('/texts/ai/translation')
        )
            requests.push(r.postDataJSON());
    });
    await expect(
        page.getByText('Maximum: 100.00', { exact: true }),
    ).toBeVisible();
    await page
        .getByRole('button', { name: 'Translate via AI', exact: true })
        .filter({ visible: true })
        .first()
        .click();
    const dialog = await quote(page);
    await expect(page.getByLabel('Source text', { exact: true })).toHaveValue(
        'Hello world.',
    );
    expect(requests).toHaveLength(1);
    await dialog.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.locator('[data-reading-pair]').first()).toBeVisible({
        timeout: 30000,
    });
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual({
        ...requests[0],
        confirmedQuoteId: expect.any(String),
    });
    await exactBilling(page.locator('[data-text-workspace]'), '0.004');
    await page.screenshot({
        path: info.outputPath('legacy-text-exact-billing.png'),
    });
    // Save/publish normally, then inspect the same budget in the signed-in shared reader's collection panel.
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page).toHaveURL(/\/texts\/[0-9a-f-]+$/);
    await page.getByLabel('Text options', { exact: true }).click();
    await page
        .getByRole('menuitem', { name: 'Share text', exact: true })
        .click();
    const sharing = page.getByRole('dialog', {
        name: 'Share text',
        exact: true,
    });
    await sharing
        .getByRole('button', { name: 'Create link', exact: true })
        .click();
    const link = sharing.getByLabel('Unlisted link', { exact: true });
    await expect(link).not.toHaveValue('');
    const shared = new URL(await link.inputValue());
    await page.goto(`${shared.pathname}${shared.hash}`);
    const source = page
        .locator('[data-reading-pair][data-side="source"]')
        .filter({ hasText: 'Hello world.' })
        .first();
    await expect(source).toBeVisible();
    await source.scrollIntoViewIfNeeded();
    const bounds = await source.evaluate((element) => {
        const node = element.firstChild!;
        const range = document.createRange();
        range.setStart(node, 0);
        range.setEnd(node, 5);
        const rect = range.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    const y = bounds.y + bounds.height / 2;
    await page.mouse.move(bounds.x + 1, y);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width - 1, y, { steps: 8 });
    await page.mouse.up();
    await expect
        .poll(() => page.evaluate(() => window.getSelection()?.toString()))
        .toBe('Hello');
    await page
        .getByRole('button', { name: 'Add to dictionary', exact: true })
        .click();
    const collection = page.getByRole('dialog', {
        name: 'Add “Hello”',
        exact: true,
    });
    await expect(
        collection.getByText('Maximum: 100.00', { exact: true }),
    ).toBeVisible();
    await page.screenshot({
        path: info.outputPath('shared-selection-maximum.png'),
    });
    clean();
});

async function sentenceSetup(page: Page, maximum = '100.00') {
    await page.getByRole('button', { name: 'Train', exact: true }).click();
    await page
        .getByRole('menuitem', { name: 'Sentence practice', exact: true })
        .click();
    const setup = page.getByRole('dialog', {
        name: 'Sentence practice',
        exact: true,
    });
    await setup.locator('input[value="source-to-target"]').check();
    await setup.locator('input[value="new-only"]').check();
    await expect(
        setup.getByText(`Maximum: ${maximum}`, { exact: true }),
    ).toBeVisible();
    return setup;
}
// @user-flow ai-accounting/legacy-sentence-quote-and-billing
test('paid sentence generation waits for consent and exposes exact charged metadata', async ({
    page,
}, info) => {
    const clean = observe(page);
    const actor = await signup(page, info);
    await budget(page);
    await customerBalance(actor, '20', 'sentence-generation');
    await dictionary(page);
    const setup = await sentenceSetup(page);
    const requests: Record<string, unknown>[] = [];
    page.on('request', (r) => {
        if (
            r.method() === 'POST' &&
            /\/sentences\/next$/.test(new URL(r.url()).pathname)
        )
            requests.push(r.postDataJSON());
    });
    const inDialog = setup.getByRole('button', { name: /Start in a dialog/ });
    await (
        (await inDialog.isVisible())
            ? inDialog
            : setup.getByRole('button', { name: /Start in full screen/ })
    ).click();
    const dialog = await quote(page);
    expect(requests).toHaveLength(1);
    await dialog.getByRole('button', { name: 'Send', exact: true }).click();
    const practice = page.getByRole('dialog', { name: /Sentence practice/ });
    await expect(
        practice.getByRole('button', {
            name: 'book: show hint · Required word',
        }),
    ).toBeVisible({ timeout: 30000 });
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual({
        ...requests[0],
        confirmedQuoteId: expect.any(String),
    });
    await expect(
        practice.getByText('Charged: 0.2', { exact: true }),
    ).toBeVisible();
    await practice.getByText('Exact amounts', { exact: true }).click();
    await expect(
        practice.getByText('Charged credits: 0.2', { exact: true }),
    ).toBeVisible();
    await page.screenshot({
        path: info.outputPath('legacy-sentence-exact-billing.png'),
    });
    clean();
});

// @user-flow ai-accounting/preparation-one-budget-explicit-continue
test('sentence preparation spends one total allowance and requires explicit new budget', async ({
    page,
}, info) => {
    test.setTimeout(90000);
    const clean = observe(page);
    const actor = await signup(page, info);
    await budget(page, '400');
    await customerBalance(actor, '400', 'sentence-generation');
    await dictionary(page, 3, ' [budget-output-limit]');
    const setup = await sentenceSetup(page, '400.00');
    await setup
        .getByRole('switch', { name: /Prepare.*dictionary.*advance/i })
        .check();
    const starts: Record<string, unknown>[] = [];
    const commands: Record<string, unknown>[] = [];
    let paused: Record<string, unknown> | undefined;
    page.on('request', (r) => {
        const path = new URL(r.url()).pathname;
        if (r.method() === 'POST' && path.endsWith('/sentences/preparations'))
            starts.push(r.postDataJSON());
        if (
            r.method() === 'POST' &&
            /\/sentences\/preparations\/[^/]+\/commands$/.test(path)
        )
            commands.push(r.postDataJSON());
    });
    page.on('response', async (r) => {
        if (
            r.request().method() === 'GET' &&
            /\/sentences\/preparations\/[^/]+$/.test(
                new URL(r.url()).pathname,
            ) &&
            r.status() === 200
        ) {
            const payload = await r.json();
            if (payload.preparation.state === 'paused')
                paused = payload.preparation;
        }
    });
    await setup
        .getByRole('button', { name: 'Start preparation', exact: true })
        .click();
    const progress = page.getByRole('dialog', {
        name: 'Sentence preparation',
        exact: true,
    });
    await expect(
        progress.getByText(
            'Preparation uses one total budget. Continue authorizes a new budget explicitly.',
            { exact: true },
        ),
    ).toBeVisible();
    await expect(
        progress.getByText('Remaining output tokens: 0', { exact: true }),
    ).toBeVisible({ timeout: 50000 });
    expect(starts).toHaveLength(1);
    await expect
        .poll(() => paused)
        .toMatchObject({
            pauseReason: 'budget',
            remainingOutputTokens: 0,
            requiresNewBudget: true,
        });
    expect(commands).toHaveLength(0);
    // A settled parent must hold nothing; the guarded CLI refuses active holds.
    // Replenish only synthetic credits so this assertion isolates explicit Continue.
    await customerBalance(actor, '400', 'sentence-generation');
    const continued = page.waitForResponse(
        (r) =>
            r.request().method() === 'POST' &&
            /\/sentences\/preparations\/[^/]+\/commands$/.test(
                new URL(r.url()).pathname,
            ) &&
            r.status() < 300,
    );
    await page.screenshot({
        path: info.outputPath('preparation-explicit-new-budget.png'),
    });
    await progress
        .getByRole('button', {
            name: 'Continue with a new budget',
            exact: true,
        })
        .first()
        .click();
    await continued;
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({ action: 'continue' });
    await expect(
        progress.getByText('All words are covered', { exact: true }),
    ).toBeVisible({ timeout: 30000 });
    clean();
});
