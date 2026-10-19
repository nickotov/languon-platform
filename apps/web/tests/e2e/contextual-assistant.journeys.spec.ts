// @user-flow-revision contextual-language-assistant-and-knowledge sha256:76dad0ed0457a680
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type {
    ConversationDetail,
    KnowledgeNote,
    TextFolder,
    TextDocument,
    OwnedDictionary,
    DictionaryCardResponse,
} from '@languon/contracts';

const liveTokens = new WeakMap<Page, string>();
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
            response.headers()['x-synthetic-scenario'] ===
                'model-unavailable' &&
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
async function source(page: Page, token: string) {
    const { folder } = (await api(page, token, '/text-folders', {
        name: 'River reading',
    })) as { folder: TextFolder };
    const { text } = (await api(page, token, '/texts', {
        folderId: folder.id,
        sourceText: 'We rested on the bank.',
        sourceLanguage: 'en',
        targetLanguage: 'es',
    })) as { text: TextDocument };
    await page.goto(`/texts/folders/${folder.id}/texts/${text.id}`);
    await page
        .getByRole('button', { name: 'Ask about this', exact: true })
        .click();
    await expect(
        page.getByRole('dialog', { name: 'Language assistant' }),
    ).toBeVisible();
    await page
        .getByRole('dialog', { name: 'Language assistant', exact: true })
        .getByRole('button', { name: 'New conversation', exact: true })
        .first()
        .click();
    await expect(page.getByLabel('Your question')).toBeEnabled();
    await page.getByLabel('Your question').focus();
    await page.keyboard.press('Tab');
    await expect(
        page.getByRole('combobox', { name: 'Reply language', exact: true }),
    ).toBeFocused();
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
}

// @user-flow contextual-language-assistant-and-knowledge/source-chat-save-knowledge
test('saved source streams through real SDK into an editable private note and revision history', async ({
    page,
}, info) => {
    const assertClean = runtimeErrors(page);
    const token = await signup(page, info);
    await source(page, token);
    await send(
        page,
        'Please draft a standalone explanation of river bank usage.',
    );
    await expect(
        page.getByRole('heading', { name: 'Knowledge draft' }),
    ).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Stop', exact: true }),
    ).toHaveCount(0);
    expect(
        ((await api(page, token, '/knowledge')) as { notes: KnowledgeNote[] })
            .notes,
    ).toHaveLength(0);
    await page
        .getByRole('dialog', { name: 'Language assistant', exact: true })
        .getByLabel('Title', { exact: true })
        .fill('My river bank explanation');
    await page
        .getByRole('textbox', { name: 'Explanation', exact: true })
        .fill(
            'The river bank is the land beside a river. We rested on the bank.',
        );
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
        page.getByRole('heading', { name: 'Knowledge draft' }),
    ).toHaveCount(0);
    const saved = (
        (await api(page, token, '/knowledge')) as { notes: KnowledgeNote[] }
    ).notes[0]!;
    expect(saved.title).toBe('My river bank explanation');
    await page.getByRole('button', { name: 'Close chat', exact: true }).click();
    await page.goto(`/knowledge/${saved.id}`);
    await expect(
        page.getByRole('heading', { level: 1, name: saved.title }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page
        .getByRole('textbox', { name: 'Summary', exact: true })
        .fill('A learner-authored summary saved without model use.');
    await page
        .getByRole('button', { name: 'Save changes', exact: true })
        .click();
    await expect(
        page.getByRole('button', { name: 'Edit', exact: true }),
    ).toBeVisible();
    const { note: updated } = (await api(
        page,
        token,
        `/knowledge/${saved.id}`,
    )) as { note: KnowledgeNote };
    expect(updated.version).toBe(2);
    await page
        .getByRole('button', { name: 'Revision history', exact: true })
        .click();
    const historical = page.getByRole('button', { name: /^Revision 1 ·/u });
    await expect(historical).toBeVisible();
    await historical.click();
    await expect(
        page
            .getByRole('region', { name: 'Saved revision' })
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
    await page
        .getByRole('button', { name: 'Ask about this', exact: true })
        .click();
    const panel = page.getByRole('dialog', {
        name: 'Language assistant',
        exact: true,
    });
    await panel
        .getByRole('button', { name: 'New conversation', exact: true })
        .first()
        .click();
    await panel
        .getByRole('button', { name: 'Add context /', exact: true })
        .click();
    for (const card of cards) {
        await panel
            .getByLabel('Find a word or passage', { exact: true })
            .fill(card.source);
        const result = panel.locator('details').filter({
            has: page.locator('summary').filter({ hasText: card.source }),
        });
        await expect(result).toHaveCount(1);
        await result.locator('summary').click();
        for (const label of [
            'Source',
            'Translation',
            'Definition',
            'Transcription (ipa)',
            'Example',
            'Example translation',
        ])
            await expect(
                result.getByRole('term').filter({
                    hasText: new RegExp(`^${label.replace(/[()]/g, '\\$&')}$`),
                }),
            ).toBeVisible();
        await expect(
            result.getByText(card.definition, { exact: true }),
        ).toHaveAttribute('lang', 'ar');
        await expect(
            result.getByText(card.definition, { exact: true }),
        ).toHaveAttribute('dir', 'auto');
        await expect(
            result.getByText(card.exampleTranslation, { exact: true }),
        ).toHaveAttribute('lang', 'en');
        await result
            .locator('..')
            .getByRole('button', { name: 'Attach', exact: true })
            .click();
    }
    await expect(
        panel.getByRole('button', { name: 'Remove attachment', exact: true }),
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
    await page.getByRole('button', { name: 'Close chat', exact: true }).click();
    await page
        .getByRole('button', { name: 'Ask about this', exact: true })
        .click();
    await expect(
        panel.getByText(
            'Explain the difference between these two copied cards.',
            { exact: true },
        ),
    ).toBeVisible();
    for (const card of cards) {
        const copy = panel.locator('details').filter({
            has: page.locator('summary').filter({ hasText: card.source }),
        });
        await copy.locator('summary').click();
        await expect(
            copy.getByText(card.definition, { exact: true }),
        ).toBeVisible();
        await expect(
            copy.getByText(card.transcription, { exact: true }),
        ).toBeVisible();
    }
    await noOverflow(page);
    await capture(page, info, 'dictionary-card-copies-desktop');
    assertClean();
});

// @user-flow contextual-language-assistant-and-knowledge/durable-close-reopen-stop-retry
test('closing reconnects without duplicating a turn, Stop retains partials, and retry is explicit on narrow screens', async ({
    page,
}, info) => {
    const assertClean = runtimeErrors(page);
    await page.setViewportSize({ width: 390, height: 844 });
    const token = await signup(page, info);
    const text = await source(page, token);
    await page.setViewportSize({ width: 320, height: 844 });
    await noOverflow(page);
    await expect
        .poll(() =>
            page
                .getByRole('dialog', {
                    name: 'Language assistant',
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
    await page.getByRole('button', { name: 'Close chat', exact: true }).click();
    await expect(
        page.getByRole('dialog', { name: 'Language assistant' }),
    ).toHaveCount(0);
    await expect(
        page.getByRole('button', { name: 'Ask about this', exact: true }),
    ).toBeFocused();
    await page
        .getByRole('button', { name: 'Ask about this', exact: true })
        .click();
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
    await expect(page.getByText('Estimated', { exact: true })).toHaveCount(2);
    const estimated = page.getByText('Estimated', { exact: true }).last();
    await expect(estimated).toBeVisible();
    await expect(estimated.locator('..')).toContainText(
        `Input tokens: ${failed.usage.inputTokens} · Output tokens: ${failed.usage.outputTokens} · Charged credits: ${failed.usage.chargedCredits}`,
    );
    await estimated.scrollIntoViewIfNeeded();
    await noOverflow(page);
    await capture(page, info, 'assistant-estimated-usage-mobile');
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
