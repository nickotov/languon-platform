// @user-flow-revision admin-text-ai-routing sha256:63e835b7246654c4
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import {
    calibrateAccounting,
    configureModel,
    selectAdminOption,
} from './support/setup-admin';
import {
    bootstrapOwner,
    createUser,
    databaseUrl,
    password,
    backendOrigin,
    adminOrigin,
} from './support/setup-runtime';

let preparedOwnerEmail: string | null = null;

// @user-flow admin-text-ai-routing/admin-checks-and-disables-reviewed-route
test('admin inspects route evidence and explicitly approves synthetic check costs', async ({
    page,
    request,
}, testInfo) => {
    test.setTimeout(120_000);
    expect(
        process.env.ADMIN_E2E_SYNTHETIC_PROBES,
        'requires guarded deterministic probe composition',
    ).toBe('true');
    const email = `routing-owner-${Date.now()}-${process.pid}@example.test`;
    const ownerId = await createUser(request, email);
    await bootstrapOwner(email);
    preparedOwnerEmail = email;
    const errors: string[] = [];
    let probePosts = 0;
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        if (
            message.type() === 'error' &&
            !message.text().startsWith('Failed to load resource:')
        )
            errors.push(message.text());
    });
    page.on('response', (response) => {
        const path = new URL(response.url()).pathname;
        if (
            response.status() >= 400 &&
            !(response.status() === 401 && path.endsWith('/auth/refresh')) &&
            !(
                response.status() === 503 &&
                path === '/api/admin/ai/accounting/report'
            )
        )
            errors.push(`${response.status()} ${path}`);
    });
    page.on('requestfailed', (request) => {
        if (
            request.method() === 'GET' &&
            request.failure()?.errorText === 'net::ERR_ABORTED'
        )
            return;
        errors.push(`${request.method()} ${new URL(request.url()).pathname}`);
    });
    page.on('request', (request) => {
        if (
            request.method() === 'POST' &&
            request.url().endsWith('/admin/ai-settings/probes')
        )
            probePosts++;
    });

    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await calibrateAccounting(page);
    await page.getByRole('menuitem', { name: 'AI settings' }).click();
    const routing = page.getByRole('region', { name: 'Text AI routes' });
    await expect(
        routing.getByText('Synthetic provider checks', { exact: true }),
    ).toBeVisible();
    await expect(
        routing.getByText(/Maximum USD 0\.010* per check/),
    ).toBeVisible();
    await expect(
        routing.getByText('Check current readiness after AI changes', {
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        routing.getByText('pnpm dev:doctor', { exact: true }),
    ).toBeVisible();
    await routing
        .getByRole('button', { name: 'Refresh check history', exact: true })
        .click();
    await expect(
        routing.getByRole('button', {
            name: 'Refresh check history',
            exact: true,
        }),
    ).toBeEnabled();
    expect(probePosts).toBe(0);
    await expect(
        routing.getByRole('columnheader', { name: 'Processing eligibility' }),
    ).toBeVisible();
    await expect(
        routing.getByRole('columnheader', {
            name: 'Observed worker readiness',
        }),
    ).toBeVisible();
    const run = routing.getByRole('button', { name: 'Run check', exact: true });
    await expect(run).toBeDisabled();
    const checks = page.locator('.ant-card').filter({
        has: page.getByText('Synthetic provider checks', { exact: true }),
    });
    await selectAdminOption(
        page,
        checks.getByLabel('Provider / model route', { exact: true }),
        /deepseek.*DeepSeek Flash/,
    );
    const approve = checks.getByRole('checkbox', {
        name: 'I approve this operator expense up to the displayed maximum.',
    });
    await approve.check();
    await expect(run).toBeEnabled();
    expect(probePosts).toBe(0);
    const quickResponse = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            response.url().endsWith('/admin/ai-settings/probes'),
    );
    await run.click();
    const quick = await quickResponse;
    expect(quick.status()).toBe(200);
    expect((await quick.json()).state).toBe('passed');
    await expect(run).toBeDisabled();
    await selectAdminOption(
        page,
        checks.getByLabel('Check type', { exact: true }),
        'Test selected flow',
    );
    await selectAdminOption(
        page,
        checks.getByLabel('AI flow', { exact: true }),
        'sentence-check',
    );
    await expect(
        checks.getByText(/No recorded check for this selection/),
    ).toBeVisible();
    await expect(
        checks.getByText('Within evidence window', { exact: true }),
    ).toHaveCount(0);
    await expect(run).toBeDisabled();
    expect(probePosts).toBe(1);
    await approve.check();
    const flowResponse = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            response.url().endsWith('/admin/ai-settings/probes'),
    );
    await run.click();
    const flow = await flowResponse;
    expect(flow.status()).toBe(200);
    expect((await flow.json()).state).toBe('passed');
    await expect(
        checks.getByText('Within evidence window', { exact: true }),
    ).toBeVisible();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
    ).toBe(true);
    await page.screenshot({
        path: testInfo.outputPath('routing-desktop.png'),
        fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
        routing.getByText('Check current readiness after AI changes', {
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        routing.getByRole('button', {
            name: 'Refresh check history',
            exact: true,
        }),
    ).toBeVisible();
    await expect(run).toBeVisible();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
    ).toBe(true);
    await expect(
        routing.getByLabel('Reason for change', { exact: true }),
    ).toBeAttached();
    await page.screenshot({
        path: testInfo.outputPath('routing-narrow.png'),
        fullPage: true,
    });
    expect(probePosts).toBe(2);
    await page.setViewportSize({ width: 1280, height: 900 });
    // Exercise the real form with no learner tariffs for operator-funded flows.
    // The backend still validates funding, checks, prices and every publication.
    const login = await request.post(
        `${backendOrigin}/admin/auth/login/password`,
        { data: { email, password }, headers: { Origin: adminOrigin } },
    );
    expect(login.status()).toBe(200);
    const { accessToken } = await login.json();
    const headers = {
        Authorization: `Bearer ${accessToken}`,
        Origin: adminOrigin,
    };
    const policyResponse = await request.get(
        `${backendOrigin}/admin/ai/capability-policies`,
        { headers },
    );
    expect(policyResponse.status()).toBe(200);
    const { policies } = await policyResponse.json();
    for (const policy of policies) {
        if (policy.funding === 'operator') continue;
        const changed = await request.post(
            `${backendOrigin}/admin/ai/capability-policies`,
            {
                headers,
                data: {
                    capability: policy.capability,
                    expectedVersion: policy.version,
                    funding: 'operator',
                    reason: 'Verify Free routing without invented customer tariffs',
                },
            },
        );
        expect(changed.status()).toBe(200);
    }
    await configureModel(page, { includeTariffs: false });
    const freeRouting = await request.get(`${backendOrigin}/admin/ai/routing`, {
        headers,
    });
    expect(freeRouting.status()).toBe(200);
    expect(
        (await freeRouting.json()).revision.configuration.flowTariffs,
    ).toEqual({});
    const activeRow = routing
        .getByRole('row')
        .filter({ hasText: 'deepseek · DeepSeek Flash' });
    await activeRow
        .getByRole('button', { name: 'Emergency disable', exact: true })
        .click();
    const disable = page.getByRole('dialog', { name: 'Disable this route?' });
    await disable
        .getByLabel('Reason for change', { exact: true })
        .fill('Synthetic emergency disable regression');
    const disabled = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            response.url().endsWith('/admin/ai/routing/disable'),
    );
    await disable
        .getByRole('button', { name: 'Disable route', exact: true })
        .click();
    expect((await disabled).status()).toBe(200);
    await expect(disable).not.toBeVisible();
    await expect(
        activeRow.getByRole('button', {
            name: 'Emergency disable',
            exact: true,
        }),
    ).toBeDisabled();
    // Restore this owned fixture through the audited form; checks remain fresh.
    await configureModel(page, {
        checkFlows: false,
        reason: 'Restore deterministic route after emergency disable regression',
    });
    await expect(
        activeRow.getByRole('button', {
            name: 'Emergency disable',
            exact: true,
        }),
    ).toBeEnabled();
    await promisify(execFile)(
        'pnpm',
        [
            '--filter',
            '@languon/backend',
            'exec',
            'tsx',
            'tests/support/admin-probe-recovery-fixture.ts',
            ownerId,
        ],
        {
            cwd: resolve(import.meta.dirname, '../../../..'),
            env: {
                ...process.env,
                APP_ENV: 'test',
                ADMIN_E2E_SYNTHETIC_PROBES: 'true',
                ADMIN_E2E_DATABASE_URL: databaseUrl,
            },
        },
    );
    await page.reload();
    await selectAdminOption(
        page,
        checks.getByLabel('Provider / model route', { exact: true }),
        /deepseek.*DeepSeek Flash/,
    );
    // Recovery belongs to the exact flow reserved by the fixture. The quick
    // selection must not display or recover a different flow's request.
    await expect(
        checks.getByRole('button', {
            name: 'Confirm provider recovery',
            exact: true,
        }),
    ).toHaveCount(0);
    await selectAdminOption(
        page,
        checks.getByLabel('Check type', { exact: true }),
        'Test selected flow',
    );
    await selectAdminOption(
        page,
        checks.getByLabel('AI flow', { exact: true }),
        'sentence-check',
    );
    const recovery = checks.getByRole('button', {
        name: 'Confirm provider recovery',
        exact: true,
    });
    await expect(recovery).toBeDisabled();
    await expect(
        checks.getByText(
            /original maximum USD 0.010* remains counted as unknown/i,
        ),
    ).toBeVisible();
    await checks
        .getByLabel('Reason for recovery', { exact: true })
        .fill('Confirmed the synthetic upstream request has stopped');
    await checks
        .getByRole('checkbox', {
            name: 'I checked the provider and confirm this upstream request has stopped.',
        })
        .check();
    const recoveredResponse = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            /\/admin\/ai-settings\/probes\/[^/]+\/recover$/.test(
                response.url(),
            ),
    );
    await recovery.click();
    const recovered = await recoveredResponse;
    expect(recovered.status()).toBe(200);
    expect((await recovered.json()).recoveredAt).toBeTruthy();
    await expect(
        checks.getByText('Operator recovery confirmed', { exact: true }),
    ).toBeVisible();
    await expect(recovery).not.toBeVisible();
    expect(errors).toEqual([]);
});

// @user-flow admin-text-ai-routing/owner-reviews-disabled-transcription-configuration
test('owner reviews disabled audio transcription configuration without provider execution', async ({
    page,
    request,
}, testInfo) => {
    const email =
        preparedOwnerEmail ??
        `transcription-owner-${Date.now()}-${process.pid}@example.test`;
    if (!preparedOwnerEmail) {
        await createUser(request, email);
        await bootstrapOwner(email);
        preparedOwnerEmail = email;
    }
    const failures: string[] = [];
    let providerRequests = 0;
    let pricePublications = 0;
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('response', (response) => {
        if (
            response.url().includes('/admin/ai/transcription') &&
            response.status() >= 400
        )
            failures.push(
                `${response.status()} ${new URL(response.url()).pathname}`,
            );
    });
    page.on('request', (request) => {
        if (
            request.method() === 'POST' &&
            request.url().endsWith('/admin/ai/accounting/provider-prices')
        )
            pricePublications++;
        if (
            request.method() === 'POST' &&
            (/\/knowledge\/[^/]+\/transcriptions/.test(request.url()) ||
                request.url().endsWith('/admin/ai-settings/probes'))
        )
            providerRequests++;
    });
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const loaded = page.waitForResponse(
        (response) =>
            response.request().method() === 'GET' &&
            response.url().endsWith('/admin/ai/transcription'),
    );
    await page.getByRole('menuitem', { name: 'AI settings' }).click();
    const initial = await loaded;
    expect(initial.status()).toBe(200);
    const before = await initial.json();
    const panel = page.getByRole('region', {
        name: 'Audio transcription',
        exact: true,
    });
    await expect(
        panel.getByRole('checkbox', {
            name: 'I verified data sharing for training is disabled for the configured OpenAI organization/project',
            exact: true,
        }),
    ).not.toBeChecked();
    await expect(
        panel.getByLabel('Organization/project data-sharing review evidence', {
            exact: true,
        }),
    ).toHaveValue('');
    await expect(
        panel.getByRole('switch', {
            name: 'Enable transcription for new requests',
        }),
    ).not.toBeChecked();
    await expect(
        panel.getByLabel('Customer credits per minute of source audio', {
            exact: true,
        }),
    ).toHaveValue('');
    await expect(
        panel.getByText(/Provider credentials are not configured/, {
            exact: true,
        }),
    ).toBeVisible();
    await panel
        .getByLabel('Maximum provider expense per action (USD micros)', {
            exact: true,
        })
        .fill('10000');
    await panel
        .getByLabel('Reason for this configuration change', { exact: true })
        .fill('Prepare disabled synthetic transcription configuration');
    const reviewed = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            response.url().endsWith('/admin/ai/transcription/preview'),
    );
    await panel
        .getByRole('button', { name: 'Review configuration', exact: true })
        .click();
    expect((await reviewed).status()).toBe(200);
    await expect(
        panel.getByRole('button', {
            name: 'Publish reviewed configuration',
            exact: true,
        }),
    ).toBeEnabled();
    expect(providerRequests).toBe(0);
    const published = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            response.url().endsWith('/admin/ai/transcription/apply'),
    );
    await panel
        .getByRole('button', {
            name: 'Publish reviewed configuration',
            exact: true,
        })
        .click();
    const applied = await published;
    expect(applied.status()).toBe(200);
    const state = await applied.json();
    expect(state.version).toBe(before.version + 1);
    expect(state.current).toMatchObject({
        enabled: false,
        creditsPerMinute: null,
        providerPriceRevisionId: null,
        billingRulesVerified: false,
    });
    await expect(
        panel.getByText('The immutable configuration revision was published.', {
            exact: true,
        }),
    ).toBeVisible();
    await page.reload();
    await expect(
        panel.getByLabel('Customer credits per minute of source audio', {
            exact: true,
        }),
    ).toHaveValue('');
    await expect(
        panel.getByRole('switch', {
            name: 'Enable transcription for new requests',
        }),
    ).not.toBeChecked();
    await panel.screenshot({
        path: testInfo.outputPath('transcription-admin-desktop.png'),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
        panel.getByRole('button', {
            name: 'Review configuration',
            exact: true,
        }),
    ).toBeVisible();
    await panel.screenshot({
        path: testInfo.outputPath('transcription-admin-narrow.png'),
    });
    await expect
        .poll(() =>
            panel.evaluate(
                (element) => element.scrollWidth <= element.clientWidth + 1,
            ),
        )
        .toBe(true);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('menuitem', { name: /AI accounting$/ }).click();
    await page
        .getByRole('button', { name: 'Add provider cost rate', exact: true })
        .click();
    const priceDialog = page.getByRole('dialog', {
        name: 'Publish provider cost revision',
        exact: true,
    });
    const meter = priceDialog.getByRole('combobox', { name: /Meter$/ });
    // Ant Design exposes only the active virtual option to accessibility APIs.
    // Select the third, non-searchable option with the real keyboard controls.
    await meter.press('ArrowDown');
    await meter.press('ArrowDown');
    await meter.press('ArrowDown');
    await meter.press('Enter');
    const nativeRules = priceDialog.getByRole('textbox', {
        name: /Reviewed native pricing rules \(JSON\)$/,
    });
    await expect(nativeRules).toHaveValue('');
    await expect(
        priceDialog.getByRole('textbox', {
            name: /USD per million input tokens$/,
        }),
    ).toHaveCount(0);
    await priceDialog
        .getByRole('button', {
            name: 'Publish provider cost revision',
            exact: true,
        })
        .click();
    await expect(nativeRules).toHaveAttribute('aria-invalid', 'true');
    expect(pricePublications).toBe(0);
    await priceDialog
        .getByRole('button', { name: 'Close', exact: true })
        .click();
    expect(providerRequests).toBe(0);
    expect(failures).toEqual([]);
});
