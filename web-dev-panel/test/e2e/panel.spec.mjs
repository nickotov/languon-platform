import { expect, test } from '@playwright/test';

// @user-flow-revision web-dev-panel sha256:69621e426da34ad2
// @user-flow web-dev-panel/parallel-command-control-and-isolated-logs
test('parallel-command-control-and-isolated-logs', async ({ page }) => {
    await page.goto('/?launch=web-dev-panel-fixture-launch');
    const alpha = page.locator('[data-command-id="alpha"]');
    const beta = page.locator('[data-command-id="beta"]');
    await alpha.getByLabel('Select').check();
    await beta.getByLabel('Select').check();
    await page.getByRole('button', { name: 'Run selected' }).click();

    await expect(alpha.locator('.status')).toHaveText('running', {
        ignoreCase: true,
    });
    await expect(beta.locator('.status')).toHaveText('running', {
        ignoreCase: true,
    });
    await expect(alpha.locator('.terminal')).toContainText('alpha: started');
    await expect(beta.locator('.terminal')).toContainText('beta: started');
    await alpha.getByRole('button', { name: 'Stop' }).click();
    await expect(alpha.locator('.status')).toHaveText('cancelled', {
        ignoreCase: true,
    });
    await expect(beta.locator('.status')).toHaveText('running', {
        ignoreCase: true,
    });
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

    const firstBeta = first.locator('[data-command-id="beta"]');
    const secondBeta = second.locator('[data-command-id="beta"]');
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
