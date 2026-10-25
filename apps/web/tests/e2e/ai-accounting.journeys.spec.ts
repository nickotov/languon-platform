// @user-flow-revision ai-accounting sha256:1c4a76dd9129b96d
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type {
    ConversationDetail,
    SubmitConversationTurnRequest,
} from '@languon/contracts';

const liveTokens = new WeakMap<Page, string>();

async function signup(page: Page, info: TestInfo) {
    page.on('response', async (response) => {
        if (
            response.status() === 200 &&
            /\/auth\/(refresh|email-verification\/verify)$/u.test(
                new URL(response.url()).pathname,
            )
        ) {
            const payload = await response.json();
            if (typeof payload.accessToken === 'string')
                liveTokens.set(page, payload.accessToken);
        }
    });
    await page.goto('/signup?returnTo=%2Ftexts');
    await page
        .getByLabel('Email')
        .fill(`accounting-${Date.now()}-${info.workerIndex}@example.test`);
    await page
        .getByLabel('Password', { exact: true })
        .fill('Synthetic accounting password 47!');
    await page
        .getByRole('button', { name: 'Create account', exact: true })
        .click();
    await page.getByLabel('Verification code').fill('0000');
    const verified = page.waitForResponse(
        (response) =>
            response.url().endsWith('/auth/email-verification/verify') &&
            response.status() === 200,
    );
    await page
        .getByRole('button', { name: 'Verify email', exact: true })
        .click();
    const { accessToken } = await (await verified).json();
    await expect(page).toHaveURL(/\/texts$/);
    return accessToken as string;
}
async function api(page: Page, token: string, path: string, data?: unknown) {
    const response = await page.request.fetch(`/api${path}`, {
        method: data === undefined ? 'GET' : 'POST',
        headers: {
            Authorization: `Bearer ${liveTokens.get(page) ?? token}`,
            Origin: 'http://localhost:3336',
        },
        ...(data === undefined ? {} : { data }),
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
}
function observe(page: Page) {
    const failures: string[] = [];
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('console', (message) => {
        if (
            message.type() === 'error' &&
            !message.text().startsWith('Failed to load resource:')
        )
            failures.push(message.text());
    });
    page.on('response', (response) => {
        const path = new URL(response.url()).pathname;
        if (
            response.status() >= 400 &&
            !(response.status() === 401 && path.endsWith('/auth/refresh')) &&
            !(
                response.status() === 409 &&
                /\/conversations\/[^/]+\/turns$/.test(path)
            )
        )
            failures.push(`${response.status()} ${path}`);
    });
    page.on('requestfailed', (request) => {
        if (!request.failure()?.errorText.includes('ERR_ABORTED'))
            failures.push(request.failure()?.errorText ?? 'request failed');
    });
    return () => expect(failures).toEqual([]);
}

// @user-flow ai-accounting/learner-budget-persists-exactly
test('learner persists exact budget and sees compact disclosure on narrow and wide profile', async ({
    page,
}, info) => {
    const clean = observe(page);
    const token = await signup(page, info);
    await page.goto('/profile#ai-preferences');
    const input = page.getByRole('textbox', {
        name: 'Maximum credits per action',
    });
    await input.fill('20.125');
    await page
        .getByRole('button', { name: 'Save preference', exact: true })
        .click();
    await expect(
        page.getByText('Preference saved. New requests will use it.'),
    ).toBeVisible();
    const saved = await api(page, token, '/users/me/ai-model-preference');
    expect(saved.maxCreditsPerAction).toBe('20.125');
    await page.reload();
    await expect(input).toHaveValue('20.125');
    await page.getByText('Maximum: 20.13', { exact: true }).click();
    await expect(
        page.getByText('Exact value: 20.125', { exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(input).toBeVisible();
    await expect(
        page.getByText('Exact value: 20.125', { exact: true }),
    ).toBeVisible();
    await page.screenshot({
        path: info.outputPath('budget-profile-narrow.png'),
        fullPage: true,
    });
    clean();
});

// @user-flow ai-accounting/quoted-send-and-explicit-continuation
test('learner confirms a reduced output allowance and explicitly starts a new action after a response limit', async ({
    page,
}, info) => {
    const clean = observe(page);
    const token = await signup(page, info);
    await page.goto('/profile#ai-preferences');
    await page
        .getByRole('textbox', { name: 'Maximum credits per action' })
        .fill('60.125');
    await page
        .getByRole('button', { name: 'Save preference', exact: true })
        .click();
    await expect(
        page.getByText('Preference saved. New requests will use it.'),
    ).toBeVisible();
    const { text } = await api(page, token, '/texts', {
        folderId: null,
        title: 'Accounting fixture',
        sourceText: 'We rested on the bank.',
        sourceLanguage: 'en',
        targetLanguage: 'es',
    });
    await page.goto(`/texts/${text.id}`);
    const created = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            new URL(response.url()).pathname.endsWith('/conversations') &&
            response.status() === 200,
    );
    await page.getByRole('button', { name: /^Open language tutor/ }).click();
    const { conversation } = await (await created).json();
    const tutor = page.getByRole('region', {
        name: 'Language tutor',
        exact: true,
    });
    await expect(
        tutor.getByText('Maximum: 60.13', { exact: true }),
    ).toHaveCount(0);
    const requests: SubmitConversationTurnRequest[] = [];
    page.on('request', (request) => {
        if (
            request.method() === 'POST' &&
            /\/conversations\/[^/]+\/turns$/.test(
                new URL(request.url()).pathname,
            )
        )
            requests.push(request.postDataJSON());
    });
    await page
        .getByLabel('Your question')
        .fill('Explain bank — output limit fixture');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    const dialog = page.getByRole('dialog', {
        name: 'Review this action’s budget',
    });
    await expect(dialog).toContainText('Approximate output tokens:');
    await expect(dialog.getByRole('link', { name: 'Top up' })).toHaveAttribute(
        'target',
        '_blank',
    );
    expect(requests).toHaveLength(1);
    const before = (await api(
        page,
        token,
        `/conversations/${conversation.id}`,
    )) as ConversationDetail;
    expect(before.turns).toHaveLength(0);
    await expect(page.getByLabel('Your question')).toHaveValue(
        'Explain bank — output limit fixture',
    );
    await page.screenshot({
        path: info.outputPath('quote-confirmation-wide.png'),
    });
    await dialog.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(
        tutor.getByRole('button', { name: 'Continue', exact: true }),
    ).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual({
        ...requests[0],
        confirmedQuoteId: expect.any(String),
    });
    const detail = (await api(
        page,
        token,
        `/conversations/${conversation.id}`,
    )) as ConversationDetail;
    expect(detail.turns).toHaveLength(1);
    const turn = detail.turns[0]!;
    expect(turn.outputLimitReached).toBe(true);
    expect(turn.billing?.state).toBe('charged');
    expect(Number(turn.billing!.chargedCredits)).toBeGreaterThan(0);
    await expect(tutor.getByRole('button', { name: /^Charged:/ })).toHaveCount(
        0,
    );
    await expect(
        page.getByRole('dialog', { name: 'Usage', exact: true }),
    ).toHaveCount(0);
    await tutor.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(dialog).toBeVisible();
    expect(requests).toHaveLength(3);
    expect(requests[2]!.requestId).not.toBe(requests[0]!.requestId);
    expect(requests[2]!.retryOf).toBeUndefined();
    await dialog
        .getByRole('button', { name: 'Keep editing', exact: true })
        .click();
    expect(
        (await api(page, token, `/conversations/${conversation.id}`)).turns,
    ).toHaveLength(1);
    clean();
});
