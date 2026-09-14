import {
    expect,
    test,
    type CDPSession,
    type Page,
    type TestInfo,
} from '@playwright/test';

// @user-flow-revision user-authentication sha256:ec863b74a22ad0b0

const initialPassword = 'E2e!Initial-password-2026';
const replacementPassword = 'E2e!Replacement-password-2026';
const runId =
    process.env.AUTH_E2E_RUN_ID ?? `${Date.now().toString(36)}-${process.pid}`;

function syntheticEmail(testInfo: TestInfo, journey: string): string {
    return `auth-e2e-${runId}-${testInfo.workerIndex}-${journey}@example.test`;
}

function captureBrowserErrors(
    page: Page,
    expectedFailures: Readonly<Record<string, number>> = {},
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
        const path = new URL(response.url()).pathname;
        const expected =
            (path === '/auth/refresh' && response.status() === 401) ||
            expectedFailures[path] === response.status();
        if (!expected) errors.push(`${response.status()} ${path}`);
    });
    return () => expect(errors, 'unexpected browser errors').toEqual([]);
}

async function signUpAndVerify(
    page: Page,
    email: string,
    password: string,
): Promise<void> {
    await page.goto('/signup?returnTo=%2Fsecurity');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    const createAccount = page.getByRole('button', { name: 'Create account' });
    await expect(createAccount).toBeEnabled();
    await createAccount.click();

    await expect(page).toHaveURL(/\/verify-email\?/);
    await page.getByLabel('Verification code').fill('0000');
    await page.getByRole('button', { name: 'Verify email' }).click();
    await expect(page).toHaveURL(/\/security$/);
    await expect(
        page.getByRole('heading', { name: 'Security settings' }),
    ).toBeVisible();
}

async function passwordLogin(
    page: Page,
    email: string,
    password: string,
    returnTo = '/security',
): Promise<void> {
    await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    const signIn = page.getByRole('button', { name: 'Sign in', exact: true });
    await expect(signIn).toBeEnabled();
    await signIn.click();
}

async function addVirtualAuthenticator(page: Page): Promise<{
    authenticatorId: string;
    client: CDPSession;
}> {
    const client = await page.context().newCDPSession(page);
    await client.send('WebAuthn.enable');
    const { authenticatorId } = await client.send(
        'WebAuthn.addVirtualAuthenticator',
        {
            options: {
                automaticPresenceSimulation: true,
                hasResidentKey: true,
                hasUserVerification: true,
                isUserVerified: true,
                protocol: 'ctap2',
                transport: 'internal',
            },
        },
    );
    return { authenticatorId, client };
}

test.describe('authentication journeys', () => {
    // @user-flow user-authentication/signup-verification-refresh-logout
    test('signup, verification, refresh bootstrap, and logout', async ({
        page,
    }, testInfo) => {
        const assertNoBrowserErrors = captureBrowserErrors(page);
        const email = syntheticEmail(testInfo, 'signup');
        const response = await page.goto('/signup?returnTo=%2Fsecurity');

        await expect(
            page.getByRole('heading', { level: 1, name: 'Create an account' }),
        ).toBeVisible();
        await expect(page.getByText(/Google|Apple|Yandex|VK/)).toHaveCount(0);

        expect(response?.headers()['content-security-policy']).toContain(
            "frame-ancestors 'none'",
        );
        expect(response?.headers()['x-frame-options']).toBe('DENY');
        await expect(page.locator('meta[name="referrer"]')).toHaveAttribute(
            'content',
            'no-referrer',
        );

        await page.getByLabel('Email').fill(email);
        await page
            .getByLabel('Password', { exact: true })
            .fill(initialPassword);
        await expect(
            page.getByRole('button', { name: 'Create account' }),
        ).toBeEnabled();
        await page.getByRole('button', { name: 'Create account' }).click();
        await expect(page).toHaveURL(/\/verify-email\?/);
        await page.getByLabel('Verification code').fill('0000');
        await page.getByRole('button', { name: 'Verify email' }).click();

        await expect(page).toHaveURL(/\/security$/);
        await expect(
            page.getByRole('heading', { name: 'Account' }),
        ).toBeVisible();
        await page.reload();
        await expect(
            page.getByRole('heading', { name: 'Account' }),
        ).toBeVisible();
        await expect(page.locator('dd', { hasText: email })).toBeVisible();
        expect(
            await page.evaluate(() => ({
                local: Object.keys(localStorage),
                session: Object.keys(sessionStorage),
            })),
        ).toEqual({ local: [], session: [] });
        expect(page.url()).not.toContain('token');

        await page.getByRole('button', { name: 'Sign out here' }).click();
        await expect(page).toHaveURL(/\/login$/);
        await page.reload();
        await expect(
            page.getByRole('heading', { name: 'Sign in' }),
        ).toBeVisible();
        assertNoBrowserErrors();
    });

    // @user-flow user-authentication/password-reset-session-revocation
    test('password reset revokes old credentials and sessions', async ({
        browser,
        page,
    }, testInfo) => {
        const assertNoBrowserErrors = captureBrowserErrors(page);
        const email = syntheticEmail(testInfo, 'reset');
        await signUpAndVerify(page, email, initialPassword);

        const secondContext = await browser.newContext({
            baseURL: testInfo.project.use.baseURL as string,
        });
        const secondPage = await secondContext.newPage();
        const assertNoSecondPageErrors = captureBrowserErrors(secondPage, {
            '/auth/login/password': 401,
        });
        try {
            await passwordLogin(secondPage, email, initialPassword);
            await expect(secondPage).toHaveURL(/\/security$/);

            await page.goto('/forgot-password');
            await page.getByLabel('Email').fill(email);
            const requestCode = page.getByRole('button', {
                name: 'Send recovery code',
            });
            await expect(requestCode).toBeEnabled();
            await requestCode.click();
            await expect(page).toHaveURL(/\/reset-password\?flowId=/);
            await page.getByLabel('Recovery code').fill('0000');
            await page
                .getByLabel('New password', { exact: true })
                .fill(replacementPassword);
            await page.getByRole('button', { name: 'Change password' }).click();
            await expect(page).toHaveURL(/\/login\?passwordReset=complete$/);

            await secondPage.reload();
            await expect(secondPage).toHaveURL(
                /\/login\?returnTo=%2Fsecurity$/,
            );
            await secondPage.getByLabel('Email').fill(email);
            await secondPage
                .getByLabel('Password', { exact: true })
                .fill(initialPassword);
            await secondPage
                .getByRole('button', { name: 'Sign in', exact: true })
                .click();
            await expect(secondPage.getByRole('alert')).toBeVisible();
            await expect(secondPage).toHaveURL(/\/login/);

            await secondPage
                .getByLabel('Password', { exact: true })
                .fill(replacementPassword);
            await secondPage
                .getByRole('button', { name: 'Sign in', exact: true })
                .click();
            await expect(secondPage).toHaveURL(/\/security$/);
            await expect(
                secondPage.locator('dd', { hasText: email }),
            ).toBeVisible();
            await secondPage
                .getByRole('button', { name: 'Sign out here' })
                .click();
            await expect(secondPage).toHaveURL(/\/login$/);
            assertNoSecondPageErrors();
        } finally {
            await secondContext.close();
        }
        assertNoBrowserErrors();
    });

    // @user-flow user-authentication/passkey-lifecycle
    test('passkey enrollment, failed assertion, login, rename, and removal', async ({
        page,
    }, testInfo) => {
        const assertNoBrowserErrors = captureBrowserErrors(page, {
            '/auth/passkeys/authentication/verify': 400,
        });
        const email = syntheticEmail(testInfo, 'passkey');
        const passkeyName = 'E2E platform passkey';
        const renamedPasskeyName = 'Renamed E2E passkey';
        const { authenticatorId, client } = await addVirtualAuthenticator(page);

        await signUpAndVerify(page, email, initialPassword);
        await page.getByLabel('Passkey name').fill(passkeyName);
        const addPasskey = page.getByRole('button', { name: 'Add passkey' });
        await expect(addPasskey).toBeEnabled();
        await addPasskey.click();
        await expect(page.getByText('Passkey added.')).toBeVisible();
        await expect(
            page.getByText(passkeyName, { exact: true }),
        ).toBeVisible();

        await page.getByRole('button', { name: 'Sign out here' }).click();
        await expect(page).toHaveURL(/\/login$/);
        await client.send('WebAuthn.setResponseOverrideBits', {
            authenticatorId,
            isBogusSignature: true,
        });
        await page
            .getByRole('button', { name: 'Sign in with a passkey' })
            .click();
        await expect(
            page.getByText('The passkey could not be verified.', {
                exact: true,
            }),
        ).toBeVisible();
        await expect(page).toHaveURL(/\/login$/);

        await client.send('WebAuthn.setResponseOverrideBits', {
            authenticatorId,
            isBogusSignature: false,
        });
        await page
            .getByRole('button', { name: 'Sign in with a passkey' })
            .click();
        await expect(page).toHaveURL(/\/$/);
        await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
        await page.getByRole('link', { name: 'Security settings' }).click();

        await page
            .getByRole('button', { name: `Rename ${passkeyName}` })
            .click();
        await page.getByLabel('New passkey name').fill(renamedPasskeyName);
        await page.getByRole('button', { name: `Save ${passkeyName}` }).click();
        await expect(
            page.getByText(renamedPasskeyName, { exact: true }),
        ).toBeVisible();
        await page
            .getByRole('button', { name: `Remove ${renamedPasskeyName}` })
            .click();
        await page
            .getByRole('button', {
                name: `Confirm remove ${renamedPasskeyName}`,
            })
            .click();
        await expect(page.getByText('No passkeys yet.')).toBeVisible();
        assertNoBrowserErrors();
    });
});
