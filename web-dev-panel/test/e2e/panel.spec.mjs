import { expect, test } from '@playwright/test';

// @user-flow-revision web-dev-panel sha256:d3bcf51e0663253b
// @user-flow web-dev-panel/parallel-command-control-and-isolated-logs
test('parallel-command-control-and-isolated-logs', async ({ page }) => {
    await page.goto('/?launch=web-dev-panel-fixture-launch');
    const navigation = page.getByRole('navigation', {
        name: 'Command sections',
    });
    await expect(navigation.getByRole('link')).toHaveCount(3);
    await expect(page.locator('.command-group[open]')).toHaveCount(0);
    await navigation.getByRole('link', { name: /Services/u }).click();
    await expect(page.locator('#command-section-services')).toHaveAttribute(
        'open',
        '',
    );
    const alpha = page.locator(
        '#command-section-services [data-command-id="alpha"]',
    );
    const beta = page.locator(
        '#command-section-services [data-command-id="beta"]',
    );
    await expect(alpha).not.toHaveAttribute('open', '');
    await expect(alpha.locator(':scope > summary')).toContainText(
        'Alpha fixture',
    );
    await expect(alpha.locator(':scope > summary')).toContainText(
        'Runs the first long-lived safe fixture command.',
    );
    await expect(alpha.locator(':scope > summary .status')).toHaveText('Idle');
    await alpha.locator(':scope > summary').click();
    await beta.locator(':scope > summary').click();
    await alpha.getByLabel('Select').check();
    await beta.getByLabel('Select').check();
    await page.getByRole('button', { name: 'Run selected' }).click();

    await expect(alpha.locator('.status')).toHaveText('running', {
        ignoreCase: true,
    });
    await expect(beta.locator('.status')).toHaveText('running', {
        ignoreCase: true,
    });
    await expect(page.locator('#selection-count')).toHaveText('0 selected');
    await expect(alpha.locator('.terminal')).toContainText('alpha: started');
    await expect(beta.locator('.terminal')).toContainText('beta: started');

    await alpha.getByRole('button', { name: 'Stop' }).click();
    await expect(alpha.locator('.status')).toHaveText('cancelled', {
        ignoreCase: true,
    });
    await expect(beta.locator('.status')).toHaveText('running', {
        ignoreCase: true,
    });

    await alpha.getByLabel('Select').check();
    await navigation.getByRole('link', { name: /Tasks/u }).click();
    const aggregate = page.locator(
        '#command-section-tasks [data-command-id="aggregate"]',
    );
    await aggregate.locator(':scope > summary').click();
    await aggregate.getByLabel('Select').check();
    await page.getByRole('button', { name: 'Run selected' }).click();
    await expect(page.getByRole('alert')).toContainText(
        'No commands were started because the selection is invalid.',
    );
    await expect(page.getByRole('alert')).toContainText(
        "aggregate: conflicts with selected command 'alpha'",
    );
    await expect(aggregate.locator('.status')).toHaveText('idle', {
        ignoreCase: true,
    });

    await navigation.getByRole('link', { name: /Unavailable/u }).click();
    const disabled = page.locator(
        '#command-section-unavailable [data-command-id="disabled-fixture"]',
    );
    await disabled.locator(':scope > summary').click();
    await expect(disabled.locator('.disabled-reason')).toContainText(
        'Why unavailable',
    );
    await expect(disabled.locator('.disabled-reason')).toContainText(
        'requires an interactive terminal',
    );
    await expect(
        disabled.getByRole('button', { name: 'Start' }),
    ).toBeDisabled();
});

// @user-flow web-dev-panel/cross-tab-single-source-of-truth
test('cross-tab-single-source-of-truth', async ({ browser }) => {
    const context = await browser.newContext();
    const first = await context.newPage();
    const second = await context.newPage();
    await Promise.all([
        first.goto('/?launch=web-dev-panel-fixture-launch'),
        second.goto('/?launch=web-dev-panel-fixture-launch'),
    ]);
    await first.locator('#command-section-services > summary').click();
    await second.locator('#command-section-services > summary').click();

    const firstBeta = first.locator('[data-command-id="beta"]');
    const secondBeta = second.locator('[data-command-id="beta"]');
    await firstBeta.locator(':scope > summary').click();
    await secondBeta.locator(':scope > summary').click();
    await firstBeta.getByRole('button', { name: 'Start' }).click();
    await expect(secondBeta.locator('.status')).toHaveText('running', {
        ignoreCase: true,
    });
    await expect(
        secondBeta.getByRole('button', { name: 'Stop' }),
    ).toBeEnabled();
    const third = await context.newPage();
    await third.goto('/');
    await expect(third.locator('[data-command-id="beta"] .status')).toHaveText(
        'running',
        { ignoreCase: true },
    );
    await secondBeta.getByRole('button', { name: 'Stop' }).click();
    await expect(firstBeta.locator('.status')).toHaveText('cancelled', {
        ignoreCase: true,
    });
    await context.close();
});

// @user-flow web-dev-panel/portable-custom-command-sections
test('portable-custom-command-sections', async ({ browser }) => {
    test.setTimeout(60_000);
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/?launch=web-dev-panel-fixture-launch');

    await page.getByRole('button', { name: 'Manage quick access' }).click();
    const manager = page.getByRole('dialog', { name: 'Manage quick access' });
    await manager.getByLabel('Section name').fill('Daily workspace');
    await manager.getByRole('button', { name: 'Create section' }).click();
    await manager.getByRole('button', { name: 'Close' }).click();

    const navigation = page.getByRole('navigation', {
        name: 'Command sections',
    });
    await expect(
        navigation.getByRole('link', { name: /Daily workspace/u }),
    ).toBeVisible();
    await expect(navigation.getByRole('link').first()).toContainText(
        'Daily workspace',
    );

    await navigation.getByRole('link', { name: /Services/u }).click();
    const catalogAlpha = page.locator(
        '#command-section-services [data-command-id="alpha"]',
    );
    const catalogBeta = page.locator(
        '#command-section-services [data-command-id="beta"]',
    );
    await catalogAlpha.locator(':scope > summary').click();
    await catalogAlpha
        .getByRole('group', { name: 'Quick-access sections' })
        .getByLabel('Daily workspace')
        .check();
    await catalogBeta.locator(':scope > summary').click();
    await catalogBeta
        .getByRole('group', { name: 'Quick-access sections' })
        .getByLabel('Daily workspace')
        .check();

    const customSection = page.locator('.custom-command-group').first();
    await expect(customSection).toContainText('Daily workspace');
    await expect(customSection.locator('[data-command-id]')).toHaveCount(2);
    const customAlpha = customSection.locator('[data-command-id="alpha"]');
    const customBeta = customSection.locator('[data-command-id="beta"]');
    await expect(customAlpha).not.toHaveAttribute('open', '');
    await expect(customAlpha.locator(':scope > summary')).toContainText(
        'Alpha fixture',
    );
    await expect(customAlpha.locator(':scope > summary')).toContainText(
        'Runs the first long-lived safe fixture command.',
    );
    await expect(customAlpha.locator(':scope > summary .status')).toHaveText(
        /Idle|Cancelled/u,
    );

    await customSection.getByRole('button', { name: 'Start all' }).click();
    await expect(customAlpha.locator('.status')).toHaveText('Running');
    await expect(customBeta.locator('.status')).toHaveText('Running');
    await expect(catalogAlpha.locator('.status')).toHaveText('Running');

    await customSection.getByRole('button', { name: 'Stop all' }).click();
    const stopDialog = page.getByRole('dialog', {
        name: 'Stop this section?',
    });
    await expect(stopDialog).toContainText('2 active commands');
    await stopDialog.getByRole('button', { name: 'Stop section' }).click();
    await expect(customAlpha.locator('.status')).toHaveText('Cancelled');
    await expect(customBeta.locator('.status')).toHaveText('Cancelled');

    await page.getByRole('button', { name: 'Manage quick access' }).click();
    const serialized = await manager
        .getByLabel('Portable custom sections JSON')
        .inputValue();
    await manager.getByRole('button', { name: 'Copy JSON' }).click();
    await expect(
        manager.locator('#custom-sections-dialog-notice'),
    ).toContainText(/copied|Clipboard access was unavailable/u);
    const exported = JSON.parse(serialized);
    expect(exported).toMatchObject({
        schema: 'languon.web-dev-panel.custom-sections',
        version: 1,
        sections: [
            {
                commandIds: ['alpha', 'beta'],
                name: 'Daily workspace',
            },
        ],
    });
    await manager.getByLabel('Portable custom sections JSON').fill(
        JSON.stringify({
            ...exported,
            sections: [
                {
                    ...exported.sections[0],
                    commandIds: ['missing-colleague-command'],
                },
            ],
        }),
    );
    await manager.getByRole('button', { name: 'Import and replace' }).click();
    await expect(manager.getByRole('alert')).toContainText(
        'missing-colleague-command',
    );
    await expect(customSection.locator('[data-command-id]')).toHaveCount(2);

    await manager.getByLabel('Portable custom sections JSON').fill(serialized);
    await manager.getByRole('button', { name: 'Import and replace' }).click();
    await manager.getByRole('button', { name: 'Close' }).click();

    const second = await context.newPage();
    await second.goto('/');
    await expect(
        second.getByRole('link', { name: /Daily workspace/u }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Manage quick access' }).click();
    await manager.getByLabel('Section name').fill('Review checks');
    await manager.getByRole('button', { name: 'Create section' }).click();
    await expect(
        second.getByRole('link', { name: /Review checks/u }),
    ).toBeVisible();
    await manager.getByRole('button', { name: 'Close' }).click();
    await catalogAlpha
        .getByRole('group', { name: 'Quick-access sections' })
        .getByLabel('Review checks')
        .check();
    const reviewSection = page.locator('.custom-command-group').filter({
        has: page.getByRole('button', { name: /Review checks/u }),
    });
    await expect(
        reviewSection.locator('[data-command-id="alpha"]'),
    ).toHaveCount(1);

    await reviewSection.getByRole('button', { name: 'Start all' }).click();
    await expect(
        reviewSection.locator('[data-command-id="alpha"] .status'),
    ).toHaveText('Running');
    await reviewSection.getByRole('button', { name: 'Stop all' }).click();
    const staleStopDialog = page.getByRole('dialog', {
        name: 'Stop this section?',
    });
    await second.getByRole('link', { name: /Services/u }).click();
    const secondCatalogAlpha = second.locator(
        '#command-section-services [data-command-id="alpha"]',
    );
    await secondCatalogAlpha.locator(':scope > summary').click();
    await secondCatalogAlpha
        .getByRole('group', { name: 'Quick-access sections' })
        .getByLabel('Review checks')
        .uncheck();
    await staleStopDialog.getByRole('button', { name: 'Stop section' }).click();
    await expect(page.getByRole('alert')).toContainText(
        'changed while Stop all was open',
    );
    await expect(catalogAlpha.locator('.status')).toHaveText('Running');
    await catalogAlpha.getByRole('button', { name: 'Stop' }).click();
    await expect(catalogAlpha.locator('.status')).toHaveText('Cancelled');

    await page.reload();
    await expect(page.locator('.custom-command-group').first()).toContainText(
        'Daily workspace',
    );
    await expect(
        page.locator('.custom-command-group').first().locator('.command-grid'),
    ).toBeHidden();
    await reviewSection.getByRole('button', { name: 'Remove' }).click();
    const removeDialog = page.getByRole('dialog', {
        name: 'Remove quick-access section?',
    });
    await removeDialog.getByRole('button', { name: 'Remove section' }).click();
    await expect(
        page.getByRole('link', { name: /Review checks/u }),
    ).toHaveCount(0);
    await expect(
        second.getByRole('link', { name: /Review checks/u }),
    ).toHaveCount(0);
    await expect(
        page.getByRole('link', { name: /Daily workspace/u }),
    ).toBeVisible();

    const storageFailure = await context.newPage();
    await storageFailure.addInitScript(() => {
        const originalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function setItem(key, value) {
            if (key === 'languon.web-dev-panel.custom-sections') {
                throw new DOMException(
                    'Blocked fixture storage',
                    'QuotaExceededError',
                );
            }
            return originalSetItem.call(this, key, value);
        };
    });
    await storageFailure.goto('/');
    await storageFailure
        .getByRole('navigation', { name: 'Command sections' })
        .getByRole('link', { name: /Services/u })
        .click();
    const storageFailureAlpha = storageFailure.locator(
        '#command-section-services [data-command-id="alpha"]',
    );
    await storageFailureAlpha.locator(':scope > summary').click();
    const storedMembership = storageFailureAlpha
        .getByRole('group', { name: 'Quick-access sections' })
        .getByLabel('Daily workspace');
    await expect(storedMembership).toBeChecked();
    await storedMembership.click();
    await expect(storedMembership).toBeChecked();
    await expect(storageFailure.locator('#preference-issues')).toContainText(
        'could not be saved to browser storage',
    );
    await storageFailure
        .getByRole('navigation', { name: 'Command sections' })
        .getByRole('link', { name: /Tasks/u })
        .click();
    await expect(storageFailure.locator('#preference-issues')).toContainText(
        'could not be saved to browser storage',
    );
    await storageFailure.close();
    await context.close();
});
