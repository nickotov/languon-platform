import { expect, type Page, type Locator } from '@playwright/test';

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

export const routingFlows = [
    'single-card',
    'card-authoring',
    'pasted-terms',
    'import-pairs',
    'document-terms',
    'sentence-generation',
    'sentence-check',
    'text-detection',
    'text-translation',
    'text-selection-card',
    'conversation',
    'portrait-interview',
];

export async function selectAdminOption(
    page: Page,
    control: Locator,
    name: string | RegExp,
) {
    await control.scrollIntoViewIfNeeded();
    await control.press('ArrowDown', { timeout: 10_000 });
    if (
        typeof name === 'string' &&
        (await control.getAttribute('readonly')) === null
    )
        await control.fill(name);
    const popupId = await control.getAttribute('aria-controls');
    if (!popupId)
        throw new Error(
            'The select did not expose its controlled option list.',
        );
    await page
        .locator(`[id=${JSON.stringify(popupId)}]`)
        .getByRole('option', { name, exact: typeof name === 'string' })
        .click({ timeout: 10_000 });
}

/** Publishes through real admin controls; synthetic probe execution is owned by
 * the dedicated local fixture runtime, never a public provider. */
export async function configureModel(
    page: Page,
    options: {
        inputRate?: string;
        outputRate?: string;
        reason?: string;
        checkFlows?: boolean;
        includeTariffs?: boolean;
    } = {},
) {
    await page.getByRole('menuitem', { name: 'AI settings' }).click();
    const routing = page.getByRole('region', { name: 'Text AI routes' });
    await expect(
        routing.getByText('Synthetic provider checks', { exact: true }),
    ).toBeVisible();
    if (options.checkFlows !== false) {
        const checks = page.locator('.ant-card').filter({
            has: page.getByText('Synthetic provider checks', {
                exact: true,
            }),
        });
        await selectAdminOption(
            page,
            checks.getByLabel('Provider / model route', { exact: true }),
            /deepseek.*DeepSeek Flash/,
        );
        await selectAdminOption(
            page,
            checks.getByLabel('Check type', { exact: true }),
            'Test selected flow',
        );
        for (const flow of routingFlows) {
            await selectAdminOption(
                page,
                checks.getByLabel('AI flow', { exact: true }),
                flow,
            );
            await checks
                .getByRole('checkbox', {
                    name: 'I approve this operator expense up to the displayed maximum.',
                })
                .check();
            const responsePromise = page.waitForResponse(
                (response) =>
                    response.request().method() === 'POST' &&
                    response.url().endsWith('/admin/ai-settings/probes'),
            );
            await checks
                .getByRole('button', { name: 'Run check', exact: true })
                .click();
            const response = await responsePromise;
            expect(response.status(), `synthetic ${flow} probe status`).toBe(
                200,
            );
            expect(
                (await response.json()).state,
                `synthetic ${flow} response contract`,
            ).toBe('passed');
        }
    }
    const config = page.locator('.ant-card').filter({
        has: page.getByText('Routing and flow tariffs', { exact: true }),
    });
    const enabled = config.getByLabel('Enabled routes', { exact: true });
    const deepSeekTag = config
        .locator('.ant-select')
        .filter({ has: enabled })
        .locator('.ant-select-selection-item')
        .filter({ hasText: /deepseek.*DeepSeek Flash/ });
    if ((await deepSeekTag.count()) === 0)
        await selectAdminOption(page, enabled, /deepseek.*DeepSeek Flash/);
    await enabled.press('Escape');
    await selectAdminOption(
        page,
        config.getByLabel('Primary route', { exact: true }).first(),
        /deepseek.*DeepSeek Flash/,
    );
    const pricedFlows = routingFlows.filter(
        (value) => value !== 'portrait-interview',
    );
    for (const flow of options.includeTariffs === false ? [] : pricedFlows) {
        const section = config
            .locator('.ant-collapse-item')
            .filter({ has: page.getByText(flow, { exact: true }) });
        const header = section.getByRole('button').first();
        if ((await header.getAttribute('aria-expanded')) !== 'true')
            await header.click();
        await section
            .getByLabel('Input credits per million tokens', { exact: true })
            .fill(options.inputRate ?? '100');
        await section
            .getByLabel('Output credits per million tokens', { exact: true })
            .fill(options.outputRate ?? '300');
        await header.click();
    }
    await config
        .getByLabel('Reason for change', { exact: true })
        .fill(
            options.reason ??
                'Publish reviewed deterministic text routing and flow tariffs',
        );
    const publication = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            response.url().endsWith('/admin/ai/routing'),
    );
    await config
        .getByRole('button', { name: 'Publish routing', exact: true })
        .click();
    const response = await publication;
    expect(response.status()).toBe(200);
    const revision = (await response.json()).revision;
    await expect(
        config.getByText(`Configuration version ${revision.version}`, {
            exact: true,
        }),
    ).toBeVisible();
    return revision as { id: string; version: number };
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
