import { expect, test, type BrowserContext, type Page } from '@playwright/test';

// @user-flow-revision dictionary-pronunciation-audio sha256:a41d88bcb8a500f2
const runId = process.env.AUTH_E2E_RUN_ID ?? String(Date.now());
let context: BrowserContext;
let page: Page;

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
    await editor.getByLabel(/^Source word or phrase \(/u).fill('casa');
    await editor.getByLabel(/^Translation \(/u).fill('house');
    await editor.getByLabel(/^Context example \(/u).fill('La casa es grande.');
    await editor
        .getByLabel(/^Example translation \(/u)
        .fill('The house is large.');
    await editor.getByRole('button', { name: 'Save card' }).click();
    await expect(page.getByText('casa', { exact: true })).toBeVisible();
}

async function playedCount() {
    return page.evaluate(
        () => (window as Window & { audioPlayed?: number }).audioPlayed ?? 0,
    );
}

async function play(field: string) {
    const before = await playedCount();
    const content = page.waitForResponse(
        (response) =>
            response.url().includes('/audio/') &&
            response.url().includes('/content?') &&
            response.status() === 200,
    );
    await page
        .getByRole('button', { name: `Play ${field}`, exact: true })
        .click();
    const response = await content;
    await expect
        .poll(async () => {
            if (
                await page
                    .getByText('Ready — press Play', { exact: false })
                    .isVisible()
            ) {
                await page
                    .getByRole('button', { name: `Play ${field}`, exact: true })
                    .click();
            }
            return playedCount();
        })
        .toBeGreaterThan(before);
    expect((await response.body()).byteLength).toBeGreaterThan(44);
    expect(response.headers()['cache-control']).toContain('no-store');
    await expect(
        page.getByText('Development sound — not a pronunciation recording.', {
            exact: false,
        }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', { name: `Play ${field}`, exact: true }),
    ).toBeVisible();
    return response;
}

test.describe.serial('dictionary pronunciation audio', () => {
    test.beforeAll(async ({ browser }) => {
        context = await browser.newContext();
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
    test.afterAll(async () => {
        await context?.close();
    });

    // @user-flow dictionary-pronunciation-audio/owner-plays-four-card-fields
    test('plays four saved fields through real worker and private byte storage', async () => {
        await createCard('fields');
        for (const field of [
            'Source phrase',
            'Translation',
            'Context example',
            'Example translation',
        ])
            await play(field);
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
    });

    // @user-flow dictionary-pronunciation-audio/repeat-play-reuses-audio-and-edits-refresh
    test('reuses a clip and selects a different asset after an edit', async () => {
        await createCard('cache');
        const first = await play('Source phrase');
        const second = await play('Source phrase');
        expect(new URL(first.url()).searchParams.get('assetId')).toBe(
            new URL(second.url()).searchParams.get('assetId'),
        );
        await page
            .getByRole('button', { name: 'Card actions, card 1' })
            .click();
        await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
        const editor = page.getByRole('dialog', { name: 'Edit card' });
        await editor.getByLabel(/^Source word or phrase \(/u).fill('hogar');
        await editor.getByRole('button', { name: 'Save card' }).click();
        await expect(page.getByText('hogar', { exact: true })).toBeVisible();
        const edited = await play('Source phrase');
        expect(new URL(edited.url()).searchParams.get('assetId')).not.toBe(
            new URL(first.url()).searchParams.get('assetId'),
        );
    });

    // @user-flow dictionary-pronunciation-audio/audio-failure-retry-and-selection-cancellation
    test('retries a failed download and stops a delayed selection without playback', async () => {
        await createCard('failure');
        const cached = await play('Source phrase');
        await page.route(
            '**/audio/source/content?*',
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
            page.getByText('Audio failed. Press Play to retry.', {
                exact: false,
            }),
        ).toBeVisible();
        const retried = await play('Source phrase');
        expect(retried.url()).toBe(cached.url());
        let release!: () => void;
        const held = new Promise<void>((resolve) => {
            release = resolve;
        });
        await page.route(
            '**/audio/source/content?*',
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
                name: 'Stop Source phrase',
                exact: true,
            }),
        ).toBeVisible();
        await page
            .getByRole('button', {
                name: 'Stop Source phrase',
                exact: true,
            })
            .click();
        release();
        await expect(page.getByText('Stopped', { exact: false })).toBeVisible();
        await play('Translation');
        expect(await playedCount()).toBe(before + 1);
    });

    // @user-flow dictionary-pronunciation-audio/archived-or-removed-owner-cannot-play-audio
    test('denies previously ready bytes after card archive', async () => {
        await createCard('archive');
        const cached = await play('Source phrase');
        const authorization = cached.request().headers()['authorization']!;
        await page
            .getByRole('button', { name: 'Card actions, card 1' })
            .click();
        await page
            .getByRole('menuitem', { name: 'Archive', exact: true })
            .click();
        await expect(
            page.getByRole('button', { name: 'Play Source phrase' }),
        ).toHaveCount(0);
        const denied = await context.request.get(cached.url(), {
            headers: { authorization },
        });
        expect(denied.status()).toBe(404);
    });
});
