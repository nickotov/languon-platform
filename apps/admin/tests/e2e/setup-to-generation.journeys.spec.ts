import type { ChildProcess } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';
import {
    calibrateAccounting,
    configureModel,
    grantCredits,
} from './support/setup-admin';
import {
    adminOrigin,
    applyDemoProfile,
    backendOrigin,
    bootstrapOwner,
    createUser,
    databaseUrl,
    inspectReadiness,
    password,
    startWorker,
    stopWorker,
    webOrigin,
} from './support/setup-runtime';

function observeErrors(page: Page) {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        // Existing rc-util development comparator warning when Select closes.
        if (
            message.text() ===
            'Warning: Warning: There may be circular references'
        )
            return;
        if (
            message.type() === 'error' &&
            !message.text().startsWith('Failed to load resource:')
        )
            errors.push(message.text());
    });
    page.on('response', (response) => {
        const path = new URL(response.url()).pathname;
        // Reporting snapshots warm asynchronously; the admin retries this response.
        if (
            response.status() === 503 &&
            path === '/api/admin/ai/accounting/report'
        )
            return;
        // An anonymous initial session probe is expected before login.
        if (
            response.status() >= 400 &&
            !(response.status() === 401 && /\/auth\/refresh$/.test(path))
        )
            errors.push(`${response.status()} ${path}`);
    });
    page.on('requestfailed', (request) => {
        // Navigation can cancel read-only requests; failed writes are never ignored.
        if (
            request.method() === 'GET' &&
            request.failure()?.errorText === 'net::ERR_ABORTED'
        )
            return;
        errors.push(
            `${request.method()} ${new URL(request.url()).pathname}: ${request.failure()?.errorText}`,
        );
    });
    return () => expect(errors, 'unexpected browser errors').toEqual([]);
}

test('empty database admin setup enables paid learner text generation and durable save', async ({
    page,
    request,
    browser,
}) => {
    test.skip(
        process.env.ADMIN_E2E_SETUP_JOURNEY !== 'true',
        'Requires a dedicated fresh setup database.',
    );
    test.setTimeout(180000);
    const sql = postgres(databaseUrl, { max: 1 });
    let worker: ChildProcess | undefined;
    const learnerContext = await browser.newContext();
    try {
        // Fail rather than silently accepting accounting seeded by other suites.
        for (const table of [
            'text_ai_routing_state',
            'text_ai_probes',
            'dictionary_ai_configuration',
            'ai_provider_price_revisions',
            'ai_accounting_settings_revisions',
            'model_price_revisions',
        ]) {
            expect(
                await sql`select * from ${sql(table)}`,
                `${table} must start empty`,
            ).toHaveLength(0);
        }
        const suffix = `${Date.now()}-${process.pid}`;
        const ownerEmail = `critical-owner-${suffix}@example.test`;
        const learnerEmail = `critical-learner-${suffix}@example.test`;
        await createUser(request, ownerEmail);
        await bootstrapOwner(ownerEmail);
        const cleanAdmin = observeErrors(page);
        await page.goto('/login');
        await page.getByLabel('Email').fill(ownerEmail);
        await page.getByLabel('Password').fill(password);
        await page
            .getByRole('button', { name: 'Sign in', exact: true })
            .click();
        await expect(
            page.getByRole('heading', { name: 'Overview' }),
        ).toBeVisible();
        const unconfigured = await inspectReadiness();
        expect(unconfigured.ready).toBe(false);
        expect(unconfigured.checks).toContainEqual(
            expect.objectContaining({
                id: expect.stringMatching(/(^|\/)model$/),
                status: 'blocked',
            }),
        );
        await calibrateAccounting(page);
        worker = await startWorker();
        await configureModel(page);
        const readiness = await inspectReadiness();
        expect(
            readiness.checks,
            'configured text runtime prerequisites',
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: expect.stringMatching(/(^|\/)provider-price$/),
                    status: 'pass',
                }),
            ]),
        );
        expect(readiness.ready, JSON.stringify(readiness.checks)).toBe(true);
        // Preferences initialize after the admin default is published.
        const learnerId = await createUser(request, learnerEmail);
        await grantCredits(page, learnerId);
        cleanAdmin();

        const learner = await learnerContext.newPage();
        const cleanLearner = observeErrors(learner);
        await learner.goto(`${webOrigin}/login?returnTo=%2Ftexts%2Fnew`);
        await learner.getByLabel('Email').fill(learnerEmail);
        await learner.getByLabel('Password', { exact: true }).fill(password);
        await learner
            .getByRole('button', { name: 'Sign in', exact: true })
            .click();
        await expect(learner).toHaveURL(/\/texts\/new$/);
        await learner
            .getByLabel('Title', { exact: true })
            .fill('Critical setup passage');
        await learner
            .getByLabel('Translation language', { exact: true })
            .selectOption('es');
        await learner
            .getByLabel('Source text', { exact: true })
            .fill('Hello world.');
        const detection = learner.waitForResponse(
            (response) =>
                response.request().method() === 'POST' &&
                response.url().endsWith('/texts/ai/detection'),
        );
        const translation = learner.waitForResponse(
            (response) =>
                response.request().method() === 'POST' &&
                response.url().endsWith('/texts/ai/translation'),
        );
        await learner
            .getByRole('button', { name: 'Translate via AI', exact: true })
            .filter({ visible: true })
            .first()
            .click();
        expect((await detection).status()).toBe(202);
        expect((await translation).status()).toBe(202);
        await expect(
            learner.getByText('[es] Hello world.', { exact: true }).first(),
        ).toBeVisible({ timeout: 30000 });
        await learner
            .getByRole('button', { name: 'Save', exact: true })
            .click();
        await expect(learner).toHaveURL(/\/texts\/[0-9a-f-]+$/);
        await learner.reload();
        await expect(
            learner.getByText('[es] Hello world.', { exact: true }).first(),
        ).toBeVisible();
        const actions =
            await sql`select id, state, outcome, measurement, charged_milli from ai_credit_actions where owner_id = ${learnerId} order by id`;
        expect(actions).toHaveLength(2);
        for (const action of actions) {
            expect(action).toMatchObject({
                state: 'settled',
                outcome: 'success',
                measurement: 'measured',
                charged_milli: '1',
            });
            const expenses =
                await sql`select id from ai_provider_expense_records where action_id = ${action.id}`;
            expect(expenses).toHaveLength(1);
        }
        await learner.reload();
        expect(
            await sql`select id, state, outcome, measurement, charged_milli from ai_credit_actions where owner_id = ${learnerId} order by id`,
        ).toEqual(actions);
        cleanLearner();

        // Only after proving UI-only setup: verify the repeatable developer CLI.
        const adminLogin = await request.post(
            `${backendOrigin}/admin/auth/login/password`,
            {
                data: { email: ownerEmail, password },
                headers: { Origin: adminOrigin },
            },
        );
        expect(adminLogin.status()).toBe(200);
        const { accessToken } = await adminLogin.json();
        const profileLearnerId = await createUser(
            request,
            `critical-profile-${suffix}@example.test`,
        );
        await applyDemoProfile(accessToken, profileLearnerId);
        const snapshot = async () => {
            const tables = [
                'text_ai_routing_revisions',
                'text_ai_probes',
                'dictionary_ai_configuration_revisions',
                'ai_provider_price_revisions',
                'ai_accounting_settings_revisions',
                'model_price_revisions',
                'ai_credit_grants',
            ];
            return Promise.all(
                tables.map(
                    (table) => sql`select id from ${sql(table)} order by id`,
                ),
            );
        };
        const configured = await snapshot();
        const grants =
            await sql`select amount from ai_credit_grants where owner_id = ${profileLearnerId}`;
        expect(grants).toHaveLength(1);
        await applyDemoProfile(accessToken, profileLearnerId);
        expect(await snapshot()).toEqual(configured);
        expect(
            await sql`select amount from ai_credit_grants where owner_id = ${profileLearnerId}`,
        ).toEqual(grants);
    } finally {
        try {
            await learnerContext.close();
        } finally {
            try {
                await stopWorker(worker);
            } finally {
                await sql.end();
            }
        }
    }
});
