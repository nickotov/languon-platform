import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import {
    installSpeechAudioProbe,
    browserAudioEvidence,
} from './support/speech-browser-audio';

// @user-flow-revision dictionary-pronunciation-audio sha256:eee1e8b11828995b
const runId = process.env.AUTH_E2E_RUN_ID ?? String(Date.now());
let context: BrowserContext;
let page: Page;
let pageErrors: string[] = [];
let consoleErrors: string[] = [];
let failedRequests: string[] = [];

async function createCard(name: string) {
    await page.goto('/dictionaries');
    await page.getByRole('button', { name: 'New dictionary' }).click();
    await page.getByLabel('Name').fill(`Audio ${name} ${runId}`);
    await page.getByLabel('Translate from').selectOption('es');
    await page.getByLabel('Translate to').selectOption('en');
    await page
        .getByRole('button', { name: 'Create dictionary', exact: true })
        .click();
    await expect(
        page.getByRole('heading', { name: 'No cards yet' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Add card', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Add card' });
    await editor
        .getByLabel(/^Source word or phrase \(/u)
        .fill(`casa ${name} ${runId}`);
    await editor.getByLabel(/^Translation \(/u).fill('house');
    await editor.getByLabel(/^Context example \(/u).fill('La casa es grande.');
    await editor
        .getByLabel(/^Example translation \(/u)
        .fill('The house is large.');
    await editor.getByRole('button', { name: 'Create card' }).click();
    await expect(
        page.getByText(`casa ${name} ${runId}`, { exact: true }),
    ).toBeVisible();
}

async function playedCount() {
    return page.evaluate(
        () => (window as Window & { audioPlayed?: number }).audioPlayed ?? 0,
    );
}

async function play(field: string) {
    const control = page.getByRole('button', {
        name: `Play ${field}`,
        exact: true,
    });
    await expect(control).toBeVisible();
    const before = await playedCount();
    const content = page.waitForResponse(
        (response) =>
            response.url().includes('/speech/playbacks/') &&
            response.url().endsWith('/content') &&
            response.status() === 200,
    );
    const preparation = page.waitForResponse(
        (response) =>
            response.url().endsWith('/speech/prepare') &&
            [200, 202].includes(response.status()),
    );
    await control.click();
    const response = await content;
    await expect
        .poll(async () => {
            if (
                (await page
                    .getByRole('status')
                    .filter({ hasText: 'Audio is ready. Press Play.' })
                    .count()) > 0
            ) {
                await page
                    .getByRole('button', { name: `Play ${field}`, exact: true })
                    .click();
            }
            return playedCount();
        })
        .toBeGreaterThan(before);
    const evidence = await browserAudioEvidence(page, response.url());
    expect(response.headers()['cache-control']).toContain('no-store');
    const preparedResponse = await preparation;
    expect(
        preparedResponse.request().postDataJSON().source
            .expectedDictionaryVersion,
    ).toBeGreaterThan(0);
    expect(
        preparedResponse.request().postDataJSON().source
            .expectedSettingsVersion,
    ).toBeGreaterThan(0);
    const prepared = await preparedResponse.json();
    expect(prepared.fixture).toBe(true);
    await expect(
        page.getByRole('button', { name: `Play ${field}`, exact: true }),
    ).toBeVisible();
    return { response, evidence, initialState: prepared.state };
}

test.describe.serial('dictionary pronunciation audio', () => {
    test.beforeAll(async ({ browser }) => {
        context = await browser.newContext();
        await installSpeechAudioProbe(context);
        await context.addInitScript(() => {
            const play = HTMLMediaElement.prototype.play;
            HTMLMediaElement.prototype.play = function () {
                this.addEventListener(
                    'playing',
                    () => {
                        const state = window as Window & {
                            audioPlayed?: number;
                        };
                        state.audioPlayed = (state.audioPlayed ?? 0) + 1;
                    },
                    { once: true },
                );
                return play.call(this);
            };
        });
        page = await context.newPage();
        page.on('pageerror', (error) => pageErrors.push(error.message));
        page.on('console', (message) => {
            if (
                message.type() === 'error' &&
                !message.text().includes('503 (Service Unavailable)')
            )
                consoleErrors.push(message.text());
        });
        page.on('requestfailed', (request) => {
            if (!request.failure()?.errorText.includes('ERR_ABORTED'))
                failedRequests.push(
                    `${new URL(request.url()).pathname}: ${request.failure()?.errorText}`,
                );
        });
        await page.goto('/signup?returnTo=%2Fdictionaries');
        await page.getByLabel('Email').fill(`audio-${runId}@example.test`);
        await page
            .getByLabel('Password', { exact: true })
            .fill('Audio-Journey-Password-24!');
        await page.getByRole('button', { name: 'Create account' }).click();
        await expect(page).toHaveURL(/\/verify-email\?/);
        await page.getByLabel('Verification code').fill('0000');
        await page.getByRole('button', { name: 'Verify email' }).click();
        await expect(page).toHaveURL(/\/dictionaries$/);
    });
    test.beforeEach(() => {
        pageErrors = [];
        consoleErrors = [];
        failedRequests = [];
    });
    test.afterEach(() => {
        expect(pageErrors).toEqual([]);
        expect(consoleErrors).toEqual([]);
        expect(failedRequests).toEqual([]);
    });
    test.afterAll(async () => {
        await context?.close();
    });

    // @user-flow dictionary-pronunciation-audio/owner-plays-four-card-fields
    test('plays only source and translation with icon-only tooltip controls', async () => {
        await createCard('fields');
        for (const field of ['Source phrase', 'Translation']) await play(field);
        for (const field of ['Context example', 'Example translation']) {
            await expect(
                page.getByRole('button', {
                    name: `Play ${field}`,
                    exact: true,
                }),
            ).toHaveCount(0);
        }
        const sourceControl = page.getByRole('button', {
            name: 'Play Source phrase',
            exact: true,
        });
        await expect(page.getByRole('button', { name: /^Play /u })).toHaveCount(
            2,
        );
        await expect(sourceControl).toHaveText('');
        await expect(page.getByRole('status').first()).toHaveCSS(
            'clip-path',
            'inset(50%)',
        );
        await sourceControl.focus();
        await expect(
            page.getByRole('tooltip', { name: /^Play Source phrase/u }),
        ).toContainText('Play Source phrase');
        await page.keyboard.press('Escape');
        await expect(
            page.getByRole('tooltip', { name: /^Play Source phrase/u }),
        ).toBeHidden();
        await expect(
            page.getByRole('combobox', { name: 'Playback speed' }),
        ).toHaveCount(0);
        await page
            .getByRole('button', { name: 'Card actions, card 1' })
            .click();
        await expect(
            page.getByRole('menuitem', { name: /Move earlier|Move later/ }),
        ).toHaveCount(0);
        await page.keyboard.press('Escape');
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(
            page.getByRole('button', { name: 'Play Source phrase' }),
        ).toBeVisible();
        expect(
            await page.evaluate(
                () =>
                    document.documentElement.scrollWidth <=
                    document.documentElement.clientWidth + 1,
            ),
        ).toBe(true);
        await page.setViewportSize({ width: 1280, height: 720 });
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
        const { capability } = await (await sharing).json();
        await page.goto(
            `/shared/dictionaries/${capability.shareId}#${capability.shareKey}`,
        );
        await expect(page.getByRole('button', { name: /^Play /u })).toHaveCount(
            2,
        );
        await expect(
            page.getByRole('button', { name: 'Play Source phrase' }),
        ).toHaveText('');
        await expect(
            page.getByText('La casa es grande.', { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText('The house is large.', { exact: true }),
        ).toBeVisible();
        for (const field of ['Context example', 'Example translation']) {
            await expect(
                page.getByRole('button', {
                    name: `Play ${field}`,
                    exact: true,
                }),
            ).toHaveCount(0);
        }
    });

    // @user-flow dictionary-pronunciation-audio/repeat-play-reuses-audio-and-edits-refresh
    test('reuses a clip and selects a different asset after an edit', async () => {
        await createCard('cache');
        const first = await play('Source phrase');
        const second = await play('Source phrase');
        expect(second.initialState).toBe('ready');
        expect(second.evidence.checksum).toBe(first.evidence.checksum);
        await page
            .getByRole('button', { name: 'Card actions, card 1' })
            .click();
        await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
        const editor = page.getByRole('dialog', { name: 'Edit card' });
        await editor
            .getByLabel(/^Source word or phrase \(/u)
            .fill(`hogar cache ${runId}`);
        await editor.getByRole('button', { name: 'Save card' }).click();
        await expect(
            page.getByText(`hogar cache ${runId}`, { exact: true }),
        ).toBeVisible();
        const edited = await play('Source phrase');
        expect(edited.initialState).toBe('queued');
    });

    // @user-flow dictionary-pronunciation-audio/audio-failure-retry-and-selection-cancellation
    test('retries a failed download and stops a delayed selection without playback', async () => {
        await createCard('failure');
        const cached = await play('Source phrase');
        await page.route(
            '**/speech/playbacks/*/content',
            (route) =>
                route.fulfill({
                    status: 503,
                    contentType: 'application/json',
                    body: '{}',
                }),
            { times: 1 },
        );
        await page
            .getByRole('button', {
                name: 'Play Source phrase',
                exact: true,
            })
            .click();
        await expect(
            page.getByRole('status').filter({
                hasText: 'Pronunciation could not be prepared. Try again.',
            }),
        ).toHaveCount(1);
        await page
            .getByRole('button', { name: 'Play Source phrase', exact: true })
            .focus();
        await expect(
            page.getByRole('tooltip', { name: /^Play Source phrase/u }),
        ).toContainText('Pronunciation could not be prepared. Try again.');
        const retried = await play('Source phrase');
        expect(retried.initialState).toBe('ready');
        expect(retried.evidence.checksum).toBe(cached.evidence.checksum);
        let release!: () => void;
        const held = new Promise<void>((resolve) => {
            release = resolve;
        });
        await page.route(
            '**/speech/playbacks/*/content',
            async (route) => {
                const response = await route.fetch();
                await held;
                await route.fulfill({ response }).catch(() => undefined);
            },
            { times: 1 },
        );
        const before = await playedCount();
        await page
            .getByRole('button', {
                name: 'Play Source phrase',
                exact: true,
            })
            .click();
        await expect(
            page.getByRole('button', {
                name: 'Play Source phrase',
                exact: true,
            }),
        ).toHaveAttribute('aria-busy', 'true');
        await expect(
            page.getByRole('button', { name: 'Stop waiting', exact: true }),
        ).toHaveText('');
        await page
            .getByRole('button', {
                name: 'Stop waiting',
                exact: true,
            })
            .click();
        await expect(
            page.getByRole('button', { name: 'Stop waiting', exact: true }),
        ).toHaveCount(0);
        release();
        await expect(
            page
                .getByRole('status')
                .filter({ hasText: 'Preparing pronunciation…' }),
        ).toHaveCount(0);
        await play('Translation');
        expect(await playedCount()).toBe(before + 1);
    });

    // @user-flow dictionary-pronunciation-audio/archived-or-removed-owner-cannot-play-audio
    test('denies previously ready bytes after card archive', async () => {
        await createCard('archive');
        const cached = await play('Source phrase');
        const authorization = cached.response.request().headers()[
            'authorization'
        ]!;
        await page
            .getByRole('button', { name: 'Card actions, card 1' })
            .click();
        await page
            .getByRole('menuitem', { name: 'Archive', exact: true })
            .click();
        await expect(
            page.getByRole('button', { name: 'Play Source phrase' }),
        ).toHaveCount(0);
        const denied = await context.request.get(cached.response.url(), {
            headers: { authorization },
        });
        expect(denied.status()).toBe(404);
    });
});
