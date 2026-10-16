// @user-flow-revision texts sha256:3bd497f7f68d42fa

import { expect, test, type Page, type TestInfo } from '@playwright/test';
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
async function translated(page: Page, info: TestInfo, role: string) {
    const owner = role === 'owner';
    const expectedTranslation = owner
        ? 'Descansamos en la orilla.'
        : 'Hola mundo.';
    const token = await signup(page, info, role);
    await page
        .getByRole('button', { name: 'New folder', exact: true })
        .first()
        .click();
    await page.getByLabel(/Folder name|^Name$/).fill(`Reading ${role}`);
    await page.getByRole('button', { name: /^Create folder$/ }).click();
    await page
        .getByRole('link', { name: `Reading ${role}`, exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Add text', exact: true })
        .first()
        .click();
    await page.getByLabel('Title', { exact: true }).fill(`Morning ${role}`);
    await page
        .getByLabel('Source language', { exact: true })
        .selectOption('en');
    await page
        .getByLabel('Translation language', { exact: true })
        .selectOption('es');
    await page
        .getByLabel('Source text', { exact: true })
        .fill(
            owner
                ? 'The river flows quietly.\n\nWe rested on the bank. Birds sang nearby.'
                : 'Hello world.',
        );
    await page
        .getByRole('button', { name: 'Translate via AI', exact: true })
        .filter({ visible: true })
        .first()
        .click();
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
    await page
        .getByRole('button', { name: 'Add to dictionary', exact: true })
        .click();
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
    await page
        .getByRole('button', { name: 'Create new dictionary', exact: true })
        .click();
    await page
        .getByLabel('Dictionary name', { exact: true })
        .fill(`Collected ${runId}`);
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
    await capture(page, info, 'owner-contextual-bank-card');
    expect(currentToken).not.toBe('');
    await verifyLongTranslationCapacity(page, currentToken);
    await page.goto('/texts');
    await expect(
        page.getByText('1 texts · 1 translated', { exact: true }).first(),
    ).toBeVisible();
    await noOverflow(page);
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
    assertErrors();
});
