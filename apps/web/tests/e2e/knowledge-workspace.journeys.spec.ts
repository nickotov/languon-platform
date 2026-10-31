import { expect, test, type Page, type TestInfo } from '@playwright/test';

// @user-flow-revision knowledge-workspace sha256:ebfb1ea752a93a99

type Share = { locator: string; key: string };

const tokens = new WeakMap<Page, string>();
const webOrigin = 'http://localhost:3336';

async function signup(page: Page, info: TestInfo) {
    page.on('response', async (response) => {
        if (
            response.status() === 200 &&
            /\/auth\/(?:refresh|email-verification\/verify)$/u.test(
                new URL(response.url()).pathname,
            )
        ) {
            const data = (await response.json()) as { accessToken?: unknown };
            if (typeof data.accessToken === 'string')
                tokens.set(page, data.accessToken);
        }
    });
    await page.goto(`${webOrigin}/signup?returnTo=%2Fknowledge`);
    await page
        .getByLabel('Email')
        .fill(
            `knowledge-workspace-${Date.now()}-${info.workerIndex}@example.test`,
        );
    await page
        .getByLabel('Password', { exact: true })
        .fill('Synthetic workspace password 47!');
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
    const { accessToken } = (await (await verified).json()) as {
        accessToken: string;
    };
    tokens.set(page, accessToken);
    await expect(page).toHaveURL(/\/knowledge$/);
    return accessToken;
}

async function signupFromCurrentPage(page: Page, info: TestInfo) {
    await page
        .getByLabel('Email')
        .fill(
            `shared-knowledge-${Date.now()}-${info.workerIndex}@example.test`,
        );
    await page
        .getByLabel('Password', { exact: true })
        .fill('Synthetic shared note password 47!');
    await page
        .getByRole('button', { name: 'Create account', exact: true })
        .click();
    await page.getByLabel('Verification code').fill('0000');
    await page
        .getByRole('button', { name: 'Verify email', exact: true })
        .click();
}

async function api<T>(
    page: Page,
    token: string,
    path: string,
    options: { method?: string; data?: unknown } = {},
): Promise<T> {
    const response = await page.request.fetch(`/api${path}`, {
        method: options.method ?? 'GET',
        headers: {
            Authorization: `Bearer ${tokens.get(page) ?? token}`,
            Origin: 'http://localhost:3336',
            ...(options.data === undefined
                ? {}
                : { 'Content-Type': 'application/json' }),
        },
        ...(options.data === undefined ? {} : { data: options.data }),
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json() as Promise<T>;
}

function runtimeErrors(page: Page) {
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
        if (response.status() >= 500)
            failures.push(
                `${response.status()} ${new URL(response.url()).pathname}`,
            );
    });
    return () => expect(failures).toEqual([]);
}

async function capture(page: Page, info: TestInfo, name: string) {
    const path = info.outputPath(`${name}.png`);
    await page.screenshot({ path, fullPage: true, animations: 'disabled' });
    await info.attach(name, { path, contentType: 'image/png' });
}

async function createDraft(page: Page) {
    await page.getByRole('button', { name: 'New note', exact: true }).click();
    await expect(page).toHaveURL(/\/knowledge\/[0-9a-f-]{36}$/u);
    await expect(
        page.getByRole('textbox', { name: 'Title', exact: true }),
    ).toHaveValue('Untitled');
}

async function waitForRecovery(page: Page) {
    const status = page.getByRole('button', {
        name: 'Private draft recovery',
        exact: true,
    });
    await status.click();
    await expect(
        page.getByText('Working draft recovered', { exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(status).toBeFocused();
}

async function openSharing(page: Page) {
    await page
        .getByRole('button', { name: 'Document actions', exact: true })
        .click();
    await page.getByRole('menuitem', { name: 'Share', exact: true }).click();
}

async function verifyDesktopPaneSizing(page: Page, info: TestInfo) {
    const layout = page.locator('[data-companion-layout]');
    const content = layout.locator('[data-companion-content]');
    const slot = layout.locator('[data-companion-slot]');
    const tutor = page.getByRole('region', {
        name: 'Language tutor',
        exact: true,
    });
    const divider = page.getByRole('separator', {
        name: 'Resize tutor panel',
        exact: true,
    });
    const width = async () => (await slot.boundingBox())!.width;
    const assertWidth = async (expected: number, announce = true) => {
        await expect
            .poll(async () => Math.abs((await width()) - expected))
            .toBeLessThan(2);
        if (announce)
            await expect
                .poll(async () => {
                    const layoutWidth = (await layout.boundingBox())!.width;
                    return Math.abs(
                        Number(await divider.getAttribute('aria-valuenow')) -
                            ((await width()) / layoutWidth) * 100,
                    );
                })
                .toBeLessThan(1);
    };
    const assertHeadersAligned = async () => {
        await expect
            .poll(async () => {
                const documentHeader = (await content
                    .locator('[data-workspace-topbar]')
                    .boundingBox())!;
                const tutorHeader = (await tutor
                    .locator('[data-tutor-header]')
                    .boundingBox())!;
                return Math.max(
                    Math.abs(documentHeader.height - 48),
                    Math.abs(tutorHeader.height - 48),
                    Math.abs(documentHeader.y - tutorHeader.y),
                    Math.abs(
                        documentHeader.y +
                            documentHeader.height -
                            tutorHeader.y -
                            tutorHeader.height,
                    ),
                );
            })
            .toBeLessThan(0.2);
    };
    const dragToWidth = async (target: number, cancel = false) => {
        const boundary = (await divider.boundingBox())!;
        const bounds = (await layout.boundingBox())!;
        const y = boundary.y + Math.min(100, boundary.height / 2);
        await page.mouse.move(boundary.x + boundary.width / 2, y);
        await page.mouse.down();
        await page.mouse.move(bounds.x + bounds.width - target, y, {
            steps: 8,
        });
        if (cancel) await page.keyboard.press('Escape');
        await page.mouse.up();
    };
    await expect(divider).toBeVisible();
    await expect(divider).toHaveAttribute('aria-orientation', 'vertical');
    await assertWidth(400);
    await assertHeadersAligned();
    const layoutWidth = (await layout.boundingBox())!.width;
    const maximum = Math.min(560, layoutWidth - 480);
    await dragToWidth(maximum + 150);
    await assertWidth(maximum);
    await dragToWidth(440);
    await assertWidth(440);
    await assertHeadersAligned();
    await capture(page, info, 'workspace-resized-aligned-headers');
    await dragToWidth(500, true);
    await assertWidth(440);
    await divider.focus();
    await divider.press('Home');
    await assertWidth(340);
    await divider.press('ArrowRight');
    await assertWidth(340);
    await divider.press('ArrowLeft');
    await assertWidth(356);
    await divider.press('Shift+ArrowLeft');
    await assertWidth(396);
    await divider.press('End');
    await assertWidth(maximum);
    await divider.press('ArrowLeft');
    await assertWidth(maximum);
    await dragToWidth(440);
    await assertWidth(440);
    const modes = page.getByRole('radiogroup', { name: 'Layout', exact: true });
    await modes.getByRole('radio', { name: 'Chat', exact: true }).click();
    await assertWidth(Math.min(layoutWidth * 0.6, layoutWidth - 480), false);
    await expect(divider).toBeHidden();
    await assertHeadersAligned();
    await capture(page, info, 'workspace-chat-layout-desktop');
    await page.setViewportSize({ width: 820, height: 1000 });
    await expect(
        modes.getByRole('radio', { name: 'Split', exact: true }),
    ).toHaveAttribute('aria-checked', 'true');
    await expect(
        modes.getByRole('radio', { name: 'Chat', exact: true }),
    ).toBeDisabled();
    await modes.getByRole('radio', { name: 'Split', exact: true }).focus();
    await modes
        .getByRole('radio', { name: 'Split', exact: true })
        .press('ArrowLeft');
    await expect(
        modes.getByRole('radio', { name: 'Focus', exact: true }),
    ).toBeFocused();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await modes.getByRole('radio', { name: 'Split', exact: true }).click();
    await expect(tutor).toBeVisible();
    await tutor
        .getByRole('button', { name: 'Minimize tutor', exact: true })
        .click();
    await expect(
        modes.getByRole('radio', { name: 'Focus', exact: true }),
    ).toBeFocused();
    await expect(tutor).toBeHidden();
    await expect(
        page.getByRole('button', { name: /^Open language tutor/u }),
    ).toHaveCount(0);
    await expect(
        content.getByRole('textbox', { name: 'Document', exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
        modes.getByRole('radio', { name: 'Focus', exact: true }),
    ).toHaveAttribute('aria-checked', 'true');
    await modes.getByRole('radio', { name: 'Split', exact: true }).click();
    await expect(tutor).toBeVisible();
    await assertWidth(440);
    await assertHeadersAligned();
    await dragToWidth(400);
    await assertWidth(400);
    for (const viewportWidth of [1023, 1024, 1060]) {
        await page.setViewportSize({ width: viewportWidth, height: 1000 });
        let lastGeometry: unknown = { viewportWidth };
        try {
            await expect
                .poll(async () => {
                    const area = (await layout.boundingBox())!;
                    const source = (await content.boundingBox())!;
                    const chat = (await slot.boundingBox())!;
                    const inline = viewportWidth >= 1024 && area.width >= 820;
                    lastGeometry = {
                        area,
                        chat,
                        dataInline: await layout.getAttribute('data-inline'),
                        dataOverlay: await layout.getAttribute('data-overlay'),
                        divider: await page
                            .locator(
                                '[role="separator"][aria-label="Resize tutor panel"]',
                            )
                            .evaluateAll((elements) =>
                                elements.map((element) => {
                                    const rect =
                                        element.getBoundingClientRect();
                                    return {
                                        height: rect.height,
                                        width: rect.width,
                                        x: rect.x,
                                        y: rect.y,
                                    };
                                }),
                            ),
                        inline,
                        layoutStyle: await layout.evaluate((element) => {
                            const style = getComputedStyle(element);
                            return {
                                gridTemplateColumns: style.gridTemplateColumns,
                                minWidth: style.minWidth,
                                width: style.width,
                            };
                        }),
                        rootFontSize: await page.evaluate(
                            () =>
                                getComputedStyle(document.documentElement)
                                    .fontSize,
                        ),
                        sidebar: await page
                            .getByRole('complementary', {
                                name: 'Application sidebar',
                                exact: true,
                            })
                            .boundingBox(),
                        source,
                        tutor: await tutor.boundingBox(),
                        viewport: await page.evaluate(() => ({
                            height: window.innerHeight,
                            width: window.innerWidth,
                        })),
                    };
                    if (
                        (await layout.getAttribute('data-inline')) !==
                            String(inline) ||
                        (await layout.getAttribute('data-overlay')) !==
                            String(!inline)
                    )
                        return false;
                    if (Math.abs(chat.width - (inline ? 340 : 380)) > 0.2)
                        return false;
                    if (inline)
                        return (
                            source.width >= 480 &&
                            chat.x >= source.x + source.width - 1
                        );
                    return (
                        chat.x >= source.x &&
                        chat.x + chat.width <= source.x + source.width + 1
                    );
                })
                .toBe(true);
        } catch (error) {
            throw new Error(
                `Companion layout breakpoint diagnostic: ${JSON.stringify(lastGeometry)}; cause: ${error instanceof Error ? error.message : String(error)}`,
                { cause: error },
            );
        }
        await expect(divider).toBeHidden();
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await assertWidth(400);
    await assertHeadersAligned();
}

async function fillPublishableDocument(
    page: Page,
    title: string,
    body: string,
) {
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
    await page
        .getByRole('textbox', { name: 'Document', exact: true })
        .fill(body);
    await waitForRecovery(page);
}

async function createTextReference(
    page: Page,
    token: string,
    title: string,
    sourceText: string,
) {
    const folder = await api<{ folder: { id: string } }>(
        page,
        token,
        '/text-folders',
        { method: 'POST', data: { name: `${title} folder` } },
    );
    await api(page, token, '/texts', {
        method: 'POST',
        data: {
            folderId: folder.folder.id,
            title,
            sourceText,
            sourceLanguage: 'en',
            targetLanguage: 'es',
        },
    });
}

async function attachFullTextReference(page: Page, title: string) {
    const picker = await openTextReferencePicker(page);
    await picker.getByRole('button', { name: title, exact: true }).click();
    await picker
        .getByRole('button', { name: 'Use full text', exact: true })
        .click();
    await picker
        .getByRole('button', { name: 'Attach to message', exact: true })
        .click();
}

async function openTextReferencePicker(page: Page) {
    await page.getByLabel('Add context /').click();
    const blockPicker = page.getByRole('dialog', {
        name: 'Blocks in this note',
        exact: true,
    });
    await blockPicker
        .getByRole('button', { name: 'Your Texts', exact: true })
        .click();
    return page.getByRole('dialog', {
        name: 'Search your Texts',
        exact: true,
    });
}

// @user-flow knowledge-workspace/workspace-draft-chat-save-reopen
test('an empty workspace recovers edits, names itself from the first tutor question, and saves one note', async ({
    page,
}, info) => {
    const assertClean = runtimeErrors(page);
    await signup(page, info);
    await createDraft(page);

    const tutor = page.getByRole('region', {
        name: 'Language tutor',
        exact: true,
    });
    await expect(tutor).toBeVisible();
    await expect(tutor.locator('..')).toHaveAttribute('data-attached', 'true');
    await verifyDesktopPaneSizing(page, info);
    await tutor
        .getByRole('button', { name: 'Response settings', exact: true })
        .click();
    const settings = page.getByRole('dialog').filter({
        has: page.getByRole('radiogroup', { name: 'Mode', exact: true }),
    });
    await expect(
        settings.getByRole('radio', { name: 'Auto', exact: true }),
    ).toBeChecked();
    await expect(
        settings.getByRole('combobox', {
            name: 'Explanation language',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        settings.getByRole('combobox', { name: 'Tone', exact: true }),
    ).toBeVisible();
    await expect(
        settings.getByRole('combobox', {
            name: 'Explanation length',
            exact: true,
        }),
    ).toBeVisible();
    await expect(settings.getByText('Model', { exact: true })).toHaveCount(0);
    await expect(
        settings.getByRole('button', {
            name: 'Use as my defaults',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        settings.getByRole('radio', { name: /selection only/iu }),
    ).toHaveCount(0);
    await capture(page, info, 'workspace-settings-desktop');
    await page.keyboard.press('Escape');

    await expect(
        page.getByRole('button', { name: 'Start writing', exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Save', exact: true }),
    ).toBeDisabled();
    await expect(
        page.getByRole('button', { name: 'Share', exact: true }),
    ).toHaveCount(0);
    await expect(
        page.getByRole('textbox', { name: 'Summary', exact: true }),
    ).toBeHidden();
    await page.getByRole('button', { name: 'Properties', exact: true }).click();
    const properties = page.getByRole('group', {
        name: 'Document properties',
        exact: true,
    });
    await properties
        .getByRole('button', { name: 'Summary', exact: true })
        .click();
    await expect(
        page.getByRole('textbox', { name: 'Summary', exact: true }),
    ).toBeVisible();
    await capture(page, info, 'workspace-properties-desktop');
    await page.keyboard.press('Escape');
    await expect(
        page.getByRole('textbox', { name: 'Summary', exact: true }),
    ).toBeHidden();
    await capture(page, info, 'workspace-empty-desktop');
    await tutor
        .getByLabel('Your question')
        .fill('Research river banks carefully');
    await tutor.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(
        page.getByText(/A river bank is the land beside a river/u).first(),
    ).toBeVisible();
    await expect(
        page.getByRole('textbox', { name: 'Title', exact: true }),
    ).toHaveValue('Research river banks');

    await fillPublishableDocument(
        page,
        'Research river banks',
        'A river bank is the land beside a river.',
    );
    await page.reload();
    await expect(
        page.getByRole('textbox', { name: 'Document', exact: true }),
    ).toContainText('A river bank is the land beside a river.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
        page.locator('[data-workspace-topbar] [data-state="saved"]'),
    ).toBeVisible();
    await page
        .getByRole('button', { name: 'Document actions', exact: true })
        .click();
    await expect(
        page.getByRole('menuitem', { name: 'Share', exact: true }),
    ).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(
        tutor.getByText(/A river bank is the land beside a river/u).first(),
    ).toBeVisible();
    await capture(page, info, 'workspace-saved-desktop');
    await page
        .getByRole('button', { name: 'Document actions', exact: true })
        .click();
    await expect(
        page.getByRole('menuitem', { name: 'Save a copy', exact: true }),
    ).toBeEnabled();
    await expect(
        page.getByRole('menuitem', { name: 'Revision history', exact: true }),
    ).toBeEnabled();
    await capture(page, info, 'workspace-document-actions-desktop');
    await page.keyboard.press('Escape');
    await page.emulateMedia({ colorScheme: 'dark' });
    await capture(page, info, 'workspace-saved-desktop-dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await openSharing(page);
    await expect(
        page.getByRole('button', { name: 'Enable sharing', exact: true }),
    ).toBeVisible();
    await capture(page, info, 'workspace-share-popover-desktop');
    assertClean();
});

// @user-flow knowledge-workspace/workspace-two-tab-conflict-recovery
test('two workspace tabs preserve both recovered versions until the learner resolves them', async ({
    page,
}, info) => {
    const assertClean = runtimeErrors(page);
    await signup(page, info);
    await createDraft(page);
    await fillPublishableDocument(
        page,
        'Original workspace title',
        'Original working document.',
    );

    const alternate = await page.context().newPage();
    const assertAlternateClean = runtimeErrors(alternate);
    try {
        await alternate.goto(page.url());
        await expect(
            alternate.getByRole('textbox', { name: 'Title', exact: true }),
        ).toHaveValue('Original workspace title');
        await page
            .getByRole('textbox', { name: 'Title', exact: true })
            .fill('First recovered version');
        await waitForRecovery(page);
        await alternate
            .getByRole('textbox', { name: 'Title', exact: true })
            .fill('Second recovered version');
        await expect(
            alternate.getByRole('region', {
                name: 'Working versions need your decision',
                exact: true,
            }),
        ).toBeVisible();
        const conflict = alternate.getByRole('region', {
            name: 'Working versions need your decision',
            exact: true,
        });
        await expect(
            conflict.getByText('First recovered version'),
        ).toBeVisible();
        await expect(
            conflict.getByText('Second recovered version'),
        ).toBeVisible();
        await conflict
            .getByRole('button', {
                name: 'Continue this version',
                exact: true,
            })
            .click();
        await expect(
            alternate.getByRole('textbox', { name: 'Title', exact: true }),
        ).toHaveValue('First recovered version');
        await conflict
            .getByRole('button', {
                name: 'Resolve working versions',
                exact: true,
            })
            .click();
        const resolveDialog = alternate.getByRole('dialog', {
            name: 'Resolve working versions',
            exact: true,
        });
        await resolveDialog
            .getByRole('button', { name: 'Keep current version', exact: true })
            .click();
        await expect(conflict).toHaveCount(0);
        assertAlternateClean();
    } finally {
        await alternate.close();
    }
    assertClean();
});

// @user-flow knowledge-workspace/workspace-restore-preserves-unsaved-branch
test('restoring a saved revision preserves the newer private branch until it is resolved', async ({
    page,
}, info) => {
    const assertClean = runtimeErrors(page);
    const token = await signup(page, info);
    await createDraft(page);
    await fillPublishableDocument(
        page,
        'First saved version',
        'The first saved wording.',
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
        page.locator('[data-workspace-topbar] [data-state="saved"]'),
    ).toBeVisible();
    await fillPublishableDocument(
        page,
        'Second saved version',
        'The second saved wording.',
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
        page.locator('[data-workspace-topbar] [data-state="saved"]'),
    ).toBeVisible();
    await fillPublishableDocument(
        page,
        'Unsaved recovered version',
        'Private wording that has not been published.',
    );

    await page
        .getByRole('button', { name: 'Document actions', exact: true })
        .click();
    await page
        .getByRole('menuitem', { name: 'Revision history', exact: true })
        .click();
    const history = page.getByRole('dialog', {
        name: 'Revision history',
        exact: true,
    });
    await expect(
        history.getByRole('button', { name: /^Revision 1 ·/u }),
    ).toBeVisible();
    await history.getByRole('button', { name: /^Revision 1 ·/u }).click();
    await history
        .getByRole('button', { name: 'Restore this version', exact: true })
        .click();
    await expect(history).toHaveCount(0);

    const conflict = page.getByRole('region', {
        name: 'Working versions need your decision',
        exact: true,
    });
    await expect(conflict).toContainText('First saved version');
    await expect(conflict).toContainText('Unsaved recovered version');
    const save = page.getByRole('button', {
        name: 'Save',
        exact: true,
    });
    await expect(save).toBeDisabled();
    await expect(
        page.getByText(
            'Compare and resolve the working versions before saving this note.',
            { exact: true },
        ),
    ).toBeVisible();

    await conflict
        .getByRole('button', {
            name: 'Resolve working versions',
            exact: true,
        })
        .click();
    await page
        .getByRole('dialog', {
            name: 'Resolve working versions',
            exact: true,
        })
        .getByRole('button', { name: 'Keep current version', exact: true })
        .click();
    await expect(conflict).toHaveCount(0);
    await expect(save).toBeEnabled();
    await save.click();

    const noteId = page.url().split('/').at(-1)!;
    const workspace = await api<{
        workspace: { published: { version: number } | null };
    }>(page, token, `/knowledge/${noteId}/workspace`);
    expect(workspace.workspace.published?.version).toBe(4);
    assertClean();
});

// @user-flow knowledge-workspace/workspace-text-reference-limit
test('the workspace Text picker accepts exactly the reference limit and rejects the next whole reference', async ({
    page,
}, info) => {
    const assertClean = runtimeErrors(page);
    const token = await signup(page, info);
    const exactLimitText = 'a'.repeat(20_000);
    await createTextReference(
        page,
        token,
        'First exact reference',
        exactLimitText,
    );
    await createTextReference(
        page,
        token,
        'Second exact reference',
        exactLimitText,
    );
    await createTextReference(page, token, 'Rejected extra reference', 'b');
    await createDraft(page);

    await attachFullTextReference(page, 'First exact reference');
    await attachFullTextReference(page, 'Second exact reference');
    const tutor = page.getByRole('region', {
        name: 'Language tutor',
        exact: true,
    });
    const material = tutor.getByRole('list', { name: 'Material discussed' });
    await expect(material).toHaveText(/First exact reference/u);
    await expect(material).toHaveText(/Second exact reference/u);
    await fillPublishableDocument(page, 'Reference study', 'Focus passage');
    const editor = page.getByRole('textbox', { name: 'Document', exact: true });
    await editor.click();
    await expect(editor).toBeFocused();
    await editor.press('ControlOrMeta+A');
    await editor.press('ArrowLeft');
    for (let index = 0; index < 'Focus passage'.length; index++)
        await editor.press('Shift+ArrowRight');
    await expect
        .poll(() => page.evaluate(() => window.getSelection()?.toString()))
        .toBe('Focus passage');
    await page
        .getByRole('toolbar', { name: 'Selection actions', exact: true })
        .getByRole('button', { name: 'Ask tutor', exact: true })
        .click();
    await expect(
        tutor.getByText('Focus passage', { exact: true }),
    ).toBeVisible();

    const picker = await openTextReferencePicker(page);
    await picker
        .getByRole('button', { name: 'Rejected extra reference', exact: true })
        .click();
    await picker
        .getByRole('button', { name: 'Attach to message', exact: true })
        .click();
    await expect(
        page
            .getByLabel('Notifications')
            .getByText(
                'Reference text exceeds the 40,000-character limit. Remove a reference or select a shorter passage.',
                { exact: true },
            ),
    ).toBeVisible();
    await expect(material.getByText('Rejected extra reference')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await tutor
        .getByLabel('Your question')
        .fill('Explain this focused passage');
    const submitted = page.waitForRequest(
        (request) =>
            request.method() === 'POST' && request.url().endsWith('/turns'),
    );
    await tutor.getByRole('button', { name: 'Send', exact: true }).click();
    const sentRequest = await submitted;
    const sent = sentRequest.postDataJSON() as {
        attachments: { content: string }[];
        editorContext: { selectedText?: string };
    };
    expect(sent.editorContext.selectedText).toBe('Focus passage');
    expect(sent.attachments).toHaveLength(2);
    expect(
        sent.attachments.reduce(
            (total, attachment) => total + attachment.content.length,
            0,
        ),
    ).toBe(40_000);
    await expect(
        tutor.getByText(
            'This question and its attachments are too large. Shorten the question or remove attachments, then send it again.',
            { exact: true },
        ),
    ).toBeVisible();
    const conversationId = new URL(sentRequest.url()).pathname.split('/')[3]!;
    type ConversationDetail = {
        messages: Array<{
            attachments: Array<{ content: string }>;
            role: 'assistant' | 'user';
            turnId: string;
        }>;
        turns: Array<{
            failureCode: string | null;
            id: string;
            status: string;
        }>;
    };
    await expect
        .poll(async () => {
            const detail = await api<ConversationDetail>(
                page,
                token,
                `/conversations/${conversationId}`,
            );
            return detail.turns.at(-1)?.failureCode ?? null;
        })
        .toBe('context_too_large');
    const failedDetail = await api<ConversationDetail>(
        page,
        token,
        `/conversations/${conversationId}`,
    );
    const failedTurn = failedDetail.turns.at(-1)!;
    expect(failedTurn.status).toBe('failed');
    expect(failedTurn.failureCode).toBe('context_too_large');
    const failedUserMessage = failedDetail.messages.find(
        (message) =>
            message.turnId === failedTurn.id && message.role === 'user',
    )!;
    expect(failedUserMessage.attachments).toHaveLength(2);
    expect(
        failedUserMessage.attachments.reduce(
            (total, attachment) => total + attachment.content.length,
            0,
        ),
    ).toBe(40_000);
    await editor.click();
    await expect(editor).toBeFocused();
    await editor.press('ControlOrMeta+A');
    await editor.press('ArrowLeft');
    for (let index = 0; index < 'Focus passage'.length; index++)
        await editor.press('Shift+ArrowRight');
    await expect
        .poll(() => page.evaluate(() => window.getSelection()?.toString()))
        .toBe('Focus passage');
    await page
        .getByRole('toolbar', { name: 'Selection actions', exact: true })
        .getByRole('button', { name: 'Ask tutor', exact: true })
        .click();
    await tutor
        .getByRole('button', {
            name: 'Remove attachment: Selected passage',
            exact: true,
        })
        .click();
    const ordinaryQuestion = 'Ask about the document without a selection';
    await tutor.getByLabel('Your question').fill(ordinaryQuestion);
    const ordinarySubmitted = page.waitForRequest(
        (request) =>
            request.method() === 'POST' && request.url().endsWith('/turns'),
    );
    await tutor.getByRole('button', { name: 'Send', exact: true }).click();
    const ordinaryRequest = await ordinarySubmitted;
    const ordinary = ordinaryRequest.postDataJSON() as {
        attachments: unknown[];
        editorContext: {
            selectedText?: string;
            editorTarget: { from: number; to: number; originalText: string };
        };
    };
    expect(ordinary.editorContext.selectedText).toBeUndefined();
    expect(ordinary.editorContext.editorTarget.from).toBe(
        ordinary.editorContext.editorTarget.to,
    );
    expect(ordinary.editorContext.editorTarget.originalText).toBe('');
    expect(ordinary.attachments).toEqual([]);
    expect((await ordinaryRequest.response())?.ok()).toBe(true);
    await expect(
        tutor.getByText(/A river bank is the land beside a river/u).first(),
    ).toBeVisible();
    await expect
        .poll(async () => {
            const detail = await api<ConversationDetail>(
                page,
                token,
                `/conversations/${conversationId}`,
            );
            return detail.turns.at(-1)?.status ?? null;
        })
        .toBe('succeeded');
    await page.reload();
    const ordinaryMessage = tutor
        .getByRole('article')
        .filter({ hasText: ordinaryQuestion });
    await expect(ordinaryMessage).toBeVisible();
    await expect(
        ordinaryMessage.getByText('Selected passage', { exact: true }),
    ).toHaveCount(0);
    assertClean();
});

// @user-flow knowledge-workspace/workspace-proposal-target-review
test('a persisted tutor proposal replaces its original target, undoes, and compares a changed target', async ({
    page,
}, info) => {
    const assertClean = runtimeErrors(page);
    await signup(page, info);
    await createDraft(page);
    await fillPublishableDocument(
        page,
        'Proposal workspace',
        [
            'The old wording',
            'Different paragraph stays',
            ...Array.from(
                { length: 24 },
                (_, index) =>
                    `Additional study paragraph ${index + 1}: Keep this learner wording.`,
            ),
        ].join('\n'),
    );
    const editor = page.getByRole('textbox', { name: 'Document', exact: true });
    // A real pointer interaction records the editor activation before native keyboard selection.
    await editor.click();
    await expect(editor).toBeFocused();
    await editor.press('ControlOrMeta+A');
    await editor.press('ArrowLeft');
    await expect(editor).toBeFocused();
    await expect
        .poll(() => page.evaluate(() => window.getSelection()?.toString()))
        .toBe('');
    for (let index = 0; index < 'The old wording'.length; index++)
        await editor.press('Shift+ArrowRight');
    await expect
        .poll(() => page.evaluate(() => window.getSelection()?.toString()))
        .toBe('The old wording');
    const selectionToolbar = page.getByRole('toolbar', {
        name: 'Selection actions',
        exact: true,
    });
    const documentScroll = page.locator('[data-workspace-scroll]');
    const scrollBounds = (await documentScroll.boundingBox())!;
    await page.mouse.move(
        scrollBounds.x + scrollBounds.width - 20,
        scrollBounds.y + scrollBounds.height / 2,
    );
    await page.mouse.wheel(0, 130);
    await expect
        .poll(() => documentScroll.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(100);
    const assertBubbleInside = async () => {
        await expect(selectionToolbar).toBeVisible();
        await expect
            .poll(async () => {
                const bubble = (await selectionToolbar.boundingBox())!;
                const viewport = (await documentScroll.boundingBox())!;
                return Math.min(
                    bubble.x - viewport.x,
                    bubble.y - viewport.y,
                    viewport.x + viewport.width - bubble.x - bubble.width,
                    viewport.y + viewport.height - bubble.y - bubble.height,
                );
            })
            .toBeGreaterThanOrEqual(-1);
    };
    await assertBubbleInside();
    await page.mouse.wheel(0, 8);
    await assertBubbleInside();
    await expect
        .poll(() => page.evaluate(() => window.getSelection()?.toString()))
        .toBe('The old wording');
    await capture(page, info, 'workspace-selection-scrolled-desktop');

    await page
        .getByRole('toolbar', { name: 'Selection actions', exact: true })
        .getByRole('button', { name: 'Ask tutor', exact: true })
        .click();
    // Move the cursor after capturing the question's target. Send must retain A.
    await editor.focus();
    await editor.press('ControlOrMeta+A');
    await editor.press('ArrowRight');
    const tutor = page.getByRole('region', {
        name: 'Language tutor',
        exact: true,
    });
    await tutor
        .getByLabel('Your question')
        .fill('Explain the selected wording');
    const submitted = page.waitForRequest(
        (request) =>
            request.method() === 'POST' && request.url().endsWith('/turns'),
    );
    await tutor.getByRole('button', { name: 'Send', exact: true }).click();
    const sent = (await submitted).postDataJSON() as {
        attachments: unknown[];
        editorContext: {
            selectedText?: string;
            editorTarget: { originalText: string };
            content: string;
        };
    };
    expect(sent.editorContext.selectedText).toBe('The old wording');
    expect(sent.editorContext.editorTarget.originalText).toBe(
        'The old wording',
    );
    expect(sent.editorContext.content).toContain('Different paragraph stays');
    expect(sent.attachments).toEqual([]);
    await expect(
        tutor
            .getByText(
                'A river bank is the land beside a river. This explanation uses your saved learning context.',
                { exact: true },
            )
            .first(),
    ).toBeVisible();
    await expect(
        tutor.locator('summary').getByText('The old wording', { exact: true }),
    ).toBeVisible();

    await page.reload();
    await expect(
        tutor.locator('summary').getByText('The old wording', { exact: true }),
    ).toBeVisible();
    const use = tutor.getByRole('button', {
        name: 'Show in text',
        exact: true,
    });
    await page.setViewportSize({ width: 1023, height: 1000 });
    await expect(page.locator('[data-companion-layout]')).toHaveAttribute(
        'data-overlay',
        'true',
    );
    await use.click();
    await expect(tutor).toBeHidden();
    const overlayInline = page.getByRole('region', {
        name: 'Use tutor reply in document',
        exact: true,
    });
    await expect(
        overlayInline.getByRole('button', { name: 'Accept', exact: true }),
    ).toBeVisible();
    await capture(page, info, 'workspace-inline-proposal-narrow-desktop');
    await overlayInline
        .getByRole('button', { name: 'Reject', exact: true })
        .click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
        .getByRole('radiogroup', { name: 'Layout', exact: true })
        .getByRole('radio', { name: 'Split', exact: true })
        .click();
    await use.click();
    const inlineReview = page.getByRole('region', {
        name: 'Use tutor reply in document',
        exact: true,
    });
    await expect(
        inlineReview.getByRole('button', { name: 'Accept', exact: true }),
    ).toBeVisible();
    await capture(page, info, 'workspace-inline-proposal-desktop');
    await inlineReview
        .getByRole('button', { name: 'Compare', exact: true })
        .click();
    await page
        .getByRole('region', {
            name: 'Use tutor reply in document',
            exact: true,
        })
        .getByRole('radio', { name: 'Replace selection', exact: true })
        .check();
    const review = page.getByRole('region', {
        name: 'Use tutor reply in document',
        exact: true,
    });
    await expect(review).toContainText('The old wording');
    await expect(
        review.getByText('You didn’t select a passage for this question', {
            exact: true,
        }),
    ).toHaveCount(0);
    await expect(
        review.getByRole('button', { name: 'Show target', exact: true }),
    ).toBeVisible();
    // Editing below the captured target during review must preserve its identity.
    await editor.focus();
    await editor.press('ControlOrMeta+A');
    await editor.press('ArrowRight');
    await editor.press('Enter');
    await editor.pressSequentially('Tail added while reviewing.');
    await expect(editor).toContainText('Tail added while reviewing.');
    await capture(page, info, 'workspace-proposal-desktop');

    await page
        .getByRole('button', { name: /^Replace(?: current text)?$/u })
        .click();
    await expect(editor).toContainText(
        'A river bank is the land beside a river.',
    );
    await expect(editor).toContainText('Different paragraph stays');
    await expect(editor).toContainText('Tail added while reviewing.');
    await expect(editor).not.toContainText('The old wording');
    await expect(
        page.getByText('Added to working draft. You can undo this edit.', {
            exact: true,
        }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(editor).toContainText('The old wording');

    await editor.fill('Changed target wording');
    await waitForRecovery(page);
    await use.click();
    await page
        .getByRole('region', {
            name: 'Use tutor reply in document',
            exact: true,
        })
        .getByRole('radio', { name: 'Replace selection', exact: true })
        .check();
    await page
        .getByRole('button', { name: /^Replace(?: current text)?$/u })
        .click();
    const comparison = page.getByRole('dialog', {
        name: 'The proposal target changed',
        exact: true,
    });
    await expect(
        comparison.getByText('The old wording', { exact: true }),
    ).toBeVisible();
    await expect(
        comparison.getByText('Changed target wording', { exact: true }),
    ).toBeVisible();
    await comparison
        .getByRole('button', { name: 'Append to the end', exact: true })
        .click();
    await expect(editor).toContainText('Changed target wording');
    await expect(editor).toContainText(
        'A river bank is the land beside a river.',
    );
    assertClean();
});

// @user-flow knowledge-workspace/workspace-share-copy-revoke
test('a saved workspace shares only its saved version, copies independently, and revokes immediately', async ({
    page,
    browser,
}, info) => {
    const assertOwnerClean = runtimeErrors(page);
    const token = await signup(page, info);
    await createDraft(page);
    const publishedBody = 'The river bank is the land beside the water.';
    const privateWorkingBody =
        'Private working wording that must never appear in a shared note.';
    await fillPublishableDocument(page, 'River bank research', publishedBody);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
        page.locator('[data-workspace-topbar] [data-state="saved"]'),
    ).toBeVisible();
    await openSharing(page);
    await page
        .getByRole('button', { name: 'Enable sharing', exact: true })
        .click();
    await expect(
        page.getByRole('button', { name: 'Shared', exact: true }),
    ).toBeVisible();
    await page
        .getByRole('textbox', { name: 'Document', exact: true })
        .fill(privateWorkingBody);
    await waitForRecovery(page);

    const noteId = page.url().split('/').at(-1)!;
    const share = await api<Share>(page, token, `/knowledge/${noteId}/share`);
    const sharedPath = `/shared/knowledge/${share.locator}#${share.key}`;

    const recipientContext = await browser.newContext();
    const recipient = await recipientContext.newPage();
    const assertRecipientClean = runtimeErrors(recipient);
    try {
        await recipient.goto(`${webOrigin}${sharedPath}`);
        await expect(
            recipient.getByRole('heading', {
                name: 'River bank research',
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            recipient.getByText(publishedBody, { exact: true }),
        ).toBeVisible();
        await expect(
            recipient.getByRole('region', {
                name: 'Language tutor',
                exact: true,
            }),
        ).toHaveCount(0);
        const signIn = recipient.getByRole('link', {
            name: 'Sign in to save a copy',
            exact: true,
        });
        await expect(signIn).toHaveAttribute(
            'href',
            new RegExp(
                `/login\\?returnTo=%2Fshared%2Fknowledge%2F${share.locator}$`,
            ),
        );
        expect(recipient.url()).not.toContain(share.key);
        await signIn.click();
        const createAccount = recipient.getByRole('link', {
            name: 'Create an account',
            exact: true,
        });
        await expect(createAccount).toHaveAttribute(
            'href',
            new RegExp(
                `/signup\\?returnTo=%2Fshared%2Fknowledge%2F${share.locator}$`,
            ),
        );
        await createAccount.click();
        await expect(recipient).toHaveURL(
            new RegExp(
                `/signup\\?returnTo=%2Fshared%2Fknowledge%2F${share.locator}$`,
            ),
        );
        await signupFromCurrentPage(recipient, info);
        await expect(recipient).toHaveURL(
            new RegExp(`/shared/knowledge/${share.locator}$`),
        );
        await recipient
            .getByRole('button', { name: 'Save my own copy', exact: true })
            .click();
        await expect(recipient).toHaveURL(/\/knowledge\/[0-9a-f-]{36}$/u);
        await expect(
            recipient.getByRole('textbox', { name: 'Title', exact: true }),
        ).toHaveValue('River bank research');
        await expect(
            recipient.getByRole('textbox', { name: 'Document', exact: true }),
        ).toContainText(publishedBody);
        const copiedPath = recipient.url();

        await page.getByRole('button', { name: 'Shared', exact: true }).click();
        await page
            .getByRole('button', { name: 'Disable sharing', exact: true })
            .click();
        await page
            .getByRole('button', { name: 'Disable link', exact: true })
            .click();
        await expect(
            page.getByRole('button', { name: 'Shared', exact: true }),
        ).toHaveCount(0);
        await recipient.goto(`${webOrigin}${sharedPath}`);
        await expect(
            recipient.getByText(
                'This shared note is unavailable or its link was disabled.',
                { exact: true },
            ),
        ).toBeVisible();
        await recipient.goto(copiedPath);
        await expect(
            recipient.getByRole('textbox', { name: 'Title', exact: true }),
        ).toHaveValue('River bank research');
        assertRecipientClean();
    } finally {
        await recipientContext.close();
    }
    assertOwnerClean();
});

// @user-flow knowledge-workspace/workspace-mobile-tutor-sheet
test('the workspace switches between mobile document and tutor tabs and uses a tablet overlay', async ({
    page,
}, info) => {
    const assertClean = runtimeErrors(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await signup(page, info);
    await createDraft(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
        .getByRole('radiogroup', { name: 'Layout', exact: true })
        .getByRole('radio', { name: 'Focus', exact: true })
        .click();
    await page.setViewportSize({ width: 390, height: 844 });
    const tutor = page.getByRole('region', {
        name: 'Language tutor',
        exact: true,
    });
    const editor = page.getByRole('textbox', { name: 'Document', exact: true });
    const documentTab = page.getByRole('tab', {
        name: 'Document',
        exact: true,
    });
    const tutorTab = page.getByRole('tab', { name: 'Tutor', exact: true });
    const documentPanelId = await documentTab.getAttribute('aria-controls');
    const tutorPanelId = await tutorTab.getAttribute('aria-controls');
    expect(documentPanelId).toBeTruthy();
    expect(tutorPanelId).toBeTruthy();
    const documentPanel = page.locator(`[id="${documentPanelId}"]`);
    const tutorPanel = page.locator(`[id="${tutorPanelId}"]`);
    await expect(documentPanel).toHaveAttribute('role', 'tabpanel');
    await expect(documentPanel).toHaveAttribute(
        'aria-labelledby',
        (await documentTab.getAttribute('id'))!,
    );
    await expect(tutorPanel).toHaveAttribute('role', 'tabpanel');
    await expect(tutorPanel).toHaveAttribute(
        'aria-labelledby',
        (await tutorTab.getAttribute('id'))!,
    );
    await expect(documentPanel.getByRole('tablist')).toHaveCount(0);
    await expect(documentTab).toHaveAttribute('aria-selected', 'true');
    await expect(editor).toBeVisible();
    await expect(tutor).toBeHidden();
    await expect(
        page.getByRole('button', { name: 'Properties', exact: true }),
    ).toBeVisible();
    await page
        .getByRole('button', { name: 'Document actions', exact: true })
        .click();
    await expect(
        page.getByRole('menuitem', { name: 'Delete note', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await capture(page, info, 'workspace-mobile-editor');
    const outlineAdmissions: {
        attachments: unknown[];
        editorContext: { content: string; selectedText?: string };
    }[] = [];
    page.on('request', (request) => {
        if (request.method() === 'POST' && request.url().endsWith('/turns'))
            outlineAdmissions.push(request.postDataJSON());
    });
    await page.getByRole('button', { name: 'AI outline', exact: true }).click();
    await expect(tutorTab).toHaveAttribute('aria-selected', 'true');
    await expect(tutor).toBeVisible();
    await expect(
        tutor.getByText(/A river bank is the land beside a river/u).first(),
    ).toBeVisible();
    await expect(
        tutor.getByRole('button', { name: 'New conversation', exact: true }),
    ).toBeEnabled();
    expect(outlineAdmissions).toHaveLength(1);
    expect(outlineAdmissions[0]!.editorContext.content).toBe('');
    expect(outlineAdmissions[0]!.editorContext.selectedText).toBeUndefined();
    expect(outlineAdmissions[0]!.attachments).toEqual([]);
    await capture(page, info, 'workspace-mobile-outline-chat');
    await tutor
        .getByRole('button', { name: 'New conversation', exact: true })
        .click();
    await documentTab.click();

    await tutorTab.click();
    await expect(tutorTab).toHaveAttribute('aria-selected', 'true');
    await expect(tutor).toBeVisible();
    await expect(editor).toBeHidden();
    await expect
        .poll(async () => Math.round((await tutor.boundingBox())!.width))
        .toBe(390);
    await expect(
        page.getByRole('separator', {
            name: 'Resize tutor panel',
            exact: true,
        }),
    ).toBeHidden();
    await expect(
        tutor.getByRole('button', {
            name: /^(?:Expand to full height|Reduce to partial height)$/u,
        }),
    ).toHaveCount(0);
    await capture(page, info, 'workspace-mobile-tutor-tab');
    await tutor.getByLabel('Your question').fill('Explain how to outline');
    await documentTab.click();
    await expect(editor).toBeVisible();
    await tutorTab.focus();
    await tutorTab.press('ArrowRight');
    await expect(tutorTab).toHaveAttribute('aria-selected', 'true');
    await expect(tutor.getByLabel('Your question')).toHaveValue(
        'Explain how to outline',
    );
    await tutor.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(
        tutor.getByText(/A river bank is the land beside a river/u).first(),
    ).toBeVisible();
    await tutor
        .getByRole('button', { name: 'Use in document', exact: true })
        .click();
    const review = page.getByRole('region', {
        name: 'Use tutor reply in document',
        exact: true,
    });
    await expect(documentTab).toHaveAttribute('aria-selected', 'true');
    await expect(review).toBeVisible();
    await expect(tutor).toBeHidden();
    await review
        .getByRole('radio', { name: 'Append to end', exact: true })
        .check();
    await capture(page, info, 'workspace-mobile-document-review');
    await review.getByRole('button', { name: 'Append', exact: true }).click();
    await expect(editor).toContainText(
        'A river bank is the land beside a river.',
    );
    await page.setViewportSize({ width: 820, height: 1000 });
    await expect(documentTab).toBeHidden();
    await page
        .getByRole('radiogroup', { name: 'Layout', exact: true })
        .getByRole('radio', { name: 'Split', exact: true })
        .click();
    await expect(tutor).toBeVisible();
    await expect(editor).toBeVisible();
    await expect
        .poll(async () =>
            Math.round(
                (await page.locator('[data-companion-slot]').boundingBox())!
                    .width,
            ),
        )
        .toBe(380);
    await expect
        .poll(async () => {
            const box = (await tutor.boundingBox())!;
            return Math.round(box.y + box.height);
        })
        .toBe(1000);
    await expect(
        page.getByRole('separator', {
            name: 'Resize tutor panel',
            exact: true,
        }),
    ).toBeHidden();
    await expect(
        page.getByRole('radio', { name: 'Chat', exact: true }),
    ).toBeDisabled();
    await capture(page, info, 'workspace-tablet-overlay');
    await expect
        .poll(() =>
            page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
        )
        .toBe(true);
    assertClean();
});

// @user-flow knowledge-workspace/workspace-markdown-insertion
test('Markdown proposals preserve rich document structure, preview read-only content, and offer literal fallback', async ({
    page,
    browser,
}, info) => {
    const assertClean = runtimeErrors(page);
    const token = await signup(page, info);
    await createDraft(page);
    const tutor = page.getByRole('region', {
        name: 'Language tutor',
        exact: true,
    });
    const editor = page.getByRole('textbox', { name: 'Document', exact: true });
    const paragraphStyle = page.getByLabel('Paragraph', { exact: true });
    await expect(paragraphStyle.locator('option')).toHaveText([
        'Paragraph',
        'Heading 1',
        'Heading 2',
        'Heading 3',
    ]);
    await expect(
        page.getByRole('button', { name: 'Horizontal rule', exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await tutor
        .getByLabel('Your question')
        .fill('Markdown grammar mapping fixture');
    await tutor.getByRole('button', { name: 'Send', exact: true }).click();
    const proposalCard = tutor.getByRole('region', {
        name: 'Proposed',
        exact: true,
    });
    await expect(
        proposalCard.getByRole('heading', {
            name: 'Времена во французском',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        proposalCard.locator('strong').filter({ hasText: /^время$/u }),
    ).toBeVisible();
    await expect(proposalCard.locator('h1')).toHaveText(
        'Времена во французском',
    );
    await expect(proposalCard.locator('h2')).toHaveText('Настоящее');
    await expect(proposalCard.locator('h3')).toHaveText('Наблюдение');
    await expect(proposalCard.locator('hr')).toHaveCount(1);
    const previewButton = proposalCard.getByRole('button', {
        name: 'Preview content',
        exact: true,
    });
    const editorHtmlBeforePreview = await editor.evaluate(
        (element) => element.innerHTML,
    );
    await previewButton.focus();
    await previewButton.click();
    const preview = page.getByRole('dialog', {
        name: 'Preview content',
        exact: true,
    });
    const previewDocument = preview.getByRole('document', {
        name: 'Proposed',
        exact: true,
    });
    await expect(previewDocument.locator('h1')).toHaveText(
        'Времена во французском',
    );
    await expect(previewDocument.locator('h2')).toHaveText('Настоящее');
    await expect(previewDocument.locator('h3')).toHaveText('Наблюдение');
    await expect(previewDocument.locator('hr')).toHaveCount(1);
    await expect(preview.getByRole('button', { name: 'Append' })).toHaveCount(
        0,
    );
    await expect(preview.getByRole('radio')).toHaveCount(0);
    await expect
        .poll(async () => Math.round((await preview.boundingBox())!.width))
        .toBe(720);
    await previewDocument.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
    });
    await expect
        .poll(() => previewDocument.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0);
    await expect(
        preview.getByRole('button', { name: 'Close', exact: true }),
    ).toBeInViewport();
    await capture(page, info, 'markdown-document-preview-desktop');
    await page.keyboard.press('Escape');
    await expect(preview).toHaveCount(0);
    await expect(previewButton).toBeFocused();
    expect(await editor.evaluate((element) => element.innerHTML)).toBe(
        editorHtmlBeforePreview,
    );
    await previewButton.click();
    await preview.getByRole('button', { name: 'Close', exact: true }).hover();
    await expect(
        page.getByRole('tooltip', { name: 'Close', exact: true }),
    ).toBeVisible();
    await preview.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(previewButton).toBeFocused();
    await tutor
        .getByRole('button', { name: 'Use in document', exact: true })
        .click();
    const review = page.getByRole('region', {
        name: 'Use tutor reply in document',
        exact: true,
    });
    await review
        .getByRole('radio', { name: 'Append to end', exact: true })
        .check();
    await expect(review).not.toContainText('H1 → H2');
    await capture(page, info, 'markdown-formatted-preview');
    await review.getByRole('button', { name: 'Append', exact: true }).click();
    await expect(editor.locator('h1').first()).toHaveText(
        'Времена во французском',
    );
    await expect(editor.locator('h2')).toHaveText('Настоящее');
    await expect(editor.locator('h3')).toHaveText('Наблюдение');
    await expect(editor.locator('hr')).toHaveCount(1);
    await expect(editor.locator('strong')).toHaveText('время');
    await expect(editor.locator('em')).toHaveText('вид');
    await expect(editor.locator('li')).toHaveCount(2);
    await expect(editor.locator('table')).toHaveCount(1);
    await expect(editor).not.toContainText('**');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(editor).toHaveText('');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    await waitForRecovery(page);
    await page.reload();
    await expect(editor.locator('strong')).toHaveText('время');
    await page
        .getByRole('textbox', { name: 'Title', exact: true })
        .fill('French Markdown grammar');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
        page.locator('[data-workspace-topbar] [data-state="saved"]'),
    ).toBeVisible();
    await page.reload();
    await expect(editor.locator('table')).toHaveCount(1);
    await expect(editor.locator('h1')).toHaveText('Времена во французском');
    await expect(editor.locator('h2')).toHaveText('Настоящее');
    await expect(editor.locator('h3')).toHaveText('Наблюдение');
    await expect(editor.locator('hr')).toHaveCount(1);
    await openSharing(page);
    await page
        .getByRole('button', { name: 'Enable sharing', exact: true })
        .click();
    await expect(
        page.getByRole('button', { name: 'Shared', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    const noteId = page.url().split('/').at(-1)!;
    const share = await api<Share>(page, token, `/knowledge/${noteId}/share`);
    const context = await browser.newContext();
    try {
        const reader = await context.newPage();
        const readerClean = runtimeErrors(reader);
        await reader.goto(
            `${webOrigin}/shared/knowledge/${share.locator}#${share.key}`,
        );
        await expect(
            reader.getByRole('heading', {
                name: 'Времена во французском',
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            reader.locator('strong').filter({ hasText: /^время$/u }),
        ).toBeVisible();
        await expect(reader.locator('table')).toHaveCount(1);
        await expect(
            reader.getByRole('heading', {
                name: 'Времена во французском',
                exact: true,
            }),
        ).toBeVisible();
        await expect(reader.locator('h2')).toHaveText('Настоящее');
        await expect(reader.locator('h3')).toHaveText('Наблюдение');
        await expect(reader.locator('hr')).toHaveCount(1);
        readerClean();
    } finally {
        await context.close();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('tab', { name: 'Tutor', exact: true }).click();
    await previewButton.click();
    await expect
        .poll(async () => {
            const box = (await preview.boundingBox())!;
            return {
                height: Math.round(box.height),
                width: Math.round(box.width),
                x: Math.round(box.x),
            };
        })
        .toEqual({ height: 844, width: 390, x: 0 });
    await expect(
        previewDocument.locator('[contenteditable="true"]'),
    ).toHaveCount(0);
    await previewDocument.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
    });
    await expect(
        preview.getByRole('button', { name: 'Close', exact: true }),
    ).toBeInViewport();
    await capture(page, info, 'markdown-document-preview-mobile');
    await page.keyboard.press('Escape');
    await expect(previewButton).toBeFocused();
    await tutor
        .getByLabel('Your question')
        .fill('Unsupported Markdown grammar fixture');
    await tutor.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(
        tutor.locator('code').filter({ hasText: 'Je parle français.' }),
    ).toBeVisible();
    await expect(
        tutor.getByRole('button', { name: 'Use in document', exact: true }),
    ).toHaveCount(2);
    await tutor
        .getByRole('button', { name: 'Use in document', exact: true })
        .last()
        .click();
    await review
        .getByRole('radio', { name: 'Append to end', exact: true })
        .check();
    await expect(review).toContainText('Formatted insertion is unavailable');
    await expect(
        review.getByRole('button', { name: 'Append', exact: true }),
    ).toBeDisabled();
    await review
        .getByRole('checkbox', { name: 'Insert as plain text', exact: true })
        .check();
    await capture(page, info, 'markdown-mobile-literal-fallback');
    await review.getByRole('button', { name: 'Append', exact: true }).click();
    await expect(editor).toContainText('```text');
    await expect(editor.locator('h1').first()).toHaveText(
        'Времена во французском',
    );
    assertClean();
});
