import { expect, type Page } from '@playwright/test';

/** Real admin forms: deliberately no configuration database fixtures. */
export async function calibrateAccounting(page: Page) {
    await page.getByRole('menuitem', { name: /AI accounting$/ }).click();
    const settings = page.locator('.ant-card').filter({
        has: page.getByText('AI action and provider expense limits', {
            exact: true,
        }),
    });
    for (const [label, value] of [
        ['Default maximum credits per action (blank = uncalibrated)', '10'],
        ['Maximum provider expense per action (USD)', '0.10'],
        ['Maximum provider expense per account per UTC day (USD)', '1'],
        ['Maximum provider expense per UTC day, all accounts (USD)', '5'],
        ['Reason for change', 'Synthetic critical journey calibration'],
    ])
        await settings.getByLabel(label!, { exact: true }).fill(value!);
    const published = page.waitForResponse(
        (response) =>
            response.request().method() === 'PATCH' &&
            response.url().endsWith('/admin/ai/accounting-settings'),
    );
    await settings
        .getByRole('button', { name: 'Publish action budget revision' })
        .click();
    expect((await published).status()).toBe(200);

    await page.getByRole('button', { name: 'Add provider cost rate' }).click();
    const dialog = page.getByRole('dialog', {
        name: 'Publish provider cost revision',
    });
    for (const [label, value] of [
        ['Provider', 'deepseek'],
        ['Model', 'deepseek-flash'],
        ['USD per million input tokens', '0.30'],
        ['USD per million output tokens', '1.20'],
        ['USD per million cache read tokens (optional)', '0.006'],
        ['Price source reference', 'synthetic-critical-journey'],
        ['Reason for change', 'Synthetic deterministic provider costs'],
    ])
        await dialog.getByLabel(label!, { exact: true }).fill(value!);
    await dialog
        .getByRole('button', { name: 'Publish provider cost revision' })
        .click();
    await expect(dialog).not.toBeVisible();
}

export async function configureModel(page: Page) {
    await page.getByRole('menuitem', { name: 'AI settings' }).click();
    await page
        .locator('label.ant-radio-button-wrapper')
        .filter({ hasText: 'DeepSeek' })
        .click();
    await page.getByRole('checkbox', { name: /DeepSeek Flash/ }).check();
    const defaultModel = page.getByLabel('Default model');
    await defaultModel.press('ArrowDown');
    await defaultModel.press('Home');
    await defaultModel.press('Enter');
    await page
        .getByLabel('Reason for change')
        .fill('Enable deterministic DeepSeek testing');
    await page.getByRole('button', { name: 'Save configuration' }).click();
    await expect(page.getByText(/Configuration version \d+/)).toBeVisible();
    const prices = page.locator('.ant-card').filter({
        has: page.getByText('Model credit pricing', { exact: true }),
    });
    await prices
        .getByRole('row')
        .filter({ hasText: 'deepseek-flash' })
        .first()
        .getByRole('button', { name: 'Edit price', exact: true })
        .click();
    const dialog = page.getByRole('dialog', { name: 'Publish model price' });
    await dialog
        .getByLabel('Credits per million input tokens', { exact: true })
        .fill('100');
    await dialog
        .getByLabel('Credits per million output tokens', { exact: true })
        .fill('300');
    await dialog
        .getByLabel('Reason', { exact: true })
        .fill('Synthetic customer tariff for critical journey');
    await dialog
        .getByRole('button', { name: 'Publish price revision' })
        .click();
    await expect(dialog).not.toBeVisible();
}

export async function grantCredits(page: Page, learnerId: string) {
    await page.goto(`/users/${learnerId}`);
    await page.getByRole('button', { name: 'Adjust credits' }).click();
    const dialog = page.getByRole('dialog', { name: 'Adjust AI credits' });
    const amount = dialog.getByRole('spinbutton', { name: 'Credits' });
    // Ant Design initializes these fields after the opening animation.
    await expect(amount).toHaveValue('1.000');
    await amount.fill('100');
    await dialog
        .getByLabel('Reason')
        .fill('Fund deterministic setup-to-generation journey');
    await dialog.getByRole('button', { name: 'Apply adjustment' }).click();
    await expect(
        page.getByText('Grant', { exact: true }).first(),
    ).toBeVisible();
}
