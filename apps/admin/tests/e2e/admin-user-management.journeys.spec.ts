import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    expect,
    test,
    type APIRequestContext,
    type CDPSession,
    type Page,
} from '@playwright/test';
import postgres from 'postgres';

// @user-flow-revision admin-user-management sha256:7cd7a676cf5edf65

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
            await page.goto(`${webOrigin}/login?returnTo=%2Fsecurity`);
            await page.getByLabel('Email').fill(ownerEmail);
            await page.locator('input[name="password"]').fill(ownerPassword);
            await page
                .getByRole('button', { name: 'Sign in', exact: true })
                .click();
            await expect(page).toHaveURL(/\/security$/);
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
