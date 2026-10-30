import { randomUUID } from 'node:crypto';
import {
    expect,
    test,
    type Page,
    type TestInfo,
    type Locator,
} from '@playwright/test';
import type {
    KnowledgeNote,
    Workbook,
    WorkbookLearningState,
} from '@languon/contracts';

// @user-flow-revision interactive-workbooks sha256:a8cfdde30a544410
const origin = 'http://localhost:3336';
const tokens = new WeakMap<Page, string>();
async function signup(page: Page, info: TestInfo, suffix: string) {
    page.on('response', async (response) => {
        if (
            response.status() === 200 &&
            /\/auth\/(?:refresh|email-verification\/verify)$/u.test(
                new URL(response.url()).pathname,
            )
        ) {
            const data = await response.json();
            if (typeof data.accessToken === 'string')
                tokens.set(page, data.accessToken);
        }
    });
    await page.goto(`${origin}/signup?returnTo=%2Fknowledge`);
    await page
        .getByLabel('Email')
        .fill(
            `workbook-${suffix}-${Date.now()}-${info.workerIndex}@example.test`,
        );
    await page
        .getByLabel('Password', { exact: true })
        .fill('Synthetic workbook password 59!');
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
    tokens.set(page, (await (await verified).json()).accessToken);
    await expect(page).toHaveURL(/\/knowledge$/u);
}
async function api<T>(
    page: Page,
    path: string,
    data?: unknown,
    method = 'GET',
    headers: Record<string, string> = {},
): Promise<T> {
    const response = await page.request.fetch(`/api${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${tokens.get(page)}`,
            Origin: origin,
            ...headers,
        },
        ...(data === undefined ? {} : { data }),
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json() as Promise<T>;
}
async function verifyAuthorizedWav(page: Page, url: string) {
    expect(new URL(url).origin).toBe(new URL(origin).origin);
    const response = await page.request.get(url, {
        headers: {
            Authorization: `Bearer ${tokens.get(page)}`,
            Origin: origin,
        },
    });
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('audio/wav');
    const bytes = await response.body();
    expect(bytes.length).toBeGreaterThan(44);
    expect(bytes.length).toBe(Number(response.headers()['content-length']));
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('ascii')).toBe('WAVE');
}
function runtime(page: Page, expectedFailures = new Set<string>()) {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        if (
            message.type() === 'error' &&
            !message.text().startsWith('Failed to load resource:')
        )
            errors.push(message.text());
    });
    page.on('response', (response) => {
        if (
            response.status() >= 500 &&
            !expectedFailures.has(
                `${response.status()} ${new URL(response.url()).pathname}`,
            )
        )
            errors.push(
                `${response.status()} ${new URL(response.url()).pathname}`,
            );
    });
    return () => expect(errors).toEqual([]);
}
async function capture(page: Page, info: TestInfo, name: string) {
    const path = info.outputPath(`${name}.png`);
    await page.screenshot({
        path,
        fullPage: (page.viewportSize()?.width ?? 1440) > 767,
        animations: 'disabled',
    });
    await info.attach(name, { path, contentType: 'image/png' });
}
async function addBlock(
    page: Page,
    kind: string,
    values: Record<string, string>,
) {
    const kinds: Record<string, string> = {
        grammar: 'Grammar',
        vocabulary: 'Vocabulary',
        'bilingual-text': 'Bilingual text',
        exercise: 'Exercise',
        video: 'Video',
    };
    await page.getByRole('button', { name: 'Add block', exact: true }).click();
    await page
        .getByRole('menuitem', { name: kinds[kind]!, exact: true })
        .click();
    const dialog = page.getByRole('dialog');
    for (const [label, value] of Object.entries(values))
        await dialog.getByLabel(label, { exact: true }).fill(value);
    await dialog
        .getByRole('button', { name: 'Apply changes', exact: true })
        .click();
    await expect(dialog).not.toBeVisible();
}
async function verifyLearnerPreview(page: Page, info: TestInfo) {
    const editor = page.locator('#knowledge-workspace-editor [role="textbox"]');
    const scroll = page.locator('[data-workspace-scroll]');
    const previousScrollTop = await scroll.evaluate(
        (element) => element.scrollTop,
    );
    await editor.evaluate((element) => {
        element.setAttribute('data-preview-preserved', 'true');
    });
    const documentBefore = await editor.innerText();
    await page
        .getByRole('button', { name: 'Document actions', exact: true })
        .click();
    const toggle = page.getByRole('menuitemcheckbox', {
        name: 'Learner preview',
        exact: true,
    });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    const preview = page.getByRole('region', {
        name: 'Learner preview',
        exact: true,
    });
    await expect(preview).toBeVisible();
    await expect(
        preview.getByRole('button', { name: 'Back to editing', exact: true }),
    ).toBeInViewport();
    await expect(preview.getByRole('heading', { level: 1 })).toHaveText(
        'First interactive lesson',
    );
    await expect(editor).toBeHidden();
    await expect(
        page.getByRole('button', { name: 'Add block', exact: true }),
    ).toBeHidden();
    await expect(
        preview.getByRole('button', { name: /Select or drag block/u }),
    ).toHaveCount(0);
    const practice = preview.getByRole('region', {
        name: 'Verb practice',
        exact: true,
    });
    await expandExercise(practice, 'Complete: I ___ English.');
    await practice
        .getByRole('button', { name: 'Show answer', exact: true })
        .click();
    await expect(
        practice.getByText('I takes the base verb.', { exact: true }),
    ).toBeVisible();
    await expect(
        practice.getByRole('button', { name: 'Check with AI', exact: true }),
    ).toHaveCount(0);
    await scroll.evaluate((element) => {
        element.scrollTop = 0;
    });
    await capture(page, info, 'document-learner-preview-desktop');
    await page
        .getByRole('button', { name: 'Document actions', exact: true })
        .click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await expect(editor).toBeVisible();
    await expect
        .poll(() => scroll.evaluate((element) => element.scrollTop))
        .toBe(previousScrollTop);
    await page
        .getByRole('button', { name: 'Document actions', exact: true })
        .click();
    await toggle.click();
    await page.setViewportSize({ width: 390, height: 844 });
    await scroll.evaluate((element) => {
        element.scrollTop = 0;
    });
    await capture(page, info, 'document-learner-preview-mobile');
    await preview
        .getByRole('button', { name: 'Back to editing', exact: true })
        .click();
    await expect(preview).toHaveCount(0);
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute('data-preview-preserved', 'true');
    expect(await editor.innerText()).toBe(documentBefore);
    await expect(editor).toBeFocused();
    await page.setViewportSize({ width: 1440, height: 1000 });
}
async function fillEditorLanguage(
    dialog: Locator,
    label: string,
    value: string,
) {
    const field = dialog.getByLabel(label, { exact: true });
    if (!(await field.isVisible())) {
        const disclosure = dialog.getByRole('button', { name: /^Languages:/u });
        await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
        await disclosure.click();
    }
    await expect(field).toBeVisible();
    await field.fill(value);
}
async function expandExercise(region: Locator, question: string) {
    const toggle = region.getByRole('button', { name: question });
    await expect(toggle).toBeVisible();
    if ((await toggle.getAttribute('aria-expanded')) === 'false')
        await toggle.click();
}
async function aiAction(page: Page, button: Locator, endpoint: RegExp) {
    const response = page.waitForResponse(
        (item) =>
            item.request().method() === 'POST' &&
            endpoint.test(new URL(item.url()).pathname),
    );
    await button.click();
    const accepted = await response;
    if (accepted.status() === 409) {
        expect((await accepted.json()).error.code).toBe(
            'action_confirmation_required',
        );
        await page
            .getByRole('dialog', {
                name: 'Review this action’s budget',
                exact: true,
            })
            .getByRole('button', { name: 'Send', exact: true })
            .click();
    } else expect(accepted.ok(), await accepted.text()).toBe(true);
}
async function prepareSpeech(page: Page, button: Locator) {
    const prepared = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            response.url().endsWith('/speech/prepare'),
    );
    await button.click();
    const response = await prepared;
    expect(response.ok(), await response.text()).toBe(true);
    const payload = await response.json();
    if (payload.state === 'confirmation_required')
        await page
            .getByRole('dialog', {
                name: 'Generate pronunciation?',
                exact: true,
            })
            .getByRole('button', { name: 'Generate', exact: true })
            .click();
    else expect(['queued', 'processing', 'ready']).toContain(payload.state);
}
function syntheticWav() {
    const samples = 8000;
    const buffer = Buffer.alloc(44 + samples * 2);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(buffer.length - 8, 4);
    buffer.write('WAVEfmt ', 8);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(8000, 24);
    buffer.writeUInt32LE(16000, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(samples * 2, 40);
    return buffer;
}

// @user-flow interactive-workbooks/author-blocks-publish-practice
test('author creates blocks and uploaded audio, publishes, reopens and saves private practice', async ({
    page,
}, info) => {
    const expectedFailures = new Set<string>();
    const healthy = runtime(page, expectedFailures);
    await signup(page, info, 'author');
    await page.getByRole('button', { name: 'New note', exact: true }).click();
    await expect(page).toHaveURL(/\/knowledge\/[0-9a-f-]{36}$/u);
    const noteId = new URL(page.url()).pathname.split('/').at(-1)!;
    await expect(
        page.getByText('Add a text, vocabulary or grammar block first.', {
            exact: true,
        }),
    ).toHaveCount(0);
    await expect(
        page.getByText(
            'Add an audio block with an uploaded WAV or MP3 first.',
            { exact: true },
        ),
    ).toHaveCount(0);
    await expect(
        page.getByRole('button', { name: 'Copy blocks to note', exact: true }),
    ).toHaveCount(0);
    await expect(
        page.getByRole('button', { name: 'Add block', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Add block', exact: true }).click();
    await expect(
        page.getByRole('menuitem', { name: 'Grammar', exact: true }),
    ).toBeVisible();
    await capture(page, info, 'editor-block-menu');
    await page.keyboard.press('Escape');
    await expect(
        page.getByRole('button', { name: 'Add block', exact: true }),
    ).toBeFocused();
    await capture(page, info, 'editor-empty-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, info, 'editor-empty-mobile');
    await page.setViewportSize({ width: 1440, height: 1000 });
    // This paid AI scenario needs a prospective allowance above the fixture's
    // synthetic 20-credit default; the wallet grant alone does not set it.
    const preference = await api<{ version: number }>(
        page,
        '/users/me/ai-model-preference',
    );
    await api(
        page,
        '/users/me/ai-model-preference',
        {
            mode: 'auto',
            expectedVersion: preference.version,
            maxCreditsPerAction: '100',
        },
        'PUT',
    );
    const tutor = page.getByRole('region', {
        name: 'Language tutor',
        exact: true,
    });
    if (!(await tutor.isVisible()))
        await page.getByRole('tab', { name: 'Tutor', exact: true }).click();
    await tutor
        .getByLabel('Your question')
        .fill(
            'French vocabulary block fixture: работа, радость, уборка, плитка, рыба, корм. French to Russian.',
        );
    const submitted = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            /\/conversations\/[^/]+\/turns$/.test(
                new URL(response.url()).pathname,
            ),
    );
    await tutor.getByRole('button', { name: 'Send', exact: true }).click();
    const submittedResponse = await submitted;
    if (submittedResponse.status() === 409) {
        expect((await submittedResponse.json()).error.code).toBe(
            'action_confirmation_required',
        );
        await page
            .getByRole('dialog', { name: 'Review this action’s budget' })
            .getByRole('button', { name: 'Send', exact: true })
            .click();
    }
    await expect(
        tutor
            .locator('[data-assistant-content]')
            .getByText('I prepared the six French words.', { exact: false }),
    ).toBeVisible();
    await expect(
        tutor.getByRole('button', { name: 'Use in document', exact: true }),
    ).toHaveCount(0);
    const proposal = tutor.getByRole('article', {
        name: 'Proposed learning blocks',
        exact: true,
    });
    await expect(
        proposal.getByText('carrelage', { exact: true }),
    ).toBeVisible();
    const frame = await proposal.evaluate((element) => {
        const style = getComputedStyle(element);
        return { border: style.borderTopWidth, padding: style.paddingTop };
    });
    expect(frame).toEqual({ border: '1px', padding: '0px' });
    await expect(page.locator('[data-learning-block-id]')).toHaveCount(0);
    await capture(page, info, 'chat-vocabulary-proposal');
    await proposal
        .getByRole('button', { name: 'Apply to working draft', exact: true })
        .click();
    await expect(page.locator('[data-learning-block-id]')).toHaveCount(1);
    const proseEditor = page.locator(
        '[data-workspace-editor] [role="textbox"]',
    );
    await proseEditor.locator(':scope > p').first().click();
    await page.keyboard.press('Delete');
    const leadingGap = proseEditor
        .getByRole('button', {
            name: 'Write here…',
            exact: true,
        })
        .first();
    await expect(leadingGap).toBeVisible();
    await leadingGap.click();
    const introduction = 'Introduction.';
    await page.keyboard.type(introduction);
    await expect(proseEditor.locator(':scope > p').first()).toHaveText(
        introduction,
    );
    for (const _character of introduction)
        await page.keyboard.press('Backspace');
    await page.keyboard.press('Delete');
    await expect(leadingGap).toBeVisible();
    await expect(page.locator('[data-learning-block-id]')).toHaveCount(1);
    await leadingGap.click();
    await page.keyboard.type('Move this paragraph.');
    await page.keyboard.press('Enter');
    await page.keyboard.type('## Section to move');
    const paragraph = proseEditor
        .locator(':scope > p')
        .filter({ hasText: 'Move this paragraph.' });
    const heading = proseEditor.getByRole('heading', {
        name: 'Section to move',
        exact: true,
    });
    for (const [source, kind, destination] of [
        [paragraph, 'Paragraph', heading],
        [heading, 'Heading', paragraph],
    ] as const) {
        await source.hover();
        const handle = page.getByRole('button', {
            name: `Select or drag block: ${kind}`,
            exact: true,
        });
        await expect(handle).toBeVisible();
        const from = await handle.boundingBox();
        const to = await destination.boundingBox();
        if (!from || !to)
            throw new Error('Prose drag geometry is unavailable.');
        const x = from.x + from.width / 2;
        const y = from.y + from.height / 2;
        const blockBox = (await source.boundingBox())!;
        await page.mouse.move(blockBox.x + 8, y, { steps: 8 });
        await page.mouse.move((from.x + from.width + blockBox.x) / 2, y, {
            steps: 8,
        });
        // Deliberate pointer dwell tests hover stability, not app readiness.
        // A fast jump skips the gutter mouseleave that originally hid the grip.
        await page.waitForTimeout(600);
        await expect(handle).toBeVisible();
        expect(from.x + from.width).toBeLessThanOrEqual(
            (await source.boundingBox())!.x,
        );
        await page.mouse.move(x, y);
        await page.waitForTimeout(300);
        await expect(handle).toBeVisible();
        await page.mouse.down();
        await page.mouse.move(x + 8, y + 8, { steps: 4 });
        await page.mouse.move(to.x + 80, to.y + to.height - 2, { steps: 12 });
        await page.mouse.move(to.x + 81, to.y + to.height - 1);
        await page.mouse.up();
        await expect(
            proseEditor.locator(':scope > p, :scope > h2').first(),
        ).toHaveText(
            kind === 'Paragraph' ? 'Section to move' : 'Move this paragraph.',
        );
    }
    await capture(page, info, 'ordinary-block-drag-handles');
    await paragraph.click();
    await page.keyboard.press('Shift+Tab');
    await expect(
        page.getByRole('button', {
            name: 'Select or drag block: Paragraph',
            exact: true,
        }),
    ).toBeFocused();
    await page.keyboard.press('Enter');
    await page.setViewportSize({ width: 390, height: 844 });
    await paragraph.dispatchEvent('pointerdown', { pointerType: 'touch' });
    const narrowHandle = page.getByRole('button', {
        name: 'Select or drag block: Paragraph',
        exact: true,
    });
    const narrowBox = await narrowHandle.boundingBox();
    if (!narrowBox)
        throw new Error('The narrow-screen prose handle is unavailable.');
    expect(narrowBox.width).toBeGreaterThanOrEqual(44);
    expect(narrowBox.height).toBeGreaterThanOrEqual(44);
    expect(narrowBox.x).toBeGreaterThanOrEqual(0);
    expect(narrowBox.x + narrowBox.width).toBeLessThanOrEqual(
        (await paragraph.boundingBox())!.x,
    );
    await capture(page, info, 'ordinary-block-handle-mobile');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
        .getByRole('button', {
            name: 'Block settings: Six French words',
            exact: true,
        })
        .click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await expect(page.locator('[data-learning-block-id]')).toHaveCount(0);

    await page
        .getByLabel('Title', { exact: true })
        .fill('First interactive lesson');
    await addBlock(page, 'grammar', {
        Title: 'Present simple',
        Rule: 'Use the base verb for I and you.',
    });
    await addBlock(page, 'exercise', {
        Title: 'Verb practice',
        Question: 'Complete: I ___ English.',
        'Reference answer': 'study',
        'Why the answer is correct': 'I takes the base verb.',
    });
    await addBlock(page, 'vocabulary', {
        Title: 'Useful words',
        'Content language': 'en',
        'Translation language': 'fr',
        'Word or phrase': 'study',
        Translation: 'étudier',
        Example: 'I study English.',
        'Example translation': 'J’étudie l’anglais.',
    });
    await addBlock(page, 'bilingual-text', {
        Title: 'Travel reading',
        'Content language': 'en',
        'Translation language': 'fr',
        'Original passage': 'I visited Paris last year.',
        'Translated passage': 'J’ai visité Paris l’année dernière.',
    });
    const grammarHandle = page.getByRole('button', {
        name: 'Select or drag block: Present simple',
        exact: true,
    });
    await grammarHandle.focus();
    await grammarHandle.press('Enter');
    await expect(
        page.getByRole('button', {
            name: 'Select or drag block: Present simple',
            exact: true,
        }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
        page.getByRole('toolbar', { name: 'Selection actions', exact: true }),
    ).toHaveCount(0);
    await page
        .getByRole('button', {
            name: 'Block settings: Present simple',
            exact: true,
        })
        .click();
    await expect(
        page.getByRole('menuitem', { name: 'Edit', exact: true }),
    ).toBeVisible();
    await capture(page, info, 'editor-inline-block-settings');
    await page.keyboard.press('Escape');
    await expect(
        page.getByRole('button', {
            name: 'Block settings: Present simple',
            exact: true,
        }),
    ).toBeFocused();
    await page
        .getByRole('button', {
            name: 'Block settings: Travel reading',
            exact: true,
        })
        .click();
    await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    const translationEditor = page.getByRole('dialog');
    await translationEditor
        .getByRole('combobox', { name: 'Prepared translation' })
        .selectOption('');
    await fillEditorLanguage(translationEditor, 'Translation language', 'es');
    await translationEditor
        .getByLabel('Translated passage', { exact: true })
        .fill('Visité París el año pasado.');
    await translationEditor
        .getByRole('button', { name: 'Apply changes', exact: true })
        .click();
    await page
        .getByRole('button', {
            name: 'Block settings: Travel reading',
            exact: true,
        })
        .click();
    await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    await translationEditor
        .getByRole('combobox', { name: 'Prepared translation' })
        .selectOption('es');
    await expect(
        translationEditor.getByLabel('Translated passage', { exact: true }),
    ).toHaveValue('Visité París el año pasado.');
    await translationEditor
        .getByRole('combobox', { name: 'Prepared translation' })
        .selectOption('fr');
    await expect(
        translationEditor.getByLabel('Translated passage', { exact: true }),
    ).toHaveValue('J’ai visité Paris l’année dernière.');
    await expect(
        translationEditor.getByRole('button', {
            name: 'Apply changes',
            exact: true,
        }),
    ).toBeDisabled();
    await translationEditor
        .getByRole('button', { name: 'Cancel', exact: true })
        .last()
        .click();
    const authorBlocks = page.locator('[data-learning-block-id]');
    const beforeDragIds = await authorBlocks.evaluateAll((elements) =>
        elements.map((element) =>
            element.getAttribute('data-learning-block-id'),
        ),
    );
    expect(new Set(beforeDragIds).size).toBe(beforeDragIds.length);
    const grammarBlock = authorBlocks.filter({
        has: page.getByRole('heading', { name: 'Present simple', exact: true }),
    });
    const readingHandle = page.getByRole('button', {
        name: 'Select or drag block: Travel reading',
        exact: true,
    });
    await readingHandle.scrollIntoViewIfNeeded();
    const sourceBox = await readingHandle.boundingBox();
    if (!sourceBox) throw new Error('The block drag handle is unavailable.');
    const readingFrame = await readingHandle
        .locator('xpath=ancestor::*[@data-learning-block-id]')
        .boundingBox();
    if (!readingFrame)
        throw new Error('The custom block frame is unavailable.');
    expect(sourceBox.x + sourceBox.width).toBeLessThanOrEqual(readingFrame.x);
    const sourceX = sourceBox.x + sourceBox.width / 2;
    const sourceY = sourceBox.y + sourceBox.height / 2;
    await page.mouse.move(sourceX, sourceY);
    await page.mouse.down();
    // Start the native drag before scrolling its distant destination into view.
    // A single dragTo scrolls first and can retarget Chromium's initial dragstart.
    await page.mouse.move(sourceX + 8, sourceY + 8, { steps: 4 });
    await grammarBlock.scrollIntoViewIfNeeded();
    const destinationBox = await grammarBlock.boundingBox();
    if (!destinationBox)
        throw new Error('The block destination is unavailable.');
    await page.mouse.move(destinationBox.x + 20, destinationBox.y + 2, {
        steps: 12,
    });
    await page.mouse.move(destinationBox.x + 21, destinationBox.y + 3);
    await page.mouse.up();
    await expect(
        authorBlocks
            .first()
            .getByRole('heading', { name: 'Travel reading', exact: true }),
    ).toBeVisible();
    const afterDragIds = await authorBlocks.evaluateAll((elements) =>
        elements.map((element) =>
            element.getAttribute('data-learning-block-id'),
        ),
    );
    expect([...afterDragIds].sort()).toEqual([...beforeDragIds].sort());
    expect(new Set(afterDragIds).size).toBe(afterDragIds.length);
    await expect(
        page.getByRole('toolbar', { name: 'Selection actions', exact: true }),
    ).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page
        .getByRole('button', {
            name: 'Block settings: Travel reading',
            exact: true,
        })
        .click();
    await expect(
        page.getByRole('menuitem', { name: 'Copy block', exact: true }),
    ).toBeVisible();
    await capture(page, info, 'editor-block-settings-mobile');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Add block', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Audio', exact: true }).click();
    await page
        .getByLabel('Upload audio (WAV or MP3, up to 5 MiB)')
        .setInputFiles({
            name: 'synthetic.wav',
            mimeType: 'audio/wav',
            buffer: syntheticWav(),
        });
    const audioDialog = page.getByRole('dialog');
    // Upload completion updates the draft asynchronously. Applying the shell
    // before this finishes intentionally saves an audio block without an asset.
    await expect(
        audioDialog.getByLabel('Upload audio (WAV or MP3, up to 5 MiB)'),
    ).toBeEnabled();
    await expect(
        audioDialog.getByRole('button', {
            name: 'Prepare transcription',
            exact: true,
        }),
    ).toBeVisible();
    await audioDialog
        .getByLabel('Title', { exact: true })
        .fill('Listening sample');
    await audioDialog
        .getByRole('button', { name: 'Apply changes', exact: true })
        .click();
    await expect(
        page.getByRole('button', { name: 'Save', exact: true }),
    ).toBeEnabled();
    const saveIcon = page.getByRole('button', { name: 'Save', exact: true });
    await expect(saveIcon).toHaveText('');
    await expect(saveIcon.locator('svg')).toBeVisible();
    await saveIcon.hover();
    await expect(
        page.getByRole('tooltip', { name: 'Save to Knowledge', exact: true }),
    ).toBeVisible();
    const savedBlockIds = await authorBlocks.evaluateAll((elements) =>
        elements.map((element) =>
            element.getAttribute('data-learning-block-id'),
        ),
    );
    const saved = page.waitForResponse(
        (response) =>
            response.url().endsWith(`/knowledge/${noteId}/save`) &&
            response.status() === 200,
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await saved;
    await page.reload();
    const practiceIcon = page.getByRole('link', {
        name: 'Practice saved note',
        exact: true,
    });
    await expect(practiceIcon).toHaveText('');
    await expect(practiceIcon.locator('svg')).toBeVisible();
    await practiceIcon.focus();
    await expect(
        page.getByRole('tooltip', { name: 'Practice saved note', exact: true }),
    ).toBeVisible();
    await expect
        .poll(() =>
            authorBlocks.evaluateAll((elements) =>
                elements.map((element) =>
                    element.getAttribute('data-learning-block-id'),
                ),
            ),
        )
        .toEqual(savedBlockIds);
    await expect(
        page
            .locator('[data-learning-block-id]')
            .first()
            .getByRole('heading', { name: 'Travel reading', exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole('heading', { name: 'Present simple', exact: true }),
    ).toBeVisible();
    await page
        .getByRole('button', {
            name: 'Block settings: Listening sample',
            exact: true,
        })
        .click();
    await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    await expect(
        page.getByRole('dialog').getByLabel('Title', { exact: true }),
    ).toHaveValue('Listening sample');
    const audioEditor = page.getByRole('dialog');
    const unavailablePath = `/api/knowledge/${noteId}/transcriptions`;
    expectedFailures.add(`503 ${unavailablePath}`);
    const transcriptionResponse = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            new URL(response.url()).pathname === unavailablePath,
    );
    await audioEditor
        .getByRole('button', { name: 'Prepare transcription', exact: true })
        .click();
    const unavailable = await transcriptionResponse;
    expect(unavailable.status()).toBe(503);
    expectedFailures.delete(`503 ${unavailablePath}`);
    await expect(
        audioEditor.getByText(
            'Transcription is unavailable with the current provider, pricing or credit configuration.',
            { exact: true },
        ),
    ).toBeVisible();
    await expect(
        audioEditor.getByLabel('Speech source text', { exact: true }),
    ).toBeEnabled();
    await audioEditor
        .getByRole('group', { name: 'Transcript passages', exact: true })
        .getByRole('button', { name: 'Add row', exact: true })
        .click();
    await expect(
        audioEditor.getByLabel('Transcript', { exact: true }),
    ).toBeEnabled();
    await audioEditor
        .getByLabel('Speech source text', { exact: true })
        .fill('Manual text remains editable.');
    await expect(
        audioEditor.getByLabel('Speech source text', { exact: true }),
    ).toHaveValue('Manual text remains editable.');
    await audioEditor
        .getByLabel('Transcript', { exact: true })
        .fill('Manual transcript remains editable.');
    const unchangedAudio = await api<{ note: KnowledgeNote }>(
        page,
        `/knowledge/${noteId}`,
    );
    expect(JSON.stringify(unchangedAudio.note.body)).not.toContain(
        'Manual text remains editable.',
    );
    expect(JSON.stringify(unchangedAudio.note.body)).not.toContain(
        'Manual transcript remains editable.',
    );
    await capture(page, info, 'audio-transcription-unavailable-manual-fields');
    await capture(page, info, 'audio-side-editor');
    await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Cancel', exact: true })
        .last()
        .click();
    await page
        .getByRole('alertdialog', { name: 'Discard changes?', exact: true })
        .getByRole('button', { name: 'Discard', exact: true })
        .click();
    await capture(page, info, 'editor-populated-desktop');
    await verifyLearnerPreview(page, info);
    await page.getByRole('button', { name: /Account menu/u }).click();
    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.keyboard.press('Escape');
    await capture(page, info, 'editor-populated-desktop-dark');
    await page.getByRole('button', { name: /Account menu/u }).click();
    await page.getByRole('button', { name: 'Light', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.goto(`${origin}/knowledge/${noteId}/practice`);
    const reading = page.getByRole('region', {
        name: 'Travel reading',
        exact: true,
    });
    await expect(
        reading.getByText('I visited Paris last year.', { exact: true }),
    ).toBeVisible();
    await reading
        .getByRole('button', { name: 'Original', exact: true })
        .click();
    await expect(
        reading.getByText('J’ai visité Paris l’année dernière.', {
            exact: true,
        }),
    ).toHaveCount(0);
    await reading
        .getByRole('button', { name: 'Bilingual', exact: true })
        .click();
    await expect(
        reading.getByText('J’ai visité Paris l’année dernière.', {
            exact: true,
        }),
    ).toBeVisible();
    await reading
        .getByRole('button', {
            name: 'Block settings: Travel reading',
            exact: true,
        })
        .click();
    await page
        .getByRole('menuitem', { name: 'Save to Texts', exact: true })
        .click();
    const textLibrary = page.getByRole('dialog', { name: 'Save to Texts' });
    await textLibrary.getByLabel('Name', { exact: true }).fill('Travel copy');
    await textLibrary
        .getByRole('button', { name: 'Preview', exact: true })
        .click();
    await expect(
        textLibrary.getByText('I visited Paris last year.', { exact: true }),
    ).toBeVisible();
    await textLibrary
        .getByRole('button', { name: 'Save independent copy', exact: true })
        .click();
    await expect(
        textLibrary.getByText('Independent copy saved.', { exact: true }),
    ).toBeVisible();
    await page.goto(`${origin}/knowledge/${noteId}/practice`);
    await expect(
        page.getByRole('heading', { name: 'Present simple', exact: true }),
    ).toBeVisible();
    const verbPractice = page.getByRole('region', {
        name: 'Verb practice',
        exact: true,
    });
    await expandExercise(verbPractice, 'Complete: I ___ English.');
    await verbPractice
        .getByRole('textbox', { name: 'Your answer', exact: true })
        .fill('study');
    await aiAction(
        page,
        verbPractice.getByRole('button', {
            name: 'Check with AI',
            exact: true,
        }),
        /\/learning\/evaluations$/u,
    );
    await expect(
        verbPractice.getByText('Your answer expresses the reference meaning.', {
            exact: false,
        }),
    ).toBeVisible({ timeout: 30_000 });
    await page
        .getByRole('region', { name: 'Verb practice', exact: true })
        .getByRole('button', { name: 'Show answer', exact: true })
        .click();
    await expect(
        page.getByText('I takes the base verb.', { exact: true }),
    ).toBeVisible();
    await page
        .getByRole('button', { name: 'Mark complete', exact: true })
        .click();
    await expect(page.getByText('Completed', { exact: true })).toBeVisible();
    await expect(page.locator('audio')).toHaveAttribute('src', /^blob:/u);
    await expect
        .poll(() =>
            page
                .locator('audio')
                .evaluate((audio: HTMLAudioElement) => audio.duration),
        )
        .toBe(1);
    await page.reload();
    await expect(page.getByText('Completed', { exact: true })).toBeVisible();
    const state = await api<WorkbookLearningState>(
        page,
        `/knowledge/${noteId}/learning`,
    );
    expect(state.attempts).toHaveLength(1);
    expect(state.attempts[0]?.evaluation).toMatchObject({
        status: 'correct',
        method: 'ai',
    });
    expect(state.events.some((event) => event.kind === 'answer-revealed')).toBe(
        true,
    );
    // The original saved vocabulary is practiced directly, without publishing a dictionary.
    await page
        .getByRole('region', { name: 'Useful words', exact: true })
        .getByRole('button', { name: 'Useful words', exact: true })
        .click();
    await page.getByRole('menuitem', { name: 'Cards', exact: true }).click();
    const cardSetup = page.getByRole('dialog', { name: 'Train with cards' });
    await expect(
        cardSetup.getByRole('button', { name: 'Start', exact: true }),
    ).toBeEnabled();
    await cardSetup.getByRole('button', { name: 'Start', exact: true }).click();
    const cardPractice = page.getByRole('dialog', { name: /Card practice/ });
    await expect(cardPractice).toBeVisible();
    await cardPractice
        .getByRole('button', { name: 'Known', exact: true })
        .click();
    await expect(
        page.getByRole('heading', { name: 'Round 1 complete' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    const savedNote = await api<{ note: KnowledgeNote }>(
        page,
        `/knowledge/${noteId}`,
    );
    const vocabulary = savedNote.note.body.document.content?.find(
        (node) =>
            node.type === 'learningBlock' &&
            node.attrs?.block?.type === 'vocabulary',
    )?.attrs?.block;
    expect(vocabulary?.type).toBe('vocabulary');
    const vocabularyProgress = await api<{ known: number; total: number }>(
        page,
        `/knowledge/${noteId}/vocabulary/${vocabulary!.id}/learning/progress`,
    );
    expect(vocabularyProgress).toMatchObject({ known: 1, total: 1 });
    await page
        .getByRole('region', { name: 'Useful words', exact: true })
        .getByRole('button', { name: 'Useful words', exact: true })
        .click();
    await page
        .getByRole('menuitem', { name: 'Sentence practice', exact: true })
        .click();
    const sentenceSetup = page.getByRole('dialog', {
        name: /Sentence practice/,
    });
    await sentenceSetup.locator('input[value="source-to-target"]').check();
    await sentenceSetup
        .getByRole('button', { name: 'Start in a dialog', exact: true })
        .click();
    const sentencePractice = page.getByRole('dialog', {
        name: /Sentence practice/,
    });
    await expect(sentencePractice).toContainText('I study English.');
    await sentencePractice
        .getByRole('button', { name: /Show reference — free/ })
        .click();
    await expect(
        sentencePractice.getByRole('region', { name: 'Free comparison' }),
    ).toContainText('J’étudie l’anglais.');
    const sentenceHistory = await api<{ reviews: unknown[] }>(
        page,
        `/knowledge/${noteId}/vocabulary/${vocabulary!.id}/sentences/reviews`,
    );
    expect(sentenceHistory.reviews).toHaveLength(1);
    await sentencePractice
        .getByRole('button', { name: 'Close practice', exact: true })
        .click();
    await capture(page, info, 'workbook-practice-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
        page.getByRole('button', { name: 'Mark incomplete' }),
    ).toBeVisible();
    await capture(page, info, 'workbook-practice-mobile');
    // Replace only the remote hosting response; saved media/source authority stays real.
    await page.route('https://www.youtube-nocookie.com/**', (route) =>
        route.fulfill({
            contentType: 'text/html',
            body: '<!doctype html><title>Synthetic external video host</title>',
        }),
    );
    const timedVideoId = randomUUID(),
        timedPassageId = randomUUID(),
        timedExerciseId = randomUUID();
    const linkedTextId = randomUUID(),
        linkedTextPassage = randomUUID(),
        linkedTextExercise = randomUUID();
    const timed = await api<{ note: KnowledgeNote }>(
        page,
        '/knowledge',
        {
            operationId: randomUUID(),
            content: {
                title: 'Timestamped viewing',
                summary: '',
                categories: [],
                studiedLanguage: 'en',
                explanationLanguage: 'en',
                body: {
                    schemaVersion: 2,
                    document: {
                        type: 'doc',
                        content: [
                            {
                                type: 'learningBlock',
                                attrs: {
                                    block: {
                                        id: timedVideoId,
                                        type: 'video',
                                        title: 'Timestamped video',
                                        source: {
                                            kind: 'youtube',
                                            videoId: 'abcdefghijk',
                                        },
                                        transcript: {
                                            language: 'en',
                                            segments: [
                                                {
                                                    id: timedPassageId,
                                                    text: 'The bus stops at the station.',
                                                    timing: {
                                                        startSeconds: 12,
                                                        endSeconds: 16,
                                                    },
                                                },
                                                {
                                                    id: randomUUID(),
                                                    text: 'The remaining transcript stays hidden.',
                                                },
                                            ],
                                        },
                                    },
                                },
                            },
                            {
                                type: 'learningBlock',
                                attrs: {
                                    block: {
                                        id: timedExerciseId,
                                        type: 'exercise',
                                        title: 'Timestamped question',
                                        format: 'free-text',
                                        question: 'Where does the bus stop?',
                                        referenceAnswer: 'At the station.',
                                        explanation:
                                            'The selected passage names the station.',
                                        source: {
                                            blockId: timedVideoId,
                                            segmentIds: [timedPassageId],
                                        },
                                    },
                                },
                            },
                            {
                                type: 'learningBlock',
                                attrs: {
                                    block: {
                                        id: linkedTextId,
                                        type: 'bilingual-text',
                                        title: 'Linked reading source',
                                        language: 'en',
                                        segments: [
                                            {
                                                id: linkedTextPassage,
                                                text: 'The train leaves at noon.',
                                            },
                                            {
                                                id: randomUUID(),
                                                text: 'An unselected reading passage.',
                                            },
                                        ],
                                        translations: [],
                                    },
                                },
                            },
                            {
                                type: 'learningBlock',
                                attrs: {
                                    block: {
                                        id: linkedTextExercise,
                                        type: 'exercise',
                                        title: 'Linked reading question',
                                        format: 'free-text',
                                        question: 'When does the train leave?',
                                        referenceAnswer: 'At noon.',
                                        explanation:
                                            'Noon is named in the selected source passage.',
                                        source: {
                                            blockId: linkedTextId,
                                            segmentIds: [linkedTextPassage],
                                        },
                                    },
                                },
                            },
                        ],
                    },
                },
            },
        },
        'POST',
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${origin}/knowledge/${timed.note.id}`);
    await page
        .getByRole('button', {
            name: 'Block settings: Timestamped video',
            exact: true,
        })
        .click();
    await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    const videoEditor = page.getByRole('dialog');
    const description = videoEditor.getByRole('textbox', {
        name: 'Author’s description',
        exact: true,
    });
    await expect(description).toHaveCount(1);
    await description.fill(
        'Unsaved author description for video editor verification.',
    );
    await capture(page, info, 'video-side-editor');
    await videoEditor
        .getByRole('button', { name: 'Cancel', exact: true })
        .last()
        .click();
    await videoEditor
        .getByRole('alertdialog', { name: 'Discard changes?', exact: true })
        .getByRole('button', { name: 'Discard', exact: true })
        .click();
    expect(
        JSON.stringify(
            (
                await api<{ note: KnowledgeNote }>(
                    page,
                    `/knowledge/${timed.note.id}`,
                )
            ).note.body,
        ),
    ).not.toContain(
        'Unsaved author description for video editor verification.',
    );
    await page.goto(`${origin}/knowledge/${timed.note.id}/practice`);
    const videoQuestion = page.getByRole('region', {
        name: 'Timestamped question',
        exact: true,
    });
    await expect(
        page.getByText('The remaining transcript stays hidden.', {
            exact: true,
        }),
    ).toHaveCount(0);
    await expect(
        videoQuestion.getByText('The bus stops at the station.', {
            exact: true,
        }),
    ).toHaveCount(0);
    await expandExercise(videoQuestion, 'Where does the bus stop?');
    await videoQuestion
        .getByRole('button', { name: 'Hint', exact: true })
        .click();
    await expect(
        videoQuestion.getByText('The bus stops at the station.', {
            exact: true,
        }),
    ).toBeVisible();
    await videoQuestion
        .getByRole('button', { name: 'Replay passage', exact: true })
        .click();
    await expect(videoQuestion.locator('iframe')).toHaveAttribute(
        'src',
        'https://www.youtube-nocookie.com/embed/abcdefghijk?start=12&autoplay=1',
    );
    const videoSource = page.getByRole('region', {
        name: 'Timestamped video',
        exact: true,
    });
    await videoSource
        .getByRole('button', { name: 'Show transcript', exact: true })
        .click();
    await expect(
        videoSource.getByText('The remaining transcript stays hidden.', {
            exact: true,
        }),
    ).toBeVisible();
    await videoSource
        .getByRole('region', { name: 'Exercise', exact: true })
        .getByRole('button', { name: 'Replay passage', exact: true })
        .click();
    await expect(videoQuestion.locator('iframe')).toHaveAttribute(
        'src',
        'https://www.youtube-nocookie.com/embed/abcdefghijk?start=12&autoplay=1',
    );
    await capture(page, info, 'video-transcript-grounded-hint');
    const readingQuestion = page.getByRole('region', {
        name: 'Linked reading question',
        exact: true,
    });
    await expect(
        readingQuestion.getByText('The train leaves at noon.', { exact: true }),
    ).toHaveCount(0);
    await expandExercise(readingQuestion, 'When does the train leave?');
    await readingQuestion
        .getByRole('button', { name: 'Hint', exact: true })
        .click();
    await expect(
        readingQuestion.getByText('The train leaves at noon.', { exact: true }),
    ).toBeVisible();
    await expect(
        readingQuestion.getByText('An unselected reading passage.', {
            exact: true,
        }),
    ).toHaveCount(0);
    await expect(
        readingQuestion.getByRole('button', {
            name: 'Replay passage',
            exact: true,
        }),
    ).toHaveCount(0);
    await expect
        .poll(async () => {
            const result = await api<WorkbookLearningState>(
                page,
                `/knowledge/${timed.note.id}/learning`,
            );
            return {
                hints: result.events.filter(
                    (event) => event.kind === 'hint-used',
                ).length,
                attempts: result.attempts.length,
            };
        })
        .toEqual({ hints: 2, attempts: 0 });
    healthy();
});

// @user-flow interactive-workbooks/workbook-share-private-copy-revoke
test('ordered workbook shares saved content, isolates reader progress, copies independently and revokes safely', async ({
    page,
    browser,
}, info) => {
    const healthy = runtime(page);
    await signup(page, info, 'owner');
    const hostile = '<img src=x onerror="window.workbookInjected=true">';
    const exerciseId = randomUUID();
    const greetingId = randomUUID();
    const greetingSegmentId = randomUUID();
    const create = async (title: string, blocks: unknown[]) =>
        (
            await api<{ note: KnowledgeNote }>(
                page,
                '/knowledge',
                {
                    operationId: randomUUID(),
                    content: {
                        title,
                        summary: '',
                        categories: [],
                        studiedLanguage: 'en',
                        explanationLanguage: 'en',
                        body: {
                            schemaVersion: 2,
                            document: {
                                type: 'doc',
                                content: blocks.map((block) => ({
                                    type: 'learningBlock',
                                    attrs: { block },
                                })),
                            },
                        },
                    },
                },
                'POST',
            )
        ).note;
    const first = await create('Safe shared lesson', [
        { id: randomUUID(), type: 'grammar', language: 'en', rule: hostile },
        {
            id: greetingId,
            type: 'bilingual-text',
            language: 'en',
            title: 'Shared greeting',
            segments: [{ id: greetingSegmentId, text: 'Hello world.' }],
            translations: [
                {
                    language: 'es',
                    segments: [
                        {
                            sourceSegmentId: greetingSegmentId,
                            text: 'Hola mundo.',
                        },
                    ],
                },
            ],
        },
        {
            id: exerciseId,
            type: 'exercise',
            format: 'free-text',
            question: 'Write a greeting.',
            referenceAnswer: 'Hello.',
            explanation: 'A common greeting.',
        },
    ]);
    const second = await create('Second lesson', [
        {
            id: randomUUID(),
            type: 'grammar',
            language: 'en',
            rule: 'Keep learning.',
        },
    ]);
    await page.goto(`${origin}/workbooks`);
    await page.getByLabel('Workbook title').fill('Ordered course foundation');
    await page
        .getByRole('button', { name: 'Create workbook', exact: true })
        .click();
    await expect(page).toHaveURL(/\/workbooks\/[0-9a-f-]{36}$/u);
    const workbookId = new URL(page.url()).pathname.split('/').at(-1)!;
    await page.getByLabel('Add note', { exact: true }).selectOption(first.id);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(
        page.getByRole('button', { name: first.title, exact: true }),
    ).toBeVisible();
    await page
        .getByRole('button', { name: 'Share workbook', exact: true })
        .click();
    const link = page.getByLabel('Share link', { exact: true });
    await expect(link).toHaveValue(/\/shared\/workbooks\/.+#.+/u);
    const sharedUrl = await link.inputValue();
    await page.getByLabel('Add note', { exact: true }).selectOption(second.id);
    await expect(
        page.getByRole('button', { name: 'Add', exact: true }),
    ).toBeDisabled();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const secondRow = page.locator('li').filter({
        has: page.getByRole('button', { name: second.title, exact: true }),
    });
    await secondRow.getByRole('button', { name: 'Move up' }).click();
    await expect
        .poll(async () =>
            (
                await api<{ workbook: Workbook }>(
                    page,
                    `/knowledge/workbooks/${workbookId}`,
                )
            ).workbook.notes.map((note) => note.id),
        )
        .toEqual([second.id, first.id]);
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
    });
    try {
        const reader = await context.newPage();
        const readerHealthy = runtime(reader);
        await reader.goto(sharedUrl);
        await expect(
            reader.getByRole('heading', { name: second.title, exact: true }),
        ).toBeVisible();
        await expect(
            reader.getByRole('button', { name: 'Save answer' }),
        ).toHaveCount(0);
        await expect(
            reader.getByText('Private translation', { exact: true }),
        ).toHaveCount(0);
        await signup(reader, info, 'reader');
        await reader.goto(sharedUrl);
        await expect(
            reader.getByText('Completed notes: 0 / 2', { exact: true }),
        ).toBeVisible();
        await reader.getByRole('button', { name: 'Next', exact: true }).click();
        await expect(reader.getByText(hostile, { exact: true })).toBeVisible();
        expect(
            await reader.evaluate(
                () =>
                    (window as unknown as Record<string, unknown>)
                        .workbookInjected,
            ),
        ).toBeUndefined();
        expect(await reader.locator('img[src="x"]').count()).toBe(0);
        const greeting = reader.getByRole('region', {
            name: 'Shared greeting',
            exact: true,
        });
        await greeting
            .getByLabel('Translation language', { exact: true })
            .selectOption('fr');
        await greeting
            .getByRole('button', { name: 'Translate privately', exact: true })
            .click();
        const consent = reader.getByRole('dialog', {
            name: 'Review this action’s budget',
            exact: true,
        });
        await expect(consent).toBeVisible();
        await consent
            .getByRole('button', { name: 'Send', exact: true })
            .click();
        await expect(
            greeting.getByText('[fr] Hello world.', { exact: true }),
        ).toBeVisible({ timeout: 30_000 });
        const ownerSource = await api<{ note: KnowledgeNote }>(
            page,
            `/knowledge/${first.id}`,
        );
        expect(JSON.stringify(ownerSource.note.body)).toContain('Hola mundo.');
        expect(JSON.stringify(ownerSource.note.body)).not.toContain(
            '[fr] Hello world.',
        );
        const otherContext = await browser.newContext({
            viewport: { width: 390, height: 844 },
        });
        try {
            const otherReader = await otherContext.newPage();
            const otherHealthy = runtime(otherReader);
            await otherReader.goto(sharedUrl);
            await signup(otherReader, info, 'other-reader');
            await otherReader.goto(sharedUrl);
            await otherReader
                .getByRole('button', { name: 'Next', exact: true })
                .click();
            const otherGreeting = otherReader.getByRole('region', {
                name: 'Shared greeting',
                exact: true,
            });
            await otherGreeting
                .getByLabel('Translation language', { exact: true })
                .selectOption('fr');
            await expect(
                otherGreeting.getByText('[fr] Hello world.', { exact: true }),
            ).toHaveCount(0);
            await expect(
                otherGreeting.getByRole('button', {
                    name: 'Translate privately',
                    exact: true,
                }),
            ).toBeVisible();
            otherHealthy();
        } finally {
            await otherContext.close();
        }
        const greetingPractice = reader.getByRole('region', {
            name: 'Exercise',
            exact: true,
        });
        await expandExercise(greetingPractice, 'Write a greeting.');
        await greetingPractice
            .getByRole('textbox', { name: 'Your answer', exact: true })
            .fill('Hello');
        await aiAction(
            reader,
            greetingPractice.getByRole('button', {
                name: 'Check with AI',
                exact: true,
            }),
            /\/learning\/evaluations$/u,
        );
        await expect(
            greetingPractice.getByText(
                'Your answer expresses the reference meaning.',
                { exact: false },
            ),
        ).toBeVisible({ timeout: 30_000 });
        await reader
            .getByRole('button', { name: 'Mark complete', exact: true })
            .click();
        await expect(
            reader.getByText('Completed notes: 1 / 2', { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText('Completed notes: 0 / 2', { exact: true }),
        ).toBeVisible();
        const ownerState = await api<WorkbookLearningState>(
            page,
            `/knowledge/${first.id}/learning`,
        );
        expect(ownerState.attempts).toEqual([]);
        await reader
            .getByRole('button', { name: 'Copy workbook', exact: true })
            .click();
        await expect(reader).toHaveURL(/\/workbooks\/[0-9a-f-]{36}$/u);
        const copyId = new URL(reader.url()).pathname.split('/').at(-1)!;
        expect(copyId).not.toBe(workbookId);
        await page
            .getByRole('button', { name: 'Disable sharing', exact: true })
            .click();
        await expect(
            page.getByRole('button', { name: 'Disable sharing', exact: true }),
        ).toHaveCount(0);
        await reader.reload();
        await expect(
            reader.getByRole('heading', {
                name: 'Ordered course foundation',
                exact: true,
            }),
        ).toBeVisible();
        await reader.goto(sharedUrl);
        await expect(
            reader.getByText('This shared workbook is unavailable.', {
                exact: true,
            }),
        ).toBeVisible();
        readerHealthy();
    } finally {
        await context.close();
    }
    healthy();
});

// @user-flow interactive-workbooks/block-review-atomic-edit-inline-feedback
test('reviews typed updates, accepts atomic field suggestions in side editors and evaluates private inline alternatives', async ({
    page,
}, info) => {
    const healthy = runtime(page);
    await signup(page, info, 'block-review');
    const preference = await api<{ version: number }>(
        page,
        '/users/me/ai-model-preference',
    );
    await api(
        page,
        '/users/me/ai-model-preference',
        {
            mode: 'auto',
            expectedVersion: preference.version,
            maxCreditsPerAction: '100',
        },
        'PUT',
    );
    const vocabularyId = randomUUID();
    const textId = randomUUID();
    const groupId = randomUUID();
    const choiceId = randomUUID();
    const freeId = randomUUID();
    const correctChoiceId = randomUUID();
    const entries = [
        ['travail', 'BAD translation'],
        ['joie', 'радость'],
        ['ménage', 'уборка'],
        ['carrelage', 'плитка'],
        ['poisson', 'рыба'],
        ['nourriture', 'корм'],
    ].map(([term, translation]) => ({ id: randomUUID(), term, translation }));
    const blocks = [
        {
            id: vocabularyId,
            type: 'vocabulary',
            title: 'Review vocabulary',
            language: 'fr',
            translationLanguage: 'ru',
            entries,
        },
        {
            id: textId,
            type: 'bilingual-text',
            title: 'Reading to translate',
            language: 'fr',
            segments: [
                {
                    id: randomUUID(),
                    text: 'Le samedi, nous faisons le ménage.',
                },
            ],
            translations: [],
        },
        { id: randomUUID(), type: 'audio', title: 'Prepare recording later' },
        {
            id: choiceId,
            type: 'exercise',
            format: 'multiple-choice',
            group: { id: groupId, title: 'Practice together' },
            question: 'Choose the right article: ___ ménage',
            choices: [
                { id: correctChoiceId, text: 'le' },
                { id: randomUUID(), text: 'la' },
            ],
            correctChoiceId,
            referenceAnswer: 'le',
            explanation: 'Ménage is masculine.',
        },
        {
            id: freeId,
            type: 'exercise',
            format: 'free-text',
            group: { id: groupId, title: 'Practice together' },
            question: 'Write a French greeting.',
            referenceAnswer: 'Salut.',
            explanation: 'Salut is an informal greeting.',
            acceptedAnswers: ['Bonjour.'],
            hint: 'A polite greeting is also valid.',
        },
    ];
    const { note } = await api<{ note: KnowledgeNote }>(
        page,
        '/knowledge',
        {
            operationId: randomUUID(),
            content: {
                title: 'Block review laboratory',
                summary: '',
                categories: [],
                studiedLanguage: 'fr',
                explanationLanguage: 'en',
                body: {
                    schemaVersion: 2,
                    document: {
                        type: 'doc',
                        content: blocks.map((block) => ({
                            type: 'learningBlock',
                            attrs: { block },
                        })),
                    },
                },
            },
        },
        'POST',
    );
    await page.addInitScript(() => {
        const state = window as typeof window & {
            knowledgeWorkspaceUnavailableFlash?: boolean;
        };
        const unavailable = 'Knowledge is unavailable. Try again.';
        state.knowledgeWorkspaceUnavailableFlash = false;
        const observeVisibleAlert = () => {
            const alert = Array.from(
                document.querySelectorAll<HTMLElement>('[role="alert"]'),
            ).find(
                (element) =>
                    element.textContent?.includes(unavailable) &&
                    element.getClientRects().length > 0,
            );
            if (alert) state.knowledgeWorkspaceUnavailableFlash = true;
        };
        new MutationObserver(observeVisibleAlert).observe(document, {
            childList: true,
            subtree: true,
            characterData: true,
        });
    });
    await page.goto(`${origin}/knowledge/${note.id}`);
    await expect(
        page.locator(`[data-learning-block-id="${vocabularyId}"]`),
    ).toBeVisible();
    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    (
                        window as typeof window & {
                            knowledgeWorkspaceUnavailableFlash?: boolean;
                        }
                    ).knowledgeWorkspaceUnavailableFlash === true,
            ),
        )
        .toBe(false);
    await page
        .getByRole('button', {
            name: 'Block settings: Review vocabulary',
            exact: true,
        })
        .click();
    await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    const editor = page.getByRole('dialog', {
        name: 'Review vocabulary',
        exact: true,
    });
    await expect(editor).toBeVisible();
    const desktopBox = await editor.boundingBox();
    expect(desktopBox?.width).toBeCloseTo(440, 0);
    const translation = editor
        .getByLabel('Translation', { exact: true })
        .first();
    await expect(translation).toHaveValue('BAD translation');
    await aiAction(
        page,
        editor
            .getByRole('button', { name: 'Check translation', exact: true })
            .first(),
        /\/block-field-actions$/u,
    );
    await expect(
        editor.getByText(
            'Use this translation for the selected source phrase.',
            { exact: true },
        ),
    ).toBeVisible({ timeout: 30_000 });
    await expect(translation).toHaveValue('BAD translation');
    await capture(page, info, 'atomic-vocabulary-side-editor');
    const beforeAccept = await api<{ note: KnowledgeNote }>(
        page,
        `/knowledge/${note.id}`,
    );
    expect(JSON.stringify(beforeAccept.note.body)).toContain('BAD translation');
    await editor.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(translation).toHaveValue('работа');
    await expect(
        editor.getByLabel('Translation', { exact: true }).nth(1),
    ).toHaveValue('радость');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(editor).toBeVisible();
    await capture(page, info, 'atomic-vocabulary-bottom-sheet');
    await editor
        .getByRole('button', { name: 'Expand editor', exact: true })
        .click();
    await expect(
        editor.getByRole('button', { name: 'Collapse editor', exact: true }),
    ).toBeVisible();
    await editor
        .getByRole('button', { name: 'Apply changes', exact: true })
        .click();
    await expect(editor).not.toBeVisible();
    expect(
        JSON.stringify(
            (await api<{ note: KnowledgeNote }>(page, `/knowledge/${note.id}`))
                .note.body,
        ),
    ).toContain('BAD translation');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
        .getByRole('button', {
            name: 'Block settings: Review vocabulary',
            exact: true,
        })
        .click();
    await page
        .getByRole('menuitem', { name: 'Save to dictionary', exact: true })
        .click();
    const library = page.getByRole('dialog', {
        name: 'Save to dictionary',
        exact: true,
    });
    await library
        .getByLabel('Name', { exact: true })
        .fill('Independent corrected words');
    await library.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(
        library
            .getByLabel('Preview', { exact: true })
            .getByText('travail — работа', { exact: true }),
    ).toBeVisible();
    await expect(library.getByText(/BAD translation/u)).toHaveCount(0);
    await library
        .getByRole('button', { name: 'Save independent copy', exact: true })
        .click();
    await expect(
        library.getByText('Independent copy saved.', { exact: true }),
    ).toBeVisible();
    // Saving a draft block to a library must not publish the author's sheet.
    expect(
        JSON.stringify(
            (await api<{ note: KnowledgeNote }>(page, `/knowledge/${note.id}`))
                .note.body,
        ),
    ).toContain('BAD translation');
    await library.getByRole('button', { name: 'Done', exact: true }).click();
    const saved = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            response.url().endsWith(`/knowledge/${note.id}/save`) &&
            response.status() === 200,
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await saved;
    const published = await api<{ note: KnowledgeNote }>(
        page,
        `/knowledge/${note.id}`,
    );
    expect(JSON.stringify(published.note.body)).not.toContain(
        'BAD translation',
    );
    expect(JSON.stringify(published.note.body)).toContain('работа');

    await page
        .getByRole('button', {
            name: 'Block settings: Prepare recording later',
            exact: true,
        })
        .click();
    await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    const recordingEditor = page.getByRole('dialog', {
        name: 'Prepare recording later',
        exact: true,
    });
    await recordingEditor
        .getByLabel('Speech source text', { exact: true })
        .fill('Bonjour, nous faisons le ménage.');
    await prepareSpeech(
        page,
        recordingEditor.getByRole('button', {
            name: 'Generate speech',
            exact: true,
        }),
    );
    await expect(
        recordingEditor.getByText('Generated audio preview', { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(recordingEditor.locator('audio')).toHaveAttribute(
        'src',
        /^blob:/u,
    );
    await recordingEditor
        .getByRole('button', { name: 'Play preview', exact: true })
        .click();
    await expect
        .poll(() =>
            recordingEditor
                .locator('audio')
                .evaluate((element: HTMLAudioElement) => element.duration),
        )
        .toBe(1);
    const beforeAudio = await api<{ note: KnowledgeNote }>(
        page,
        `/knowledge/${note.id}`,
    );
    const audioBefore = beforeAudio.note.body.document.content?.find(
        (node) => node.attrs?.block?.title === 'Prepare recording later',
    )?.attrs?.block;
    expect(audioBefore?.type).toBe('audio');
    expect(audioBefore).not.toHaveProperty('assetId');
    await capture(page, info, 'generated-audio-preview');
    await recordingEditor
        .getByRole('button', { name: 'Accept recording', exact: true })
        .click();
    await expect(
        recordingEditor.getByText(
            'Recording accepted. Apply block changes when ready.',
            { exact: true },
        ),
    ).toBeVisible();
    await recordingEditor
        .getByRole('button', { name: 'Apply changes', exact: true })
        .click();
    const audioSaved = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            response.url().endsWith(`/knowledge/${note.id}/save`) &&
            response.status() === 200,
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await audioSaved;
    const preparedAudio = (
        await api<{ note: KnowledgeNote }>(page, `/knowledge/${note.id}`)
    ).note.body.document.content?.find(
        (node) => node.attrs?.block?.title === 'Prepare recording later',
    )?.attrs?.block;
    expect(preparedAudio).toHaveProperty('assetId', expect.any(String));

    await page
        .getByRole('button', {
            name: 'Block settings: Reading to translate',
            exact: true,
        })
        .click();
    await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    const textEditor = page.getByRole('dialog', {
        name: 'Reading to translate',
        exact: true,
    });
    await fillEditorLanguage(textEditor, 'Translation language', 'ru');
    await aiAction(
        page,
        textEditor.getByRole('button', {
            name: 'Generate translation',
            exact: true,
        }),
        /\/block-field-actions$/u,
    );
    await expect(
        textEditor.getByText('[ru] Le samedi, nous faisons le ménage.', {
            exact: true,
        }),
    ).toBeVisible({ timeout: 30_000 });
    await textEditor
        .getByRole('button', { name: 'Accept', exact: true })
        .click();
    await expect(
        textEditor.getByLabel('Translated passage', { exact: true }),
    ).toHaveValue('[ru] Le samedi, nous faisons le ménage.');
    // Dismissing a dirty editor is explicit and does not publish accepted field proposals.
    await textEditor
        .getByRole('button', { name: 'Cancel', exact: true })
        .last()
        .click();
    await expect(
        textEditor.getByRole('alertdialog', {
            name: 'Discard changes?',
            exact: true,
        }),
    ).toBeVisible();
    await textEditor
        .getByRole('button', { name: 'Discard', exact: true })
        .click();
    expect(
        JSON.stringify(
            (await api<{ note: KnowledgeNote }>(page, `/knowledge/${note.id}`))
                .note.body,
        ),
    ).not.toContain('[ru] Le samedi');

    const tutor = page.getByRole('region', {
        name: 'Language tutor',
        exact: true,
    });
    if (!(await tutor.isVisible()))
        await page.getByRole('tab', { name: 'Tutor', exact: true }).click();
    // The generated proposal must retain safe narrative structure in both
    // compact chat preview and the applied sheet, rather than flattening it.
    await tutor
        .getByLabel('Your question')
        .fill('Markdown grammar block fixture');
    await aiAction(
        page,
        tutor.getByRole('button', { name: 'Send', exact: true }),
        /\/conversations\/[^/]+\/turns$/u,
    );
    const grammarProposal = tutor
        .getByRole('article', {
            name: 'Proposed learning blocks',
            exact: true,
        })
        .filter({
            has: page.getByRole('heading', {
                name: 'Subjonctif: readable pattern',
                exact: true,
            }),
        });
    await expect(grammarProposal).toBeVisible({ timeout: 30_000 });
    await expect(
        grammarProposal.locator('strong', { hasText: 'le subjonctif' }),
    ).toBeVisible();
    await expect(grammarProposal.locator('ul > li')).toHaveCount(2);
    await expect(grammarProposal.locator('table')).toBeVisible();
    await grammarProposal
        .getByRole('button', { name: 'Apply to working draft', exact: true })
        .click();
    const grammarSheet = page.locator('[data-learning-block-id]').filter({
        has: page.getByRole('heading', {
            name: 'Subjonctif: readable pattern',
            exact: true,
        }),
    });
    await expect(
        grammarSheet.locator('strong', { hasText: 'le subjonctif' }),
    ).toBeVisible();
    await expect(grammarSheet.locator('ul > li')).toHaveCount(2);
    await expect(grammarSheet.locator('table')).toBeVisible();

    // Settings and the slash picker feed the same removable, server-resolved
    // references. The request itself carries IDs, never client block material.
    await page
        .getByRole('button', {
            name: 'Block settings: Review vocabulary',
            exact: true,
        })
        .click();
    await page
        .getByRole('menuitem', { name: 'Add block to chat', exact: true })
        .click();
    await expect(
        tutor.getByRole('button', {
            name: 'Remove block reference: Review vocabulary',
            exact: true,
        }),
    ).toBeVisible();
    const question = tutor.getByLabel('Your question');
    await question.focus();
    await question.press('/');
    const blockPicker = page.getByRole('dialog', {
        name: 'Blocks in this note',
        exact: true,
    });
    await expect(blockPicker).toBeVisible();
    await blockPicker
        .getByRole('button', { name: /^Reading to translate/u })
        .click();
    await blockPicker
        .getByRole('button', { name: 'Done', exact: true })
        .click();
    await expect(
        tutor.getByRole('button', {
            name: 'Remove block reference: Reading to translate',
            exact: true,
        }),
    ).toBeVisible();
    await question.fill('Mentioned blocks update fixture');
    await aiAction(
        page,
        tutor.getByRole('button', { name: 'Send', exact: true }),
        /\/conversations\/[^/]+\/turns$/u,
    );
    const mentionedVocabulary = tutor
        .getByRole('article', {
            name: 'Proposed learning blocks',
            exact: true,
        })
        .filter({ hasText: 'travail amélioré' });
    const mentionedReading = tutor
        .getByRole('article', {
            name: 'Proposed learning blocks',
            exact: true,
        })
        .filter({
            has: page.getByRole('heading', {
                name: 'Mentioned reading updated',
                exact: true,
            }),
        });
    await expect(mentionedVocabulary).toBeVisible({ timeout: 30_000 });
    await expect(mentionedReading).toBeVisible({ timeout: 30_000 });
    await mentionedVocabulary
        .getByRole('button', { name: 'Dismiss', exact: true })
        .click();
    const dismissedProposal = tutor
        .getByRole('article', { name: 'Proposed learning blocks', exact: true })
        .filter({ hasText: 'Proposal dismissed' });
    await expect(
        dismissedProposal.getByText('Proposal dismissed', { exact: true }),
    ).toBeVisible();
    expect(
        JSON.stringify(
            (await api<{ note: KnowledgeNote }>(page, `/knowledge/${note.id}`))
                .note.body,
        ),
    ).not.toContain('travail amélioré');
    await dismissedProposal
        .getByRole('button', { name: 'Show proposal', exact: true })
        .click();
    const proseEditor = page.locator(
        '[data-workspace-editor] [role="textbox"]',
    );
    await proseEditor.locator(':scope > p').last().click();
    await mentionedReading
        .getByRole('button', { name: 'Add at cursor', exact: true })
        .click();
    await expect(
        proseEditor.getByRole('heading', {
            name: 'Mentioned reading updated',
            exact: true,
        }),
    ).toBeVisible();
    await mentionedVocabulary
        .getByRole('button', { name: 'Update block', exact: true })
        .click();
    await expect(
        page.getByRole('button', {
            name: 'Block settings: Mentioned vocabulary updated',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', {
            name: 'Block settings: Reading to translate',
            exact: true,
        }),
    ).toBeVisible();
    await tutor
        .getByLabel('Your question')
        .fill(
            'Update French vocabulary block fixture: keep the existing entries and improve the first translation.',
        );
    await aiAction(
        page,
        tutor.getByRole('button', { name: 'Send', exact: true }),
        /\/conversations\/[^/]+\/turns$/u,
    );
    const proposal = tutor
        .getByRole('article', {
            name: 'Proposed learning blocks',
            exact: true,
        })
        .filter({ hasText: 'работа / труд' });
    await expect(
        proposal.getByText('работа / труд', { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    const audioContent = page.waitForResponse(
        (response) =>
            response.status() === 200 &&
            /\/speech\/playbacks\/[^/]+\/content$/u.test(
                new URL(response.url()).pathname,
            ),
    );
    await prepareSpeech(
        page,
        proposal.getByRole('button', { name: 'Play: travail', exact: true }),
    );
    const playbackResponse = await audioContent;
    expect(playbackResponse.headers()['content-type']).toContain('audio/wav');
    await expect(
        proposal.getByRole('button', { name: 'Stop', exact: true }),
    ).toBeVisible();
    await proposal.getByRole('button', { name: 'Stop', exact: true }).click();
    // Chromium transfers and decodes these bytes, but CDP binary-body capture
    // can be empty. Read the identical authorized URL independently as well.
    await verifyAuthorizedWav(page, playbackResponse.url());
    await proposal.getByRole('button', { name: 'Review', exact: true }).click();
    const review = page.getByRole('dialog', {
        name: 'Review proposed content',
        exact: true,
    });
    await expect(
        review.getByText('работа / труд', { exact: true }),
    ).toBeVisible();
    await capture(page, info, 'chat-target-update-review');
    await review.getByRole('button', { name: 'Close', exact: true }).click();
    // An unrelated title edit must not invalidate the captured vocabulary target.
    await page
        .getByLabel('Title', { exact: true })
        .fill('Block review laboratory updated');
    await proposal
        .getByRole('button', { name: 'Update block', exact: true })
        .click();
    await expect(
        proposal.getByRole('button', { name: 'Show in sheet', exact: true }),
    ).toBeVisible();
    await expect(page.locator('[data-learning-block-id]')).toHaveCount(
        blocks.length + 2,
    );
    const stillPublished = await api<{ note: KnowledgeNote }>(
        page,
        `/knowledge/${note.id}`,
    );
    expect(JSON.stringify(stillPublished.note.body)).not.toContain(
        'работа / труд',
    );
    const publishUpdate = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            response.url().endsWith(`/knowledge/${note.id}/save`) &&
            response.status() === 200,
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await publishUpdate;
    const updated = await api<{ note: KnowledgeNote }>(
        page,
        `/knowledge/${note.id}`,
    );
    const vocabulary = updated.note.body.document.content?.find(
        (node) => node.attrs?.block?.id === vocabularyId,
    )?.attrs?.block;
    expect(vocabulary).toMatchObject({
        id: vocabularyId,
        type: 'vocabulary',
        entries: [
            {
                id: entries[0]!.id,
                term: 'travail',
                translation: 'работа / труд',
            },
            ...entries.slice(1),
        ],
    });
    await tutor
        .getByLabel('Your question')
        .fill('Copy prepared audio block fixture for review.');
    const preparedMediaRead = page.waitForResponse(
        (response) =>
            response.status() === 200 &&
            new URL(response.url()).pathname.endsWith(
                `/knowledge/notes/${note.id}/media/${preparedAudio!.assetId}`,
            ),
    );
    await aiAction(
        page,
        tutor.getByRole('button', { name: 'Send', exact: true }),
        /\/conversations\/[^/]+\/turns$/u,
    );
    const audioProposal = tutor
        .getByRole('article', { name: 'Proposed learning blocks', exact: true })
        .filter({
            has: page.getByRole('heading', {
                name: 'Prepared audio proposal',
                exact: true,
            }),
        });
    await expect(audioProposal).toBeVisible({ timeout: 30_000 });
    const preparedMedia = await preparedMediaRead;
    expect(preparedMedia.headers()['content-type']).toContain('audio/wav');
    await verifyAuthorizedWav(page, preparedMedia.url());
    await expect(audioProposal.locator('audio')).toHaveAttribute(
        'src',
        /^blob:/u,
    );
    await expect
        .poll(() =>
            audioProposal
                .locator('audio')
                .evaluate((element: HTMLAudioElement) => element.duration),
        )
        .toBe(1);
    const compactAudioSource = await audioProposal
        .locator('audio')
        .getAttribute('src');
    await audioProposal
        .getByRole('button', { name: 'Review', exact: true })
        .click();
    const audioReview = page.getByRole('dialog', {
        name: 'Review proposed content',
        exact: true,
    });
    await expect(audioReview.locator('audio')).toHaveAttribute(
        'src',
        compactAudioSource ?? '',
    );
    const reviewBounds = await audioReview.boundingBox();
    expect(reviewBounds?.y).toBe(12);
    expect(reviewBounds?.height).toBe((page.viewportSize()?.height ?? 0) - 24);
    await capture(page, info, 'prepared-audio-chat-review');
    await audioReview
        .getByRole('button', { name: 'Close', exact: true })
        .click();
    await page.setViewportSize({ width: 390, height: 844 });
    if (!(await tutor.isVisible()))
        await page.getByRole('tab', { name: 'Tutor', exact: true }).click();
    await audioProposal
        .getByRole('button', { name: 'Review', exact: true })
        .click();
    const mobileReviewBounds = await audioReview.boundingBox();
    expect(mobileReviewBounds?.height).toBeCloseTo(844 * 0.82, 0);
    const publicationNotice = audioReview.getByText(
        'Not published until you Save.',
        { exact: true },
    );
    await expect(publicationNotice).toBeVisible();
    expect(
        (await publicationNotice.boundingBox())?.width,
    ).toBeGreaterThanOrEqual(300);
    await capture(page, info, 'prepared-audio-chat-review-mobile');
    await audioReview
        .getByRole('button', { name: 'Expand', exact: true })
        .click();
    const expandedReviewBounds = await audioReview.boundingBox();
    expect(expandedReviewBounds?.y).toBe(8);
    expect(expandedReviewBounds?.height).toBe(836);
    await capture(page, info, 'prepared-audio-chat-review-mobile-expanded');
    await audioReview
        .getByRole('button', { name: 'Close', exact: true })
        .click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${origin}/knowledge/${note.id}/practice`);
    await expect(
        page.getByRole('heading', { name: 'Practice together', exact: true }),
    ).toBeVisible();
    // Expand the set, then use the exact question panel to keep its feedback local.
    const choiceToggle = page.getByRole('button', {
        name: /Choose the right article: ___ ménage/u,
    });
    await choiceToggle.click();
    const articleChoice = page.getByRole('radio', { name: 'le', exact: true });
    await articleChoice.locator('..').click();
    await expect(articleChoice).toBeChecked();
    await page.getByRole('button', { name: 'Check', exact: true }).click();
    await expect
        .poll(async () => {
            const state = await api<WorkbookLearningState>(
                page,
                `/knowledge/${note.id}/learning`,
            );
            return state.attempts.find(
                (attempt) => attempt.exerciseId === choiceId,
            )?.evaluation;
        })
        .toMatchObject({ status: 'correct', method: 'deterministic' });
    await page
        .getByRole('button', { name: /Write a French greeting\./u })
        .click();
    const answer = page.getByRole('textbox', {
        name: 'Your answer',
        exact: true,
    });
    await answer.fill('Bonjour.');
    await aiAction(
        page,
        page.getByRole('button', { name: 'Check with AI', exact: true }).last(),
        /\/learning\/evaluations$/u,
    );
    await expect(
        page.getByText('A valid alternative expresses the reference meaning.', {
            exact: false,
        }),
    ).toBeVisible({ timeout: 30_000 });
    const state = await api<WorkbookLearningState>(
        page,
        `/knowledge/${note.id}/learning`,
    );
    expect(
        state.attempts.find((attempt) => attempt.exerciseId === freeId)
            ?.evaluation,
    ).toMatchObject({
        status: 'correct',
        method: 'ai',
        validAlternative: true,
    });
    await capture(page, info, 'inline-exercise-feedback-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    await answer.locator('xpath=ancestor::form').scrollIntoViewIfNeeded();
    await capture(page, info, 'inline-exercise-feedback-mobile');
    healthy();
});
