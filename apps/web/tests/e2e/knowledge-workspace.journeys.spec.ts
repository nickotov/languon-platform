import { expect, test, type Page, type TestInfo } from '@playwright/test';

// @user-flow-revision knowledge-workspace sha256:3123ab18fa632bb3

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

async function createDraft(page: Page) {
    await page.getByRole('button', { name: 'New note', exact: true }).click();
    await expect(page).toHaveURL(/\/knowledge\/[0-9a-f-]{36}$/u);
    await expect(page.getByLabel('Title')).toHaveValue('Untitled');
}

async function fillPublishableDocument(
    page: Page,
    title: string,
    body: string,
) {
    await page.getByLabel('Title').fill(title);
    await page
        .getByRole('textbox', { name: 'Document', exact: true })
        .fill(body);
    await expect(
        page.getByText('Working draft recovered', { exact: true }),
    ).toBeVisible();
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
    await page.getByLabel('Add context /').click();
    const picker = page.getByRole('dialog', {
        name: 'Search your Texts',
        exact: true,
    });
    await picker.getByRole('button', { name: title, exact: true }).click();
    await picker
        .getByRole('button', { name: 'Use full text', exact: true })
        .click();
    await picker
        .getByRole('button', { name: 'Attach to message', exact: true })
        .click();
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
    await tutor
        .getByLabel('Your question')
        .fill('Research river banks carefully');
    await tutor.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(
        page.getByText(/A river bank is the land beside a river/u).first(),
    ).toBeVisible();
    await expect(page.getByLabel('Title')).toHaveValue('Research river banks');

    await fillPublishableDocument(
        page,
        'Research river banks',
        'A river bank is the land beside a river.',
    );
    await page.reload();
    await expect(
        page.getByRole('textbox', { name: 'Document', exact: true }),
    ).toContainText('A river bank is the land beside a river.');
    await page
        .getByRole('button', { name: 'Save changes', exact: true })
        .click();
    await expect(
        page.getByRole('button', { name: 'Enable sharing', exact: true }),
    ).toBeVisible();
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
        await expect(alternate.getByLabel('Title')).toHaveValue(
            'Original workspace title',
        );
        await page.getByLabel('Title').fill('First recovered version');
        await expect(
            page.getByText('Working draft recovered', { exact: true }),
        ).toBeVisible();
        await alternate.getByLabel('Title').fill('Second recovered version');
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
        await expect(alternate.getByLabel('Title')).toHaveValue(
            'First recovered version',
        );
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
    await page
        .getByRole('button', { name: 'Save changes', exact: true })
        .click();
    await fillPublishableDocument(
        page,
        'Second saved version',
        'The second saved wording.',
    );
    await page
        .getByRole('button', { name: 'Save changes', exact: true })
        .click();
    await fillPublishableDocument(
        page,
        'Unsaved recovered version',
        'Private wording that has not been published.',
    );

    await page
        .getByRole('button', { name: 'Revision history', exact: true })
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
        name: 'Save changes',
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

    await page.getByLabel('Add context /').click();
    const picker = page.getByRole('dialog', {
        name: 'Search your Texts',
        exact: true,
    });
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
        'The old wording',
    );
    const editor = page.getByRole('textbox', { name: 'Document', exact: true });
    await editor.focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    const tutor = page.getByRole('region', {
        name: 'Language tutor',
        exact: true,
    });
    await tutor
        .getByLabel('Your question')
        .fill('Explain the selected wording');
    await tutor.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(
        tutor.getByText(
            'A river bank is the land beside a river. This explanation uses your saved learning context.',
            { exact: true },
        ),
    ).toBeVisible();

    await page.reload();
    const use = page.getByRole('button', {
        name: 'Use in document',
        exact: true,
    });
    await use.click();
    await page
        .getByRole('region', { name: 'Review before inserting', exact: true })
        .getByLabel('Review before inserting')
        .selectOption({ label: 'Replace original selection' });
    await page
        .getByRole('button', { name: 'Accept edit', exact: true })
        .click();
    await expect(editor).toContainText(
        'A river bank is the land beside a river.',
    );
    await expect(
        page.getByText('Added to working draft. You can undo this edit.', {
            exact: true,
        }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(editor).toContainText('The old wording');

    await editor.fill('Changed target wording');
    await expect(
        page.getByText('Working draft recovered', { exact: true }),
    ).toBeVisible();
    await use.click();
    await page
        .getByRole('region', { name: 'Review before inserting', exact: true })
        .getByLabel('Review before inserting')
        .selectOption({ label: 'Replace original selection' });
    await page
        .getByRole('button', { name: 'Accept edit', exact: true })
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
    await page
        .getByRole('button', { name: 'Save changes', exact: true })
        .click();
    await page
        .getByRole('button', { name: 'Enable sharing', exact: true })
        .click();
    await expect(
        page.getByRole('button', { name: 'Disable sharing', exact: true }),
    ).toBeVisible();
    await page
        .getByRole('textbox', { name: 'Document', exact: true })
        .fill(privateWorkingBody);
    await expect(
        page.getByText('Working draft recovered', { exact: true }),
    ).toBeVisible();

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
        await expect(recipient.getByLabel('Title')).toHaveValue(
            'River bank research',
        );
        await expect(
            recipient.getByRole('textbox', { name: 'Document', exact: true }),
        ).toContainText(publishedBody);
        const copiedPath = recipient.url();

        await page
            .getByRole('button', { name: 'Disable sharing', exact: true })
            .click();
        await expect(
            page.getByRole('button', { name: 'Enable sharing', exact: true }),
        ).toBeVisible();
        await recipient.goto(`${webOrigin}${sharedPath}`);
        await expect(
            recipient.getByText(
                'This shared note is unavailable or its link was disabled.',
                { exact: true },
            ),
        ).toBeVisible();
        await recipient.goto(copiedPath);
        await expect(recipient.getByLabel('Title')).toHaveValue(
            'River bank research',
        );
        assertRecipientClean();
    } finally {
        await recipientContext.close();
    }
    assertOwnerClean();
});

// @user-flow knowledge-workspace/workspace-mobile-tutor-sheet
test('the workspace keeps its editor usable beside the mobile tutor sheet', async ({
    page,
}, info) => {
    const assertClean = runtimeErrors(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await signup(page, info);
    await createDraft(page);
    const tutor = page.getByRole('region', {
        name: 'Language tutor',
        exact: true,
    });
    await expect(tutor).toBeVisible();
    await expect
        .poll(async () => Math.round((await tutor.boundingBox())!.width))
        .toBe(390);
    await tutor
        .getByRole('button', { name: 'Reduce to partial height', exact: true })
        .first()
        .click();
    await expect
        .poll(async () => Math.round((await tutor.boundingBox())!.height))
        .toBe(Math.round(844 * 0.75));
    await expect
        .poll(() =>
            page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
        )
        .toBe(true);
    assertClean();
});
