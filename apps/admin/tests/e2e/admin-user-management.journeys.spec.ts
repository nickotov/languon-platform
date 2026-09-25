import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import {
    expect,
    test,
    type APIRequestContext,
    type CDPSession,
    type Page,
} from '@playwright/test';
import postgres from 'postgres';

// @user-flow-revision admin-user-management sha256:43c037477d75d58d
// @user-flow-revision ai-provider-management sha256:dc741eefb55aaec6
// @user-flow-revision ai-credit-wallet sha256:9cf122911016613c

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../..',
);
const backendOrigin =
    process.env.ADMIN_E2E_BACKEND_ORIGIN ?? 'http://localhost:4000';
const adminOrigin =
    process.env.ADMIN_E2E_ADMIN_ORIGIN ?? 'http://localhost:3001';
const webOrigin = process.env.ADMIN_E2E_WEB_ORIGIN ?? 'http://localhost:3333';
const databaseUrl = process.env.ADMIN_E2E_DATABASE_URL ?? '';
const redisUrl = process.env.ADMIN_E2E_REDIS_URL ?? '';
const ownerPassword = 'E2e!Admin-owner-password-2026';
const runId = `${Date.now().toString(36)}-${process.pid}`;
const ownerEmail = `admin-owner-${runId}@example.test`;
const targetEmail = `admin-target-${runId}@example.test`;
let ownerId = '';
let targetId = '';

function membershipEnvironment() {
    return {
        ...process.env,
        ADMIN_BASE_URL: adminOrigin,
        APP_ENV: 'development',
        AUTH_ALLOWED_ORIGINS: `${adminOrigin},${webOrigin}`,
        AUTH_CODE_HMAC_SECRET:
            'admin-e2e-code-secret-do-not-use-outside-local-tests',
        AUTH_JWT_SECRET: 'admin-e2e-jwt-secret-do-not-use-outside-local-tests',
        DICTIONARY_HMAC_SECRET:
            'admin-e2e-dictionary-secret-do-not-use-outside-local-tests',
        AUTH_WEBAUTHN_RP_ID: new URL(adminOrigin).hostname,
        DATABASE_URL: databaseUrl,
        REDIS_URL: redisUrl,
    };
}

function captureBrowserErrors(
    page: Page,
    expected: Readonly<Record<string, number>> = {},
) {
    const errors: string[] = [];
    page.on('console', (message) => {
        // Ant Design's development-only context comparator can encounter React
        // internals while a controlled Select closes. It emits this rc-util
        // warning without an application exception or state loss.
        if (
            message.text() ===
            'Warning: Warning: There may be circular references'
        ) {
            return;
        }
        if (
            message.type() === 'error' &&
            !message.text().startsWith('Failed to load resource:')
        ) {
            errors.push(message.text());
        }
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
        if (response.status() < 400) return;
        const route = new URL(response.url()).pathname;
        if (expected[route] !== response.status()) {
            errors.push(`${response.status()} ${route}`);
        }
    });
    return () => expect(errors, 'unexpected browser errors').toEqual([]);
}

async function provisionVerifiedUser(
    request: APIRequestContext,
    email: string,
    password: string,
) {
    const existingLogin = await request.post(
        `${backendOrigin}/auth/login/password`,
        {
            data: { email, password },
            headers: { Origin: adminOrigin },
        },
    );
    if (existingLogin.ok()) {
        const existing = (await existingLogin.json()) as {
            status?: string;
            user?: { id: string };
        };
        if (existing.status === 'authenticated' && existing.user) {
            return existing.user.id;
        }
    }
    const signup = await request.post(`${backendOrigin}/auth/sign-up`, {
        data: { email, password },
        headers: { Origin: adminOrigin },
    });
    expect(signup.status()).toBe(202);
    const pending = (await signup.json()) as {
        verification: { flowId: string };
    };
    const verification = await request.post(
        `${backendOrigin}/auth/email-verification/verify`,
        {
            data: { code: '0000', flowId: pending.verification.flowId },
            headers: { Origin: adminOrigin },
        },
    );
    expect(verification.status()).toBe(200);
    return ((await verification.json()) as { user: { id: string } }).user.id;
}

async function runMembershipGrant(email: string, actorEmail?: string) {
    try {
        const args = [
            '--filter',
            '@languon/backend',
            'admin:membership',
            'grant',
            '--email',
            email,
            '--reason',
            'Bootstrap the disposable E2E administration owner',
            '--confirm',
            'admin-membership-change',
        ];
        if (actorEmail) args.push('--actor-email', actorEmail);
        await execFileAsync('pnpm', args, {
            cwd: repositoryRoot,
            env: membershipEnvironment(),
        });
    } catch (error) {
        const output =
            error && typeof error === 'object'
                ? `${'stdout' in error ? String(error.stdout) : ''}${'stderr' in error ? String(error.stderr) : ''}`
                : String(error);
        if (!/already has an active owner membership/i.test(output)) {
            throw error;
        }
    }
}

async function listOwnerEmails() {
    const { stdout } = await execFileAsync(
        'pnpm',
        ['--filter', '@languon/backend', 'admin:membership', 'list'],
        { cwd: repositoryRoot, env: membershipEnvironment() },
    );
    const jsonStart = stdout.indexOf('{');
    if (jsonStart < 0) throw new Error('Membership list returned no JSON.');
    const output = JSON.parse(stdout.slice(jsonStart)) as {
        result: Array<{ email: string }>;
    };
    return output.result.map(({ email }) => email);
}

async function grantOwner() {
    const owners = await listOwnerEmails();
    await runMembershipGrant(ownerEmail, owners[0]);
}

async function startDictionaryWorker() {
    const output: string[] = [];
    const database = postgres(databaseUrl, { max: 1 });
    await database`delete from dictionary_ai_worker_observations`;
    const worker = spawn(
        'pnpm',
        [
            '--filter',
            '@languon/backend',
            'exec',
            'tsx',
            'src/infrastructure/worker/dictionary-worker-command.ts',
            'run',
        ],
        {
            cwd: repositoryRoot,
            env: {
                ...membershipEnvironment(),
                APP_ENV: 'test',
                DEEPSEEK_API_KEY: 'admin-e2e-deepseek-worker-key',
                DICTIONARY_AI_PROVIDER_FIXTURE_MODE: 'deterministic',
                DICTIONARY_GENERATION_PROVIDER_MODE: 'mastra',
                DICTIONARY_JOB_API_ENQUEUED_FORMATS: 'single-card:v1',
                DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS: 'single-card:v1',
                DICTIONARY_WORKER_CONCURRENCY: '1',
                DICTIONARY_WORKER_DATABASE_URL: databaseUrl,
                DICTIONARY_WORKER_POLL_INTERVAL_MS: '50',
                DICTIONARY_WORKER_READINESS_TIMEOUT_MS: '1000',
                KIE_API_KEY: 'admin-e2e-kie-worker-key',
                RELEASE_SHA: 'development',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        },
    );
    worker.stdout?.on('data', (chunk) => output.push(String(chunk)));
    worker.stderr?.on('data', (chunk) => output.push(String(chunk)));

    try {
        for (let attempt = 0; attempt < 100; attempt += 1) {
            if (worker.exitCode !== null) {
                throw new Error(
                    `Dictionary worker exited before readiness: ${output.join('').slice(-2_000)}`,
                );
            }
            const [observation] = await database<[{ count: number }]>`
                select count(*)::int as count
                from dictionary_ai_worker_observations
            `;
            if ((observation?.count ?? 0) >= 2) return worker;
            await delay(100);
        }
        throw new Error('Dictionary worker did not publish readiness in time.');
    } finally {
        await database.end({ timeout: 1 });
    }
}

async function stopDictionaryWorker(worker: ChildProcess | undefined) {
    if (!worker || worker.exitCode !== null) return;
    worker.kill('SIGTERM');
    await Promise.race([
        new Promise<void>((resolveExit) =>
            worker.once('exit', () => resolveExit()),
        ),
        delay(5_000).then(() => {
            if (worker.exitCode === null) worker.kill('SIGKILL');
        }),
    ]);
}

async function waitForGenerationReview(
    request: APIRequestContext,
    accessToken: string,
    jobId: string,
) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
        const response = await request.get(
            `${backendOrigin}/dictionary-generation-jobs/${jobId}`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Origin: webOrigin,
                },
            },
        );
        expect(response.status()).toBe(200);
        const payload = (await response.json()) as {
            job: {
                failure: unknown;
                proposal: {
                    candidate: Record<string, unknown>;
                } | null;
                state: string;
            };
        };
        if (payload.job.state === 'review' && payload.job.proposal) {
            return payload.job;
        }
        if (['cancelled', 'expired', 'failed'].includes(payload.job.state)) {
            throw new Error(
                `Generation ${jobId} reached ${payload.job.state}: ${JSON.stringify(payload.job.failure)}`,
            );
        }
        await delay(100);
    }
    throw new Error(`Generation ${jobId} did not reach review.`);
}

async function passwordLogin(
    page: Page,
    email = ownerEmail,
    expectAuthorized = true,
) {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(ownerPassword);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    if (expectAuthorized) {
        await expect(
            page.getByRole('heading', { name: 'Overview' }),
        ).toBeVisible();
    }
}

async function addVirtualAuthenticator(page: Page): Promise<CDPSession> {
    const client = await page.context().newCDPSession(page);
    await client.send('WebAuthn.enable');
    await client.send('WebAuthn.addVirtualAuthenticator', {
        options: {
            automaticPresenceSimulation: true,
            hasResidentKey: true,
            hasUserVerification: true,
            isUserVerified: true,
            protocol: 'ctap2',
            transport: 'internal',
        },
    });
    return client;
}

test.describe.serial('admin user management journeys', () => {
    test.beforeAll(async ({ request }) => {
        ownerId = await provisionVerifiedUser(
            request,
            ownerEmail,
            ownerPassword,
        );
        await grantOwner();
        targetId = await provisionVerifiedUser(
            request,
            targetEmail,
            ownerPassword,
        );
    });

    // @user-flow admin-user-management/admin-owner-password-login-and-user-inspection
    test('owner signs in, refreshes the dedicated session, and inspects a user', async ({
        page,
    }) => {
        const assertNoBrowserErrors = captureBrowserErrors(page, {
            '/api/admin/auth/refresh': 401,
        });
        await passwordLogin(page);
        await expect(
            page.getByRole('heading', { name: 'Overview' }),
        ).toBeVisible();
        await page.reload();
        await expect(page.getByText(ownerEmail, { exact: true })).toBeVisible();
        await page.getByRole('menuitem', { name: 'Users' }).click();
        await page.getByPlaceholder('Email or exact user ID').fill(targetEmail);
        await page.getByRole('button', { name: 'search' }).click();
        await page.getByRole('link', { name: targetEmail }).first().click();
        await expect(
            page.getByRole('heading', { name: targetEmail }),
        ).toBeVisible();
        await expect(page.getByText('Verified', { exact: true })).toBeVisible();
        assertNoBrowserErrors();
    });

    // @user-flow admin-user-management/admin-owner-disable-and-restore-user
    test('owner disables and restores a user with explicit audited reasons', async ({
        page,
    }) => {
        const assertNoBrowserErrors = captureBrowserErrors(page, {
            '/api/admin/auth/refresh': 401,
        });
        await passwordLogin(page);
        await page.goto('/users');
        await page.getByPlaceholder('Email or exact user ID').fill(targetEmail);
        await page.getByRole('button', { name: 'search' }).click();
        await page.getByRole('link', { name: targetEmail }).first().click();
        await page.getByRole('button', { name: 'Disable user' }).click();
        await page
            .getByLabel('Reason')
            .fill('Reviewed account restriction in the E2E journey');
        await page.getByRole('button', { name: 'Confirm disable' }).click();
        await expect(
            page.getByText('disabled', { exact: true }).first(),
        ).toBeVisible();

        await page.getByRole('button', { name: 'Restore user' }).click();
        await page
            .getByLabel('Reason')
            .fill('Confirmed restoration in the E2E journey');
        await page.getByRole('button', { name: 'Confirm restore' }).click();
        await expect(
            page.getByText('active', { exact: true }).first(),
        ).toBeVisible();
        await page.getByRole('menuitem', { name: 'Audit' }).click();
        const auditRow = page
            .getByRole('row')
            .filter({ hasText: 'Confirmed restoration in the E2E journey' })
            .filter({ hasText: ownerEmail });
        await expect(auditRow).toContainText(ownerEmail);
        await expect(auditRow).toContainText(targetEmail);
        await expect(auditRow).toContainText(
            /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
        );
        assertNoBrowserErrors();
    });

    // @user-flow ai-credit-wallet/admin-grants-and-generation-consumes-ai-credits
    test('owner grants AI credits and a managed generation consumes them', async ({
        page,
        request,
    }) => {
        test.setTimeout(120_000);
        const assertNoBrowserErrors = captureBrowserErrors(page, {
            '/api/admin/auth/refresh': 401,
        });
        await passwordLogin(page);

        await page.getByRole('menuitem', { name: 'AI settings' }).click();
        await expect(
            page.getByRole('heading', { name: 'AI providers' }),
        ).toBeVisible();
        await page
            .locator('label.ant-radio-button-wrapper')
            .filter({ hasText: 'DeepSeek' })
            .click();
        await page
            .getByRole('checkbox', { name: /DeepSeek Chat/ })
            .evaluate((element: HTMLInputElement) => element.click());
        await page.getByLabel('Default model').press('ArrowDown');
        await page.getByLabel('Default model').press('Enter');
        await page
            .getByLabel('Reason for change')
            .fill('Configure priced managed generation for credit E2E');
        await page.getByRole('button', { name: 'Save configuration' }).click();
        await expect(page.getByText(/Configuration version \d+/)).toBeVisible();

        await page.goto(`/users/${targetId}`);
        await expect(
            page.getByRole('heading', { name: targetEmail }),
        ).toBeVisible();
        await expect(
            page.getByText('AI credits', { exact: true }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Adjust credits' }).click();
        const adjustmentDialog = page.getByRole('dialog', {
            name: 'Adjust AI credits',
        });
        const amount = adjustmentDialog.getByRole('spinbutton', {
            name: 'Credits',
        });
        await expect(amount).toHaveValue('1');
        await amount.fill('5000000');
        await expect(amount).toHaveValue('5000000');
        await adjustmentDialog
            .getByLabel('Reason')
            .fill('Grant one deterministic managed generation attempt');
        await expect(adjustmentDialog.getByLabel('Reason')).toHaveValue(
            'Grant one deterministic managed generation attempt',
        );
        await adjustmentDialog
            .getByRole('button', { name: 'Apply adjustment' })
            .click();
        await expect(
            page.getByText('Grant', { exact: true }).first(),
        ).toBeVisible();

        const targetLogin = await request.post(
            `${backendOrigin}/auth/login/password`,
            {
                data: { email: targetEmail, password: ownerPassword },
                headers: { Origin: webOrigin },
            },
        );
        expect(targetLogin.status()).toBe(200);
        const accessToken = (
            (await targetLogin.json()) as { accessToken: string }
        ).accessToken;
        const apiHeaders = {
            Authorization: `Bearer ${accessToken}`,
            Origin: webOrigin,
        };
        const dictionaryResponse = await request.post(
            `${backendOrigin}/dictionaries`,
            {
                data: {
                    name: `AI credit wallet ${runId}`,
                    sourceLanguage: 'en',
                    targetLanguage: 'fr',
                },
                headers: {
                    ...apiHeaders,
                    'Idempotency-Key': `credit-dictionary-${runId}`,
                },
            },
        );
        expect(dictionaryResponse.status()).toBe(201);
        const dictionary = (await dictionaryResponse.json()) as {
            dictionary: {
                id: string;
                settingsVersion: number;
                version: number;
            };
        };
        const cardResponse = await request.post(
            `${backendOrigin}/dictionaries/${dictionary.dictionary.id}/cards`,
            {
                data: {
                    expectedDictionaryVersion: dictionary.dictionary.version,
                    expectedSettingsVersion:
                        dictionary.dictionary.settingsVersion,
                    values: { source: 'wallet', translation: 'portefeuille' },
                },
                headers: {
                    ...apiHeaders,
                    'Idempotency-Key': `credit-card-${runId}`,
                },
            },
        );
        expect(cardResponse.status()).toBe(201);
        const card = (await cardResponse.json()) as {
            card: { id: string; version: number };
            dictionaryVersion: number;
        };
        const generationResponse = await request.post(
            `${backendOrigin}/dictionaries/${dictionary.dictionary.id}/cards/${card.card.id}/generations`,
            {
                data: {
                    expectedCardVersion: card.card.version,
                    expectedDictionaryVersion: card.dictionaryVersion,
                    expectedSettingsVersion:
                        dictionary.dictionary.settingsVersion,
                    instruction: 'Keep the translation concise.',
                },
                headers: {
                    ...apiHeaders,
                    'Idempotency-Key': `credit-generation-${runId}`,
                },
            },
        );
        expect(generationResponse.status()).toBe(202);
        const jobId = (
            (await generationResponse.json()) as {
                job: { id: string };
            }
        ).job.id;

        let worker: ChildProcess | undefined;
        try {
            worker = await startDictionaryWorker();
            const job = await waitForGenerationReview(
                request,
                accessToken,
                jobId,
            );
            const database = postgres(databaseUrl, { max: 1 });
            try {
                const [reservation] = await database<
                    Array<{
                        chargedCredits: string;
                        dispatchedAt: Date | null;
                        measurement: string | null;
                        reservedCredits: string;
                        settledAt: Date | null;
                        state: string;
                    }>
                >`
                    select
                        charged_credits as "chargedCredits",
                        dispatched_at as "dispatchedAt",
                        measurement,
                        reserved_credits as "reservedCredits",
                        settled_at as "settledAt",
                        state
                    from ai_credit_reservations
                    where job_id = ${jobId}
                    order by attempt
                `;
                expect(reservation).toMatchObject({
                    dispatchedAt: expect.any(Date),
                    measurement: 'estimated',
                    reservedCredits: '400000',
                    settledAt: expect.any(Date),
                    state: 'settled',
                });
                expect(reservation!.chargedCredits).toBe('400000');
                const history = await database<Array<{ kind: string }>>`
                    select kind
                    from ai_credit_history
                    where owner_id = ${targetId}
                    order by created_at, id
                `;
                expect(history.map((entry) => entry.kind)).toEqual(
                    expect.arrayContaining([
                        'grant',
                        'reservation',
                        'settlement',
                    ]),
                );
            } finally {
                await database.end();
            }
            await page.reload();
            const settlementHistoryRow = page
                .getByRole('row')
                .filter({ hasText: 'Settlement' })
                .filter({ hasText: 'Estimated maximum' });
            await expect(settlementHistoryRow).toContainText('−400,000');
            const accepted = await request.post(
                `${backendOrigin}/dictionary-generation-jobs/${jobId}/accept`,
                {
                    data: { candidate: job.proposal!.candidate },
                    headers: apiHeaders,
                },
            );
            expect(accepted.status()).toBe(200);
            expect(
                ((await accepted.json()) as { job: { state: string } }).job
                    .state,
            ).toBe('accepted');
        } finally {
            await stopDictionaryWorker(worker);
        }
        assertNoBrowserErrors();
    });

    // @user-flow ai-provider-management/admin-configures-dictionary-ai-default
    test('owner configures providers and queued jobs retain their selected revisions', async ({
        page,
        request,
    }) => {
        test.setTimeout(120_000);
        const assertNoBrowserErrors = captureBrowserErrors(page, {
            '/api/admin/auth/refresh': 401,
        });
        await passwordLogin(page);
        await page.getByRole('menuitem', { name: 'AI settings' }).click();
        await expect(
            page.getByRole('heading', { name: 'AI providers' }),
        ).toBeVisible();
        const hasManagedRevision =
            (await page.getByText(/Configuration version \d+/).count()) > 0;
        if (!hasManagedRevision) {
            await page
                .locator('label.ant-radio-button-wrapper')
                .filter({ hasText: 'DeepSeek' })
                .click();
            const deepSeekCheckbox = page.getByRole('checkbox', {
                name: /DeepSeek Chat/,
            });
            await deepSeekCheckbox.evaluate((element: HTMLInputElement) =>
                element.click(),
            );
            await page.getByLabel('Default model').press('ArrowDown');
            await page.getByLabel('Default model').press('Enter');
            await page
                .getByLabel('Reason for change')
                .fill('Enable curated DeepSeek dictionary generation');
            await page
                .getByRole('button', { name: 'Save configuration' })
                .click();
            await expect(
                page.getByText(/Configuration version \d+/),
            ).toBeVisible();
        }

        const targetLogin = await request.post(
            `${backendOrigin}/auth/login/password`,
            {
                data: { email: targetEmail, password: ownerPassword },
                headers: { Origin: webOrigin },
            },
        );
        expect(targetLogin.status()).toBe(200);
        const accessToken = (
            (await targetLogin.json()) as { accessToken: string }
        ).accessToken;
        const apiHeaders = {
            Authorization: `Bearer ${accessToken}`,
            Origin: webOrigin,
        };
        const dictionaryResponse = await request.post(
            `${backendOrigin}/dictionaries`,
            {
                data: {
                    name: `AI provider routing ${runId}`,
                    sourceLanguage: 'en',
                    targetLanguage: 'fr',
                },
                headers: {
                    ...apiHeaders,
                    'Idempotency-Key': `dictionary-${runId}`,
                },
            },
        );
        expect(dictionaryResponse.status()).toBe(201);
        const createdDictionary = (await dictionaryResponse.json()) as {
            dictionary: {
                id: string;
                settingsVersion: number;
                version: number;
            };
        };
        const dictionaryId = createdDictionary.dictionary.id;
        const settingsVersion = createdDictionary.dictionary.settingsVersion;
        let dictionaryVersion = createdDictionary.dictionary.version;

        const createCard = async (source: string, translation: string) => {
            const response = await request.post(
                `${backendOrigin}/dictionaries/${dictionaryId}/cards`,
                {
                    data: {
                        expectedDictionaryVersion: dictionaryVersion,
                        expectedSettingsVersion: settingsVersion,
                        values: { source, translation },
                    },
                    headers: {
                        ...apiHeaders,
                        'Idempotency-Key': `card-${source}-${runId}`,
                    },
                },
            );
            expect(response.status()).toBe(201);
            const payload = (await response.json()) as {
                card: { id: string; version: number };
                dictionaryVersion: number;
            };
            dictionaryVersion = payload.dictionaryVersion;
            return payload.card;
        };
        const deepSeekCard = await createCard('canvas', 'toile');
        const kieCard = await createCard('studio', 'atelier');

        const enqueue = async (card: { id: string; version: number }) => {
            const response = await request.post(
                `${backendOrigin}/dictionaries/${dictionaryId}/cards/${card.id}/generations`,
                {
                    data: {
                        expectedCardVersion: card.version,
                        expectedDictionaryVersion: dictionaryVersion,
                        expectedSettingsVersion: settingsVersion,
                        instruction: 'Keep the translation concise.',
                    },
                    headers: {
                        ...apiHeaders,
                        'Idempotency-Key': `generation-${card.id}-${runId}`,
                    },
                },
            );
            expect(response.status()).toBe(202);
            return ((await response.json()) as { job: { id: string } }).job.id;
        };
        const deepSeekJobId = await enqueue(deepSeekCard);

        await page
            .locator('label.ant-radio-button-wrapper')
            .filter({ hasText: 'Kie' })
            .click();
        const kieCheckbox = page.getByRole('checkbox', {
            name: /Gemini 2\.5 Pro via Kie/,
        });
        if (!(await kieCheckbox.isChecked())) {
            await kieCheckbox.evaluate((element: HTMLInputElement) =>
                element.click(),
            );
        }
        await page.getByLabel('Default model').press('ArrowDown');
        await page.getByLabel('Default model').press('Enter');
        await page
            .getByLabel('Reason for change')
            .fill('Switch new dictionary jobs to the curated Kie model');
        await page.getByRole('button', { name: 'Save configuration' }).click();
        await expect(
            page.getByText(/Configuration version \d+/i),
        ).toBeVisible();
        const kieJobId = await enqueue(kieCard);

        const database = postgres(databaseUrl, { max: 1 });
        try {
            const pinned = await database<
                Array<{
                    jobId: string;
                    modelId: string;
                    providerId: string;
                    revisionId: string;
                }>
            >`
                select
                    jobs.id as "jobId",
                    jobs.execution_revision_id as "revisionId",
                    revisions.catalog_snapshot ->> 'modelId' as "modelId",
                    revisions.catalog_snapshot ->> 'providerId' as "providerId"
                from dictionary_generation_jobs jobs
                join dictionary_ai_configuration_revisions revisions
                  on revisions.id = jobs.execution_revision_id
                where jobs.id in (${deepSeekJobId}, ${kieJobId})
                order by jobs.id
            `;
            expect(pinned).toHaveLength(2);
            expect(new Set(pinned.map((row) => row.revisionId)).size).toBe(2);
            expect(
                pinned.map(({ modelId, providerId }) => ({
                    modelId,
                    providerId,
                })),
            ).toEqual(
                expect.arrayContaining([
                    { modelId: 'deepseek-chat', providerId: 'deepseek' },
                    { modelId: 'gemini-2.5-pro', providerId: 'kie' },
                ]),
            );
        } finally {
            await database.end();
        }

        let worker: ChildProcess | undefined;
        try {
            worker = await startDictionaryWorker();
            const deepSeekJob = await waitForGenerationReview(
                request,
                accessToken,
                deepSeekJobId,
            );
            await waitForGenerationReview(request, accessToken, kieJobId);
            const accepted = await request.post(
                `${backendOrigin}/dictionary-generation-jobs/${deepSeekJobId}/accept`,
                {
                    data: { candidate: deepSeekJob.proposal!.candidate },
                    headers: apiHeaders,
                },
            );
            expect(accepted.status()).toBe(200);
            expect(
                ((await accepted.json()) as { job: { state: string } }).job
                    .state,
            ).toBe('accepted');
        } finally {
            await stopDictionaryWorker(worker);
        }

        await page.reload();
        await expect(page.getByRole('radio', { name: 'Kie' })).toBeChecked();
        await expect(
            page.getByRole('checkbox', { name: /Gemini 2\.5 Pro via Kie/ }),
        ).toBeChecked();
        await expect(
            page.getByText(/Configuration version \d+/i),
        ).toBeVisible();
        assertNoBrowserErrors();
    });

    // @user-flow admin-user-management/admin-owner-cancels-scheduled-deletion
    test('owner cancels a scheduled removal through the audited distinct action', async ({
        page,
        request,
    }) => {
        const targetLogin = await request.post(
            `${backendOrigin}/auth/login/password`,
            {
                data: { email: targetEmail, password: ownerPassword },
                headers: { Origin: webOrigin },
            },
        );
        expect(targetLogin.status()).toBe(200);
        const token = ((await targetLogin.json()) as { accessToken: string })
            .accessToken;
        const scheduled = await request.post(
            `${backendOrigin}/users/me/deletion`,
            {
                data: {},
                headers: {
                    Authorization: `Bearer ${token}`,
                    Origin: webOrigin,
                },
            },
        );
        expect(scheduled.status()).toBe(202);

        const assertNoBrowserErrors = captureBrowserErrors(page, {
            '/api/admin/auth/refresh': 401,
        });
        await passwordLogin(page);
        await page.goto(`/users/${targetId}`);
        await expect(
            page.getByText('scheduled for deletion', { exact: true }).first(),
        ).toBeVisible();
        await page
            .getByRole('button', { name: 'Cancel scheduled deletion' })
            .click();
        await page
            .getByLabel('Reason')
            .fill('Reviewed administrator cancellation in disposable E2E');
        await page
            .getByRole('button', { name: 'Confirm cancellation' })
            .click();
        await expect(
            page.getByText('active', { exact: true }).first(),
        ).toBeVisible();
        await page.getByRole('menuitem', { name: 'Audit' }).click();
        await expect(
            page.getByRole('row').filter({
                hasText:
                    'Reviewed administrator cancellation in disposable E2E',
            }),
        ).toBeVisible();
        assertNoBrowserErrors();
    });

    // @user-flow admin-user-management/admin-recent-authentication-required
    test('an expired recent-authentication window preserves the mutation reason and requires sign-in', async ({
        page,
    }) => {
        const assertNoBrowserErrors = captureBrowserErrors(page, {
            '/api/admin/auth/refresh': 401,
            [`/api/admin/users/${targetId}/disable`]: 403,
        });
        await passwordLogin(page);
        const sql = postgres(databaseUrl, { max: 1 });
        try {
            await sql`
                update auth_sessions
                set authenticated_at = created_at - interval '10 minutes'
                where user_id = ${ownerId}
                  and revoked_at is null
                  and rotated_at is null
            `;
        } finally {
            await sql.end();
        }
        await page.goto(`/users/${targetId}`);
        await page.getByRole('button', { name: 'Disable user' }).click();
        const reason = 'Reviewed recent authentication rejection';
        await page.getByLabel('Reason').fill(reason);
        await page.getByRole('button', { name: 'Confirm disable' }).click();

        await expect(
            page
                .getByRole('alert')
                .filter({
                    hasText: 'Recent authentication is required.',
                })
                .first(),
        ).toBeVisible();
        await expect(page.getByLabel('Reason')).toHaveValue(reason);
        await expect(
            page.getByRole('button', { name: 'Sign in again' }),
        ).toBeVisible();
        assertNoBrowserErrors();
    });

    // @user-flow admin-user-management/admin-non-member-denied
    test('a verified user without membership is denied administration access', async ({
        page,
    }) => {
        const assertNoBrowserErrors = captureBrowserErrors(page, {
            '/api/admin/auth/login/password': 403,
            '/api/admin/auth/refresh': 401,
        });
        await passwordLogin(page, targetEmail, false);
        await expect(
            page
                .getByRole('alert')
                .filter({ hasText: 'Administrator access is required.' })
                .first(),
        ).toBeVisible();
        await expect(page).toHaveURL(/\/login$/);
        assertNoBrowserErrors();
    });

    // @user-flow admin-user-management/admin-owner-passkey-login
    test('an owner enrolls on the public account and signs into admin with that passkey', async ({
        page,
    }) => {
        const assertNoBrowserErrors = captureBrowserErrors(page, {
            '/auth/refresh': 401,
            '/api/admin/auth/refresh': 401,
        });
        const client = await addVirtualAuthenticator(page);
        try {
            await page.goto(
                `${webOrigin}/login?returnTo=%2Fprofile%3Ftab%3Dsecurity`,
            );
            await page.getByLabel('Email').fill(ownerEmail);
            await page.locator('input[name="password"]').fill(ownerPassword);
            await page
                .getByRole('button', { name: 'Sign in', exact: true })
                .click();
            await expect(page).toHaveURL(/\/profile\?tab=security$/);
            await page.getByLabel('Passkey name').fill(`Admin E2E ${runId}`);
            await page.getByRole('button', { name: 'Add passkey' }).click();
            await expect(page.getByText('Passkey added.')).toBeVisible();
            await page.getByRole('button', { name: 'Sign out here' }).click();

            await page.goto('/login');
            await page.getByRole('button', { name: 'Use a passkey' }).click();
            await expect(
                page.getByRole('heading', { name: 'Overview' }),
            ).toBeVisible();
        } finally {
            await client.detach();
        }
        assertNoBrowserErrors();
    });
});
