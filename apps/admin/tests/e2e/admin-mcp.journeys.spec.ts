// @user-flow-revision admin-mcp sha256:ce2252390d6e9f38
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import {
    expect,
    test,
    type APIRequestContext,
    type Page,
} from '@playwright/test';
import postgres from 'postgres';
import {
    adminOrigin,
    backendOrigin,
    createUser,
    databaseUrl,
    password,
    webOrigin,
} from './support/setup-runtime';

const runId = `${Date.now()}-${process.pid}`;
const email = `mcp-owner-${runId}@example.test`;
const mcpOrigin = process.env.ADMIN_E2E_MCP_ORIGIN ?? 'http://localhost:3002';
// Token issuance responses contain secrets; never retain network traces or video.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test.beforeAll(async ({ request }) => {
    await createUser(request, email);
    const sql = postgres(databaseUrl, { max: 1 });
    let actorEmail: string | undefined;
    try {
        const rows =
            await sql`select e.email from admin_memberships m join user_emails e on e.user_id=m.user_id where m.revoked_at is null and e.is_primary=true limit 1`;
        actorEmail = rows[0]?.email as string | undefined;
    } finally {
        await sql.end();
    }
    await promisify(execFile)(
        'pnpm',
        [
            '--filter',
            '@languon/backend',
            'admin:membership',
            'grant',
            '--email',
            email,
            '--reason',
            'Bootstrap disposable MCP journey owner',
            '--confirm',
            'admin-membership-change',
            ...(actorEmail ? ['--actor-email', actorEmail] : []),
        ],
        {
            cwd: resolve(import.meta.dirname, '../../../..'),
            env: {
                ...process.env,
                APP_ENV: 'development',
                DATABASE_URL: databaseUrl,
                REDIS_URL: process.env.ADMIN_E2E_REDIS_URL,
                ADMIN_BASE_URL: adminOrigin,
                AUTH_ALLOWED_ORIGINS: `${adminOrigin},${webOrigin}`,
                AUTH_JWT_SECRET:
                    'admin-e2e-jwt-secret-do-not-use-outside-local-tests',
                AUTH_CODE_HMAC_SECRET:
                    'admin-e2e-code-secret-do-not-use-outside-local-tests',
                DICTIONARY_HMAC_SECRET:
                    'admin-e2e-dictionary-secret-do-not-use-outside-local-tests',
            },
        },
    );
});

async function login(page: Page) {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await page.goto('/admin-mcp');
    await expect(
        page.getByRole('heading', { name: 'Agent access (MCP)' }),
    ).toBeVisible();
}
function browserFailures(page: Page) {
    const failures: string[] = [];
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error') failures.push(message.text());
    });
    page.on('requestfailed', (request) => {
        // React cleanup and document reload cancel read-only fetches deliberately.
        if (
            request.method() === 'GET' &&
            request.failure()?.errorText === 'net::ERR_ABORTED'
        )
            return;
        failures.push(`${request.method()} ${new URL(request.url()).pathname}`);
    });
    page.on('response', (response) => {
        if (response.status() >= 400)
            failures.push(
                `${response.status()} ${new URL(response.url()).pathname}`,
            );
    });
    return () =>
        expect(failures, 'unexpected browser console/network failures').toEqual(
            [],
        );
}
async function issue(
    page: Page,
    name: string,
    grants = false,
    pricing = false,
) {
    await page.getByLabel('Client name', { exact: true }).fill(name);
    await page
        .getByLabel('Reason', { exact: true })
        .fill('Synthetic disposable MCP integration verification');
    if (pricing)
        await page
            .getByRole('checkbox', { name: 'Provider prices', exact: true })
            .check();
    if (grants) {
        await page
            .getByRole('checkbox', {
                name: 'Credit grants (not revenue)',
                exact: true,
            })
            .check();
        await page
            .getByLabel('Maximum credits per grant', { exact: true })
            .fill('2');
        await page
            .getByLabel('Maximum granted credits per UTC day', { exact: true })
            .fill('3');
    }
    const pending = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            response.url().endsWith('/admin/mcp/tokens'),
    );
    await page
        .getByRole('button', { name: 'Create token', exact: true })
        .click();
    const response = await pending;
    expect(response.status()).toBe(201);
    const issued = (await response.json()) as {
        secret: string;
        token: { id: string };
    };
    await expect(
        page.getByText('Save this secret now', { exact: true }),
    ).toBeVisible();
    // Keep the secret solely in process memory; never include it in snapshots, logs or assertions.
    await page
        .getByRole('button', { name: 'I have saved the secret', exact: true })
        .click();
    await expect(
        page.getByText('Save this secret now', { exact: true }),
    ).not.toBeVisible();
    return issued;
}
async function rpc(
    request: APIRequestContext,
    secret: string,
    method: string,
    params: unknown = {},
) {
    return request.post(`${mcpOrigin}/mcp`, {
        headers: {
            Authorization: `Bearer ${secret}`,
            Accept: 'application/json, text/event-stream',
            'MCP-Protocol-Version': '2025-11-25',
        },
        data: { jsonrpc: '2.0', id: randomUUID(), method, params },
    });
}
async function result(response: Awaited<ReturnType<typeof rpc>>) {
    expect(response.status()).toBe(200);
    const body = await response.text();
    const event = body.split('\n').find((line) => line.startsWith('data: '));
    const message = JSON.parse(event ? event.slice(6) : body);
    expect(message.error).toBeUndefined();
    return message.result;
}
async function initialize(request: APIRequestContext, secret: string) {
    return result(
        await rpc(request, secret, 'initialize', {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'languon-disposable-e2e', version: '1.0.0' },
        }),
    );
}

// @user-flow admin-mcp/owner-token-lifecycle-and-client-guides
test('owner creates read-only credential, reads MCP, and revokes at narrow width', async ({
    page,
    request,
}, testInfo) => {
    await login(page);
    // The login page intentionally probes refresh before a session exists (401).
    const assertClean = browserFailures(page);
    await expect(
        page.getByRole('checkbox', {
            name: 'Providers and models (read)',
            exact: true,
        }),
    ).toBeChecked();
    await expect(
        page.getByRole('checkbox', { name: 'Paid model checks', exact: true }),
    ).not.toBeChecked();
    await expect(
        page.getByRole('checkbox', {
            name: 'Credit grants (not revenue)',
            exact: true,
        }),
    ).not.toBeChecked();
    const issued = await issue(page, `Read-only client ${runId}`);
    await initialize(request, issued.secret);
    const tools = await result(await rpc(request, issued.secret, 'tools/list'));
    expect(tools.tools.map((tool: { name: string }) => tool.name)).toContain(
        'admin_connection_test',
    );
    const toolNames = tools.tools.map((tool: { name: string }) => tool.name);
    expect(toolNames).not.toContain('preview_credits_grant');
    expect(toolNames).not.toContain('admin_model_check');
    const connected = await result(
        await rpc(request, issued.secret, 'tools/call', {
            name: 'admin_connection_test',
            arguments: {},
        }),
    );
    expect(connected.isError).not.toBe(true);
    await page.reload();
    await expect(
        page.getByText('Save this secret now', { exact: true }),
    ).not.toBeVisible();
    await expect(
        page.getByRole('heading', { name: 'Agent access (MCP)' }),
    ).toBeVisible();
    await expect(
        page.getByText(`Read-only client ${runId}`, { exact: true }),
    ).toBeVisible();
    await page
        .getByRole('heading', { name: 'Agent access (MCP)' })
        .scrollIntoViewIfNeeded();
    await page.screenshot({
        path: testInfo.outputPath('mcp-desktop.png'),
        fullPage: true,
    });
    await page
        .getByRole('spinbutton', { name: /^MCP listener port/ })
        .fill('3999');
    for (const name of ['Codex', 'Claude Code', 'OpenCode']) {
        await page.getByRole('tab', { name, exact: true }).click();
        await expect(page.getByRole('tabpanel')).toContainText(
            'LANGUON_ADMIN_MCP_TOKEN',
        );
        await expect(page.getByRole('tabpanel')).toContainText(
            'http://127.0.0.1:3999/mcp',
        );
    }
    await page
        .getByRole('spinbutton', { name: /^MCP listener port/ })
        .fill('3002');
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(
        page.getByRole('heading', { name: 'Agent access (MCP)' }),
    ).toBeVisible();
    await page.getByRole('tab', { name: 'Codex', exact: true }).click();
    const layout = await page.locator('body').evaluate((element) => ({
        width: element.scrollWidth,
        overflow: Array.from(element.querySelectorAll('*'))
            .map((node) => ({
                tag: node.tagName,
                className: node.className,
                right: node.getBoundingClientRect().right,
            }))
            .filter((node) => node.right > window.innerWidth + 1)
            .slice(0, 12),
    }));
    expect(layout.width, JSON.stringify(layout.overflow)).toBeLessThanOrEqual(
        375,
    );
    await page.screenshot({
        path: testInfo.outputPath('mcp-narrow.png'),
        fullPage: true,
    });
    await page
        .getByRole('button', { name: 'Revoke token', exact: true })
        .click();
    const dialog = page.getByRole('dialog', {
        name: 'Revoke this client’s access?',
    });
    await dialog
        .getByLabel('Reason', { exact: true })
        .fill('End synthetic MCP client access');
    await dialog
        .getByRole('button', { name: 'Revoke token', exact: true })
        .click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('Revoked', { exact: true })).toBeVisible();
    expect((await rpc(request, issued.secret, 'tools/list')).status()).toBe(
        401,
    );
    await page.reload();
    await expect(page.getByText('Revoked', { exact: true })).toBeVisible();
    await expect(
        page.getByText('Agent activity', { exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole('cell', { name: 'token.revoked', exact: true }),
    ).toBeVisible();
    assertClean();
});

async function callTool(
    request: APIRequestContext,
    secret: string,
    name: string,
    args: Record<string, unknown>,
) {
    const reply = await result(
        await rpc(request, secret, 'tools/call', { name, arguments: args }),
    );
    expect(reply.isError, `tool ${name} rejected`).not.toBe(true);
    return JSON.parse(reply.content[0].text);
}

// @user-flow admin-mcp/bounded-credit-preview-and-idempotent-apply
test('bounded credit grant previews current state and replay never doubles the grant', async ({
    page,
    request,
}) => {
    await login(page);
    // The login page intentionally probes refresh before a session exists (401).
    const assertClean = browserFailures(page);
    const issued = await issue(page, `Bounded grant client ${runId}`, true);
    await initialize(request, issued.secret);
    const lookup = await callTool(request, issued.secret, 'users_lookup', {
        email,
    });
    const userId = lookup.user.id;
    const before = await callTool(request, issued.secret, 'users_credits', {
        userId,
    });
    const preview = await callTool(
        request,
        issued.secret,
        'preview_credits_grant',
        {
            targetUserId: userId,
            expectedVersion: before.account.managementVersion,
            amountCredits: '1',
            reason: 'Synthetic bounded grant demonstrates safe replay',
        },
    );
    expect(preview.target).toBe(userId);
    expect(preview.current.managementVersion).toBe(
        before.account.managementVersion,
    );
    expect(preview.proposed.amountCredits).toBe('1');
    const unchanged = await callTool(request, issued.secret, 'users_credits', {
        userId,
    });
    expect(unchanged.account).toEqual(before.account);
    const input = { previewId: preview.id, operationKey: randomUUID() };
    const applied = await callTool(
        request,
        issued.secret,
        'admin_apply',
        input,
    );
    const replay = await callTool(request, issued.secret, 'admin_apply', input);
    expect(replay).toEqual(applied);
    const after = await callTool(request, issued.secret, 'users_credits', {
        userId,
    });
    expect(after.account.managementVersion).toBe(
        before.account.managementVersion + 1,
    );
    expect(
        after.history.filter(
            (entry: { kind: string }) => entry.kind === 'grant',
        ),
    ).toHaveLength(1);
    assertClean();
});

/** Warm exactly the Accounting page's current UTC range before visiting Accounting. */
async function prepareAccountingReport(request: APIRequestContext) {
    const login = await request.post(
        `${backendOrigin}/admin/auth/login/password`,
        {
            data: { email, password },
            headers: { Origin: adminOrigin },
        },
    );
    expect(login.status()).toBe(200);
    const { accessToken } = (await login.json()) as { accessToken: string };
    const now = new Date();
    const query = new URLSearchParams({
        from: new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
        ).toISOString(),
        to: new Date(
            Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate() + 1,
            ),
        ).toISOString(),
    });
    // The report worker runs every 15s. Only the documented pending response may retry.
    await expect
        .poll(
            async () => {
                const response = await request.get(
                    `${backendOrigin}/admin/ai/accounting/report?${query}`,
                    {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            Origin: adminOrigin,
                        },
                        timeout: 5_000,
                    },
                );
                if (response.status() === 200) return 200;
                expect(response.status()).toBe(503);
                expect(response.headers()['retry-after']).toBe('2');
                expect((await response.json()).error.code).toBe(
                    'service_unavailable',
                );
                return response.status();
            },
            {
                timeout: 40_000,
                intervals: [2_000],
                message:
                    'Accounting report must be materialized before the browser visits Accounting',
            },
        )
        .toBe(200);
}

// @user-flow admin-mcp/native-provider-pricing-display
test('native provider prices published through MCP show exact read-only billing rules at desktop and narrow width', async ({
    page,
    request,
}, testInfo) => {
    test.setTimeout(70_000);
    await login(page);
    const assertClean = browserFailures(page);
    const issued = await issue(
        page,
        `Native pricing client ${runId}`,
        false,
        true,
    );
    await initialize(request, issued.secret);
    const modelId = `native-model-${runId}`;
    const preview = await callTool(
        request,
        issued.secret,
        'preview_provider_prices_native_write',
        {
            providerId: 'native-ui-fixture',
            modelId,
            meter: 'speech-tokens',
            inputUsdPerMillionTokens: null,
            outputUsdPerMillionTokens: null,
            cacheReadUsdPerMillionTokens: null,
            cacheWriteUsdPerMillionTokens: null,
            usdPer1000Characters: null,
            minimumUsdPerRequest: null,
            nativeRules: {
                version: 1,
                validFrom: '2026-10-01T00:00:00Z',
                validUntil: '2026-12-31T00:00:00Z',
                currency: {
                    code: 'UC',
                    usdNumerator: '1',
                    unitDenominator: '680000',
                },
                variants: [
                    {
                        id: 'standard-base',
                        applies: {
                            endpointIds: ['synthetic-endpoint'],
                            serviceTiers: ['standard'],
                            inputTokens: {
                                minInclusive: 0,
                                maxExclusive: 272001,
                            },
                            dispatchWindows: [
                                {
                                    from: '2026-10-01T00:00:00Z',
                                    until: '2026-12-31T00:00:00Z',
                                },
                            ],
                        },
                        components: [
                            {
                                meter: 'inputTokens',
                                pricePerUnit: '62.123456789012345678901234',
                                unitQuantity: 1000,
                                minimum: '100',
                                chargeWhen: 'request',
                                rounding: { quantum: '1', mode: 'ceil' },
                            },
                            {
                                meter: 'audioOutputTokens',
                                pricePerUnit: '306',
                                unitQuantity: 1000,
                                minimum: '100',
                                chargeWhen: 'request',
                                rounding: { quantum: '1', mode: 'ceil' },
                            },
                        ],
                        minimumPerRequest: '200',
                        totalRounding: { quantum: '1', mode: 'ceil' },
                    },
                ],
            },
            effectiveAt: new Date().toISOString(),
            expectedVersion: 0,
            sourceUrl: 'https://example.test/pricing',
            sourceReference: 'synthetic-native-price-ui',
            reason: 'Verify synthetic native price presentation',
        },
    );
    await callTool(request, issued.secret, 'admin_apply', {
        previewId: preview.id,
        operationKey: randomUUID(),
    });
    await prepareAccountingReport(request);
    await page.goto('/accounting');
    const row = page.getByRole('row').filter({ hasText: modelId });
    await expect(
        row.getByText('Native billing rules', { exact: true }),
    ).toBeVisible();
    await expect(
        row.getByRole('button', { name: 'Edit', exact: true }),
    ).toHaveCount(0);
    await row
        .getByRole('button', { name: 'View billing rules', exact: true })
        .click();
    const dialog = page.getByRole('dialog', {
        name: 'Native billing rules',
        exact: true,
    });
    await expect(
        dialog.getByText('1 USD per 680000 UC', { exact: true }),
    ).toBeVisible();
    await expect(
        dialog.getByText(
            '62.123456789012345678901234 UC per 1000 input tokens',
            { exact: true },
        ),
    ).toBeVisible();
    await expect(
        dialog.getByText('306 UC per 1000 audio output tokens', {
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        dialog.getByText('At least 0, below 272001', { exact: true }),
    ).toBeVisible();
    await expect(
        dialog.getByText('synthetic-endpoint', { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByText('standard', { exact: true })).toBeVisible();
    await expect(
        dialog.getByText(
            '2026-10-01T00:00:00Z (inclusive) → 2026-12-31T00:00:00Z (exclusive)',
            { exact: true },
        ),
    ).toBeVisible();
    await expect(
        dialog.getByText('Component minimum: 100 UC', { exact: true }),
    ).toHaveCount(2);
    await expect(
        dialog.getByText('Round up to 1 UC', { exact: true }),
    ).toHaveCount(2);
    await expect(dialog.getByRole('textbox')).toHaveCount(0);
    await page.screenshot({
        path: testInfo.outputPath('native-pricing-desktop.png'),
        animations: 'disabled',
        fullPage: true,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    const layout = await dialog.evaluate((element) => ({
        width: element.getBoundingClientRect().width,
        contentWidth: element.scrollWidth,
    }));
    expect(layout.width).toBeLessThanOrEqual(375);
    expect(layout.contentWidth).toBeLessThanOrEqual(375);
    await page.screenshot({
        path: testInfo.outputPath('native-pricing-narrow.png'),
        animations: 'disabled',
        fullPage: true,
    });
    await dialog
        .getByRole('button', { name: 'Close billing rules', exact: true })
        .click();
    await expect(dialog).not.toBeVisible();
    assertClean();
});
