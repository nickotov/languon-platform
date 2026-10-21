import { expect, test, type Page, type TestInfo } from '@playwright/test';

// @user-flow-revision sidebar-navigation sha256:030165acd42957c3

const api = 'http://127.0.0.1:4005';
const runId = process.env.AUTH_E2E_RUN_ID ?? 'local';

async function signup(page: Page, info: TestInfo, role: string) {
    await page.goto('/signup?returnTo=%2F');
    await page
        .getByLabel('Email')
        .fill(`sidebar-${runId}-${info.workerIndex}-${role}@example.test`);
    await page
        .getByLabel('Password', { exact: true })
        .fill('Synthetic sidebar password 47!');
    await page
        .getByRole('button', { name: 'Create account', exact: true })
        .click();
    await page.getByLabel('Verification code').fill('0000');
    const verified = page.waitForResponse(
        (response) =>
            response.url().endsWith('/auth/email-verification/verify') &&
            response.status() === 200,
    );
    await page
        .getByRole('button', { name: 'Verify email', exact: true })
        .click();
    const { accessToken } = await (await verified).json();
    await expect(page).toHaveURL(/\/$/);
    const headers = { Authorization: `Bearer ${accessToken}` };
    page.on('request', (request) => {
        const authorization = request.headers()['authorization'];
        if (authorization?.startsWith('Bearer '))
            headers.Authorization = authorization;
    });
    return headers;
}

function observe(page: Page) {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        if (
            message.type() === 'error' &&
            !message.text().startsWith('Failed to load resource:')
        )
            errors.push(message.text());
    });
    page.on('requestfailed', (request) => {
        if (!request.failure()?.errorText.includes('ERR_ABORTED'))
            errors.push(
                `${request.method()} ${new URL(request.url()).pathname} ${request.failure()?.errorText}`,
            );
    });
    page.on('response', (response) => {
        const url = new URL(response.url());
        const expectedGuestRefresh =
            response.status() === 401 && url.pathname.endsWith('/auth/refresh');
        if (response.status() >= 400 && !expectedGuestRefresh)
            errors.push(`${response.status()} ${url.pathname}`);
    });
    return () => expect(errors).toEqual([]);
}

async function capture(page: Page, info: TestInfo, name: string) {
    const path = info.outputPath(`${name}.png`);
    await page.screenshot({ path, fullPage: true });
    await info.attach(name, { path, contentType: 'image/png' });
}

async function search(page: Page) {
    await page
        .getByRole('button', { name: 'Search', exact: true })
        .filter({ visible: true })
        .first()
        .click();
    return page.getByRole('dialog').filter({ has: page.getByRole('combobox') });
}

async function dictionary(
    page: Page,
    headers: Record<string, string>,
    name: string,
) {
    const response = await page.request.post(`${api}/dictionaries`, {
        headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
        data: { name, sourceLanguage: 'en', targetLanguage: 'es' },
    });
    expect(response.status(), await response.text()).toBe(201);
    return (await response.json()).dictionary as { id: string; name: string };
}

// @user-flow sidebar-navigation/owned-title-search-and-synced-navigation
test('owned title search reaches unopened resources and pins and recents sync across contexts', async ({
    page,
    browser,
}, info) => {
    const assertErrors = observe(page);
    const headers = await signup(page, info, 'search-owner');
    const resources = [];
    for (let index = 0; index < 7; index++)
        resources.push(
            await dictionary(page, headers, `Owned shelf ${index} ${runId}`),
        );
    const target = resources[0]!;
    await page.reload();
    const sidebar = page.getByRole('complementary', {
        name: 'Application sidebar',
    });
    const dictionarySection = sidebar
        .getByRole('link', { name: 'Dictionaries', exact: true })
        .locator('xpath=ancestor::li[1]');
    await expect(
        dictionarySection.getByRole('link', { name: /Owned shelf/ }),
    ).toHaveCount(5);
    const fallback = await page.request.get(
        `${api}/navigation/resources?kind=dictionary&limit=5`,
        { headers },
    );
    expect(fallback.status(), await fallback.text()).toBe(200);
    const fallbackResources = (await fallback.json()).resources;
    expect(fallbackResources).toHaveLength(5);
    expect(
        fallbackResources.every(
            (resource: { lastOpenedAt: string | null }) =>
                resource.lastOpenedAt === null,
        ),
    ).toBe(true);
    await expect(sidebar.getByRole('link', { name: target.name })).toHaveCount(
        0,
    );
    const initiallyRecent = await page.request.get(`${api}/navigation/recent`, {
        headers,
    });
    expect(initiallyRecent.status()).toBe(200);
    expect((await initiallyRecent.json()).resources).toEqual([]);
    const privateTextTitle = `Private independent passage ${runId}`;
    const textResponse = await page.request.post(`${api}/texts`, {
        headers,
        data: {
            folderId: null,
            title: privateTextTitle,
            sourceText: 'Hello world.',
            sourceLanguage: 'en',
            targetLanguage: 'es',
        },
    });
    expect(textResponse.status(), await textResponse.text()).toBe(201);
    const draftResponse = await page.request.post(`${api}/knowledge/drafts`, {
        headers,
        data: { operationId: crypto.randomUUID() },
    });
    expect(draftResponse.status(), await draftResponse.text()).toBe(201);
    const { workspace } = await draftResponse.json();
    const branch = workspace.branches.find(
        (item: { id: string }) => item.id === workspace.preferredBranchId,
    );
    const privateNoteTitle = `Private research notebook ${runId}`;
    const updatedDraft = await page.request.patch(
        `${api}/knowledge/${workspace.noteId}/working`,
        {
            headers,
            data: {
                operationId: crypto.randomUUID(),
                branchId: branch.id,
                expectedVersion: branch.version,
                content: { ...branch.content, title: privateNoteTitle },
            },
        },
    );
    expect(updatedDraft.status(), await updatedDraft.text()).toBe(200);
    const palette = await search(page);
    await palette.getByRole('combobox').fill(privateTextTitle);
    await expect(
        palette.getByRole('row', { name: privateTextTitle }),
    ).toBeVisible();
    await palette.getByRole('combobox').fill(privateNoteTitle);
    await expect(
        palette.getByRole('row', { name: privateNoteTitle }),
    ).toBeVisible();
    await palette.getByRole('combobox').fill(`SHELF 0 ${runId}`);
    const result = palette
        .getByRole('row', {
            name: target.name,
        })
        .getByRole('button')
        .first();
    await expect(result).toBeVisible();
    // Search and prefetch must not fabricate an actual open.
    await result.hover();
    const beforeOpen = await page.request.get(`${api}/navigation/recent`, {
        headers,
    });
    expect((await beforeOpen.json()).resources).toEqual([]);
    await capture(page, info, 'sidebar-owned-whole-library-search');
    await result.click();
    await expect(page).toHaveURL(new RegExp(`/dictionaries/${target.id}$`));
    await expect(
        page.getByRole('heading', { name: target.name, exact: true }),
    ).toBeVisible();
    await expect
        .poll(async () => {
            const response = await page.request.get(
                `${api}/navigation/recent`,
                { headers },
            );
            return (await response.json()).resources[0]?.id;
        })
        .toBe(target.id);
    await sidebar.getByRole('link', { name: 'Home', exact: true }).click();
    const shortcut = sidebar.getByRole('link', {
        name: target.name,
    });
    await expect(shortcut).toBeVisible();
    const row = shortcut.locator('..');
    await row.getByRole('button', { name: /Resource actions/ }).click();
    await page.getByRole('menuitem', { name: 'Pin', exact: true }).click();
    const second = await browser.newContext({
        baseURL: 'http://localhost:3335',
        viewport: { width: 1440, height: 1000 },
    });
    const otherDevice = await second.newPage();
    const assertSecondErrors = observe(otherDevice);
    await otherDevice.goto('/login?returnTo=%2F');
    await otherDevice
        .getByLabel('Email')
        .fill(`sidebar-${runId}-${info.workerIndex}-search-owner@example.test`);
    await otherDevice
        .getByLabel('Password', { exact: true })
        .fill('Synthetic sidebar password 47!');
    await otherDevice
        .getByRole('button', { name: 'Sign in', exact: true })
        .click();
    await expect(otherDevice).toHaveURL(/\/$/);
    const otherSidebar = otherDevice.getByRole('complementary', {
        name: 'Application sidebar',
    });
    const synced = otherSidebar.getByRole('link', {
        name: target.name,
    });
    await expect(synced).toBeVisible();
    await synced
        .locator('..')
        .getByRole('button', { name: /Resource actions/ })
        .click();
    await expect(
        otherDevice.getByRole('menuitem', { name: 'Unpin', exact: true }),
    ).toBeVisible();
    await otherDevice
        .getByRole('menuitem', { name: 'Unpin', exact: true })
        .click();
    await page.reload();
    await shortcut
        .locator('..')
        .getByRole('button', { name: /Resource actions/ })
        .click();
    await expect(
        page.getByRole('menuitem', { name: 'Pin', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    assertSecondErrors();
    await second.close();
    const isolated = await browser.newContext({
        baseURL: 'http://localhost:3335',
    });
    const stranger = await isolated.newPage();
    await signup(stranger, info, 'search-stranger');
    const strangerSearch = await search(stranger);
    const isolatedResults = stranger.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
            response.status() === 200 &&
            url.pathname.endsWith('/navigation/resources') &&
            url.searchParams.get('q') === target.name
        );
    });
    await strangerSearch.getByRole('combobox').fill(target.name);
    await isolatedResults;
    await expect(
        strangerSearch.getByRole('row', { name: target.name }),
    ).toHaveCount(0);
    await isolated.close();
    assertErrors();
});

// @user-flow sidebar-navigation/responsive-sidebar-and-keyboard-flyouts
test('contextual sidebar renders its source geometry and accessible rail and drawers', async ({
    page,
}, info) => {
    const assertErrors = observe(page);
    const headers = await signup(page, info, 'responsive-owner');
    const item = await dictionary(
        page,
        headers,
        `Visible rail resource ${runId}`,
    );
    await page.goto(`/dictionaries/${item.id}`);
    await expect(
        page.getByRole('heading', { name: item.name, exact: true }),
    ).toBeVisible();
    await page.goto('/');
    const sidebar = page.getByRole('complementary', {
        name: 'Application sidebar',
    });
    await expect
        .poll(async () => (await sidebar.boundingBox())?.width)
        .toBe(240);
    await expect(
        sidebar.getByRole('link', { name: 'Home', exact: true }),
    ).toBeVisible();
    await expect(sidebar.getByText('Lessons', { exact: true })).toHaveCount(0);
    await expect(sidebar.getByText('Courses', { exact: true })).toHaveCount(0);
    await expect
        .poll(() =>
            sidebar.evaluate(
                (element) => element.scrollWidth <= element.clientWidth + 1,
            ),
        )
        .toBe(true);
    await capture(page, info, 'sidebar-expanded-1440');
    await sidebar
        .getByRole('button', { name: 'Create new', exact: true })
        .first()
        .click();
    await expect(
        page.getByRole('menuitem', { name: 'New dictionary', exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole('menuitem', {
            name: 'New knowledge document',
            exact: true,
        }),
    ).toBeVisible();
    await capture(page, info, 'sidebar-unified-create-menu');
    await page.getByRole('menuitem', { name: 'New text', exact: true }).click();
    const destination = page.getByRole('dialog', {
        name: 'New text',
        exact: true,
    });
    await expect(
        destination.getByLabel('Destination', { exact: true }),
    ).toHaveValue('');
    await destination
        .getByRole('button', { name: 'Cancel', exact: true })
        .click();
    await sidebar.getByRole('button', { name: /Account menu/ }).click();
    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await capture(page, info, 'sidebar-expanded-dark-1440');
    await sidebar.getByRole('button', { name: /Account menu/ }).click();
    await page.getByRole('button', { name: 'Light', exact: true }).click();
    await page.keyboard.press('Escape');
    await page
        .getByRole('button', { name: 'Collapse sidebar', exact: true })
        .click();
    await expect
        .poll(async () => (await sidebar.boundingBox())?.width)
        .toBe(64);
    const brandMark = sidebar
        .getByRole('link', { name: 'Languon home', exact: true })
        .locator('span')
        .first();
    await expect
        .poll(async () => {
            const [rail, mark] = await Promise.all([
                sidebar.boundingBox(),
                brandMark.boundingBox(),
            ]);
            return rail && mark
                ? Math.abs(rail.x + rail.width / 2 - (mark.x + mark.width / 2))
                : Infinity;
        })
        .toBeLessThanOrEqual(1);
    await sidebar.getByRole('link', { name: 'Home', exact: true }).hover();
    await expect(
        page.getByRole('tooltip', { name: 'Home', exact: true }),
    ).toBeVisible();
    await sidebar
        .getByRole('button', { name: 'Create new', exact: true })
        .hover();
    await expect(
        page.getByRole('tooltip', { name: 'Create new', exact: true }),
    ).toBeVisible();
    const trigger = sidebar.getByRole('button', {
        name: 'Dictionaries',
        exact: true,
    });
    await trigger.focus();
    await trigger.press('Enter');
    const flyout = page.getByRole('dialog', {
        name: 'Dictionaries',
        exact: true,
    });
    await expect(flyout).toBeVisible();
    await flyout.getByRole('textbox').fill('Visible rail');
    await expect(flyout.getByRole('link', { name: item.name })).toBeVisible();
    await flyout
        .getByRole('button', {
            name: `Resource actions: ${item.name}`,
            exact: true,
        })
        .click();
    await page.getByRole('menuitem', { name: 'Pin', exact: true }).click();
    await expect(flyout).toBeVisible();
    await flyout
        .getByRole('button', {
            name: `Resource actions: ${item.name}`,
            exact: true,
        })
        .click();
    await expect(
        page.getByRole('menuitem', { name: 'Unpin', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(flyout).toBeVisible();
    await capture(page, info, 'sidebar-rail-flyout-1440');
    await page.keyboard.press('Escape');
    await expect(flyout).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await page.setViewportSize({ width: 900, height: 1000 });
    await expect
        .poll(async () => (await sidebar.boundingBox())?.width)
        .toBe(64);
    await page
        .getByRole('button', { name: 'Expand sidebar', exact: true })
        .click();
    const drawer = page.getByRole('dialog', {
        name: 'Main navigation',
        exact: true,
    });
    await expect(drawer).toBeVisible();
    await capture(page, info, 'sidebar-tablet-drawer-900');
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    const open = page.getByRole('button', {
        name: 'Open navigation',
        exact: true,
    });
    await open.click();
    await expect(drawer).toBeVisible();
    await expect
        .poll(
            async () =>
                (
                    await drawer
                        .getByRole('region', { name: 'Application sidebar' })
                        .boundingBox()
                )?.width,
        )
        .toBe(320);
    await expect(
        drawer.getByRole('button', { name: 'Search', exact: true }),
    ).toBeVisible();
    for (const label of [
        'New dictionary',
        'Hide recent: Dictionaries',
        `Resource actions: ${item.name}`,
    ]) {
        const touchAction = drawer.getByRole('button', {
            name: label,
            exact: true,
        });
        await expect
            .poll(async () => {
                const box = await touchAction.boundingBox();
                return Boolean(box && box.width >= 44 && box.height >= 44);
            })
            .toBe(true);
    }
    await expect
        .poll(() =>
            drawer
                .getByRole('region', { name: 'Application sidebar' })
                .evaluate(
                    (element) => element.scrollWidth <= element.clientWidth + 1,
                ),
        )
        .toBe(true);
    await expect
        .poll(() =>
            page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
        )
        .toBe(true);
    await capture(page, info, 'sidebar-mobile-drawer-390');
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
    await expect(open).toBeFocused();
    assertErrors();
});
