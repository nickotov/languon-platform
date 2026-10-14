// @user-flow-revision shared-pronunciation-playback sha256:56b7a5103be1a668
import {
    expect,
    test,
    type Browser,
    type BrowserContext,
    type Page,
    type Request,
} from '@playwright/test';

import {
    installSpeechAudioProbe,
    browserAudioEvidence,
} from './support/speech-browser-audio';
import { speechCreditFixture } from './support/speech-credit-fixture';

const runId = process.env.AUTH_E2E_RUN_ID ?? String(Date.now());
const password = 'Speech-Journey-Password-24!';

async function learner(browser: Browser, role: string) {
    const context = await browser.newContext();
    await installSpeechAudioProbe(context);
    const page = await context.newPage();
    await page.goto('/signup?returnTo=%2Fdictionaries');
    await page.getByLabel('Email').fill(`speech-${role}-${runId}@example.test`);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page
        .getByRole('button', { name: 'Create account', exact: true })
        .click();
    await expect(page).toHaveURL(/\/verify-email\?/);
    await page.getByLabel('Verification code').fill('0000');
    const verification = page.waitForResponse(
        (response) =>
            response.url().endsWith('/auth/email-verification/verify') &&
            response.status() === 200,
    );
    await page.getByRole('button', { name: 'Verify email' }).click();
    const { AuthenticationSuccessResponseSchema } =
        await import('@languon/contracts');
    const verified = AuthenticationSuccessResponseSchema.parse(
        await (await verification).json(),
    );
    await expect(page).toHaveURL(/\/dictionaries$/);
    return { context, page, actorId: verified.user.id };
}

async function savedWord(
    page: Page,
    text: string,
    role: string,
    sourceLanguage = 'es',
) {
    await page.goto('/dictionaries');
    await page.getByRole('button', { name: 'New dictionary' }).click();
    await page.getByLabel('Name').fill(`Speech ${role} ${runId}`);
    await page.getByLabel('Translate from').selectOption(sourceLanguage);
    await page.getByLabel('Translate to').selectOption('en');
    await page
        .getByRole('button', { name: 'Create dictionary', exact: true })
        .click();
    await page.getByRole('button', { name: 'Add card', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Add card' });
    await editor.getByLabel(/^Source word or phrase \(/u).fill(text);
    await editor.getByLabel(/^Translation \(/u).fill('Saved translation');
    await editor.getByRole('button', { name: 'Create card' }).click();
    if (sourceLanguage !== 'he')
        await expect(
            page.getByRole('button', {
                name: 'Play Source phrase',
                exact: true,
            }),
        ).toBeVisible();
}

async function preparation(page: Page) {
    const response = page.waitForResponse(
        (value) =>
            value.url().endsWith('/speech/prepare') &&
            [200, 202].includes(value.status()),
    );
    await page
        .getByRole('button', { name: 'Play Source phrase', exact: true })
        .click();
    return (await response).json();
}

test.describe.serial('shared pronunciation playback', () => {
    let first: { context: BrowserContext; page: Page; actorId: string };
    let second: { context: BrowserContext; page: Page; actorId: string };
    test.beforeAll(async ({ browser }, info) => {
        first = await learner(browser, `first-${info.workerIndex}`);
        second = await learner(browser, `second-${info.workerIndex}`);
    });
    test.afterAll(async () => {
        await first?.context.close();
        await second?.context.close();
    });

    // @user-flow shared-pronunciation-playback/free-generation-and-shared-reuse
    test('reuses normalized saved text across authenticated accounts without another generation', async () => {
        const text = `palabra ${runId} ${test.info().workerIndex}`;
        await savedWord(first.page, text, 'first');
        const bytes = first.page.waitForResponse(
            (value) =>
                value.url().includes('/speech/playbacks/') &&
                value.url().endsWith('/content') &&
                value.status() === 200,
        );
        const initial = await preparation(first.page);
        expect(initial.state).toBe('queued');
        expect(initial.quote).toBeNull();
        await browserAudioEvidence(first.page, (await bytes).url());
        await savedWord(second.page, `  ${text}  `, 'second');
        const cached = await preparation(second.page);
        expect(cached.state).toBe('ready');
        expect(cached.billingState).toBe('free');
        expect(cached.quote).toBeNull();
        expect(cached.playbackId).not.toBe(initial.requestId);
        await second.page.setViewportSize({ width: 390, height: 844 });
        expect(
            await second.page.evaluate(
                () =>
                    document.documentElement.scrollWidth <=
                    document.documentElement.clientWidth + 1,
            ),
        ).toBe(true);
    });

    // @user-flow shared-pronunciation-playback/paid-generation-confirmation-cancellation
    test('shows exact success-only billing and requires confirmation before paid generation', async () => {
        const text = `Esta frase de ejemplo contiene muchas palabras para comprobar la confirmación antes de generar una pronunciación ${runId}.`;
        await savedWord(first.page, text, 'paid');
        let confirmations = 0;
        const observe = (request: Request) => {
            if (request.url().endsWith('/speech/confirm')) ++confirmations;
        };
        first.page.on('request', observe);
        const result = await preparation(first.page);
        expect(result.state).toBe('confirmation_required');
        expect(result.requestId).toBeNull();
        const dialog = first.page.getByRole('dialog', {
            name: 'Generate pronunciation?',
        });
        await expect(dialog).toBeVisible();
        await expect(
            dialog.getByText(`${result.quote.credits} credits`, {
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            dialog.getByText(/charged only if audio is saved successfully/),
        ).toBeVisible();
        await expect(
            dialog.getByText('Provisional price', { exact: true }),
        ).toBeVisible();
        if (
            !result.quote.unlimited &&
            BigInt(result.quote.availableCredits) < BigInt(result.quote.credits)
        ) {
            await expect(
                dialog.getByText('Not enough credits.', { exact: true }),
            ).toBeVisible();
            await expect(
                dialog.getByRole('button', { name: 'Generate', exact: true }),
            ).toBeDisabled();
        }
        await dialog
            .getByRole('button', { name: 'Cancel', exact: true })
            .click();
        await expect(dialog).toHaveCount(0);
        expect(confirmations).toBe(0);
        const repeated = await preparation(first.page);
        expect(repeated.state).toBe('confirmation_required');
        expect(confirmations).toBe(0);
        await first.page
            .getByRole('dialog', { name: 'Generate pronunciation?' })
            .getByRole('button', { name: 'Cancel', exact: true })
            .click();
        first.page.off('request', observe);
    });
    // @user-flow shared-pronunciation-playback/paid-generation-confirmed-success
    test('confirms a finite credit quote, settles saved audio once, and replays for free', async () => {
        test.setTimeout(90_000);
        const before = await speechCreditFixture(first.actorId, 'grant');
        expect(before.availableCredits).toBe('1000');
        expect(before.reservedCredits).toBe('0');
        expect(before.consumedCredits).toBe('0');
        const text = `Esta generación ${runId} ${test.info().workerIndex} comprueba que la pronunciación se guarda antes de cobrar los créditos confirmados por el estudiante.`;
        await savedWord(first.page, text, 'finite-paid');
        const quoted = await preparation(first.page);
        expect(quoted.state).toBe('confirmation_required');
        expect(quoted.quote.unlimited).toBe(false);
        expect(quoted.quote.availableCredits).toBe('1000');
        const amount = BigInt(quoted.quote.credits);
        expect(amount).toBeGreaterThan(0n);
        const dialog = first.page.getByRole('dialog', {
            name: 'Generate pronunciation?',
        });
        await expect(
            dialog.getByText(`${quoted.quote.credits} credits`, {
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            dialog.getByText('Available credits: 1,000', { exact: true }),
        ).toBeVisible();
        const confirmation = first.page.waitForResponse(
            (value) =>
                value.url().endsWith('/speech/confirm') &&
                [200, 202].includes(value.status()),
        );
        const bytes = first.page.waitForResponse(
            (value) =>
                value.url().includes('/speech/playbacks/') &&
                value.url().endsWith('/content') &&
                value.status() === 200,
        );
        await dialog
            .getByRole('button', { name: 'Generate', exact: true })
            .click();
        const admitted = await (await confirmation).json();
        expect(admitted.billingState).toBe('reserved');
        expect(admitted.quote).toBeNull();
        await browserAudioEvidence(first.page, (await bytes).url());
        const after = await speechCreditFixture(first.actorId, 'summary');
        expect(after.reservedCredits).toBe('0');
        expect(BigInt(after.consumedCredits)).toBe(amount);
        expect(BigInt(after.availableCredits)).toBe(1000n - amount);
        const cached = await preparation(first.page);
        expect(cached.state).toBe('ready');
        expect(cached.billingState).toBe('free');
        expect(cached.quote).toBeNull();
        expect(await speechCreditFixture(first.actorId, 'summary')).toEqual(
            after,
        );
    });
    // @user-flow shared-pronunciation-playback/unsupported-language-controls
    test('hides Hebrew pronunciation while a supported English translation remains playable', async () => {
        await savedWord(first.page, `שלום ${runId}`, 'unsupported', 'he');
        await expect(
            first.page.getByRole('button', {
                name: 'Play Translation',
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            first.page.getByRole('button', {
                name: 'Play Source phrase',
                exact: true,
            }),
        ).toHaveCount(0);
        await expect(
            first.page.getByText(`שלום ${runId}`, { exact: true }),
        ).toBeVisible();
    });
});
