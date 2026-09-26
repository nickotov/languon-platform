import { expect, test, type Page, type TestInfo } from '@playwright/test';

// @user-flow-revision dictionary-permanent-deletion sha256:d13617b45d9dd4aa

const password = 'E2e!Dictionary-password-2026';
const runId =
    process.env.AUTH_E2E_RUN_ID ?? `${Date.now().toString(36)}-${process.pid}`;

function syntheticEmail(testInfo: TestInfo, journey: string): string {
    return `dictionary-deletion-${runId}-${testInfo.workerIndex}-${journey}@example.test`;
}

async function signUp(page: Page, email: string): Promise<void> {
    await page.goto('/signup?returnTo=%2Fdictionaries');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/verify-email\?/);
    await page.getByLabel('Verification code').fill('0000');
    await page.getByRole('button', { name: 'Verify email' }).click();
    await expect(page).toHaveURL(/\/dictionaries$/);
}

async function createDictionary(page: Page, name: string): Promise<void> {
    await page.getByRole('button', { name: 'New dictionary' }).click();
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Translate from').selectOption('en');
    await page.getByLabel('Translate to').selectOption('es');
    await page.getByRole('button', { name: 'Create dictionary' }).click();
    await expect(page.getByRole('heading', { name })).toBeVisible();
}

async function backToLibrary(page: Page): Promise<void> {
    await page.getByRole('link', { name: /Back to dictionaries/ }).click();
    await expect(
        page.getByRole('heading', { name: 'My dictionaries' }),
    ).toBeVisible();
}

async function dictionaryAction(page: Page, name: string, action: string) {
    const row = page.getByRole('listitem').filter({ hasText: name });
    await row.getByRole('button', { name: `Actions for ${name}` }).click();
    await row.getByRole('menuitem', { name: action, exact: true }).click();
}

async function addCard(page: Page, source: string, translation: string) {
    await page.getByRole('button', { name: 'Add card' }).click();
    await page.getByLabel(/^Source word or phrase \(/).fill(source);
    await page.getByLabel(/^Translation \(/).fill(translation);
    await page.getByRole('button', { name: 'Save card' }).click();
    await expect(page.getByText(source, { exact: true })).toBeVisible();
}

async function cardAction(page: Page, source: string, action: string) {
    const row = page.getByRole('listitem').filter({ hasText: source });
    await row.getByRole('button', { name: /Card actions, card/ }).click();
    await row.getByRole('menuitem', { name: action, exact: true }).click();
}

async function selectArchivedCards(page: Page) {
    await page
        .getByRole('group', { name: 'Card status' })
        .getByRole('button', { name: 'Archived', exact: true })
        .click();
}

test.describe('dictionary permanent deletion journeys', () => {
    // @user-flow dictionary-permanent-deletion/owner-deletes-selected-and-all-archived-dictionaries
    test('owner permanently deletes selected and all archived dictionaries', async ({
        page,
    }, testInfo) => {
        await signUp(page, syntheticEmail(testInfo, 'dictionaries'));
        const names = ['one', 'two', 'three'].map(
            (suffix) => `Archived ${suffix} ${runId}`,
        );
        for (const name of names) {
            await createDictionary(page, name);
            await backToLibrary(page);
        }
        for (const name of names) await dictionaryAction(page, name, 'Archive');
        await page
            .getByRole('button', { name: 'Archived', exact: true })
            .click();

        await dictionaryAction(page, names[0], 'Delete permanently');
        const singleDialog = page.getByRole('alertdialog', {
            name: 'Delete dictionaries permanently?',
        });
        await expect(
            singleDialog.getByLabel(`Type “${names[0]}” to confirm`),
        ).toBeVisible();
        await singleDialog.getByRole('button', { name: 'Cancel' }).click();
        await expect(page.getByText(names[0], { exact: true })).toBeVisible();

        await page.getByLabel(`Select ${names[0]}`).check();
        await page.getByLabel(`Select ${names[1]}`).check();
        await page.getByRole('button', { name: 'Delete selected' }).click();
        const selectedDialog = page.getByRole('alertdialog', {
            name: 'Delete dictionaries permanently?',
        });
        await selectedDialog
            .getByLabel('Type “DELETE 2” to confirm')
            .fill('DELETE 2');
        await selectedDialog
            .getByRole('button', { name: 'Delete permanently' })
            .click();
        await expect(
            page.getByText('Dictionaries permanently deleted: 2.'),
        ).toBeVisible();
        await expect(page.getByText(names[0], { exact: true })).toHaveCount(0);
        await expect(page.getByText(names[2], { exact: true })).toBeVisible();

        await page.getByRole('button', { name: 'Delete all archived' }).click();
        const allDialog = page.getByRole('alertdialog', {
            name: 'Delete dictionaries permanently?',
        });
        await allDialog
            .getByLabel('Type “DELETE 1” to confirm')
            .fill('DELETE 1');
        await allDialog
            .getByRole('button', { name: 'Delete permanently' })
            .click();
        await expect(
            page.getByText('Dictionaries permanently deleted: 1.'),
        ).toBeVisible();
        await expect(page.getByText(names[2], { exact: true })).toHaveCount(0);
    });

    // @user-flow dictionary-permanent-deletion/owner-deletes-selected-and-all-archived-cards
    test('owner permanently deletes selected and all archived cards', async ({
        page,
    }, testInfo) => {
        await signUp(page, syntheticEmail(testInfo, 'cards'));
        await createDictionary(page, `Cards ${runId}`);
        await addCard(page, 'archived one', 'uno');
        await addCard(page, 'archived two', 'dos');
        await addCard(page, 'archived three', 'tres');
        await addCard(page, 'active survivor', 'activo');
        for (const source of [
            'archived one',
            'archived two',
            'archived three',
        ]) {
            await cardAction(page, source, 'Archive');
        }
        await selectArchivedCards(page);

        await cardAction(page, 'archived one', 'Delete permanently');
        const singleDialog = page.getByRole('alertdialog', {
            name: 'Delete cards permanently?',
        });
        await expect(singleDialog.getByText('archived one')).toBeVisible();
        await expect(singleDialog.getByText('uno')).toBeVisible();
        await singleDialog.getByRole('button', { name: 'Cancel' }).click();

        await page.getByLabel('Select card archived one').check();
        await page.getByLabel('Select card archived two').check();
        await page.getByRole('button', { name: 'Delete selected' }).click();
        const selectedDialog = page.getByRole('alertdialog', {
            name: 'Delete cards permanently?',
        });
        await selectedDialog
            .getByLabel(
                'I understand these cards cannot be recovered. Cards: 2.',
            )
            .check();
        await selectedDialog
            .getByRole('button', { name: 'Delete permanently' })
            .click();
        await expect(
            page.getByText('Cards permanently deleted: 2.'),
        ).toBeVisible();
        await expect(
            page.getByText('archived one', { exact: true }),
        ).toHaveCount(0);
        await expect(
            page.getByText('archived three', { exact: true }),
        ).toBeVisible();

        await page.getByRole('button', { name: 'Delete all archived' }).click();
        const allDialog = page.getByRole('alertdialog', {
            name: 'Delete cards permanently?',
        });
        await allDialog
            .getByLabel(
                'I understand these cards cannot be recovered. Cards: 1.',
            )
            .check();
        await allDialog
            .getByRole('button', { name: 'Delete permanently' })
            .click();
        await expect(
            page.getByText('Cards permanently deleted: 1.'),
        ).toBeVisible();
        await expect(
            page.getByText('archived three', { exact: true }),
        ).toHaveCount(0);
        await page
            .getByRole('group', { name: 'Card status' })
            .getByRole('button', { name: /Active/, exact: false })
            .click();
        await expect(
            page.getByText('active survivor', { exact: true }),
        ).toBeVisible();
    });

    // @user-flow dictionary-permanent-deletion/stale-or-busy-deletion-preserves-content
    test('a stale all-archived preview preserves every card for retry', async ({
        page,
    }, testInfo) => {
        await signUp(page, syntheticEmail(testInfo, 'busy'));
        await createDictionary(page, `Stale ${runId}`);
        await addCard(page, 'stale one', 'uno');
        await addCard(page, 'stale two', 'dos');
        await cardAction(page, 'stale one', 'Archive');
        await cardAction(page, 'stale two', 'Archive');
        await selectArchivedCards(page);
        await page.getByRole('button', { name: 'Delete all archived' }).click();
        const dialog = page.getByRole('alertdialog', {
            name: 'Delete cards permanently?',
        });
        await dialog
            .getByLabel(
                'I understand these cards cannot be recovered. Cards: 2.',
            )
            .check();
        const concurrentPage = await page.context().newPage();
        await concurrentPage.goto(page.url());
        await selectArchivedCards(concurrentPage);
        await cardAction(concurrentPage, 'stale one', 'Restore');
        await dialog
            .getByRole('button', { name: 'Delete permanently' })
            .click();
        await expect(dialog.getByText('Deletion failed')).toBeVisible();
        await expect(
            dialog.getByRole('button', { name: 'Reload' }),
        ).toBeVisible();
        const verificationPage = await page.context().newPage();
        await verificationPage.goto(page.url());
        await selectArchivedCards(verificationPage);
        await expect(
            verificationPage.getByText('stale two', { exact: true }),
        ).toBeVisible();
        await expect(
            verificationPage.getByText('stale one', { exact: true }),
        ).toHaveCount(0);
        await verificationPage
            .getByRole('group', { name: 'Card status' })
            .getByRole('button', { name: /Active/, exact: false })
            .click();
        await expect(
            verificationPage.getByText('stale one', { exact: true }),
        ).toBeVisible();
        await expect(
            verificationPage.getByText('stale two', { exact: true }),
        ).toHaveCount(0);
        await verificationPage.close();
        await concurrentPage.close();
    });
});
