// @user-flow-revision contextual-language-assistant-and-knowledge sha256:cf08a97114c6b3f5
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
    expect,
    test,
    type Page,
    type TestInfo,
    type Request,
    type Browser,
    type Locator,
} from '@playwright/test';
import type {
    ConversationDetail,
    Conversation,
    KnowledgeNote,
    TextFolder,
    TextDocument,
    OwnedDictionary,
    DictionaryCardResponse,
} from '@languon/contracts';

const liveTokens = new WeakMap<Page, string>();

test('editor and real tutor collapse the sidebar below 1280 and preserve explicit expansion', async ({
    page,
}, info) => {
    const assertClean = runtimeErrors(page);
    const httpFailures: string[] = [];
    const turnRequests: string[] = [];
    page.on('response', (response) => {
        const path = new URL(response.url()).pathname;
        if (
            response.status() >= 400 &&
            !(response.status() === 401 && path.endsWith('/auth/refresh'))
        )
            httpFailures.push(`${response.status()} ${path}`);
    });
    page.on('request', (request) => {
        const path = new URL(request.url()).pathname;
        if (
            request.method() === 'POST' &&
            /\/conversations\/[^/]+\/turns$/.test(path)
        )
            turnRequests.push(path);
    });
    await page.setViewportSize({ width: 1200, height: 1000 });
    const token = await signup(page, info);
    const { text } = await api(page, token, '/texts', {
        folderId: null,
        title: 'Independent tutor layout',
        sourceText: 'We rested on the bank.',
        sourceLanguage: 'en',
        targetLanguage: 'es',
    });
    await page.goto(`/texts/${text.id}`);
    await expect(page.getByLabel('Source text', { exact: true })).toHaveValue(
        'We rested on the bank.',
    );
    const sidebar = page.getByRole('complementary', {
        name: 'Application sidebar',
        exact: true,
    });
    await expect
        .poll(async () => (await sidebar.boundingBox())?.width)
        .toBe(240);
    const created = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            new URL(response.url()).pathname.endsWith('/conversations') &&
            response.status() === 200,
    );
    await page.getByRole('button', { name: /^Open language tutor/u }).click();
    const { conversation } = await (await created).json();
    const tutor = page.getByRole('region', {
        name: 'Language tutor',
        exact: true,
    });
    await expect(tutor).toBeVisible();
    await expect(page.getByLabel('Your question')).toBeEnabled();
    await expect
        .poll(async () => (await sidebar.boundingBox())?.width)
        .toBe(64);
    await noOverflow(page);
    await capture(page, info, 'sidebar-editor-tutor-auto-rail-1200');
    await sidebar
        .getByRole('button', { name: 'Expand sidebar', exact: true })
        .click();
    await expect
        .poll(async () => (await sidebar.boundingBox())?.width)
        .toBe(240);
    await expect(tutor).toBeVisible();
    await page.setViewportSize({ width: 1180, height: 1000 });
    await expect
        .poll(async () => (await sidebar.boundingBox())?.width)
        .toBe(240);
    await expect(tutor).toBeVisible();
    await noOverflow(page);
    await capture(page, info, 'sidebar-editor-tutor-explicit-expanded-1180');
    const detail = await api(page, token, `/conversations/${conversation.id}`);
    expect(detail.turns).toEqual([]);
    expect(turnRequests).toEqual([]);
    expect(httpFailures).toEqual([]);
    assertClean();
});

async function signup(page: Page, info: TestInfo) {
    page.on('response', async (response) => {
        if (
            response.status() === 200 &&
            /\/auth\/(refresh|email-verification\/verify)$/u.test(
                new URL(response.url()).pathname,
            )
        ) {
            const payload = (await response.json()) as {
                accessToken?: unknown;
            };
            if (typeof payload.accessToken === 'string')
                liveTokens.set(page, payload.accessToken);
        }
    });
    await page.goto('/signup?returnTo=%2Ftexts');
    await page
        .getByLabel('Email')
        .fill(`assistant-${Date.now()}-${info.workerIndex}@example.test`);
    await page
        .getByLabel('Password', { exact: true })
        .fill('Synthetic assistant password 47!');
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
    const token = ((await (await verified).json()) as { accessToken: string })
        .accessToken;
    await expect(page).toHaveURL(/\/texts$/);
    return token;
}
function runtimeErrors(page: Page) {
    const failures: string[] = [];
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('console', (message) => {
        if (
            message.type() === 'error' &&
            !message.text().startsWith('Failed to load resource:')
        )
            failures.push(message.text());
    });
    page.on('requestfailed', (request) => {
        if (!request.failure()?.errorText.includes('ERR_ABORTED'))
            failures.push(
                `${request.method()} ${new URL(request.url()).pathname}: ${request.failure()?.errorText}`,
            );
    });
    page.on('response', (response) => {
        if (
            [
                'model-unavailable',
                'preference-update-unavailable',
                'defaults-update-unavailable',
            ].includes(response.headers()['x-synthetic-scenario'] ?? '') &&
            response.status() === 503
        )
            return;
        if (
            response.url().includes('/events?') &&
            response.headers()['content-encoding']
        )
            failures.push(
                'Conversation SSE must remain uncompressed for incremental proxy delivery.',
            );
        if (response.status() >= 500)
            failures.push(
                `${response.status()} ${new URL(response.url()).pathname}`,
            );
    });
    return () => expect(failures).toEqual([]);
}
async function api(
    page: Page,
    token: string,
    path: string,
    body?: unknown,
    method = body === undefined ? 'GET' : 'POST',
) {
    const response = await page.request.fetch(`/api${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${liveTokens.get(page) ?? token}`,
            Origin: 'http://localhost:3336',
            ...(path === '/dictionaries' && method === 'POST'
                ? { 'Idempotency-Key': `assistant-${crypto.randomUUID()}` }
                : {}),
        },
        ...(body === undefined ? {} : { data: body }),
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
}
async function source(page: Page, token: string, info: TestInfo) {
    const { folder } = (await api(page, token, '/text-folders', {
        name: 'River reading',
    })) as { folder: TextFolder };
    const { text } = (await api(page, token, '/texts', {
        folderId: folder.id,
        sourceText: 'We rested on the bank.',
        sourceLanguage: 'en',
        targetLanguage: 'es',
    })) as { text: TextDocument };
    const conversationRequests: { path: string; method: string }[] = [];
    function observeConversation(request: Request) {
        const path = new URL(request.url()).pathname;
        if (
            path === '/api/conversations' ||
            path.startsWith('/api/conversations/')
        )
            conversationRequests.push({ path, method: request.method() });
    }
    page.on('request', observeConversation);
    await page.goto(`/texts/folders/${folder.id}/texts/${text.id}`);
    const launcher = page.getByRole('button', {
        name: /^Open language tutor/u,
    });
    await expect(launcher).toBeVisible();
    await expect(
        page.getByRole('region', { name: 'Language tutor', exact: true }),
    ).toHaveCount(0);
    const launchBounds = (await launcher.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(launchBounds.x + launchBounds.width / 2).toBeGreaterThan(
        viewport.width / 2,
    );
    expect(launchBounds.y + launchBounds.height / 2).toBeGreaterThan(
        viewport.height / 2,
    );
    expect(
        Math.abs(launchBounds.width - launchBounds.height),
    ).toBeLessThanOrEqual(1);
    await expect(launcher.locator('svg').first()).toBeVisible();
    if (viewport.width > 768) {
        await launcher.hover();
        await expect(
            page.getByRole('tooltip', { name: 'AI Tutor', exact: true }),
        ).toBeVisible();
        await page.mouse.move(0, 0);
    }
    await capture(page, info, `tutor-initial-pill-${viewport.width}`);
    expect(conversationRequests).toEqual([]);

    await launcher.focus();
    await launcher.press('Enter');
    const openedTutor = page.getByRole('region', {
        name: 'Language tutor',
        exact: true,
    });
    await expect(openedTutor).toBeVisible();
    await expect
        .poll(() =>
            openedTutor.evaluate((element) =>
                element.contains(document.activeElement),
            ),
        )
        .toBe(true);
    await expect(page.getByLabel('Your question')).toBeEnabled();
    await expect
        .poll(() =>
            conversationRequests.some(
                (request) =>
                    request.path === '/api/conversations' &&
                    request.method === 'GET',
            ),
        )
        .toBe(true);
    page.off('request', observeConversation);
    return text;
}
async function send(page: Page, content: string) {
    await page.getByLabel('Your question').fill(content);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
}
async function noOverflow(page: Page) {
    await expect
        .poll(() =>
            page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth + 1,
            ),
        )
        .toBe(true);
}
async function capture(page: Page, info: TestInfo, name: string) {
    const path = info.outputPath(`${name}.png`);
    await page.screenshot({ path, fullPage: true, animations: 'disabled' });
    await info.attach(name, { path, contentType: 'image/png' });
    if (process.env.TUTOR_DESIGN_EVIDENCE === 'true') {
        const directory = resolve(
            process.cwd(),
            '../../.agent/improvements/contextual-tutor-widget-polish-evidence',
        );
        await mkdir(directory, { recursive: true });
        await copyFile(path, resolve(directory, `${name}.png`));
    }
}

/** A second real authorized subscription measures proxy delivery before UI smoothing. */
async function observeWire(page: Page, token: string, conversationId: string) {
    const { ConversationEventSchema } = await import('@languon/contracts');
    const controller = new AbortController();
    const samples: { at: number; text: string }[] = [];
    let ready!: () => void;
    let rejected!: (error: unknown) => void;
    const initial = new Promise<void>((resolve, reject) => {
        ready = resolve;
        rejected = reject;
    });
    let failure: unknown;
    const done = (async () => {
        const response = await fetch(
            `http://localhost:3336/api/conversations/${conversationId}/events?after=0`,
            {
                headers: {
                    Authorization: `Bearer ${liveTokens.get(page) ?? token}`,
                    Origin: 'http://localhost:3336',
                },
                signal: AbortSignal.any([
                    controller.signal,
                    AbortSignal.timeout(30_000),
                ]),
            },
        );
        if (!response.ok || !response.body)
            throw new Error(`Wire observation rejected: ${response.status}`);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const at = performance.now();
                buffer += decoder
                    .decode(value, { stream: true })
                    .replace(/\r\n/gu, '\n');
                let end: number;
                while ((end = buffer.indexOf('\n\n')) !== -1) {
                    const frame = buffer.slice(0, end);
                    buffer = buffer.slice(end + 2);
                    if (
                        !frame
                            .split('\n')
                            .some((line) => line === 'event: conversation')
                    )
                        continue;
                    const data = frame
                        .split('\n')
                        .filter((line) => line.startsWith('data:'))
                        .map((line) => line.slice(5).trimStart())
                        .join('\n');
                    const event = ConversationEventSchema.parse(
                        JSON.parse(data),
                    );
                    if (event.type === 'snapshot') ready();
                    if (
                        event.type !== 'message' ||
                        event.data.role !== 'assistant' ||
                        !event.data.content
                    )
                        continue;
                    if (event.data.content !== samples.at(-1)?.text)
                        samples.push({ at, text: event.data.content });
                }
            }
        } finally {
            await reader.cancel().catch(() => {});
            reader.releaseLock();
        }
    })().catch((error: unknown) => {
        if (!controller.signal.aborted) {
            failure = error;
            rejected(error);
        }
    });
    try {
        await initial;
    } catch (error) {
        controller.abort();
        await done;
        throw error;
    }
    return {
        samples,
        async close() {
            controller.abort();
            await done;
            if (failure) throw failure;
        },
    };
}

/** Observe rendered output rather than network chunks or internal React state. */
async function observeStreaming(page: Page) {
    await page
        .getByRole('region', { name: 'Language tutor', exact: true })
        .evaluate((element) => {
            type Sample = { at: number; text: string; activity: string | null };
            const root = element as HTMLElement & {
                streamingEvidence?: {
                    samples: Sample[];
                    observer: MutationObserver;
                };
            };
            const samples: Sample[] = [];
            const collect = () => {
                const text = Array.from(
                    root.querySelectorAll('[data-assistant-content]'),
                )
                    .map((content) => content.textContent ?? '')
                    .join('');
                const activity =
                    root
                        .querySelector('[data-tutor-activity]')
                        ?.getAttribute('data-tutor-activity') ?? null;
                const previous = samples.at(-1);
                if (
                    !previous ||
                    previous.text !== text ||
                    previous.activity !== activity
                )
                    samples.push({ at: performance.now(), text, activity });
            };
            const observer = new MutationObserver(collect);
            observer.observe(root, {
                subtree: true,
                childList: true,
                characterData: true,
                attributes: true,
                attributeFilter: ['data-tutor-activity'],
            });
            root.streamingEvidence = { samples, observer };
            collect();
        });
}
async function streamingEvidence(page: Page) {
    return page
        .getByRole('region', { name: 'Language tutor', exact: true })
        .evaluate((element) => {
            const root = element as HTMLElement & {
                streamingEvidence?: {
                    samples: {
                        at: number;
                        text: string;
                        activity: string | null;
                    }[];
                    observer: MutationObserver;
                };
            };
            if (!root.streamingEvidence)
                throw new Error('Missing rendered streaming observer.');
            root.streamingEvidence.observer.disconnect();
            return root.streamingEvidence.samples;
        });
}

async function verifyPersistentTutorModes(
    page: Page,
    widget: Locator,
    token: string,
    sourceId: string,
    info: TestInfo,
) {
    const list = async () =>
        (await api(
            page,
            token,
            `/conversations?sourceKind=text&sourceId=${sourceId}`,
        )) as { conversations: Conversation[] };
    const original = (await list()).conversations[0]!;
    await api(
        page,
        token,
        `/conversations/${original.id}`,
        { title: 'Mode primary' },
        'PATCH',
    );
    const { conversation: other } = (await api(page, token, '/conversations', {
        source: { kind: 'text', id: sourceId },
    })) as { conversation: Conversation };
    await api(
        page,
        token,
        `/conversations/${other.id}`,
        { title: 'Mode control' },
        'PATCH',
    );
    const choose = async (label: string) => {
        await widget.getByRole('button', { name: /^Mode:/u }).click();
        const modes = page.getByRole('radiogroup', {
            name: 'Mode',
            exact: true,
        });
        const selected = modes.getByRole('radio', { name: label, exact: true });
        await selected.click();
        await expect(modes).toBeVisible();
        await expect(
            modes.getByRole('radio', { name: label, exact: true }),
        ).toBeEnabled();
        await expect(
            modes.getByRole('radio', { name: label, exact: true }),
        ).toBeChecked();
        await expect(selected).toBeFocused();
        expect(
            (
                (await api(
                    page,
                    token,
                    `/conversations/${original.id}`,
                )) as ConversationDetail
            ).conversation.preferences.mode,
        ).toBe(label.toLowerCase());
        await page.keyboard.press('Escape');
        await expect(
            widget.getByRole('button', { name: `Mode: ${label}`, exact: true }),
        ).toBeVisible();
    };
    const reopen = async () => {
        await page.reload();
        const launcher = page.getByRole('button', {
            name: /^Open language tutor/u,
        });
        await expect(launcher).toBeVisible();
        await launcher.click();
        await expect(widget).toBeVisible();
    };
    const select = async (title: string) => {
        await widget
            .getByRole('button', { name: 'More options', exact: true })
            .click();
        await page
            .getByRole('menuitem', {
                name: 'Conversation history',
                exact: true,
            })
            .click();
        await widget
            .getByRole('button', { name: new RegExp(`^${title}`, 'u') })
            .click();
        await expect(widget.getByLabel('Your question')).toBeVisible();
    };
    await choose('Practice');
    await widget
        .getByRole('button', { name: 'Mode: Practice', exact: true })
        .click();
    await expect(
        page
            .getByRole('radiogroup', { name: 'Mode', exact: true })
            .getByRole('radio', { name: 'Practice', exact: true }),
    ).toBeChecked();
    await page.keyboard.press('Escape');
    await reopen();
    await expect(
        widget.getByRole('button', { name: 'Mode: Practice', exact: true }),
    ).toBeVisible();
    await select('Mode control');
    await expect(
        widget.getByRole('button', { name: 'Mode: Auto', exact: true }),
    ).toBeVisible();
    await select('Mode primary');
    await widget
        .getByRole('button', { name: 'Mode: Practice', exact: true })
        .click();
    const defaultsSaved = page.waitForResponse(
        (response) =>
            response.request().method() === 'PUT' &&
            response.url().endsWith('/conversation-settings'),
    );
    await page
        .getByRole('button', { name: 'Use as my defaults', exact: true })
        .click();
    expect((await defaultsSaved).status()).toBe(200);
    await page.keyboard.press('Escape');
    await widget
        .getByRole('button', { name: 'New conversation', exact: true })
        .click();
    await expect(
        widget.getByRole('button', { name: 'Mode: Practice', exact: true }),
    ).toBeVisible();
    const inherited = (await list()).conversations.find(
        (conversation) => ![original.id, other.id].includes(conversation.id),
    )!;
    expect(inherited.preferences.mode).toBe('practice');
    await api(
        page,
        token,
        `/conversations/${inherited.id}`,
        { title: 'Mode inherited' },
        'PATCH',
    );
    await reopen();
    await select('Mode primary');
    await choose('Explain');
    await select('Mode inherited');
    await expect(
        widget.getByRole('button', { name: 'Mode: Practice', exact: true }),
    ).toBeVisible();
    expect(
        (
            (await api(
                page,
                token,
                `/conversations/${other.id}`,
            )) as ConversationDetail
        ).conversation.preferences.mode,
    ).toBe('auto');
    await select('Mode primary');
    await expect(
        widget.getByRole('button', { name: 'Mode: Explain', exact: true }),
    ).toBeVisible();
    await capture(page, info, 'tutor-persistent-modes-desktop');
    return original.id;
}

async function verifyPreferenceFailureRetries(
    page: Page,
    widget: Locator,
    token: string,
    conversationId: string,
    info: TestInfo,
) {
    let turnAdmissions = 0;
    const observe = (request: Request) => {
        if (request.method() === 'POST' && request.url().endsWith('/turns'))
            turnAdmissions += 1;
    };
    page.on('request', observe);
    const preferencePath = `/api/conversations/${conversationId}`;
    const requests: { method: string; mode: string }[] = [];
    let preferenceFails = true;
    await page.route(`**${preferencePath}`, async (route) => {
        const request = route.request();
        if (request.method() !== 'PATCH') {
            await route.continue();
            return;
        }
        requests.push({
            method: 'PATCH',
            mode: request.postDataJSON().preferences.mode,
        });
        if (!preferenceFails) {
            await route.continue();
            return;
        }
        preferenceFails = false;
        await route.fulfill({
            status: 503,
            headers: {
                'x-synthetic-scenario': 'preference-update-unavailable',
            },
            json: {
                error: {
                    code: 'service_unavailable',
                    message: 'Synthetic preference outage',
                    correlationId: 'synthetic-preference-retry',
                },
            },
        });
    });
    try {
        await widget
            .getByRole('button', { name: 'Mode: Explain', exact: true })
            .click();
        await page
            .getByRole('radiogroup', { name: 'Mode', exact: true })
            .getByRole('radio', { name: 'Correct', exact: true })
            .click();
        const failure = widget.locator(
            '[data-tutor-action-error="preferences"]',
        );
        await expect(failure).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(
            widget.getByRole('button', { name: 'Mode: Explain', exact: true }),
        ).toBeVisible();
        await failure
            .getByRole('button', { name: 'Retry settings', exact: true })
            .click();
        await expect(
            widget.getByRole('button', { name: 'Mode: Correct', exact: true }),
        ).toBeVisible();
        expect(requests).toEqual([
            { method: 'PATCH', mode: 'correct' },
            { method: 'PATCH', mode: 'correct' },
        ]);
        expect(turnAdmissions).toBe(0);
    } finally {
        await page.unroute(`**${preferencePath}`);
    }
    let defaultsFails = true;
    const defaultsRequests: string[] = [];
    await page.route('**/api/conversation-settings', async (route) => {
        const request = route.request();
        if (request.method() !== 'PUT') {
            await route.continue();
            return;
        }
        defaultsRequests.push(request.postDataJSON().preferences.mode);
        if (!defaultsFails) {
            await route.continue();
            return;
        }
        defaultsFails = false;
        await route.fulfill({
            status: 503,
            headers: { 'x-synthetic-scenario': 'defaults-update-unavailable' },
            json: {
                error: {
                    code: 'service_unavailable',
                    message: 'Synthetic defaults outage',
                    correlationId: 'synthetic-defaults-retry',
                },
            },
        });
    });
    try {
        await widget
            .getByRole('button', { name: 'Mode: Correct', exact: true })
            .click();
        await page
            .getByRole('button', { name: 'Use as my defaults', exact: true })
            .click();
        const failure = widget.locator('[data-tutor-defaults-error]');
        await expect(failure).toBeVisible();
        await page.keyboard.press('Escape');
        await failure
            .getByRole('button', { name: 'Retry settings', exact: true })
            .click();
        await expect(failure).toBeHidden();
        expect(defaultsRequests).toEqual(['correct', 'correct']);
        expect(turnAdmissions).toBe(0);
        expect(
            (await api(page, token, '/conversation-settings')).preferences.mode,
        ).toBe('correct');
        await capture(page, info, 'tutor-settings-retries-no-new-turn');
    } finally {
        await page.unroute('**/api/conversation-settings');
        page.off('request', observe);
    }
}

// @user-flow contextual-language-assistant-and-knowledge/source-chat-save-knowledge
test('saved source streams through real SDK into an editable private note and revision history', async ({
    page,
}, info) => {
    const assertClean = runtimeErrors(page);
    const token = await signup(page, info);
    const text = await source(page, token, info);
    const widget = page.getByRole('region', {
        name: 'Language tutor',
        exact: true,
    });
    await expect(widget).not.toHaveAttribute('aria-modal', 'true');
    expect(
        await widget.evaluate(
            (element) => getComputedStyle(element).animationName,
        ),
    ).not.toBe('none');
    expect(
        await widget.evaluate((element) =>
            getComputedStyle(element)
                .transitionDuration.split(',')
                .some((duration) => parseFloat(duration) > 0),
        ),
    ).toBe(true);
    const content = page.locator('[data-companion-content]').filter({
        has: page.getByRole('textbox', { name: 'Source text', exact: true }),
    });
    await expect(content).toHaveCount(1);
    await expect(widget.locator('..')).toHaveAttribute('data-attached', 'true');
    await expect
        .poll(async () => {
            const sourceBounds = (await content.boundingBox())!;
            const tutorBounds = (await widget.boundingBox())!;
            return tutorBounds.x >= sourceBounds.x + sourceBounds.width - 1;
        })
        .toBe(true);
    await capture(page, info, 'tutor-attached-text-desktop');
    const defaultTutorWidth = (await widget.boundingBox())!.width;
    const companionLayout = content.locator('..');
    await widget
        .getByRole('button', { name: 'More options', exact: true })
        .click();
    const halfWidth = page.getByRole('menuitemcheckbox', {
        name: 'Half-width chat (50%)',
        exact: true,
    });
    await expect(halfWidth).toHaveAttribute('aria-checked', 'false');
    await halfWidth.click();
    await expect(halfWidth).toHaveAttribute('aria-checked', 'true');
    await expect(companionLayout).toHaveAttribute('data-half-width', 'true');
    await expect
        .poll(async () => {
            const layoutBounds = (await companionLayout.boundingBox())!;
            const contentBounds = (await content.boundingBox())!;
            const tutorBounds = (await widget.boundingBox())!;
            return Math.max(
                Math.abs(contentBounds.width - tutorBounds.width),
                Math.max(
                    0,
                    tutorBounds.x +
                        tutorBounds.width -
                        layoutBounds.x -
                        layoutBounds.width,
                ),
            );
        })
        .toBeLessThan(3);
    await capture(page, info, 'tutor-attached-half-width-desktop');
    await page.keyboard.press('Escape');
    const retainedQuestion = 'Keep my draft while changing chat placement';
    await widget.getByLabel('Your question').fill(retainedQuestion);
    await widget
        .getByRole('button', { name: 'More options', exact: true })
        .click();
    await page
        .getByRole('menuitemcheckbox', { name: 'Detached chat', exact: true })
        .click();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(widget.locator('..')).toHaveAttribute(
        'data-attached',
        'false',
    );
    await expect(widget.getByLabel('Your question')).toHaveValue(
        retainedQuestion,
    );
    await expect
        .poll(async () => Math.round((await widget.boundingBox())!.height))
        .toBe(960);
    await expect
        .poll(async () => Math.round((await widget.boundingBox())!.width))
        .toBe(420);
    const right = (await widget.boundingBox())!.x;
    await widget
        .getByRole('button', { name: 'More options', exact: true })
        .click();
    await capture(page, info, 'tutor-menu-desktop');
    await page
        .getByRole('menuitem', { name: 'Move to upper left', exact: true })
        .click();
    await expect
        .poll(async () => (await widget.boundingBox())!.x)
        .toBeLessThan(right);
    const sidebarOffset = await widget.evaluate(
        (element) =>
            parseFloat(
                getComputedStyle(element).getPropertyValue(
                    '--app-sidebar-width',
                ),
            ) || 0,
    );
    expect(Math.round((await widget.boundingBox())!.x)).toBe(
        sidebarOffset + 24,
    );
    await capture(page, info, 'tutor-detached-upper-left-desktop');
    await widget
        .getByRole('button', { name: 'More options', exact: true })
        .click();
    await page
        .getByRole('menuitemcheckbox', {
            name: 'Wider reading size',
            exact: true,
        })
        .click();
    await page.keyboard.press('Escape');
    await expect
        .poll(async () => Math.round((await widget.boundingBox())!.width))
        .toBe(560);
    await widget
        .getByRole('button', { name: 'More options', exact: true })
        .click();
    await page
        .getByRole('menuitemcheckbox', {
            name: 'Wider reading size',
            exact: true,
        })
        .click();
    await page.keyboard.press('Escape');
    await widget
        .getByRole('button', { name: 'More options', exact: true })
        .click();
    await page
        .getByRole('menuitemcheckbox', { name: 'Detached chat', exact: true })
        .click();
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(widget.locator('..')).toHaveAttribute('data-attached', 'true');
    await expect(companionLayout).toHaveAttribute('data-half-width', 'true');
    await expect(widget.getByLabel('Your question')).toHaveValue(
        retainedQuestion,
    );
    await expect
        .poll(async () => {
            const sourceBounds = (await content.boundingBox())!;
            return (
                (await widget.boundingBox())!.x >=
                sourceBounds.x + sourceBounds.width - 1
            );
        })
        .toBe(true);
    await widget
        .getByRole('button', { name: 'More options', exact: true })
        .click();
    const attachedHalfWidth = page.getByRole('menuitemcheckbox', {
        name: 'Half-width chat (50%)',
        exact: true,
    });
    await expect(attachedHalfWidth).toHaveAttribute('aria-checked', 'true');
    await attachedHalfWidth.click();
    await expect(companionLayout).toHaveAttribute('data-half-width', 'false');
    await expect
        .poll(async () =>
            Math.abs((await widget.boundingBox())!.width - defaultTutorWidth),
        )
        .toBeLessThan(2);
    await page.keyboard.press('Escape');

    await widget.getByRole('button', { name: /^Reply language:/u }).click();
    await capture(page, info, 'tutor-preferences-desktop');
    await page.keyboard.press('Escape');
    const modeConversationId = await verifyPersistentTutorModes(
        page,
        widget,
        token,
        text.id,
        info,
    );
    // The source remains interactive while the tutor is open: real pointer
    // selection must succeed rather than falling behind a modal overlay.
    const passage = page.getByRole('textbox', {
        name: 'Source text',
        exact: true,
    });
    await passage.click();
    await passage.press('ControlOrMeta+a');
    await expect
        .poll(() =>
            passage.evaluate((element) => {
                const textarea = element as HTMLTextAreaElement;
                return textarea.value.slice(
                    textarea.selectionStart,
                    textarea.selectionEnd,
                );
            }),
        )
        .toBe('We rested on the bank.');
    await page
        .getByLabel('Your question')
        .fill('Keep this unfinished question');
    await page
        .getByRole('button', { name: 'Minimize tutor', exact: true })
        .click();
    await expect(widget).toHaveCount(0);
    await page.getByRole('button', { name: /^Open language tutor/u }).click();
    await expect(page.getByLabel('Your question')).toHaveValue(
        'Keep this unfinished question',
    );
    const { conversations: wireConversations } = (await api(
        page,
        token,
        `/conversations?sourceKind=text&sourceId=${text.id}`,
    )) as { conversations: { id: string }[] };
    expect(wireConversations[0]!.id).toBe(modeConversationId);
    const wire = await observeWire(page, token, wireConversations[0]!.id);
    try {
        await observeStreaming(page);
        await send(
            page,
            'Please draft a standalone explanation of river bank usage progressively.',
        );
        expect(
            (
                (await api(
                    page,
                    token,
                    `/conversations/${modeConversationId}`,
                )) as ConversationDetail
            ).conversation.preferences.mode,
        ).toBe('explain');
        const activity = widget.locator('[data-tutor-activity]');
        await expect(activity).toBeVisible();
        await expect(activity).toHaveAttribute('role', 'status');
        await expect(
            widget.locator('[data-tutor-activity="working"]'),
        ).toBeVisible();
        await capture(page, info, 'tutor-working-before-first-text-desktop');
        await expect(
            widget.locator('[data-tutor-activity="writing"]'),
        ).toBeVisible();
        await expect
            .poll(
                async () => {
                    const text = await widget
                        .locator('[data-assistant-content]')
                        .allTextContents();
                    const state = await activity.getAttribute(
                        'data-tutor-activity',
                    );
                    return text.join('').length >= 40 && state === 'working';
                },
                { intervals: [50, 100, 100] },
            )
            .toBe(true);
        await capture(
            page,
            info,
            'tutor-working-during-provider-pause-desktop',
        );
        await expect(
            page.getByRole('button', { name: 'Review and save', exact: true }),
        ).toBeVisible();
        await expect(
            page.getByRole('button', { name: 'Stop', exact: true }),
        ).toHaveCount(0);
        await expect(activity).toHaveCount(0);
        const samples = await streamingEvidence(page);
        await info.attach('rendered-stream-timing', {
            body: JSON.stringify(samples, null, 2),
            contentType: 'application/json',
        });
        expect(
            samples.some(
                (sample) => sample.text === '' && sample.activity === 'working',
            ),
        ).toBe(true);
        expect(
            samples.some(
                (sample) =>
                    sample.text.length >= 40 && sample.activity === 'working',
            ),
        ).toBe(true);
        const textChanges = samples.filter(
            (sample, index) =>
                sample.text.length > 0 &&
                sample.text !== samples[index - 1]?.text,
        );
        expect(textChanges.length).toBeGreaterThanOrEqual(10);
        for (let index = 1; index < textChanges.length; index++) {
            const previous = textChanges[index - 1]!;
            const current = textChanges[index]!;
            expect(current.text.startsWith(previous.text)).toBe(true);
            expect(
                current.text.length - previous.text.length,
            ).toBeLessThanOrEqual(20);
        }
        expect(
            textChanges
                .slice(1)
                .filter(
                    (sample, index) => sample.at - textChanges[index]!.at < 800,
                ).length,
        ).toBeGreaterThanOrEqual(8);
        expect(textChanges.at(-1)?.text).toBe(
            'A river bank is the land beside a river. This explanation uses your saved learning context.',
        );
        await expect
            .poll(() => wire.samples.at(-1)?.text)
            .toBe(
                'A river bank is the land beside a river. This explanation uses your saved learning context.',
            );
        const wireIntervals = wire.samples.slice(1).map((sample, index) => {
            expect(sample.text.startsWith(wire.samples[index]!.text)).toBe(
                true,
            );
            return sample.at - wire.samples[index]!.at;
        });
        expect(
            wireIntervals.filter((interval) => interval > 40 && interval < 500)
                .length,
        ).toBeGreaterThanOrEqual(3);
        const wirePath = info.outputPath('wire-stream-timing.json');
        await writeFile(
            wirePath,
            JSON.stringify(
                {
                    lengths: wire.samples.map((sample) => sample.text.length),
                    intervalsMs: wireIntervals,
                },
                null,
                2,
            ),
        );
        await info.attach('wire-stream-timing', {
            path: wirePath,
            contentType: 'application/json',
        });
    } finally {
        await wire.close();
    }
    expect(
        ((await api(page, token, '/knowledge')) as { notes: KnowledgeNote[] })
            .notes,
    ).toHaveLength(0);
    await capture(page, info, 'tutor-draft-card-desktop');
    await verifyPreferenceFailureRetries(
        page,
        widget,
        token,
        modeConversationId,
        info,
    );
    await page
        .getByRole('button', { name: 'Review and save', exact: true })
        .click();
    await page
        .getByRole('region', { name: 'Language tutor', exact: true })
        .getByLabel('Title', { exact: true })
        .fill('My river bank explanation');
    await page
        .getByRole('textbox', { name: 'Explanation', exact: true })
        .fill(
            'The river bank is the land beside a river. We rested on the bank.',
        );
    await page
        .getByRole('button', { name: 'Minimize tutor', exact: true })
        .click();
    await expect(page.getByRole('dialog', { name: /unsaved/i })).toHaveCount(0);
    await page.getByRole('button', { name: /^Open language tutor/u }).click();
    await expect(widget.getByLabel('Title', { exact: true })).toHaveValue(
        'My river bank explanation',
    );
    await expect(
        page.getByRole('textbox', { name: 'Explanation', exact: true }),
    ).toContainText('We rested on the bank.');
    await capture(page, info, 'tutor-note-editor-desktop');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect
        .poll(() =>
            widget
                .getByLabel('Title', { exact: true })
                .evaluate(
                    (element) => getComputedStyle(element).backgroundColor,
                ),
        )
        .toBe('rgb(255, 255, 255)');
    await expect
        .poll(() =>
            widget
                .getByLabel('Title', { exact: true })
                .evaluate((element) => getComputedStyle(element).color),
        )
        .toBe('rgb(15, 23, 42)');
    await capture(page, info, 'tutor-note-editor-dark');
    await page.emulateMedia({ colorScheme: 'light' });

    const publication = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            response.url().includes('/conversations/') &&
            response.url().endsWith('/publish'),
    );
    await page
        .getByRole('button', { name: 'Save to Knowledge', exact: true })
        .click();
    expect((await publication).status()).toBe(200);
    await expect(
        page.getByRole('button', { name: 'Review and save', exact: true }),
    ).toHaveCount(0);
    const saved = (
        (await api(page, token, '/knowledge')) as { notes: KnowledgeNote[] }
    ).notes[0]!;
    expect(saved.title).toBe('My river bank explanation');
    await page
        .getByRole('button', { name: 'Minimize tutor', exact: true })
        .click();
    await page.goto(`/knowledge/${saved.id}`);
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
        saved.title,
    );
    await page
        .getByRole('group', { name: 'Document properties', exact: true })
        .getByRole('button', { name: saved.summary || 'Summary', exact: true })
        .click();
    await page
        .getByRole('textbox', { name: 'Summary', exact: true })
        .fill('A learner-authored summary saved without model use.');
    await page.keyboard.press('Escape');
    await page
        .getByRole('button', { name: 'Private draft recovery', exact: true })
        .click();
    await expect(
        page.getByText('Working draft recovered', { exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
        page.getByRole('button', { name: 'Save', exact: true }),
    ).toBeVisible();
    const { note: updated } = (await api(
        page,
        token,
        `/knowledge/${saved.id}`,
    )) as { note: KnowledgeNote };
    expect(updated.version).toBe(2);
    await page
        .getByRole('button', { name: 'Document actions', exact: true })
        .click();
    await page
        .getByRole('menuitem', { name: 'Revision history', exact: true })
        .click();
    const historical = page.getByRole('button', { name: /^Revision 1 ·/u });
    await expect(historical).toBeVisible();
    await historical.click();
    await expect(
        page
            .getByRole('dialog', { name: 'Revision history' })
            .getByText('Distinguish a river bank from a financial bank.', {
                exact: true,
            }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Restore this version', exact: true }),
    ).toBeEnabled();
    await capture(page, info, 'knowledge-revisions-desktop');
    await noOverflow(page);
    assertClean();
});

// @user-flow contextual-language-assistant-and-knowledge/dictionary-card-copies-preserve-visible-fields
test('two copied dictionary cards retain typed labels, language directions and immutable message content', async ({
    page,
    browser,
}, info) => {
    const assertClean = runtimeErrors(page);
    const token = await signup(page, info);
    const { dictionary } = (await api(page, token, '/dictionaries', {
        name: 'Arabic bank senses',
        sourceLanguage: 'ar',
        targetLanguage: 'en',
        settings: {
            transcriptionEnabled: true,
            transcriptionNotation: 'ipa',
            transcriptionCustomLabel: null,
            definitionEnabled: true,
            definitionLanguage: 'source',
            exampleEnabled: true,
            exampleLanguage: 'source',
            exampleTranslationEnabled: true,
        },
    })) as { dictionary: OwnedDictionary };
    const cards = [
        {
            source: 'شاطئ',
            translation: 'river bank',
            definition: 'أرض بجانب النهر',
            transcription: 'ʃaːtˤiʔ',
            example: 'جلسنا على الشاطئ.',
            exampleTranslation: 'We sat on the river bank.',
        },
        {
            source: 'بنك',
            translation: 'financial bank',
            definition: 'مؤسسة مالية',
            transcription: 'bank',
            example: 'البنك مغلق اليوم.',
            exampleTranslation: 'The bank is closed today.',
        },
    ];
    let version = dictionary.version;
    for (const values of cards) {
        const created = (await api(
            page,
            token,
            `/dictionaries/${dictionary.id}/cards`,
            {
                expectedDictionaryVersion: version,
                expectedSettingsVersion: dictionary.settings.version,
                values,
            },
        )) as DictionaryCardResponse;
        version = created.dictionaryVersion;
    }
    await page.goto(`/dictionaries/${dictionary.id}`);
    await page.getByRole('button', { name: /^Open language tutor/u }).click();
    const panel = page.getByRole('region', {
        name: 'Language tutor',
        exact: true,
    });
    const dictionaryContent = page.locator('#dictionary-content');
    await expect
        .poll(async () => {
            const sourceBounds = (await dictionaryContent.boundingBox())!;
            return (
                (await panel.boundingBox())!.x >=
                sourceBounds.x + sourceBounds.width - 1
            );
        })
        .toBe(true);
    const addCard = page.getByRole('button', { name: 'Add card', exact: true });
    for (const name of ['Add card', 'Train']) {
        const action = page.getByRole('button', { name, exact: true });
        await expect(action).toBeVisible();
        const bounds = (await action.boundingBox())!;
        expect(Math.abs(bounds.width - bounds.height)).toBeLessThanOrEqual(1);
        await action.hover();
        await expect(
            page.getByRole('tooltip', { name, exact: true }),
        ).toBeVisible();
        await page.mouse.move(0, 0);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(panel).toBeVisible();
    await expect
        .poll(async () => Math.round((await panel.boundingBox())!.width))
        .toBe(390);
    await expect
        .poll(() =>
            panel.evaluate(
                (element) => element.scrollWidth <= element.clientWidth + 1,
            ),
        )
        .toBe(true);
    // At an actual action/chat overlap, hit testing must reach the chat rather
    // than the dictionary's fixed action bar, which used to cover the composer.
    await expect
        .poll(async () => {
            const action = (await addCard.boundingBox())!;
            const chat = (await panel.boundingBox())!;
            const left = Math.max(action.x, chat.x);
            const right = Math.min(
                action.x + action.width,
                chat.x + chat.width,
            );
            const top = Math.max(action.y, chat.y);
            const bottom = Math.min(
                action.y + action.height,
                chat.y + chat.height,
            );
            if (left >= right || top >= bottom) return false;
            return panel.evaluate(
                (element, point) =>
                    element.contains(
                        document.elementFromPoint(point.x, point.y),
                    ),
                { x: (left + right) / 2, y: (top + bottom) / 2 },
            );
        })
        .toBe(true);
    await capture(page, info, 'dictionary-chat-above-actions-mobile');
    await noOverflow(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const card of cards) {
        await panel
            .getByRole('button', { name: 'Add context /', exact: true })
            .click();
        const picker = panel.getByRole('dialog', {
            name: 'Add context /',
            exact: true,
        });
        await picker
            .getByLabel('Find a word or passage', { exact: true })
            .fill(card.source);
        await capture(page, info, 'tutor-context-picker-desktop');
        await picker
            .getByRole('button')
            .filter({ hasText: card.source })
            .click();
        await picker
            .getByRole('button', { name: 'Close context picker', exact: true })
            .click();
        await panel
            .getByRole('button', { name: card.source, exact: true })
            .click();
        for (const value of [
            card.translation,
            card.definition,
            card.transcription,
            card.example,
            card.exampleTranslation,
        ])
            await expect(panel.getByText(value, { exact: true })).toBeVisible();
        await expect(
            panel.getByText(card.definition, { exact: true }),
        ).toHaveAttribute('lang', 'ar');
        await expect(
            panel.getByText(card.definition, { exact: true }),
        ).toHaveAttribute('dir', 'auto');
        await expect(
            panel.getByText(card.exampleTranslation, { exact: true }),
        ).toHaveAttribute('lang', 'en');
        await panel
            .getByRole('button', { name: card.source, exact: true })
            .click();
    }
    await expect(
        panel.getByRole('button', { name: /^Remove attachment:/u }),
    ).toHaveCount(2);
    await panel.getByLabel('Your question').fill('Compare the attached words');
    await panel
        .getByRole('button', { name: 'Minimize tutor', exact: true })
        .click();
    await page.getByRole('button', { name: /^Open language tutor/u }).click();
    await expect(panel.getByLabel('Your question')).toHaveValue(
        'Compare the attached words',
    );
    await expect(
        panel.getByRole('button', { name: /^Remove attachment:/u }),
    ).toHaveCount(2);
    // Controlled browser-only failure proof; the subsequent admission remains real.
    const admissionPattern = '**/api/conversations/*/turns';
    await page.route(admissionPattern, (route) =>
        route.fulfill({
            status: 503,
            contentType: 'application/json',
            headers: { 'x-synthetic-scenario': 'model-unavailable' },
            body: JSON.stringify({
                error: {
                    code: 'model_unavailable',
                    message: 'Synthetic model capability unavailable.',
                    requestId: 'synthetic-model-unavailable',
                },
            }),
        }),
    );
    await send(page, 'Show the unavailable model guidance.');
    await expect(
        panel.getByText(
            'This model cannot run the assistant. Choose Automatic or DeepSeek Flash in Profile.',
            { exact: true },
        ),
    ).toBeVisible();
    await expect(
        panel.getByRole('link', { name: 'Change AI model', exact: true }),
    ).toHaveAttribute('href', '/profile');
    await expect(
        panel.getByText('Synthetic model capability unavailable.', {
            exact: true,
        }),
    ).toHaveCount(0);
    await panel
        .getByRole('link', { name: 'Change AI model', exact: true })
        .scrollIntoViewIfNeeded();
    await capture(page, info, 'assistant-model-guidance-controlled');
    await page.unroute(admissionPattern);
    await send(page, 'Explain the difference between these two copied cards.');
    await expect(
        panel.getByRole('button', { name: 'Stop', exact: true }),
    ).toHaveCount(0);
    await expect(
        panel.getByText(/^A river bank is the land beside a river/u).last(),
    ).toBeVisible();
    const { conversations } = (await api(
        page,
        token,
        `/conversations?sourceKind=dictionary&sourceId=${dictionary.id}`,
    )) as { conversations: { id: string }[] };
    const conversationId = conversations[0]!.id;
    const detail = (await api(
        page,
        token,
        `/conversations/${conversationId}`,
    )) as ConversationDetail;
    const copies = detail.messages.find(
        (message) => message.role === 'user',
    )!.attachments;
    expect(copies).toHaveLength(2);
    for (const [index, copy] of copies.entries()) {
        expect(copy.kind).toBe('dictionary-card');
        if (copy.kind !== 'dictionary-card')
            throw new Error('Expected a typed dictionary card copy');
        expect(copy.card).toMatchObject({
            ...cards[index],
            sourceLanguage: 'ar',
            targetLanguage: 'en',
            definitionLanguage: 'ar',
            exampleLanguage: 'ar',
            exampleTranslationLanguage: 'en',
            transcriptionNotation: 'ipa',
        });
    }
    await page
        .getByRole('button', { name: 'Minimize tutor', exact: true })
        .click();
    await page.getByRole('button', { name: /^Open language tutor/u }).click();
    await expect(
        panel.getByText(
            'Explain the difference between these two copied cards.',
            { exact: true },
        ),
    ).toBeVisible();
    await panel
        .locator('summary')
        .filter({ hasText: /^Copied material/u })
        .click();
    for (const card of cards) {
        const copy = panel.locator('details').filter({
            has: page
                .locator(':scope > summary')
                .filter({ hasText: card.source }),
        });
        await copy.locator('summary').click();
        for (const label of [
            'Source',
            'Translation',
            'Definition',
            'Transcription (ipa)',
            'Example',
            'Example translation',
        ])
            await expect(
                copy.getByRole('term').filter({
                    hasText: new RegExp(`^${label.replace(/[()]/g, '\\$&')}$`),
                }),
            ).toBeVisible();
        await expect(
            copy.getByText(card.definition, { exact: true }),
        ).toBeVisible();
        await expect(
            copy.getByText(card.transcription, { exact: true }),
        ).toBeVisible();
    }
    await noOverflow(page);
    await capture(page, info, 'dictionary-card-copies-desktop');
    const lightSurface = await panel.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
    );
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await expect
        .poll(() =>
            panel.evaluate(
                (element) => getComputedStyle(element).backgroundColor,
            ),
        )
        .not.toBe(lightSurface);
    await expect
        .poll(() =>
            page.evaluate(
                () => matchMedia('(prefers-reduced-motion: reduce)').matches,
            ),
        )
        .toBe(true);
    expect(
        await panel.evaluate(
            (element) => getComputedStyle(element).animationName,
        ),
    ).toBe('none');
    // The app-wide reduced-motion rule retains a 1ms duration; this panel's
    // transition-property:none suppresses its opening/folding transitions.
    expect(
        await panel.evaluate(
            (element) => getComputedStyle(element).transitionProperty,
        ),
    ).toBe('none');
    expect(
        await panel.evaluate((element) =>
            getComputedStyle(element)
                .transitionDuration.split(',')
                .every((duration) => parseFloat(duration) <= 0.001),
        ),
    ).toBe(true);
    await capture(page, info, 'tutor-dark-rtl-material-reduced-motion');
    await page.emulateMedia({
        colorScheme: 'light',
        reducedMotion: 'no-preference',
    });
    await panel
        .getByRole('button', { name: 'More options', exact: true })
        .click();
    await page
        .getByRole('menuitem', { name: 'Conversation history', exact: true })
        .click();
    await capture(page, info, 'tutor-history-desktop');
    await panel.getByRole('button', { name: /^Delete conversation:/u }).click();
    const confirmation = page.getByRole('group', {
        name: 'Delete conversation',
        exact: true,
    });
    await expect(confirmation).toBeVisible();
    await expect(
        confirmation.getByRole('button', { name: 'Cancel', exact: true }),
    ).toBeFocused();
    await confirmation
        .getByRole('button', { name: 'Cancel', exact: true })
        .last()
        .click();
    expect(
        (
            (await api(
                page,
                token,
                `/conversations?sourceKind=dictionary&sourceId=${dictionary.id}`,
            )) as { conversations: unknown[] }
        ).conversations,
    ).toHaveLength(1);
    await panel.getByRole('button', { name: /^Delete conversation:/u }).click();
    await confirmation
        .getByRole('button', { name: 'Delete', exact: true })
        .click();
    await expect(confirmation).toHaveCount(0);
    await expect
        .poll(
            async () =>
                (
                    (await api(
                        page,
                        token,
                        `/conversations?sourceKind=dictionary&sourceId=${dictionary.id}`,
                    )) as { conversations: unknown[] }
                ).conversations.length,
        )
        .toBe(0);
    await verifySharedDictionaryPlacement(
        page,
        browser,
        token,
        dictionary,
        info,
    );
    assertClean();
});

async function verifySharedDictionaryPlacement(
    page: Page,
    browser: Browser,
    token: string,
    dictionary: OwnedDictionary,
    info: TestInfo,
) {
    const { dictionary: currentDictionary } = (await api(
        page,
        token,
        `/dictionaries/${dictionary.id}`,
    )) as { dictionary: OwnedDictionary };
    const { capability } = (await api(
        page,
        token,
        `/dictionaries/${dictionary.id}/share-key/rotate`,
        { expectedDictionaryVersion: currentDictionary.version },
    )) as { capability: { shareId: string; shareKey: string } };
    const sharedPath = `/shared/dictionaries/${capability.shareId}#${capability.shareKey}`;
    const readerContext = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        baseURL: 'http://localhost:3336',
    });
    const guestContext = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        baseURL: 'http://localhost:3336',
    });
    try {
        const reader = await readerContext.newPage();
        const assertReaderClean = runtimeErrors(reader);
        await signup(reader, info);
        await reader.goto(sharedPath);
        const sourceContent = reader.locator('[data-companion-content]');
        await expect(
            sourceContent.getByRole('heading', {
                name: dictionary.name,
                exact: true,
            }),
        ).toBeVisible();
        await reader
            .getByRole('button', { name: /^Open language tutor/u })
            .click();
        const panel = reader.getByRole('region', {
            name: 'Language tutor',
            exact: true,
        });
        await expect(panel).toBeVisible();
        await expect(panel.locator('..')).toHaveAttribute(
            'data-attached',
            'true',
        );
        await expect
            .poll(async () => {
                const bounds = (await sourceContent.boundingBox())!;
                return (
                    (await panel.boundingBox())!.x >=
                    bounds.x + bounds.width - 1
                );
            })
            .toBe(true);
        await expect(panel.getByLabel('Your question')).toBeEnabled();
        await capture(reader, info, 'shared-dictionary-attached-tutor-desktop');
        await noOverflow(reader);

        const guest = await guestContext.newPage();
        const assertGuestClean = runtimeErrors(guest);
        await guest.goto(sharedPath);
        const main = guest.locator('[data-companion-content] main');
        await expect(
            main.getByRole('heading', { name: dictionary.name, exact: true }),
        ).toBeVisible();
        const signIn = main.getByRole('link', {
            name: 'Sign in to ask the language assistant',
            exact: true,
        });
        await expect(signIn).toBeVisible();
        await expect(signIn).toHaveAttribute('href', '/login');
        await expect(guest.locator('[data-companion-slot]')).toBeEmpty();
        await expect(
            guest.getByRole('button', { name: /^Open language tutor/u }),
        ).toHaveCount(0);
        const linkBounds = (await signIn.boundingBox())!;
        expect(linkBounds.width).toBeGreaterThan(100);
        await expect
            .poll(() =>
                signIn.evaluate((element) => {
                    const rect = element.getBoundingClientRect();
                    return element.contains(
                        document.elementFromPoint(
                            rect.x + rect.width / 2,
                            rect.y + rect.height / 2,
                        ),
                    );
                }),
            )
            .toBe(true);
        await capture(guest, info, 'shared-dictionary-guest-sign-in-desktop');
        await noOverflow(guest);
        assertReaderClean();
        assertGuestClean();
    } finally {
        await readerContext.close();
        await guestContext.close();
    }
}

// @user-flow contextual-language-assistant-and-knowledge/durable-close-reopen-stop-retry
test('closing reconnects without duplicating a turn, Stop retains partials, and retry is explicit on narrow screens', async ({
    page,
}, info) => {
    const assertClean = runtimeErrors(page);
    await page.setViewportSize({ width: 390, height: 844 });
    const token = await signup(page, info);
    const text = await source(page, token, info);
    const sheet = page.getByRole('region', {
        name: 'Language tutor',
        exact: true,
    });
    await expect
        .poll(async () => Math.round((await sheet.boundingBox())!.width))
        .toBe(390);
    await expect
        .poll(async () => Math.round((await sheet.boundingBox())!.height))
        .toBe(832);
    await capture(page, info, 'tutor-initial-full-sheet-mobile');
    await sheet
        .getByRole('button', { name: 'Reduce to partial height', exact: true })
        .first()
        .click();
    const partial = (await sheet.boundingBox())!.height;
    expect(Math.round(partial)).toBe(Math.round(844 * 0.75));
    await sheet
        .getByRole('button', { name: 'Expand to full height', exact: true })
        .first()
        .click();
    await expect
        .poll(async () => (await sheet.boundingBox())!.height)
        .toBeGreaterThan(partial);
    await capture(page, info, 'tutor-expanded-sheet-mobile');
    await sheet
        .getByRole('button', { name: 'Reduce to partial height', exact: true })
        .first()
        .click();
    await expect
        .poll(async () => Math.round((await sheet.boundingBox())!.height))
        .toBe(Math.round(partial));
    await capture(page, info, 'tutor-partial-sheet-mobile');
    const handle = (await sheet
        .getByRole('button', { name: 'Expand to full height', exact: true })
        .first()
        .boundingBox())!;
    await page.mouse.move(
        handle.x + handle.width / 2,
        handle.y + handle.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
        handle.x + handle.width / 2,
        handle.y + handle.height / 2 + 300,
        { steps: 10 },
    );
    await page.mouse.up();
    await expect(sheet).toHaveCount(0);
    await page.getByRole('button', { name: /^Open language tutor/u }).click();
    await expect(sheet).toBeVisible();

    await page.setViewportSize({ width: 320, height: 844 });
    await noOverflow(page);
    await expect
        .poll(() =>
            page
                .getByRole('region', {
                    name: 'Language tutor',
                    exact: true,
                })
                .evaluate(
                    (element) => element.scrollWidth <= element.clientWidth + 1,
                ),
        )
        .toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await send(page, 'Explain river bank slowly.');
    await expect(
        page.getByRole('button', { name: 'Stop', exact: true }),
    ).toBeVisible();
    await expect(
        page.getByText('A river bank is the', { exact: true }).first(),
    ).toBeVisible();
    const { conversations } = (await api(
        page,
        token,
        `/conversations?sourceKind=text&sourceId=${text.id}`,
    )) as { conversations: { id: string }[] };
    const conversationId = conversations[0]!.id;
    const streaming = (await api(
        page,
        token,
        `/conversations/${conversationId}`,
    )) as ConversationDetail;
    expect(streaming.turns[0]?.status).toBe('running');
    await page
        .getByRole('button', { name: 'Minimize tutor', exact: true })
        .click();
    await expect(
        page.getByRole('region', { name: 'Language tutor' }),
    ).toHaveCount(0);
    await expect(
        page.getByRole('button', { name: /^Open language tutor/u }),
    ).toBeFocused();
    await capture(page, info, 'tutor-folded-stream-mobile');
    await page.getByRole('button', { name: /^Open language tutor/u }).click();
    await expect(page.getByLabel('Your question')).toBeVisible();
    await expect(
        page.getByText(/A river bank is the land beside a river/).first(),
    ).toBeVisible();
    await expect
        .poll(
            async () =>
                (
                    (await api(
                        page,
                        token,
                        `/conversations/${conversationId}`,
                    )) as ConversationDetail
                ).turns[0]?.status,
        )
        .toBe('succeeded');
    const detail = (await api(
        page,
        token,
        `/conversations/${conversationId}`,
    )) as ConversationDetail;
    expect(detail.turns).toHaveLength(1);
    expect(
        detail.messages.filter((message) => message.role === 'user'),
    ).toHaveLength(1);
    await send(page, 'Explain river bank slowly again.');
    await expect(
        page.getByRole('button', { name: 'Stop', exact: true }),
    ).toBeVisible();
    await expect
        .poll(async () => {
            const current = (await api(
                page,
                token,
                `/conversations/${conversationId}`,
            )) as ConversationDetail;
            return current.messages.some(
                (message) =>
                    message.role === 'assistant' &&
                    message.status === 'streaming' &&
                    message.content.length > 0,
            );
        })
        .toBe(true);
    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(
        page.getByRole('button', { name: 'Retry response', exact: true }),
    ).toBeVisible();
    await expect(sheet.locator('[data-tutor-activity]')).toHaveCount(0);
    await expect(
        page.getByText('Incomplete response', { exact: true }).first(),
    ).toBeVisible();
    await send(page, 'Explain river bank; fail once.');
    await expect
        .poll(
            async () =>
                (
                    (await api(
                        page,
                        token,
                        `/conversations/${conversationId}`,
                    )) as ConversationDetail
                ).turns.find((turn) => turn.status === 'failed')?.status,
        )
        .toBe('failed');
    const failed = (
        (await api(
            page,
            token,
            `/conversations/${conversationId}`,
        )) as ConversationDetail
    ).turns.find((turn) => turn.status === 'failed')!;
    expect(failed.usage.estimated).toBe(true);
    const retry = page
        .getByRole('region', {
            name: 'Incomplete response: Explain river bank; fail once.',
            exact: true,
        })
        .getByRole('button', { name: 'Retry response', exact: true });
    await expect(retry).toBeEnabled();
    const failedArticle = page.locator('article').filter({ has: retry });
    const usageTrigger = failedArticle.getByRole('button', {
        name: /^Charged credits:/u,
    });
    await usageTrigger.click();
    const usage = page.getByRole('dialog', { name: 'Usage', exact: true });
    await expect(usage).toBeVisible();
    await expect(usage.getByText('Estimated', { exact: true })).toBeVisible();
    await expect(
        usage
            .getByRole('term')
            .filter({ hasText: /^Input tokens$/u })
            .locator('+ dd'),
    ).toHaveText(String(failed.usage.inputTokens));
    await expect(
        usage
            .getByRole('term')
            .filter({ hasText: /^Output tokens$/u })
            .locator('+ dd'),
    ).toHaveText(String(failed.usage.outputTokens));
    await expect(usageTrigger).toContainText(
        `Charged credits: ${failed.usage.chargedCredits}`,
    );
    await usage.scrollIntoViewIfNeeded();
    await noOverflow(page);
    await capture(page, info, 'assistant-estimated-usage-mobile');
    await page.keyboard.press('Escape');
    await expect(usage).toHaveCount(0);
    await expect(usageTrigger).toBeFocused();
    const retried = page.waitForRequest(
        (request) =>
            request.method() === 'POST' &&
            request.url().endsWith(`/conversations/${conversationId}/turns`),
    );
    await retry.click();
    expect((await retried).postDataJSON().retryOf).toBe(failed.id);
    await expect
        .poll(
            async () =>
                (
                    (await api(
                        page,
                        token,
                        `/conversations/${conversationId}`,
                    )) as ConversationDetail
                ).turns.filter((turn) => turn.status === 'succeeded').length,
        )
        .toBe(2);
    await expect(
        page.getByRole('button', { name: 'Stop', exact: true }),
    ).toHaveCount(0);
    await page
        .getByText(/^A river bank is the land beside a river/u)
        .last()
        .scrollIntoViewIfNeeded();
    await noOverflow(page);
    await capture(page, info, 'assistant-reconnected-mobile');
    assertClean();
});
