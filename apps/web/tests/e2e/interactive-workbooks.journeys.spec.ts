import { randomUUID } from 'node:crypto';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type {
    KnowledgeNote,
    Workbook,
    WorkbookLearningState,
} from '@languon/contracts';

// @user-flow-revision interactive-workbooks sha256:7714455deb2c9ee8
const origin = 'http://localhost:3336';
const tokens = new WeakMap<Page, string>();
async function signup(page: Page, info: TestInfo, suffix: string) {
    page.on('response', async (response) => {
        if (
            response.status() === 200 &&
            /\/auth\/(?:refresh|email-verification\/verify)$/u.test(
                new URL(response.url()).pathname,
            )
        ) {
            const data = await response.json();
            if (typeof data.accessToken === 'string')
                tokens.set(page, data.accessToken);
        }
    });
    await page.goto(`${origin}/signup?returnTo=%2Fknowledge`);
    await page
        .getByLabel('Email')
        .fill(
            `workbook-${suffix}-${Date.now()}-${info.workerIndex}@example.test`,
        );
    await page
        .getByLabel('Password', { exact: true })
        .fill('Synthetic workbook password 59!');
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
    tokens.set(page, (await (await verified).json()).accessToken);
    await expect(page).toHaveURL(/\/knowledge$/u);
}
async function api<T>(
    page: Page,
    path: string,
    data?: unknown,
    method = 'GET',
    headers: Record<string, string> = {},
): Promise<T> {
    const response = await page.request.fetch(`/api${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${tokens.get(page)}`,
            Origin: origin,
            ...headers,
        },
        ...(data === undefined ? {} : { data }),
    });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json() as Promise<T>;
}
function runtime(page: Page) {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        if (
            message.type() === 'error' &&
            !message.text().startsWith('Failed to load resource:')
        )
            errors.push(message.text());
    });
    page.on('response', (response) => {
        if (response.status() >= 500)
            errors.push(
                `${response.status()} ${new URL(response.url()).pathname}`,
            );
    });
    return () => expect(errors).toEqual([]);
}
async function capture(page: Page, info: TestInfo, name: string) {
    const path = info.outputPath(`${name}.png`);
    await page.screenshot({ path, fullPage: true, animations: 'disabled' });
    await info.attach(name, { path, contentType: 'image/png' });
}
async function addBlock(
    page: Page,
    kind: string,
    values: Record<string, string>,
) {
    const kinds: Record<string, string> = {
        grammar: 'Grammar',
        vocabulary: 'Vocabulary',
        'bilingual-text': 'Bilingual text',
        exercise: 'Exercise',
        video: 'Video',
    };
    await page.getByRole('button', { name: 'Add block', exact: true }).click();
    await page
        .getByRole('menuitem', { name: kinds[kind]!, exact: true })
        .click();
    const dialog = page.getByRole('dialog');
    for (const [label, value] of Object.entries(values))
        await dialog.getByLabel(label, { exact: true }).fill(value);
    await dialog
        .getByRole('button', { name: 'Apply block', exact: true })
        .click();
    await expect(dialog).not.toBeVisible();
}
function syntheticWav() {
    const samples = 8000;
    const buffer = Buffer.alloc(44 + samples * 2);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(buffer.length - 8, 4);
    buffer.write('WAVEfmt ', 8);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(8000, 24);
    buffer.writeUInt32LE(16000, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(samples * 2, 40);
    return buffer;
}

// @user-flow interactive-workbooks/author-blocks-publish-practice
test('author creates blocks and uploaded audio, publishes, reopens and saves private practice', async ({
    page,
}, info) => {
    const healthy = runtime(page);
    await signup(page, info, 'author');
    await page.getByRole('button', { name: 'New note', exact: true }).click();
    await expect(page).toHaveURL(/\/knowledge\/[0-9a-f-]{36}$/u);
    const noteId = new URL(page.url()).pathname.split('/').at(-1)!;
    await expect(
        page.getByText('Add a text, vocabulary or grammar block first.', {
            exact: true,
        }),
    ).toHaveCount(0);
    await expect(
        page.getByText(
            'Add an audio block with an uploaded WAV or MP3 first.',
            { exact: true },
        ),
    ).toHaveCount(0);
    await expect(
        page.getByRole('button', { name: 'Copy blocks to note', exact: true }),
    ).toHaveCount(0);
    await expect(
        page.getByRole('button', { name: 'Add block', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Add block', exact: true }).click();
    await expect(
        page.getByRole('menuitem', { name: 'Grammar', exact: true }),
    ).toBeVisible();
    await capture(page, info, 'editor-block-menu');
    await page.keyboard.press('Escape');
    await expect(
        page.getByRole('button', { name: 'Add block', exact: true }),
    ).toBeFocused();
    await capture(page, info, 'editor-empty-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, info, 'editor-empty-mobile');
    await page.setViewportSize({ width: 1440, height: 1000 });
    // This paid AI scenario needs a prospective allowance above the fixture's
    // synthetic 20-credit default; the wallet grant alone does not set it.
    const preference = await api<{ version: number }>(
        page,
        '/users/me/ai-model-preference',
    );
    await api(
        page,
        '/users/me/ai-model-preference',
        {
            mode: 'auto',
            expectedVersion: preference.version,
            maxCreditsPerAction: '100',
        },
        'PUT',
    );
    const tutor = page.getByRole('region', {
        name: 'Language tutor',
        exact: true,
    });
    if (!(await tutor.isVisible()))
        await page.getByRole('tab', { name: 'Tutor', exact: true }).click();
    await tutor
        .getByLabel('Your question')
        .fill(
            'French vocabulary block fixture: работа, радость, уборка, плитка, рыба, корм. French to Russian.',
        );
    const submitted = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            /\/conversations\/[^/]+\/turns$/.test(
                new URL(response.url()).pathname,
            ),
    );
    await tutor.getByRole('button', { name: 'Send', exact: true }).click();
    const submittedResponse = await submitted;
    if (submittedResponse.status() === 409) {
        expect((await submittedResponse.json()).error.code).toBe(
            'action_confirmation_required',
        );
        await page
            .getByRole('dialog', { name: 'Review this action’s budget' })
            .getByRole('button', { name: 'Send', exact: true })
            .click();
    }
    await expect(
        tutor
            .locator('[data-assistant-content]')
            .getByText('I prepared the six French words.', { exact: false }),
    ).toBeVisible();
    await expect(
        tutor.getByRole('button', { name: 'Use in document', exact: true }),
    ).toHaveCount(0);
    const proposal = tutor.getByRole('article', {
        name: 'Proposed learning blocks',
        exact: true,
    });
    await expect(
        proposal.getByText('carrelage', { exact: true }),
    ).toBeVisible();
    const frame = await proposal.evaluate((element) => {
        const style = getComputedStyle(element);
        return { border: style.borderTopWidth, padding: style.paddingTop };
    });
    expect(frame).toEqual({ border: '0px', padding: '0px' });
    await expect(page.locator('[data-learning-block-id]')).toHaveCount(0);
    await capture(page, info, 'chat-vocabulary-proposal');
    await proposal
        .getByRole('button', { name: 'Apply to working draft', exact: true })
        .click();
    await expect(page.locator('[data-learning-block-id]')).toHaveCount(1);
    await page
        .getByRole('button', {
            name: 'Block settings: Six French words',
            exact: true,
        })
        .click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await expect(page.locator('[data-learning-block-id]')).toHaveCount(0);

    await page
        .getByLabel('Title', { exact: true })
        .fill('First interactive lesson');
    await addBlock(page, 'grammar', {
        Title: 'Present simple',
        Rule: 'Use the base verb for I and you.',
    });
    await addBlock(page, 'exercise', {
        Title: 'Verb practice',
        Question: 'Complete: I ___ English.',
        'Reference answer': 'study',
        'Why the answer is correct': 'I takes the base verb.',
    });
    await addBlock(page, 'vocabulary', {
        Title: 'Useful words',
        'Content language': 'en',
        'Translation language': 'fr',
        'Word or phrase': 'study',
        Translation: 'étudier',
        Example: 'I study English.',
        'Example translation': 'J’étudie l’anglais.',
    });
    await addBlock(page, 'bilingual-text', {
        Title: 'Travel reading',
        'Content language': 'en',
        'Translation language': 'fr',
        'Original passage': 'I visited Paris last year.',
        'Translated passage': 'J’ai visité Paris l’année dernière.',
    });
    const grammarHandle = page.getByRole('button', {
        name: 'Select or drag block: Present simple',
        exact: true,
    });
    await grammarHandle.focus();
    await grammarHandle.press('Enter');
    await expect(
        page.getByRole('button', {
            name: 'Select or drag block: Present simple',
            exact: true,
        }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
        page.getByRole('toolbar', { name: 'Selection actions', exact: true }),
    ).toHaveCount(0);
    await page
        .getByRole('button', {
            name: 'Block settings: Present simple',
            exact: true,
        })
        .click();
    await expect(
        page.getByRole('menuitem', { name: 'Edit', exact: true }),
    ).toBeVisible();
    await capture(page, info, 'editor-inline-block-settings');
    await page.keyboard.press('Escape');
    await expect(
        page.getByRole('button', {
            name: 'Block settings: Present simple',
            exact: true,
        }),
    ).toBeFocused();
    await page
        .getByRole('button', {
            name: 'Block settings: Travel reading',
            exact: true,
        })
        .click();
    await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    const translationEditor = page.getByRole('dialog');
    await translationEditor
        .getByRole('combobox', { name: 'Prepared translation' })
        .selectOption('');
    await translationEditor
        .getByLabel('Translation language', { exact: true })
        .fill('es');
    await translationEditor
        .getByLabel('Translated passage', { exact: true })
        .fill('Visité París el año pasado.');
    await translationEditor
        .getByRole('button', { name: 'Apply block', exact: true })
        .click();
    await page
        .getByRole('button', {
            name: 'Block settings: Travel reading',
            exact: true,
        })
        .click();
    await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    await translationEditor
        .getByRole('combobox', { name: 'Prepared translation' })
        .selectOption('es');
    await expect(
        translationEditor.getByLabel('Translated passage', { exact: true }),
    ).toHaveValue('Visité París el año pasado.');
    await translationEditor
        .getByRole('combobox', { name: 'Prepared translation' })
        .selectOption('fr');
    await expect(
        translationEditor.getByLabel('Translated passage', { exact: true }),
    ).toHaveValue('J’ai visité Paris l’année dernière.');
    await translationEditor
        .getByRole('button', { name: 'Apply block', exact: true })
        .click();
    const authorBlocks = page.locator('[data-learning-block-id]');
    const beforeDragIds = await authorBlocks.evaluateAll((elements) =>
        elements.map((element) =>
            element.getAttribute('data-learning-block-id'),
        ),
    );
    expect(new Set(beforeDragIds).size).toBe(beforeDragIds.length);
    const grammarBlock = authorBlocks.filter({
        has: page.getByRole('heading', { name: 'Present simple', exact: true }),
    });
    const readingHandle = page.getByRole('button', {
        name: 'Select or drag block: Travel reading',
        exact: true,
    });
    await readingHandle.scrollIntoViewIfNeeded();
    const sourceBox = await readingHandle.boundingBox();
    if (!sourceBox) throw new Error('The block drag handle is unavailable.');
    const sourceX = sourceBox.x + sourceBox.width / 2;
    const sourceY = sourceBox.y + sourceBox.height / 2;
    await page.mouse.move(sourceX, sourceY);
    await page.mouse.down();
    // Start the native drag before scrolling its distant destination into view.
    // A single dragTo scrolls first and can retarget Chromium's initial dragstart.
    await page.mouse.move(sourceX + 8, sourceY + 8, { steps: 4 });
    await grammarBlock.scrollIntoViewIfNeeded();
    const destinationBox = await grammarBlock.boundingBox();
    if (!destinationBox)
        throw new Error('The block destination is unavailable.');
    await page.mouse.move(destinationBox.x + 20, destinationBox.y + 2, {
        steps: 12,
    });
    await page.mouse.move(destinationBox.x + 21, destinationBox.y + 3);
    await page.mouse.up();
    await expect(
        authorBlocks
            .first()
            .getByRole('heading', { name: 'Travel reading', exact: true }),
    ).toBeVisible();
    const afterDragIds = await authorBlocks.evaluateAll((elements) =>
        elements.map((element) =>
            element.getAttribute('data-learning-block-id'),
        ),
    );
    expect([...afterDragIds].sort()).toEqual([...beforeDragIds].sort());
    expect(new Set(afterDragIds).size).toBe(afterDragIds.length);
    await expect(
        page.getByRole('toolbar', { name: 'Selection actions', exact: true }),
    ).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page
        .getByRole('button', {
            name: 'Block settings: Travel reading',
            exact: true,
        })
        .click();
    await expect(
        page.getByRole('menuitem', { name: 'Copy block', exact: true }),
    ).toBeVisible();
    await capture(page, info, 'editor-block-settings-mobile');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: 'Add block', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Audio', exact: true }).click();
    await page
        .getByLabel('Upload audio (WAV or MP3, up to 5 MiB)')
        .setInputFiles({
            name: 'synthetic.wav',
            mimeType: 'audio/wav',
            buffer: syntheticWav(),
        });
    const audioDialog = page.getByRole('dialog');
    await audioDialog
        .getByLabel('Title', { exact: true })
        .fill('Listening sample');
    await audioDialog
        .getByRole('button', { name: 'Apply block', exact: true })
        .click();
    await expect(
        page.getByRole('button', { name: 'Save', exact: true }),
    ).toBeEnabled();
    const savedBlockIds = await authorBlocks.evaluateAll((elements) =>
        elements.map((element) =>
            element.getAttribute('data-learning-block-id'),
        ),
    );
    const saved = page.waitForResponse(
        (response) =>
            response.url().endsWith(`/knowledge/${noteId}/save`) &&
            response.status() === 200,
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await saved;
    await page.reload();
    await expect
        .poll(() =>
            authorBlocks.evaluateAll((elements) =>
                elements.map((element) =>
                    element.getAttribute('data-learning-block-id'),
                ),
            ),
        )
        .toEqual(savedBlockIds);
    await expect(
        page
            .locator('[data-learning-block-id]')
            .first()
            .getByRole('heading', { name: 'Travel reading', exact: true }),
    ).toBeVisible();
    await expect(
        page.getByRole('heading', { name: 'Present simple', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Audio tools', { exact: true })).toBeVisible();
    await page.getByText('Audio tools', { exact: true }).click();
    await expect(
        page.getByText('Add a text, vocabulary or grammar block first.', {
            exact: true,
        }),
    ).toHaveCount(0);
    await page.getByText('Audio tools', { exact: true }).click();
    await capture(page, info, 'editor-populated-desktop');
    await page.goto(`${origin}/knowledge/${noteId}/practice`);
    const reading = page.getByRole('region', {
        name: 'Travel reading',
        exact: true,
    });
    await expect(
        reading.getByText('I visited Paris last year.', { exact: true }),
    ).toBeVisible();
    await expect(
        reading.getByText('J’ai visité Paris l’année dernière.', {
            exact: true,
        }),
    ).toHaveCount(0);
    await reading
        .getByRole('button', { name: 'Bilingual', exact: true })
        .click();
    await expect(
        reading.getByText('J’ai visité Paris l’année dernière.', {
            exact: true,
        }),
    ).toBeVisible();
    await page
        .getByRole('button', { name: 'Save to Texts', exact: true })
        .click();
    const textLibrary = page.getByRole('dialog', { name: 'Save to Texts' });
    await textLibrary.getByLabel('Name', { exact: true }).fill('Travel copy');
    await textLibrary
        .getByRole('button', { name: 'Preview', exact: true })
        .click();
    await expect(
        textLibrary.getByText('I visited Paris last year.', { exact: true }),
    ).toBeVisible();
    await textLibrary
        .getByRole('button', { name: 'Save independent copy', exact: true })
        .click();
    await expect(
        textLibrary.getByText('Independent copy saved.', { exact: true }),
    ).toBeVisible();
    await page.goto(`${origin}/knowledge/${noteId}/practice`);
    await expect(
        page.getByRole('heading', { name: 'Present simple', exact: true }),
    ).toBeVisible();
    await page
        .getByRole('textbox', { name: 'Your answer', exact: true })
        .fill('study');
    await page
        .getByRole('button', { name: 'Save answer', exact: true })
        .click();
    await expect(
        page.getByText('Answer saved. Not evaluated.', { exact: true }),
    ).toBeVisible();
    await page
        .getByRole('region', { name: 'Verb practice', exact: true })
        .getByRole('button', { name: 'Show answer', exact: true })
        .click();
    await expect(
        page.getByText('I takes the base verb.', { exact: true }),
    ).toBeVisible();
    await page
        .getByRole('button', { name: 'Mark complete', exact: true })
        .click();
    await expect(page.getByText('Completed', { exact: true })).toBeVisible();
    await expect(page.locator('audio')).toHaveAttribute('src', /^blob:/u);
    await expect
        .poll(() =>
            page
                .locator('audio')
                .evaluate((audio: HTMLAudioElement) => audio.duration),
        )
        .toBe(1);
    await page.reload();
    await expect(page.getByText('Completed', { exact: true })).toBeVisible();
    const state = await api<WorkbookLearningState>(
        page,
        `/knowledge/${noteId}/learning`,
    );
    expect(state.attempts).toHaveLength(1);
    expect(state.attempts[0]?.evaluation.status).toBe('unchecked');
    expect(state.events.some((event) => event.kind === 'answer-revealed')).toBe(
        true,
    );
    // The original saved vocabulary is practiced directly, without publishing a dictionary.
    await page
        .getByRole('region', { name: 'Useful words', exact: true })
        .getByRole('button', { name: 'Train', exact: true })
        .click();
    await page.getByRole('menuitem', { name: 'Cards', exact: true }).click();
    const cardSetup = page.getByRole('dialog', { name: 'Train with cards' });
    await expect(
        cardSetup.getByRole('button', { name: 'Start', exact: true }),
    ).toBeEnabled();
    await cardSetup.getByRole('button', { name: 'Start', exact: true }).click();
    const cardPractice = page.getByRole('dialog', { name: /Card practice/ });
    await expect(cardPractice).toBeVisible();
    await cardPractice
        .getByRole('button', { name: 'Known', exact: true })
        .click();
    await expect(
        page.getByRole('heading', { name: 'Round 1 complete' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    const savedNote = await api<{ note: KnowledgeNote }>(
        page,
        `/knowledge/${noteId}`,
    );
    const vocabulary = savedNote.note.body.document.content?.find(
        (node) =>
            node.type === 'learningBlock' &&
            node.attrs?.block?.type === 'vocabulary',
    )?.attrs?.block;
    expect(vocabulary?.type).toBe('vocabulary');
    const vocabularyProgress = await api<{ known: number; total: number }>(
        page,
        `/knowledge/${noteId}/vocabulary/${vocabulary!.id}/learning/progress`,
    );
    expect(vocabularyProgress).toMatchObject({ known: 1, total: 1 });
    await page
        .getByRole('region', { name: 'Useful words', exact: true })
        .getByRole('button', { name: 'Train', exact: true })
        .click();
    await page
        .getByRole('menuitem', { name: 'Sentence practice', exact: true })
        .click();
    const sentenceSetup = page.getByRole('dialog', {
        name: /Sentence practice/,
    });
    await sentenceSetup.locator('input[value="source-to-target"]').check();
    await sentenceSetup
        .getByRole('button', { name: 'Start in a dialog', exact: true })
        .click();
    const sentencePractice = page.getByRole('dialog', {
        name: /Sentence practice/,
    });
    await expect(sentencePractice).toContainText('I study English.');
    await sentencePractice
        .getByRole('button', { name: /Show reference — free/ })
        .click();
    await expect(
        sentencePractice.getByRole('region', { name: 'Free comparison' }),
    ).toContainText('J’étudie l’anglais.');
    const sentenceHistory = await api<{ reviews: unknown[] }>(
        page,
        `/knowledge/${noteId}/vocabulary/${vocabulary!.id}/sentences/reviews`,
    );
    expect(sentenceHistory.reviews).toHaveLength(1);
    await sentencePractice
        .getByRole('button', { name: 'Close practice', exact: true })
        .click();
    await capture(page, info, 'workbook-practice-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
        page.getByRole('button', { name: 'Mark incomplete' }),
    ).toBeVisible();
    await capture(page, info, 'workbook-practice-mobile');
    // Replace only the remote hosting response; saved media/source authority stays real.
    await page.route('https://www.youtube-nocookie.com/**', (route) =>
        route.fulfill({
            contentType: 'text/html',
            body: '<!doctype html><title>Synthetic external video host</title>',
        }),
    );
    const timedVideoId = randomUUID(),
        timedPassageId = randomUUID(),
        timedExerciseId = randomUUID();
    const linkedTextId = randomUUID(),
        linkedTextPassage = randomUUID(),
        linkedTextExercise = randomUUID();
    const timed = await api<{ note: KnowledgeNote }>(
        page,
        '/knowledge',
        {
            operationId: randomUUID(),
            content: {
                title: 'Timestamped viewing',
                summary: '',
                categories: [],
                studiedLanguage: 'en',
                explanationLanguage: 'en',
                body: {
                    schemaVersion: 2,
                    document: {
                        type: 'doc',
                        content: [
                            {
                                type: 'learningBlock',
                                attrs: {
                                    block: {
                                        id: timedVideoId,
                                        type: 'video',
                                        title: 'Timestamped video',
                                        source: {
                                            kind: 'youtube',
                                            videoId: 'abcdefghijk',
                                        },
                                        transcript: {
                                            language: 'en',
                                            segments: [
                                                {
                                                    id: timedPassageId,
                                                    text: 'The bus stops at the station.',
                                                    timing: {
                                                        startSeconds: 12,
                                                        endSeconds: 16,
                                                    },
                                                },
                                                {
                                                    id: randomUUID(),
                                                    text: 'The remaining transcript stays hidden.',
                                                },
                                            ],
                                        },
                                    },
                                },
                            },
                            {
                                type: 'learningBlock',
                                attrs: {
                                    block: {
                                        id: timedExerciseId,
                                        type: 'exercise',
                                        title: 'Timestamped question',
                                        format: 'free-text',
                                        question: 'Where does the bus stop?',
                                        referenceAnswer: 'At the station.',
                                        explanation:
                                            'The selected passage names the station.',
                                        source: {
                                            blockId: timedVideoId,
                                            segmentIds: [timedPassageId],
                                        },
                                    },
                                },
                            },
                            {
                                type: 'learningBlock',
                                attrs: {
                                    block: {
                                        id: linkedTextId,
                                        type: 'bilingual-text',
                                        title: 'Linked reading source',
                                        language: 'en',
                                        segments: [
                                            {
                                                id: linkedTextPassage,
                                                text: 'The train leaves at noon.',
                                            },
                                            {
                                                id: randomUUID(),
                                                text: 'An unselected reading passage.',
                                            },
                                        ],
                                        translations: [],
                                    },
                                },
                            },
                            {
                                type: 'learningBlock',
                                attrs: {
                                    block: {
                                        id: linkedTextExercise,
                                        type: 'exercise',
                                        title: 'Linked reading question',
                                        format: 'free-text',
                                        question: 'When does the train leave?',
                                        referenceAnswer: 'At noon.',
                                        explanation:
                                            'Noon is named in the selected source passage.',
                                        source: {
                                            blockId: linkedTextId,
                                            segmentIds: [linkedTextPassage],
                                        },
                                    },
                                },
                            },
                        ],
                    },
                },
            },
        },
        'POST',
    );
    await page.goto(`${origin}/knowledge/${timed.note.id}/practice`);
    const videoQuestion = page.getByRole('region', {
        name: 'Timestamped question',
        exact: true,
    });
    await expect(
        page.getByText('The remaining transcript stays hidden.', {
            exact: true,
        }),
    ).toHaveCount(0);
    await expect(
        videoQuestion.getByText('The bus stops at the station.', {
            exact: true,
        }),
    ).toHaveCount(0);
    await videoQuestion
        .getByRole('button', { name: 'Hint', exact: true })
        .click();
    await expect(
        videoQuestion.getByText('The bus stops at the station.', {
            exact: true,
        }),
    ).toBeVisible();
    await videoQuestion
        .getByRole('button', { name: 'Replay passage', exact: true })
        .click();
    await expect(videoQuestion.locator('iframe')).toHaveAttribute(
        'src',
        'https://www.youtube-nocookie.com/embed/abcdefghijk?start=12&autoplay=1',
    );
    const videoSource = page.getByRole('region', {
        name: 'Timestamped video',
        exact: true,
    });
    await videoSource
        .getByRole('button', { name: 'Show transcript', exact: true })
        .click();
    await videoSource
        .getByRole('button', { name: 'Replay passage', exact: true })
        .click();
    await expect(videoSource.locator('iframe')).toHaveAttribute(
        'src',
        'https://www.youtube-nocookie.com/embed/abcdefghijk?start=12&autoplay=1',
    );
    const readingQuestion = page.getByRole('region', {
        name: 'Linked reading question',
        exact: true,
    });
    await expect(
        readingQuestion.getByText('The train leaves at noon.', { exact: true }),
    ).toHaveCount(0);
    await readingQuestion
        .getByRole('button', { name: 'Hint', exact: true })
        .click();
    await expect(
        readingQuestion.getByText('The train leaves at noon.', { exact: true }),
    ).toBeVisible();
    await expect(
        readingQuestion.getByText('An unselected reading passage.', {
            exact: true,
        }),
    ).toHaveCount(0);
    await expect(
        readingQuestion.getByRole('button', {
            name: 'Replay passage',
            exact: true,
        }),
    ).toHaveCount(0);
    await expect
        .poll(async () => {
            const result = await api<WorkbookLearningState>(
                page,
                `/knowledge/${timed.note.id}/learning`,
            );
            return {
                hints: result.events.filter(
                    (event) => event.kind === 'hint-used',
                ).length,
                attempts: result.attempts.length,
            };
        })
        .toEqual({ hints: 2, attempts: 0 });
    healthy();
});

// @user-flow interactive-workbooks/workbook-share-private-copy-revoke
test('ordered workbook shares saved content, isolates reader progress, copies independently and revokes safely', async ({
    page,
    browser,
}, info) => {
    const healthy = runtime(page);
    await signup(page, info, 'owner');
    const hostile = '<img src=x onerror="window.workbookInjected=true">';
    const exerciseId = randomUUID();
    const greetingId = randomUUID();
    const greetingSegmentId = randomUUID();
    const create = async (title: string, blocks: unknown[]) =>
        (
            await api<{ note: KnowledgeNote }>(
                page,
                '/knowledge',
                {
                    operationId: randomUUID(),
                    content: {
                        title,
                        summary: '',
                        categories: [],
                        studiedLanguage: 'en',
                        explanationLanguage: 'en',
                        body: {
                            schemaVersion: 2,
                            document: {
                                type: 'doc',
                                content: blocks.map((block) => ({
                                    type: 'learningBlock',
                                    attrs: { block },
                                })),
                            },
                        },
                    },
                },
                'POST',
            )
        ).note;
    const first = await create('Safe shared lesson', [
        { id: randomUUID(), type: 'grammar', language: 'en', rule: hostile },
        {
            id: greetingId,
            type: 'bilingual-text',
            language: 'en',
            title: 'Shared greeting',
            segments: [{ id: greetingSegmentId, text: 'Hello world.' }],
            translations: [
                {
                    language: 'es',
                    segments: [
                        {
                            sourceSegmentId: greetingSegmentId,
                            text: 'Hola mundo.',
                        },
                    ],
                },
            ],
        },
        {
            id: exerciseId,
            type: 'exercise',
            format: 'free-text',
            question: 'Write a greeting.',
            referenceAnswer: 'Hello.',
            explanation: 'A common greeting.',
        },
    ]);
    const second = await create('Second lesson', [
        {
            id: randomUUID(),
            type: 'grammar',
            language: 'en',
            rule: 'Keep learning.',
        },
    ]);
    await page.goto(`${origin}/workbooks`);
    await page.getByLabel('Workbook title').fill('Ordered course foundation');
    await page
        .getByRole('button', { name: 'Create workbook', exact: true })
        .click();
    await expect(page).toHaveURL(/\/workbooks\/[0-9a-f-]{36}$/u);
    const workbookId = new URL(page.url()).pathname.split('/').at(-1)!;
    await page.getByLabel('Add note', { exact: true }).selectOption(first.id);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(
        page.getByRole('button', { name: first.title, exact: true }),
    ).toBeVisible();
    await page
        .getByRole('button', { name: 'Share workbook', exact: true })
        .click();
    const link = page.getByLabel('Share link', { exact: true });
    await expect(link).toHaveValue(/\/shared\/workbooks\/.+#.+/u);
    const sharedUrl = await link.inputValue();
    await page.getByLabel('Add note', { exact: true }).selectOption(second.id);
    await expect(
        page.getByRole('button', { name: 'Add', exact: true }),
    ).toBeDisabled();
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const secondRow = page.locator('li').filter({
        has: page.getByRole('button', { name: second.title, exact: true }),
    });
    await secondRow.getByRole('button', { name: 'Move up' }).click();
    await expect
        .poll(async () =>
            (
                await api<{ workbook: Workbook }>(
                    page,
                    `/knowledge/workbooks/${workbookId}`,
                )
            ).workbook.notes.map((note) => note.id),
        )
        .toEqual([second.id, first.id]);
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
    });
    try {
        const reader = await context.newPage();
        const readerHealthy = runtime(reader);
        await reader.goto(sharedUrl);
        await expect(
            reader.getByRole('heading', { name: second.title, exact: true }),
        ).toBeVisible();
        await expect(
            reader.getByRole('button', { name: 'Save answer' }),
        ).toHaveCount(0);
        await expect(
            reader.getByText('Private translation', { exact: true }),
        ).toHaveCount(0);
        await signup(reader, info, 'reader');
        await reader.goto(sharedUrl);
        await expect(
            reader.getByText('Completed notes: 0 / 2', { exact: true }),
        ).toBeVisible();
        await reader.getByRole('button', { name: 'Next', exact: true }).click();
        await expect(reader.getByText(hostile, { exact: true })).toBeVisible();
        expect(
            await reader.evaluate(
                () =>
                    (window as unknown as Record<string, unknown>)
                        .workbookInjected,
            ),
        ).toBeUndefined();
        expect(await reader.locator('img[src="x"]').count()).toBe(0);
        const greeting = reader.getByRole('region', {
            name: 'Shared greeting',
            exact: true,
        });
        await greeting
            .getByText('Private translation', { exact: true })
            .click();
        await greeting
            .getByLabel('Target language', { exact: true })
            .selectOption('fr');
        await greeting
            .getByRole('button', { name: 'Translate privately', exact: true })
            .click();
        const consent = reader.getByRole('dialog', {
            name: 'Review this action’s budget',
            exact: true,
        });
        await expect(consent).toBeVisible();
        await consent
            .getByRole('button', { name: 'Send', exact: true })
            .click();
        const privateView = greeting.getByRole('region', {
            name: 'Your private bilingual view',
            exact: true,
        });
        await expect(privateView).toBeVisible({ timeout: 30_000 });
        await privateView
            .getByRole('button', { name: 'Bilingual', exact: true })
            .click();
        await expect(
            privateView.getByText('[fr] Hello world.', { exact: true }),
        ).toBeVisible();
        const ownerSource = await api<{ note: KnowledgeNote }>(
            page,
            `/knowledge/${first.id}`,
        );
        expect(JSON.stringify(ownerSource.note.body)).toContain('Hola mundo.');
        expect(JSON.stringify(ownerSource.note.body)).not.toContain(
            '[fr] Hello world.',
        );
        const otherContext = await browser.newContext({
            viewport: { width: 390, height: 844 },
        });
        try {
            const otherReader = await otherContext.newPage();
            const otherHealthy = runtime(otherReader);
            await otherReader.goto(sharedUrl);
            await signup(otherReader, info, 'other-reader');
            await otherReader.goto(sharedUrl);
            await otherReader
                .getByRole('button', { name: 'Next', exact: true })
                .click();
            const otherGreeting = otherReader.getByRole('region', {
                name: 'Shared greeting',
                exact: true,
            });
            await otherGreeting
                .getByText('Private translation', { exact: true })
                .click();
            await expect(
                otherGreeting.getByRole('region', {
                    name: 'Your private bilingual view',
                    exact: true,
                }),
            ).toHaveCount(0);
            otherHealthy();
        } finally {
            await otherContext.close();
        }
        await reader
            .getByRole('textbox', { name: 'Your answer', exact: true })
            .fill('Hello');
        await reader
            .getByRole('button', { name: 'Save answer', exact: true })
            .click();
        await expect(
            reader.getByText('Answer saved. Not evaluated.', { exact: true }),
        ).toBeVisible();
        await reader
            .getByRole('button', { name: 'Mark complete', exact: true })
            .click();
        await expect(
            reader.getByText('Completed notes: 1 / 2', { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText('Completed notes: 0 / 2', { exact: true }),
        ).toBeVisible();
        const ownerState = await api<WorkbookLearningState>(
            page,
            `/knowledge/${first.id}/learning`,
        );
        expect(ownerState.attempts).toEqual([]);
        await reader
            .getByRole('button', { name: 'Copy workbook', exact: true })
            .click();
        await expect(reader).toHaveURL(/\/workbooks\/[0-9a-f-]{36}$/u);
        const copyId = new URL(reader.url()).pathname.split('/').at(-1)!;
        expect(copyId).not.toBe(workbookId);
        await page
            .getByRole('button', { name: 'Disable sharing', exact: true })
            .click();
        await expect(
            page.getByRole('button', { name: 'Disable sharing', exact: true }),
        ).toHaveCount(0);
        await reader.reload();
        await expect(
            reader.getByRole('heading', {
                name: 'Ordered course foundation',
                exact: true,
            }),
        ).toBeVisible();
        await reader.goto(sharedUrl);
        await expect(
            reader.getByText('This shared workbook is unavailable.', {
                exact: true,
            }),
        ).toBeVisible();
        readerHealthy();
    } finally {
        await context.close();
    }
    healthy();
});
