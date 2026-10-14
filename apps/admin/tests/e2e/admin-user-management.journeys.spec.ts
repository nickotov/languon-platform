// @user-flow-revision shared-pronunciation-playback sha256:56b7a5103be1a668
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

// @user-flow-revision admin-user-management sha256:8f1ff6e6a88850b6
// @user-flow-revision ai-provider-management sha256:9d0a0f62b235f0b2
// @user-flow-revision ai-credit-wallet sha256:912c63845e283ad8

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
                DICTIONARY_JOB_API_ENQUEUED_FORMATS: 'single-card:v2',
                DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS: 'single-card:v2',
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

async function runSpeechFixture(
    mode: 'seed' | 'join' | 'assert-deleted',
    ...args: string[]
) {
    const { stdout } = await execFileAsync(
        'pnpm',
        [
            '--filter',
            '@languon/backend',
            'exec',
            'tsx',
            'tests/support/admin-speech-fixture.ts',
            mode,
            ownerId,
            ...args,
        ],
        {
            cwd: repositoryRoot,
            env: {
                ...process.env,
                APP_ENV: 'test',
                ADMIN_E2E_SPEECH_FIXTURES: 'true',
                ADMIN_E2E_DATABASE_URL: databaseUrl,
            },
        },
    );
    const jsonLine = stdout
        .split('\n')
        .findLast((line) => line.startsWith('{'));
    if (!jsonLine) throw new Error('Speech fixture returned no JSON.');
    return JSON.parse(jsonLine) as {
        recordingId: string;
        dictionaryId: string;
        cardId: string;
        text: string;
        deleted?: boolean;
    };
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

    // @user-flow shared-pronunciation-playback/admin-private-preview-and-impact-removal
    test('owner previews private speech bytes and confirms removal after changed impact', async ({
        page,
    }, info) => {
        const fixture = await runSpeechFixture('seed', runId);
        await passwordLogin(page);
        const assertErrors = captureBrowserErrors(page, {
            '/api/admin/speech/recordings/delete': 409,
        });
        await page.getByRole('menuitem', { name: 'Speech recordings' }).click();
        await page.getByLabel('Normalized text search').fill(fixture.text);
        const inventory = page.waitForResponse(
            (response) =>
                response.url().includes('/admin/speech/recordings?') &&
                new URL(response.url()).searchParams.get('search') ===
                    fixture.text,
        );
        await page.getByRole('button', { name: 'Apply filters' }).click();
        expect((await inventory).status()).toBe(200);
        const row = page.getByRole('row').filter({ hasText: fixture.text });
        await expect(row).toHaveCount(1);
        await expect(row).toContainText('fixture');
        await page.setViewportSize({ width: 390, height: 844 });
        await row.getByRole('button', { name: 'Preview', exact: true }).click();
        const preview = page.getByRole('dialog', {
            name: 'Preview',
            exact: true,
        });
        await expect(preview).toContainText(fixture.text);
        const bytes = page.waitForResponse((response) =>
            response
                .url()
                .endsWith(
                    `/admin/speech/recordings/${fixture.recordingId}/content`,
                ),
        );
        await preview
            .getByRole('button', { name: 'Load audio preview' })
            .click();
        const audioResponse = await bytes;
        expect(audioResponse.status()).toBe(200);
        expect(audioResponse.headers()['cache-control']).toContain('no-store');
        expect(audioResponse.headers()['content-type']).toBe('audio/wav');
        const adminToken = (await audioResponse.request().allHeaders())
            .authorization!;
        await expect(preview.locator('audio')).toHaveAttribute('src', /^blob:/);
        await page.screenshot({
            path: info.outputPath('admin-private-speech-preview-narrow.png'),
            fullPage: true,
        });
        await preview
            .getByRole('button', { name: 'Close', exact: true })
            .click();
        await row.getByRole('checkbox').check();
        await page.getByRole('button', { name: 'Delete selected (1)' }).click();
        const removal = page.getByRole('dialog', {
            name: 'Delete these recordings?',
        });
        await expect(removal).toContainText(
            'Remove 1 recordings affecting 1 saved-content links.',
        );
        await removal
            .getByRole('button', { name: 'Confirm permanent removal' })
            .click();
        await expect(
            removal.getByRole('textbox', { name: 'Reason' }),
        ).toHaveAttribute('aria-invalid', 'true');
        await runSpeechFixture('join', fixture.dictionaryId, fixture.cardId);
        await removal
            .getByRole('textbox', { name: 'Reason' })
            .fill('Remove synthetic fixture after reviewing saved links');
        const conflict = page.waitForResponse(
            (response) =>
                response.url().endsWith('/admin/speech/recordings/delete') &&
                response.request().method() === 'POST',
        );
        await removal
            .getByRole('button', { name: 'Confirm permanent removal' })
            .click();
        expect((await conflict).status()).toBe(409);
        await expect(
            removal.getByRole('button', { name: 'Confirm permanent removal' }),
        ).toBeDisabled();
        await removal
            .getByRole('button', { name: 'Reload and review impact' })
            .click();
        await expect(removal).not.toBeVisible();
        await row.getByRole('checkbox').check();
        await page.getByRole('button', { name: 'Delete selected (1)' }).click();
        await expect(removal).toContainText(
            'Remove 1 recordings affecting 2 saved-content links.',
        );
        await removal
            .getByRole('textbox', { name: 'Reason' })
            .fill('Confirm removal with the refreshed two-link impact');
        const deleted = page.waitForResponse(
            (response) =>
                response.url().endsWith('/admin/speech/recordings/delete') &&
                response.request().method() === 'POST',
        );
        await removal
            .getByRole('button', { name: 'Confirm permanent removal' })
            .click();
        expect((await deleted).status()).toBe(200);
        await expect(removal).not.toBeVisible();
        await expect(row).toHaveCount(0);
        expect(
            (await runSpeechFixture('assert-deleted', fixture.recordingId))
                .deleted,
        ).toBe(true);
        const removedContent = await page.request.get(
            `${adminOrigin}/api/admin/speech/recordings/${fixture.recordingId}/content`,
            { headers: { Authorization: adminToken } },
        );
        expect(removedContent.status()).toBe(404);
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
        ).toBe(true);
        assertErrors();
    });

    // @user-flow shared-pronunciation-playback/admin-library-filters
    test('owner searches the retained speech inventory without exposing object URLs', async ({
        page,
    }, info) => {
        await passwordLogin(page);
        const assertErrors = captureBrowserErrors(page);
        await page.getByRole('menuitem', { name: 'Speech recordings' }).click();
        await expect(
            page.getByRole('heading', { name: 'Speech recordings' }),
        ).toBeVisible();
        await page
            .getByLabel('Normalized text search')
            .fill(`no-such-recording-${runId}`);
        await page.getByLabel('Language', { exact: true }).fill('fr');
        await page.getByLabel('Created from (UTC)').fill('2026-01-01');
        const loaded = page.waitForResponse(
            (response) =>
                response.url().includes('/admin/speech/recordings?') &&
                new URL(response.url()).searchParams.get('language') === 'fr',
        );
        await page
            .getByRole('button', { name: 'Apply filters', exact: true })
            .click();
        expect((await loaded).status()).toBe(200);
        await expect(
            page.getByRole('button', { name: 'Delete selected (0)' }),
        ).toBeDisabled();
        await expect(page.locator('.ant-empty-description')).toHaveText('No data');
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({
            path: info.outputPath('admin-speech-library-narrow.png'),
            fullPage: true,
        });
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
        ).toBe(true);
        assertErrors();
    });

    // @user-flow shared-pronunciation-playback/admin-model-price-publication
    test('owner publishes an immutable speech price revision and reviews stale edits', async ({
        page,
        browser,
    }, info) => {
        await passwordLogin(page);
        const assertErrors = captureBrowserErrors(page, {
            '/api/admin/ai/model-prices': 409,
        });
        await page.getByRole('menuitem', { name: 'AI settings' }).click();
        const panel = page.locator('.ant-card').filter({
            has: page.getByText('Model credit pricing', { exact: true }),
        });
        const row = panel
            .getByRole('row')
            .filter({ hasText: 'speech-characters' })
            .first();
        await expect(row).toBeVisible();
        await row
            .getByRole('button', { name: 'Edit price', exact: true })
            .click();
        const staleDialog = page.getByRole('dialog', {
            name: 'Publish model price',
        });
        await expect(staleDialog).toBeVisible();
        const secondContext = await browser.newContext({
            baseURL: adminOrigin,
        });
        try {
            const second = await secondContext.newPage();
            await passwordLogin(second);
            const secondErrors = captureBrowserErrors(second);
            await second.getByRole('menuitem', { name: 'AI settings' }).click();
            const secondPanel = second.locator('.ant-card').filter({
                has: second.getByText('Model credit pricing', {
                    exact: true,
                }),
            });
            await secondPanel
                .getByRole('row')
                .filter({ hasText: 'speech-characters' })
                .first()
                .getByRole('button', { name: 'Edit price', exact: true })
                .click();
            const dialog = second.getByRole('dialog', {
                name: 'Publish model price',
            });
            await dialog.getByLabel('Credits per 1,000 characters').fill('101');
            await dialog
                .getByLabel('Reason', { exact: true })
                .fill('Publish a deterministic test price revision');
            const published = second.waitForResponse(
                (response) =>
                    response.url().includes('/admin/ai/model-prices') &&
                    response.request().method() === 'POST',
            );
            await dialog
                .getByRole('button', { name: 'Publish price revision' })
                .click();
            expect((await published).status()).toBe(200);
            await expect(dialog).not.toBeVisible();
            secondErrors();
            await staleDialog
                .getByLabel('Reason', { exact: true })
                .fill('Attempt an intentionally stale price revision');
            const conflict = page.waitForResponse(
                (response) =>
                    response.url().includes('/admin/ai/model-prices') &&
                    response.request().method() === 'POST',
            );
            await staleDialog
                .getByRole('button', { name: 'Publish price revision' })
                .click();
            expect((await conflict).status()).toBe(409);
            await expect(
                staleDialog.getByRole('button', {
                    name: 'Publish price revision',
                }),
            ).toBeDisabled();
            await page.setViewportSize({ width: 390, height: 844 });
            await page.screenshot({
                path: info.outputPath('admin-price-revision-conflict.png'),
                fullPage: true,
            });
            await staleDialog
                .getByRole('button', { name: 'Refresh', exact: true })
                .click();
            await expect(staleDialog).not.toBeVisible();
        } finally {
            await secondContext.close();
        }
        assertErrors();
    });

    // @user-flow admin-user-management/admin-sentence-library-management
    test('inspects, archives, restores and permanently removes saved examples with reasons', async ({
        page,
        request,
    }, info) => {
        test.skip(
            process.env.ADMIN_E2E_SENTENCE_SERVICES !== 'true',
            'Requires the guarded deterministic sentence worker.',
        );
        test.setTimeout(120_000);
        const assertErrors = captureBrowserErrors(page, {
            '/api/admin/auth/refresh': 401,
        });
        // This disposable database can retain the previous run's Kie default.
        // Configure the model processed by our deterministic sentence worker
        // through the same audited administrator UI used in production.
        await passwordLogin(page);
        await page.getByRole('menuitem', { name: 'AI settings' }).click();
        await page
            .locator('label.ant-radio-button-wrapper')
            .filter({ hasText: 'DeepSeek' })
            .click();
        const modelEnabled = page.getByRole('checkbox', {
            name: /DeepSeek Chat/,
        });
        if (!(await modelEnabled.isChecked()))
            await modelEnabled.evaluate((element: HTMLInputElement) =>
                element.click(),
            );
        const fixtureDefault = page.getByLabel('Default model');
        await fixtureDefault.press('ArrowDown');
        await fixtureDefault.press('Home');
        await fixtureDefault.press('Enter');
        await expect(
            page.locator('.ant-select').filter({ has: fixtureDefault }),
        ).toContainText('DeepSeek Chat');
        await page
            .getByLabel('Reason for change')
            .fill(
                'Select deterministic sentence fixture model for isolated E2E',
            );
        await page.getByRole('button', { name: 'Save configuration' }).click();
        await expect(page.getByText(/Configuration version \d+/)).toBeVisible();
        const fixtureRunId = process.env.ADMIN_E2E_SENTENCE_RUN_ID!;
        const learnerEmail = `sentence-e2e-${fixtureRunId}-admin-owner@example.test`;
        const learnerId = await provisionVerifiedUser(
            request,
            learnerEmail,
            ownerPassword,
        );
        const login = await request.post(
            `${backendOrigin}/auth/login/password`,
            {
                data: { email: learnerEmail, password: ownerPassword },
                headers: { Origin: webOrigin },
            },
        );
        expect(login.status()).toBe(200);
        const headers = {
            Authorization: `Bearer ${((await login.json()) as { accessToken: string }).accessToken}`,
            Origin: webOrigin,
        };
        const dictionaryResponse = await request.post(
            `${backendOrigin}/dictionaries`,
            {
                headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
                data: {
                    name: `Sentence operations ${fixtureRunId}`,
                    sourceLanguage: 'en',
                    targetLanguage: 'fr',
                },
            },
        );
        expect(dictionaryResponse.status()).toBe(201);
        const { dictionary } = (await dictionaryResponse.json()) as {
            dictionary: {
                id: string;
                version: number;
                settingsVersion: number;
            };
        };
        const card = await request.post(
            `${backendOrigin}/dictionaries/${dictionary.id}/cards`,
            {
                headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
                data: {
                    expectedDictionaryVersion: dictionary.version,
                    expectedSettingsVersion: dictionary.settingsVersion,
                    values: { source: 'book', translation: 'livre' },
                },
            },
        );
        expect(card.status()).toBe(201);
        const sentencePath = `${backendOrigin}/learning/dictionaries/${dictionary.id}/sentences`;
        // Wait for fixture provider readiness and credit initialization via the real setup API.
        await expect
            .poll(
                async () => {
                    const setup = await request.post(
                        `${sentencePath}/prepare`,
                        {
                            headers,
                            data: {
                                direction: 'source-to-target',
                                mode: 'new-only',
                                scope: { type: 'all' },
                            },
                        },
                    );
                    return setup.status();
                },
                { timeout: 30_000 },
            )
            .toBe(200);
        const nextInput = {
            direction: 'source-to-target',
            mode: 'new-only',
            scope: { type: 'all' },
            sessionId: crypto.randomUUID(),
            operationId: crypto.randomUUID(),
            visitedExerciseIds: [],
        };
        let next: Awaited<ReturnType<typeof request.post>>;
        await expect
            .poll(
                async () => {
                    next = await request.post(`${sentencePath}/next`, {
                        headers,
                        data: nextInput,
                    });
                    if (next.status() === 503) {
                        const error = (await next!.json()) as {
                            error?: { code?: string };
                        };
                        return `503:${error.error?.code ?? 'unknown'}`;
                    }
                    return String(next.status());
                },
                {
                    timeout: 30_000,
                    intervals: [1000, 2000, 4000],
                    message:
                        'Wait for deterministic sentence worker policy and credit readiness',
                },
            )
            .toBe('202');
        const admitted = (await next!.json()) as { job: { id: string } };
        await expect
            .poll(
                async () => {
                    const response = await request.get(
                        `${sentencePath}/jobs/${admitted.job.id}`,
                        { headers },
                    );
                    expect(response.status()).toBe(200);
                    return ((await response.json()) as { state: string }).state;
                },
                { timeout: 40_000 },
            )
            .toBe('completed');
        await page.goto(`/users/${learnerId}`);
        await page
            .getByRole('button', {
                name: 'Manage sentence library',
                exact: true,
            })
            .click();
        await expect(
            page.getByRole('heading', {
                name: 'Saved examples, under control.',
                exact: true,
            }),
        ).toBeVisible();
        await page
            .getByRole('combobox', { name: 'Dictionary', exact: true })
            .click();
        await page
            .getByText(`Sentence operations ${fixtureRunId} · EN → FR`, {
                exact: true,
            })
            .click();
        const selection = page.getByRole('checkbox', {
            name: 'Select example: book is useful.',
        });
        await expect(selection).toBeVisible();
        await page
            .getByRole('button', { name: 'Preview example: book is useful.' })
            .click();
        const preview = page.getByRole('dialog', { name: 'Example preview' });
        await expect(preview).toContainText('livre est utile.');
        await expect(
            preview.getByText('Hints & phrase mappings', { exact: true }),
        ).toBeVisible();
        await page.screenshot({
            animations: 'disabled',
            path: info.outputPath('admin-sentence-preview-wide.png'),
            fullPage: true,
        });
        await preview
            .getByRole('button', { name: 'Close', exact: true })
            .click();
        await page.getByText('Dark', { exact: true }).click();
        await expect(page.locator('html')).toHaveAttribute(
            'data-theme',
            'dark',
        );
        await page
            .getByRole('button', { name: 'Preview example: book is useful.' })
            .click();
        await expect(preview).toContainText('livre est utile.');
        await page.screenshot({
            path: info.outputPath('admin-sentence-preview-wide-dark.png'),
            animations: 'disabled',
            fullPage: false,
        });
        await preview
            .getByRole('button', { name: 'Close', exact: true })
            .click();
        await page.getByText('Light', { exact: true }).click();
        await expect(page.locator('html')).toHaveAttribute(
            'data-theme',
            'light',
        );
        const mutate = async (label: string, reason: string, purge = false) => {
            await selection.check();
            await page
                .getByRole('button', { name: label, exact: true })
                .click();
            const dialog = page.getByRole('dialog', {
                name: label,
                exact: true,
            });
            await dialog.getByLabel('Reason', { exact: true }).fill(reason);
            await page.screenshot({
                animations: 'disabled',
                path: info.outputPath(
                    `admin-sentence-confirm-${label.replaceAll(' ', '-').toLowerCase()}.png`,
                ),
                fullPage: true,
            });
            if (purge) {
                await dialog
                    .getByRole('button', {
                        name: 'Confirm action',
                        exact: true,
                    })
                    .click();
                await expect(dialog).toBeVisible();
                await expect(
                    dialog.getByText(
                        'Confirm permanent deletion before continuing.',
                        { exact: true },
                    ),
                ).toBeVisible();
                await dialog
                    .getByRole('checkbox', {
                        name: /I understand this permanently deletes/,
                    })
                    .check();
            }
            await dialog
                .getByRole('button', { name: 'Confirm action', exact: true })
                .click();
            await expect(dialog).not.toBeVisible();
        };
        await mutate(
            'Archive globally',
            'Hide the synthetic example globally for verification',
        );
        await mutate(
            'Restore globally',
            'Restore the synthetic globally archived example',
        );
        await mutate(
            'Archive for user',
            'Archive the generator example before permanent cleanup',
        );
        await page.reload();
        await page
            .getByRole('button', {
                name: 'Manage sentence library',
                exact: true,
            })
            .click();
        await page
            .getByRole('combobox', { name: 'Dictionary', exact: true })
            .click();
        await page
            .getByText(`Sentence operations ${fixtureRunId} · EN → FR`, {
                exact: true,
            })
            .click();
        await expect(selection).toBeVisible();
        await mutate(
            'Restore for user',
            'Verify personal restore retains saved example content',
        );
        await mutate(
            'Archive for user',
            'Archive the generator example for final permanent cleanup',
        );
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(
            page.getByRole('heading', {
                name: 'Saved examples, under control.',
                exact: true,
            }),
        ).toBeVisible();
        await page.screenshot({
            animations: 'disabled',
            path: info.outputPath('admin-sentence-library-narrow.png'),
            fullPage: true,
        });
        const sentencePanel = page.locator('.ant-card').filter({
            has: page.getByText('Sentence library', { exact: true }),
        });
        await sentencePanel.screenshot({
            path: info.outputPath('admin-sentence-panel-narrow.png'),
            animations: 'disabled',
        });
        const panelPosition = await sentencePanel.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const header = document.querySelector('.ant-layout-header');
            return {
                top: rect.top + scrollY,
                bottom: rect.bottom + scrollY,
                header: header?.getBoundingClientRect().height ?? 0,
            };
        });
        await page.evaluate(
            (position) =>
                scrollTo(0, Math.max(0, position.top - position.header - 16)),
            panelPosition,
        );
        await page.screenshot({
            path: info.outputPath('admin-sentence-panel-top-narrow.png'),
            animations: 'disabled',
        });
        await page.evaluate(
            (position) =>
                scrollTo(0, Math.max(0, position.bottom - innerHeight + 16)),
            panelPosition,
        );
        await page.screenshot({
            path: info.outputPath('admin-sentence-panel-bottom-narrow.png'),
            animations: 'disabled',
        });
        expect(
            await page.evaluate(
                () =>
                    document.documentElement.scrollWidth <=
                    window.innerWidth + 1,
            ),
        ).toBe(true);
        await page
            .getByRole('button', { name: 'Preview example: book is useful.' })
            .click();
        await expect(preview).toContainText('livre est utile.');
        await page.screenshot({
            animations: 'disabled',
            path: info.outputPath('admin-sentence-preview-narrow.png'),
            fullPage: false,
        });
        await preview
            .getByRole('button', { name: 'Close', exact: true })
            .click();
        await mutate(
            'Delete permanently',
            'Permanently erase this synthetic creator archived example',
            true,
        );
        await expect(selection).not.toBeVisible();
        const remaining = await request.get(
            `${sentencePath}/library?personalArchive=all&globalArchive=all`,
            { headers },
        );
        expect(remaining.status()).toBe(200);
        expect(
            ((await remaining.json()) as { items: unknown[] }).items,
        ).toHaveLength(0);
        assertErrors();
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
            .evaluate((element: HTMLInputElement) => {
                // A preceding sentence journey may already have enabled this model.
                if (!element.checked) element.click();
            });
        const defaultModel = page.getByLabel('Default model');
        await defaultModel.press('ArrowDown');
        await defaultModel.press('Home');
        await defaultModel.press('Enter');
        await expect(
            page.locator('.ant-select').filter({ has: defaultModel }),
        ).toContainText('DeepSeek Chat');
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
        await amount.fill('50000000');
        await expect(amount).toHaveValue('50000000');
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
        let worker: ChildProcess | undefined;
        try {
            // Admission must observe a live worker that can process card authoring,
            // even when the sentence fixture has already published its own formats.
            worker = await startDictionaryWorker();
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
        // Establish the first revision on every run: this owned fixture can retain
        // a Kie default from a previous successful run or the credit-wallet case.
        await page
            .locator('label.ant-radio-button-wrapper')
            .filter({ hasText: 'DeepSeek' })
            .click();
        const deepSeekCheckbox = page.getByRole('checkbox', {
            name: /DeepSeek Chat/,
        });
        if (!(await deepSeekCheckbox.isChecked())) {
            await deepSeekCheckbox.evaluate((element: HTMLInputElement) =>
                element.click(),
            );
        }
        const defaultModel = page.getByLabel('Default model');
        await defaultModel.press('ArrowDown');
        await defaultModel.press('Home');
        await defaultModel.press('Enter');
        await expect(
            page.locator('.ant-select').filter({ has: defaultModel }),
        ).toContainText('DeepSeek Chat');
        await page
            .getByLabel('Reason for change')
            .fill('Establish DeepSeek baseline for pinned revision regression');
        await page.getByRole('button', { name: 'Save configuration' }).click();
        await expect(page.getByText(/Configuration version \d+/)).toBeVisible();

        // Reserve both models full three-attempt ceilings (up to 4M per attempt).
        // Fund through the owner UI rather than depending on another test case.
        await page.goto(`/users/${targetId}`);
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
        await amount.fill('50000000');
        await expect(amount).toHaveValue('50000000');
        await adjustmentDialog
            .getByLabel('Reason')
            .fill('Fund pinned provider-revision generation jobs');
        await expect(adjustmentDialog.getByLabel('Reason')).toHaveValue(
            'Fund pinned provider-revision generation jobs',
        );
        await adjustmentDialog
            .getByRole('button', { name: 'Apply adjustment' })
            .click();
        await expect(
            page.getByText('Grant', { exact: true }).first(),
        ).toBeVisible();
        await page.getByRole('menuitem', { name: 'AI settings' }).click();
        await expect(
            page.getByRole('heading', { name: 'AI providers' }),
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
        let worker: ChildProcess | undefined;
        try {
            // Selected provider revisions require a current capable-worker
            // observation before admission. Keep this deterministic worker alive
            // through both revisions so it can execute the pinned jobs too.
            worker = await startDictionaryWorker();
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
            await page
                .getByRole('button', { name: 'Save configuration' })
                .click();
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
                expect(new Set(pinned.map((row) => row.revisionId)).size).toBe(
                    2,
                );
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
            page
                .getByRole('row')
                .filter({
                    hasText:
                        'Reviewed administrator cancellation in disposable E2E',
                })
                .filter({ hasText: targetEmail }),
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
            await page
                .getByRole('button', {
                    name: 'Add your first passkey',
                    exact: true,
                })
                .click();
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
