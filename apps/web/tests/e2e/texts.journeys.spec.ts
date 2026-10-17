// @user-flow-revision texts sha256:4df9322d0beb2f55

import {
    expect,
    test,
    type Locator,
    type Page,
    type TestInfo,
} from '@playwright/test';
import type {
    TextDocument,
    CreateTextFolderRequest,
    CreateTextRequest,
    EnqueueTextTranslationRequest,
    SaveTextRequest,
} from '@languon/contracts';

const runId = process.env.AUTH_E2E_RUN_ID ?? 'local';
async function signup(page: Page, info: TestInfo, role: string) {
    await page.goto('/signup?returnTo=%2Ftexts');
    await page
        .getByLabel('Email')
        .fill(`texts-web-${runId}-${info.workerIndex}-${role}@example.test`);
    await page
        .getByLabel('Password', { exact: true })
        .fill('Synthetic web password 47!');
    const signupResponse = page.waitForResponse((response) =>
        response.url().endsWith('/auth/sign-up'),
    );
    await page
        .getByRole('button', { name: 'Create account', exact: true })
        .click();
    const registered = await signupResponse;
    expect(registered.status(), await registered.text()).toBe(202);
    await page.getByLabel('Verification code').fill('0000');
    const verified = page.waitForResponse(
        (r) =>
            r.url().endsWith('/auth/email-verification/verify') &&
            r.status() === 200,
    );
    await page
        .getByRole('button', { name: 'Verify email', exact: true })
        .click();
    const auth = (await (await verified).json()) as { accessToken: string };
    await expect(page).toHaveURL(/\/texts$/);
    return auth.accessToken;
}
function errors(page: Page) {
    const failures: string[] = [];
    page.on('pageerror', (e) => failures.push(e.message));
    page.on('console', (message) => {
        if (
            message.type() === 'error' &&
            !message.text().startsWith('Failed to load resource:')
        )
            failures.push(message.text());
    });
    page.on('requestfailed', (request) => {
        if (!request.failure()?.errorText.includes('ERR_ABORTED'))
            failures.push(
                `${request.method()} ${new URL(request.url()).pathname} ${request.failure()?.errorText}`,
            );
    });
    page.on('response', (r) => {
        if (r.status() >= 500)
            failures.push(`${r.status()} ${new URL(r.url()).pathname}`);
    });
    return () => expect(failures).toEqual([]);
}
async function capture(page: Page, info: TestInfo, name: string) {
    const path = info.outputPath(`${name}.png`);
    await page.screenshot({ path, fullPage: true });
    await info.attach(name, { path, contentType: 'image/png' });
}
async function noOverflow(page: Page) {
    await expect
        .poll(() =>
            page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
        )
        .toBe(true);
}
async function viewportBounded(page: Page, element: Locator) {
    await expect(element).toBeVisible();
    await expect
        .poll(async () => {
            const box = await element.boundingBox();
            const viewport = page.viewportSize()!;
            return Boolean(
                box &&
                box.x >= 0 &&
                box.y >= 0 &&
                box.x + box.width <= viewport.width + 1 &&
                box.y + box.height <= viewport.height + 1,
            );
        })
        .toBe(true);
}
async function responsiveAction(page: Page, name: string) {
    const action = page
        .getByRole('button', { name, exact: true })
        .filter({ visible: true })
        .first();
    await expect(action).toBeVisible();
    const labelVisible = await action.evaluate((button) => {
        const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            if (!walker.currentNode.textContent?.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(walker.currentNode);
            const parent = walker.currentNode.parentElement!;
            const style = getComputedStyle(parent);
            if (
                range.getBoundingClientRect().width > 0 &&
                style.clipPath !== 'inset(50%)'
            )
                return true;
        }
        return false;
    });
    expect(labelVisible).toBe((page.viewportSize()?.width ?? 1440) <= 767);
}
async function translated(page: Page, info: TestInfo, role: string) {
    const owner = role === 'owner';
    const expectedTranslation = owner
        ? 'Descansamos en la orilla.'
        : 'Hola mundo.';
    const token = await signup(page, info, role);
    await responsiveAction(page, 'New folder');
    await page
        .getByRole('button', { name: 'New folder', exact: true })
        .first()
        .click();
    await page.getByLabel(/Folder name|^Name$/).fill(`Reading ${role}`);
    await page.getByRole('button', { name: /^Create folder$/ }).click();
    const folderLink = page.getByRole('link', {
        name: `Reading ${role}`,
        exact: true,
    });
    const folderRow = folderLink.locator('xpath=ancestor::article');
    const folderGeometry = await folderRow.evaluate((element) => {
        const style = getComputedStyle(element);
        const gridStyle = getComputedStyle(element.closest('ul')!);
        return {
            rowGap: parseFloat(gridStyle.rowGap),
            gap: parseFloat(style.gap) || parseFloat(style.rowGap),
            padding: parseFloat(style.paddingTop),
        };
    });
    expect(
        Math.max(folderGeometry.gap || 0, folderGeometry.padding || 0),
    ).toBeGreaterThanOrEqual(8);
    expect(folderGeometry.rowGap).toBeGreaterThanOrEqual(12);
    await folderLink.click();
    await page
        .getByRole('button', { name: 'Add text', exact: true })
        .first()
        .click();
    await page.getByLabel('Title', { exact: true }).fill(`Morning ${role}`);
    const source = page.getByLabel('Source text', { exact: true });
    const target = page.getByLabel('Translation language', { exact: true });
    const action = page
        .getByRole('button', {
            name: 'Translate via AI',
            exact: true,
        })
        .filter({ visible: true });
    await expect(action).toHaveCount(0);
    await expect(page.locator('[class*="draftHint"]')).toHaveCount(0);
    await expect(
        page.getByLabel('Source language', { exact: true }),
    ).toHaveValue('auto');
    await expect(
        page.getByRole('option', { name: 'Detect automatically', exact: true }),
    ).toHaveCount(1);
    const sourceText = owner
        ? 'The river flows quietly.\n\nWe rested on the bank. Birds sang nearby.'
        : 'Hello world.';
    await source.fill(sourceText);
    await responsiveAction(page, 'Translate via AI');
    await expect(action).toHaveCount(1);
    const counter = page.locator('[class*="counterRow"]');
    await expect(
        counter.getByRole('button', { name: 'Translate via AI', exact: true }),
    ).toHaveCount(1);
    const geometry = await counter.evaluate((row) => {
        const button = row.querySelector('button')!.getBoundingClientRect();
        const count = row.lastElementChild!.getBoundingClientRect();
        return {
            buttonRight: button.right,
            countLeft: count.left,
            buttonTop: button.top,
            countBottom: count.bottom,
        };
    });
    expect(geometry.buttonRight).toBeLessThanOrEqual(geometry.countLeft);
    expect(geometry.buttonTop).toBeLessThan(geometry.countBottom);
    const normalBorder = await target.evaluate((field) => {
        const probe = document.createElement('span');
        probe.style.color =
            getComputedStyle(field).getPropertyValue('--border-default');
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
    });
    const validBorder = await target.evaluate(
        (field) => getComputedStyle(field).borderColor,
    );
    await action.click();
    await expect(target).toHaveAttribute('aria-invalid', 'true');
    await expect(
        page.getByText('Choose a translation language.', { exact: true }),
    ).toBeVisible();
    const errorColor = await page
        .getByText('Choose a translation language.', { exact: true })
        .evaluate((message) => getComputedStyle(message).color);
    await expect
        .poll(() =>
            target.evaluate((field) => getComputedStyle(field).borderColor),
        )
        .toBe(errorColor);
    expect(errorColor).not.toBe(validBorder);
    await capture(page, info, `${role}-compose-missing-target`);
    await target.selectOption('es');
    await source.click();
    await expect(target).not.toHaveAttribute('aria-invalid', 'true');
    await expect(
        page.getByText('Choose a translation language.', { exact: true }),
    ).toHaveCount(0);
    await expect
        .poll(() =>
            target.evaluate((field) => getComputedStyle(field).borderColor),
        )
        .toBe(normalBorder);
    if (owner || role === 'phone-owner') {
        await page.getByLabel('Title', { exact: true }).click();
        const sourceBorder = await source.evaluate(
            (field) => getComputedStyle(field).borderColor,
        );
        await source.fill('🌍'.repeat(20_001));
        await expect(source).toHaveAttribute('aria-invalid', 'true');
        await expect(page.getByText(/^The text is too long/)).toBeVisible();
        await expect
            .poll(() =>
                source.evaluate((field) => getComputedStyle(field).borderColor),
            )
            .toBe(errorColor);
        expect(errorColor).not.toBe(sourceBorder);
        await page.getByText(/^The text is too long/).scrollIntoViewIfNeeded();
        await capture(page, info, `${role}-compose-long-source`);
        await source.fill(sourceText);
        await page.getByLabel('Title', { exact: true }).click();
        await expect(source).not.toHaveAttribute('aria-invalid', 'true');
        await expect(page.getByText(/^The text is too long/)).toHaveCount(0);
        await expect
            .poll(() =>
                source.evaluate((field) => getComputedStyle(field).borderColor),
            )
            .toBe(normalBorder);
    }
    await noOverflow(page);
    await action.scrollIntoViewIfNeeded();
    await capture(page, info, `${role}-compose-counter-action`);
    if (role === 'phone-owner') {
        await page.setViewportSize({ width: 320, height: 720 });
        await noOverflow(page);
        await responsiveAction(page, 'Translate via AI');
        expect(
            await counter.evaluate((row) => {
                const button = row
                    .querySelector('button')!
                    .getBoundingClientRect();
                const count = row.lastElementChild!.getBoundingClientRect();
                return button.right <= count.left && button.top < count.bottom;
            }),
        ).toBe(true);
        await action.scrollIntoViewIfNeeded();
        await capture(page, info, 'phone-320-compose-counter-action');
        await page.setViewportSize({ width: 390, height: 844 });
    }
    const detectionRequest = page.waitForRequest(
        (request) =>
            request.method() === 'POST' &&
            new URL(request.url()).pathname.endsWith('/texts/ai/detection'),
    );
    const translationRequest = page.waitForRequest(
        (request) =>
            request.method() === 'POST' &&
            new URL(request.url()).pathname.endsWith('/texts/ai/translation'),
    );
    await page
        .getByRole('button', { name: 'Translate via AI', exact: true })
        .filter({ visible: true })
        .first()
        .click();
    await detectionRequest;
    await expect(
        page.getByRole('heading', { name: 'Detecting…', exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole('heading', {
            name: 'Translation preview — not saved yet',
            exact: true,
        }),
    ).toHaveCount(0);
    expect((await translationRequest).postDataJSON()).toMatchObject({
        sourceLanguage: 'en',
        targetLanguage: 'es',
    });
    await expect(
        page.getByRole('heading', {
            name: 'Translation preview — not saved yet',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page.getByRole('heading', { name: 'Detecting…', exact: true }),
    ).toHaveCount(0);
    await expect(page.locator('[data-reading-pair]').first()).toBeVisible();
    const translationTab = page.getByRole('tab', { name: /^Translation ·/ });
    if ((page.viewportSize()?.width ?? 1440) <= 1023) {
        await expect(translationTab).toBeVisible();
        await translationTab.click();
    }
    await expect(
        page.getByText(expectedTranslation, { exact: true }).first(),
    ).toBeVisible();
    const saved = page.waitForResponse(
        (response) =>
            (response.request().method() === 'PUT' &&
                /\/texts\/[^/]+$/.test(new URL(response.url()).pathname)) ||
            (response.request().method() === 'POST' &&
                new URL(response.url()).pathname.endsWith('/texts') &&
                response.status() >= 400),
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const savedResponse = await saved;
    expect(savedResponse.status(), await savedResponse.text()).toBe(200);
    const payload = (await savedResponse.json()) as { text: TextDocument };
    expect(payload.text.sourceLanguage).toBe('en');
    expect(payload.text.targetLanguage).toBe('es');
    await expect(page).toHaveURL(new RegExp(`/texts/${payload.text.id}$`));
    await page.reload();
    await expect(page.locator('[data-reading-pair]').first()).toBeVisible();
    if ((page.viewportSize()?.width ?? 1440) <= 1023) {
        await expect(translationTab).toBeVisible();
        await translationTab.click();
    }
    await expect(
        page.getByText(expectedTranslation, { exact: true }).first(),
    ).toBeVisible();
    return { token, text: payload.text };
}
async function selectWord(page: Page, word = 'Hello') {
    const sourceTab = page.getByRole('tab', { name: /^Source ·/ });
    if ((page.viewportSize()?.width ?? 1440) <= 1023) {
        await expect(sourceTab).toBeVisible();
        await sourceTab.click();
    }
    const source = page
        .locator('[data-reading-pair][data-side="source"]')
        .filter({ hasText: word })
        .first();
    await source.scrollIntoViewIfNeeded();
    const selectionBounds = await source.evaluate((element, selectedWord) => {
        const node = element.firstChild;
        if (!node) throw new Error('Missing sentence text node');
        const range = document.createRange();
        const start = node.textContent!.indexOf(selectedWord);
        if (start < 0) throw new Error('Selected word absent');
        range.setStart(node, start);
        range.setEnd(node, start + selectedWord.length);
        const rect = range.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }, word);
    const y = selectionBounds.y + selectionBounds.height / 2;
    await page.mouse.move(selectionBounds.x + 1, y);
    await page.mouse.down();
    await page.mouse.move(selectionBounds.x + selectionBounds.width - 1, y, {
        steps: 8,
    });
    await page.mouse.up();
    await expect
        .poll(() => page.evaluate(() => window.getSelection()?.toString()))
        .toBe(word);
    const trigger = page.getByRole('button', {
        name: 'Add to dictionary',
        exact: true,
    });
    await expect(trigger).toBeVisible();
    const triggerBox = (await trigger.boundingBox())!;
    expect(
        Math.abs(
            triggerBox.x +
                triggerBox.width / 2 -
                selectionBounds.x -
                selectionBounds.width / 2,
        ),
    ).toBeLessThan(100);
    expect(Math.abs(triggerBox.y - selectionBounds.y)).toBeLessThan(100);
    await viewportBounded(page, trigger);
    const toolbar = trigger.locator('xpath=ancestor::*[@role="dialog"][1]');
    const toolbarGeometry = await toolbar.evaluate((element) => {
        const style = getComputedStyle(element);
        const buttons = [...element.querySelectorAll('button')];
        let actions = buttons[0]!.parentElement!;
        while (
            actions.querySelectorAll('button').length !== buttons.length &&
            actions !== element
        )
            actions = actions.parentElement!;
        const actionsStyle = getComputedStyle(actions);
        const number = (value: string) => parseFloat(value) || 0;
        return {
            count: buttons.length,
            width: element.getBoundingClientRect().width,
            expected:
                buttons.reduce(
                    (sum, button) => sum + button.getBoundingClientRect().width,
                    0,
                ) +
                number(actionsStyle.columnGap) * (buttons.length - 1) +
                number(style.paddingLeft) +
                number(style.paddingRight) +
                number(style.borderLeftWidth) +
                number(style.borderRightWidth),
        };
    });
    expect(toolbarGeometry.count).toBe(2);
    expect(
        Math.abs(toolbarGeometry.width - toolbarGeometry.expected),
    ).toBeLessThanOrEqual(2);
    await trigger.click();
    const panel = page.getByRole('dialog', {
        name: `Add “${word}”`,
        exact: true,
    });
    await viewportBounded(page, panel);
}

async function verifyCardPadding(page: Page, source: string) {
    const card = page
        .getByText(source, { exact: true })
        .locator('xpath=ancestor::li[1]');
    const padding = await card.evaluate((element) => {
        const content = element.querySelector('[class*="cardContent"]');
        if (!content)
            throw new Error('Missing persisted dictionary card content');
        const style = getComputedStyle(content);
        return [
            style.paddingTop,
            style.paddingRight,
            style.paddingBottom,
            style.paddingLeft,
        ].map(parseFloat);
    });
    const minimum = (page.viewportSize()?.width ?? 1440) <= 767 ? 12 : 16;
    expect(Math.min(...padding)).toBeGreaterThanOrEqual(minimum);
}

async function verifyFrenchArticleCollection(page: Page, info: TestInfo) {
    await page.goto('/texts');
    await page
        .getByRole('link', { name: 'Reading owner', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Add text', exact: true })
        .first()
        .click();
    await page
        .getByLabel('Title', { exact: true })
        .fill('French contextual noun');
    await expect(
        page.getByLabel('Source language', { exact: true }),
    ).toHaveValue('auto');
    await page
        .getByLabel('Translation language', { exact: true })
        .selectOption('ru');
    await page
        .getByLabel('Source text', { exact: true })
        .fill('Le but de cette visite est clair.');
    const translation = page.waitForRequest(
        (request) =>
            request.method() === 'POST' &&
            new URL(request.url()).pathname.endsWith('/texts/ai/translation'),
    );
    await page
        .getByRole('button', { name: 'Translate via AI', exact: true })
        .filter({ visible: true })
        .first()
        .click();
    expect((await translation).postDataJSON()).toMatchObject({
        sourceLanguage: 'fr',
        targetLanguage: 'ru',
    });
    await expect(page.locator('[data-reading-pair]').first()).toBeVisible();
    const saved = page.waitForResponse(
        (response) =>
            response.request().method() === 'PUT' &&
            /\/texts\/[^/]+$/.test(new URL(response.url()).pathname),
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const savedResponse = await saved;
    expect(savedResponse.status()).toBe(200);
    const savedPayload = await savedResponse.json();
    await expect(page).toHaveURL(new RegExp(`/texts/${savedPayload.text.id}$`));
    await page.reload();
    await expect(
        page.getByText('Le but de cette visite est clair.', { exact: true }),
    ).toBeVisible();
    await selectWord(page, 'but');
    await page
        .getByRole('button', { name: 'Create new dictionary', exact: true })
        .click();
    await page
        .getByLabel('Dictionary name', { exact: true })
        .fill(`French article ${runId}`);
    await page
        .getByRole('button', { name: 'Create and add', exact: true })
        .click();
    await expect(
        page.getByText('Added “but” with definition and example.', {
            exact: true,
        }),
    ).toBeVisible();
    await page
        .getByRole('link', { name: 'Open dictionary', exact: true })
        .click();
    await expect(page).toHaveURL(/\/dictionaries\/[^/]+$/);
    await page.reload();
    for (const value of [
        'le but',
        'цель',
        'Un objectif que l’on souhaite atteindre.',
        'Le but de cette visite est clair.',
        'Цель этого визита ясна.',
    ])
        await expect(page.getByText(value, { exact: true })).toBeVisible();
    await verifyCardPadding(page, 'le but');
    await capture(page, info, 'owner-french-canonical-source-card');
}

async function verifyLongTranslationCapacity(page: Page, token: string) {
    const headers = { Authorization: `Bearer ${token}` };
    const folderResponse = await page.request.post(
        'http://127.0.0.1:4005/text-folders',
        {
            headers,
            data: {
                name: `Capacity ${runId}`,
            } satisfies CreateTextFolderRequest,
        },
    );
    expect(folderResponse.status(), await folderResponse.text()).toBe(201);
    const { folder } = (await folderResponse.json()) as {
        folder: { id: string };
    };
    const sourceText =
        'La rivière traverse lentement la vallée française, où les enfants regardent les oiseaux depuis la rive paisible. '.repeat(
            100,
        );
    expect(new TextEncoder().encode(sourceText).length).toBeGreaterThan(11000);
    const created = await page.request.post('http://127.0.0.1:4005/texts', {
        headers,
        data: {
            folderId: folder.id,
            sourceText,
            sourceLanguage: 'fr',
            targetLanguage: 'ru',
        } satisfies CreateTextRequest,
    });
    expect(created.status(), await created.text()).toBe(201);
    const { text } = (await created.json()) as { text: TextDocument };
    const queued = await page.request.post(
        'http://127.0.0.1:4005/texts/ai/translation',
        {
            headers,
            data: {
                folderId: folder.id,
                textId: text.id,
                expectedTextVersion: text.version,
                sourceText,
                sourceLanguage: 'fr',
                targetLanguage: 'ru',
                operationId: crypto.randomUUID(),
            } satisfies EnqueueTextTranslationRequest,
        },
    );
    expect(queued.status(), await queued.text()).toBe(202);
    const { job } = (await queued.json()) as {
        job: { id: string; state: string };
    };
    expect(['queued', 'running']).toContain(job.state);
    let completed:
        | {
              state: string;
              failureCode: string | null;
              result: TextDocument & { textId: string };
          }
        | undefined;
    await expect
        .poll(
            async () => {
                const response = await page.request.get(
                    `http://127.0.0.1:4005/texts/ai/jobs/${job.id}`,
                    { headers },
                );
                expect(response.status()).toBe(200);
                completed = (await response.json()).job;
                return completed!.state;
            },
            { timeout: 30000 },
        )
        .toBe('completed');
    expect(completed!.failureCode).toBeNull();
    const proposal = completed!.result;
    expect(proposal.sourceText).toBe(sourceText);
    expect(proposal.sourceLanguage).toBe('fr');
    expect(proposal.targetLanguage).toBe('ru');
    expect(proposal.alignment!.source.length).toBeGreaterThanOrEqual(100);
    expect(proposal.alignment!.translation.map((pair) => pair.pairId)).toEqual(
        proposal.alignment!.source.map((pair) => pair.pairId),
    );
    expect(proposal.alignment!.source.map((pair) => pair.text).join('')).toBe(
        sourceText,
    );
    expect(
        proposal.alignment!.translation.every((pair) =>
            pair.text.includes('Река спокойно течёт по долине.'),
        ),
    ).toBe(true);
    const saved = await page.request.put(
        `http://127.0.0.1:4005/texts/${text.id}`,
        {
            headers,
            data: {
                kind: 'proposal',
                expectedVersion: text.version,
                jobId: job.id,
            } satisfies SaveTextRequest,
        },
    );
    expect(saved.status(), await saved.text()).toBe(200);
    const reloaded = await page.request.get(
        `http://127.0.0.1:4005/texts/${text.id}`,
        {
            headers,
        },
    );
    const persisted = (await reloaded.json()).text as TextDocument;
    expect(persisted.sourceText).toBe(sourceText);
    expect(persisted.alignment).toEqual(proposal.alignment);
}

// @user-flow texts/web-owner-reading-and-collection
test('owner translates, saves, reloads, edits and collects a contextual word', async ({
    page,
}, info) => {
    const assertErrors = errors(page);
    let currentToken = '';
    page.on('request', (request) => {
        const authorization = request.headers()['authorization'];
        if (authorization?.startsWith('Bearer '))
            currentToken = authorization.slice(7);
    });
    const original = await translated(page, info, 'owner');
    await capture(page, info, 'owner-saved-reader-desktop');
    await page
        .getByRole('button', { name: 'Text options', exact: true })
        .click();
    await viewportBounded(page, page.getByRole('menu'));
    await capture(page, info, 'owner-reader-menu');
    await page.keyboard.press('Escape');
    await expect(
        page.locator('[data-reading-pair][data-side="source"]'),
    ).toHaveCount(3);
    await page.getByRole('button', { name: 'Edit text', exact: true }).click();
    await page
        .getByLabel('Source text', { exact: true })
        .first()
        .fill('The river flows slowly.');
    await page
        .getByLabel('Translation', { exact: true })
        .first()
        .fill('El río fluye lentamente.');
    const editedResponse = page.waitForResponse(
        (response) =>
            response.request().method() === 'PUT' &&
            /\/texts\/[^/]+$/.test(new URL(response.url()).pathname),
    );
    await page
        .getByRole('button', { name: 'Save changes', exact: true })
        .click();
    const edited = (await (await editedResponse).json()) as {
        text: TextDocument;
    };
    expect(edited.text.sourceText).toBe(
        'The river flows slowly.\n\nWe rested on the bank. Birds sang nearby.',
    );
    expect(
        edited.text.alignment!.source.map((pair) => pair.paragraphIndex),
    ).toEqual(
        original.text.alignment!.source.map((pair) => pair.paragraphIndex),
    );
    expect(
        edited.text.alignment!.translation.map((pair) => pair.text).join(''),
    ).toBe(
        'El río fluye lentamente.\n\nDescansamos en la orilla. Los pájaros cantaban cerca.',
    );
    await expect(
        page.getByText('El río fluye lentamente.', { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
        page.getByText('El río fluye lentamente.', { exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText('Edited after translation', { exact: true }).first(),
    ).toBeVisible();
    for (const side of ['source', 'translation']) {
        const paragraphs = await page
            .locator(`[data-reading-pair][data-side="${side}"]`)
            .evaluateAll(
                (nodes) => new Set(nodes.map((node) => node.closest('p'))).size,
            );
        expect(paragraphs).toBe(2);
    }
    await capture(page, info, 'owner-edited-paragraphs');
    await selectWord(page, 'bank');
    // Keep the native modal open while the available viewport shrinks. The
    // collection surface must shift/resize rather than extending below it.
    await page.setViewportSize({ width: 1440, height: 440 });
    await viewportBounded(
        page,
        page.getByRole('dialog', { name: 'Add “bank”', exact: true }),
    );
    await capture(page, info, 'owner-collection-short-viewport');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
        .getByRole('button', { name: 'Create new dictionary', exact: true })
        .click();
    const dictionaryName = page.getByLabel('Dictionary name', { exact: true });
    await dictionaryName.click();
    await expect(dictionaryName).toBeFocused();
    await dictionaryName.fill(`Collected ${runId}`);
    await viewportBounded(
        page,
        page.getByRole('dialog', { name: 'New dictionary', exact: true }),
    );
    await page
        .getByRole('button', { name: 'Create and add', exact: true })
        .click();
    await expect(
        page.getByText('Added “bank” with definition and example.', {
            exact: true,
        }),
    ).toBeVisible();
    await page
        .getByRole('link', { name: 'Open dictionary', exact: true })
        .click();
    await expect(page).toHaveURL(/\/dictionaries\/[^/]+$/);
    await expect(page.getByText('bank', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('bank', { exact: true })).toBeVisible();
    for (const value of [
        'orilla',
        'The land alongside a river.',
        'We sat on the river bank.',
        'Nos sentamos en la orilla del río.',
    ])
        await expect(page.getByText(value, { exact: true })).toBeVisible();
    await verifyCardPadding(page, 'bank');
    await capture(page, info, 'owner-contextual-bank-card');
    expect(currentToken).not.toBe('');
    await verifyLongTranslationCapacity(page, currentToken);
    await page.goto('/texts');
    await expect(
        page.getByText('1 texts · 1 translated', { exact: true }).first(),
    ).toBeVisible();
    await noOverflow(page);
    await verifyFrenchArticleCollection(page, info);
    assertErrors();
});

// @user-flow texts/web-public-copy-and-revocation
test('anonymous reader views and authenticated visitor copies before owner revokes', async ({
    page,
    browser,
}, info) => {
    const ownerErrors = errors(page);
    await translated(page, info, 'sharing-owner');
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
    await expect(
        sharing.getByLabel('Unlisted link', { exact: true }),
    ).not.toHaveValue('');
    const url = new URL(
        await sharing.getByLabel('Unlisted link', { exact: true }).inputValue(),
    );
    const path = `${url.pathname}${url.hash}`;
    const anonymous = await browser.newContext({
        baseURL: 'http://localhost:3335',
        viewport: { width: 1440, height: 1000 },
    });
    const visitor = await anonymous.newPage();
    const visitorErrors = errors(visitor);
    await visitor.goto(path);
    await expect(
        visitor.getByText('Hola mundo.', { exact: true }).first(),
    ).toBeVisible();
    await visitor
        .getByRole('button', { name: 'Copy to my folders', exact: true })
        .click();
    await expect(
        visitor.getByRole('dialog', { name: 'Sign in to continue' }),
    ).toBeVisible();
    await visitor
        .getByRole('button', { name: 'Keep reading', exact: true })
        .click();
    await capture(visitor, info, 'anonymous-shared-reader');
    visitorErrors();
    await anonymous.close();
    const readerContext = await browser.newContext({
        baseURL: 'http://localhost:3335',
        viewport: { width: 1440, height: 1000 },
    });
    const reader = await readerContext.newPage();
    const readerErrors = errors(reader);
    await signup(reader, info, 'copy-reader');
    await reader.goto(path);
    await reader
        .getByRole('button', { name: 'Copy to my folders', exact: true })
        .click();
    await reader
        .getByLabel('New folder name', { exact: true })
        .fill(`Independent ${runId}`);
    await reader
        .getByRole('button', { name: 'Make a copy', exact: true })
        .click();
    await expect(
        reader.getByRole('status', { name: 'Notifications' }),
    ).toContainText('Copied successfully. Your copy is independent.');
    await reader
        .getByRole('link', { name: 'Open folder', exact: true })
        .click();
    await expect(reader).toHaveURL(/\/texts\/folders\/[^/]+$/);
    const copiedFolder = reader.url();
    await sharing
        .getByRole('button', { name: 'Revoke link', exact: true })
        .click();
    await sharing
        .locator('[role="status"], [role="alert"]')
        .filter({ hasText: 'Revoke this link?' })
        .getByRole('button', { name: 'Revoke link', exact: true })
        .click();
    await expect(
        sharing.getByText('Link revoked', { exact: true }),
    ).toBeVisible();
    await reader.goto(path);
    await expect(
        reader.getByRole('heading', {
            name: 'This shared page isn’t available',
        }),
    ).toBeVisible();
    await reader.goto(copiedFolder);
    await expect(
        reader.getByText('Morning sharing-owner', { exact: true }),
    ).toBeVisible();
    await reader.getByText('Morning sharing-owner', { exact: true }).click();
    await expect(reader.locator('[data-reading-pair]').first()).toBeVisible();
    await reader.reload();
    await expect(
        reader.getByText('Hello world.', { exact: true }),
    ).toBeVisible();
    await expect(
        reader.getByText('Hola mundo.', { exact: true }),
    ).toBeVisible();
    readerErrors();
    await readerContext.close();
    ownerErrors();
});

// @user-flow texts/web-phone-reading-selection
test('phone reader selects and collects without horizontal overflow', async ({
    page,
}, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const assertErrors = errors(page);
    await translated(page, info, 'phone-owner');
    await noOverflow(page);
    await capture(page, info, 'phone-saved-reader');
    await page.getByRole('tab', { name: /^Source ·/ }).click();
    const matching = page.getByRole('switch', {
        name: 'Match sentences',
        exact: true,
    });
    await matching.check();
    await page
        .locator('[data-reading-pair][data-side="source"]')
        .first()
        .press('Enter');
    const counterpart = page.getByRole('dialog', {
        name: 'Sentence 1 of 1',
        exact: true,
    });
    await expect(
        counterpart.getByText('Hola mundo.', { exact: true }),
    ).toBeVisible();
    await capture(page, info, 'phone-counterpart-sheet');
    await counterpart
        .getByRole('button', { name: 'Back to reading', exact: true })
        .click();
    await selectWord(page);
    await expect(
        page.getByRole('dialog', { name: 'Add “Hello”', exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 320, height: 720 });
    await viewportBounded(
        page,
        page.getByRole('dialog', { name: 'Add “Hello”', exact: true }),
    );
    await noOverflow(page);
    await capture(page, info, 'phone-320-collection-panel');
    await page.setViewportSize({ width: 390, height: 844 });
    await page
        .getByRole('button', { name: 'Create new dictionary', exact: true })
        .click();
    await page
        .getByLabel('Dictionary name', { exact: true })
        .fill(`Phone collected ${runId}`);
    await capture(page, info, 'phone-create-dictionary');
    await noOverflow(page);
    await page
        .getByRole('button', { name: 'Create and add', exact: true })
        .click();
    await expect(
        page.getByText('Added “Hello” with definition and example.', {
            exact: true,
        }),
    ).toBeVisible();
    await page.setViewportSize({ width: 320, height: 720 });
    await noOverflow(page);
    await capture(page, info, 'phone-320-reader');
    await page
        .getByRole('link', { name: 'Open dictionary', exact: true })
        .click();
    await expect(page).toHaveURL(/\/dictionaries\/[^/]+$/);
    await expect(page.getByText('Hello', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Hello', { exact: true })).toBeVisible();
    await verifyCardPadding(page, 'Hello');
    await capture(page, info, 'phone-persisted-card-padding');
    assertErrors();
});
