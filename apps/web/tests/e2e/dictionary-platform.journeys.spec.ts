import {
    expect,
    test,
    type Locator,
    type Page,
    type TestInfo,
} from '@playwright/test';
import { readFile } from 'node:fs/promises';

// @user-flow-revision dictionary-platform sha256:88cffdee38a7d5a1

const password = 'E2e!Dictionary-password-2026';
const backendPort = new URL(
    process.env.AUTH_E2E_BACKEND_ORIGIN ?? 'http://localhost:4000',
).port;
const runId =
    process.env.AUTH_E2E_RUN_ID ?? `${Date.now().toString(36)}-${process.pid}`;

function syntheticEmail(testInfo: TestInfo, journey: string): string {
    return `dictionary-e2e-${runId}-${testInfo.workerIndex}-${journey}@example.test`;
}

function captureBrowserErrors(
    page: Page,
    expectedResponse: (path: string, status: number) => boolean = () => false,
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
            (path.startsWith('/shared/dictionaries/') &&
                response.status() === 404) ||
            expectedResponse(path, response.status());
        if (!expected) errors.push(`${response.status()} ${path}`);
    });
    return () => expect(errors, 'unexpected browser errors').toEqual([]);
}

async function signUpAndVerify(
    page: Page,
    email: string,
    returnTo: string,
): Promise<void> {
    await page.goto(`/signup?returnTo=${encodeURIComponent(returnTo)}`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/verify-email\?/);
    await page.getByLabel('Verification code').fill('0000');
    await page.getByRole('button', { name: 'Verify email' }).click();
    await expect(page).toHaveURL(
        new RegExp(`${returnTo.replaceAll('/', '\\/')}$`),
    );
}

async function signUpAndVerifyOrSignInAfterRateLimit(
    page: Page,
    email: string,
    returnTo: string,
    fallbackEmail: string,
): Promise<void> {
    await page.goto(`/signup?returnTo=${encodeURIComponent(returnTo)}`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();

    let outcome = 'pending';
    await expect
        .poll(async () => {
            if (new URL(page.url()).pathname === '/verify-email') {
                outcome = 'verify';
            }
            if (
                outcome === 'pending' &&
                (await page
                    .getByText('Too many attempts', { exact: false })
                    .isVisible())
            ) {
                outcome = 'rate-limited';
            }
            return outcome;
        })
        .not.toBe('pending');

    if (outcome === 'rate-limited') {
        await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
        await page.getByLabel('Email').fill(fallbackEmail);
        await page.getByLabel('Password', { exact: true }).fill(password);
        await page
            .getByRole('button', { name: 'Sign in', exact: true })
            .click();
        await expect(page).toHaveURL(
            new RegExp(`${returnTo.replaceAll('/', '\\/')}$`),
        );
        return;
    }

    await page.getByLabel('Verification code').fill('0000');
    await page.getByRole('button', { name: 'Verify email' }).click();
    await expect(page).toHaveURL(
        new RegExp(`${returnTo.replaceAll('/', '\\/')}$`),
    );
}

async function createDictionary(page: Page, name: string): Promise<void> {
    await page.getByRole('button', { name: 'New dictionary' }).click();
    await page.getByLabel('Name').fill(name);
    await page
        .getByLabel('Description')
        .fill('Vocabulary used in an art studio.');
    await page.getByLabel('Translate from').selectOption('en');
    await page.getByLabel('Translate to').selectOption('es');
    await page.getByRole('button', { name: 'Create dictionary' }).click();
    const dictionaryHeading = page.getByRole('heading', { name });
    await expect(dictionaryHeading).toBeVisible();
    await expect(
        dictionaryHeading
            .locator('xpath=ancestor::header')
            .getByText('Private', { exact: true }),
    ).toBeVisible();
}

async function addPopulatedCard(
    page: Page,
    translationContext?: string,
    verifyResponsiveLayout = false,
): Promise<void> {
    const settings = await openDictionarySettings(page);
    if (translationContext) {
        await settings
            .getByLabel('Dictionary context')
            .fill(translationContext);
    }
    if (verifyResponsiveLayout) {
        await settings.getByLabel('Transcription').check();
    }
    await settings.getByLabel('Definition').check();
    await settings.getByLabel('Context example').check();
    await settings.getByLabel('Example translation').check();
    await settings.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Dictionary settings saved.')).toBeVisible();
    await settings
        .getByRole('button', { name: 'Cancel', exact: true })
        .first()
        .click();

    await page.getByRole('button', { name: 'Add card' }).click();
    if (verifyResponsiveLayout) {
        const editor = page.getByRole('dialog', { name: 'Add card' });
        await expectEditorWordPair(editor, 'columns');
        const bounds = await editor.boundingBox();
        expect(bounds!.width).toBeGreaterThan(800);
        expect(bounds!.width).toBeLessThanOrEqual(880);
        await page.setViewportSize({ width: 768, height: 900 });
        await expectEditorWordPair(editor, 'columns');
        await page.setViewportSize({ width: 320, height: 900 });
        await expectEditorWordPair(editor, 'stacked');
        await page.setViewportSize({ width: 1280, height: 900 });
    }
    await page.getByLabel(/^Source word or phrase \(/).fill('work of art');
    await page.getByLabel(/^Translation \(/).fill('obra de arte');
    await page
        .getByLabel(/^Definition \(/)
        .fill('An object made for artistic expression.');
    await page
        .getByLabel(/^Context example \(/)
        .fill('The gallery acquired the work of art.');
    await page
        .getByLabel(/^Example translation \(/)
        .fill('La galería adquirió la obra de arte.');
    if (verifyResponsiveLayout) {
        await page.getByLabel(/^Transcription \(/).fill('wɜːk əv ɑːt');
    }
    await page.getByRole('button', { name: 'Create card' }).click();
    await expect(page.getByText('work of art', { exact: true })).toBeVisible();
    const lockedSettings = await openDictionarySettings(page);
    await expect(
        lockedSettings.getByText('Locked', { exact: true }),
    ).toBeVisible();
    await expect(lockedSettings.getByLabel('Translate from')).toHaveCount(0);
    await lockedSettings
        .getByRole('button', { name: 'Cancel', exact: true })
        .first()
        .click();
}

async function openDictionarySettings(page: Page) {
    await page.getByRole('button', { name: /^Dictionary settings —/ }).click();
    const settings = page.getByRole('dialog', {
        name: 'Dictionary settings',
    });
    await expect(settings).toBeVisible();
    return settings;
}

async function chooseDictionarySecondaryAction(page: Page, action: string) {
    await page.getByRole('button', { name: 'More dictionary actions' }).click();
    await page
        .getByRole('menuitem', {
            name: action,
            exact: true,
        })
        .click();
}

async function chooseDictionaryLibraryAction(
    page: Page,
    name: string,
    action: string,
) {
    const dictionary = page.getByRole('listitem').filter({ hasText: name });
    await dictionary
        .getByRole('button', { name: `Actions for ${name}`, exact: true })
        .click();
    await dictionary
        .getByRole('menuitem', { name: action, exact: true })
        .click();
}

async function chooseCardAction(
    page: Page,
    source: string,
    action: string,
): Promise<void> {
    const card = page.getByRole('listitem').filter({ hasText: source });
    await card.getByRole('button', { name: /Card actions, card/ }).click();
    await card.getByRole('menuitem', { name: action }).click();
}

async function expectWordPairGeometry(
    source: Locator,
    translation: Locator,
    layout: 'columns' | 'stacked',
) {
    await expect(source).toBeVisible();
    await expect(translation).toBeVisible();
    await expect
        .poll(async () => {
            const [first, second] = await Promise.all([
                source.boundingBox(),
                translation.boundingBox(),
            ]);
            if (!first || !second) return false;
            const equalWidth = Math.abs(first.width - second.width) <= 1;
            return layout === 'columns'
                ? equalWidth &&
                      Math.abs(first.y - second.y) <= 1 &&
                      second.x >= first.x + first.width
                : equalWidth &&
                      Math.abs(first.x - second.x) <= 1 &&
                      second.y >= first.y + first.height;
        }, `Source and Translation should render as equal ${layout}`)
        .toBe(true);
}

async function expectEditorWordPair(
    editor: Locator,
    layout: 'columns' | 'stacked',
) {
    const source = editor.getByRole('textbox', {
        name: /^Source word or phrase \(/,
    });
    const translation = editor.getByRole('textbox', {
        name: /^Translation \(/,
    });
    // Field labels/actions may wrap independently; align the complete fields.
    // Input adds nested spans, so find the nearest Field containing a label row.
    const sourceField = source.locator('xpath=ancestor::div[div/label][1]');
    const translationField = translation.locator(
        'xpath=ancestor::div[div/label][1]',
    );
    await expectWordPairGeometry(sourceField, translationField, layout);
    await expect(source).toHaveAttribute('lang', 'en');
    await expect(translation).toHaveAttribute('lang', 'es');
    await expect(source).toHaveAttribute('dir', 'ltr');
    await expect(translation).toHaveAttribute('dir', 'ltr');
    const definition = editor.getByRole('textbox', {
        name: /^Definition \(/,
    });
    const [translationBounds, definitionBounds] = await Promise.all([
        translation.boundingBox(),
        definition.boundingBox(),
    ]);
    expect(definitionBounds!.y).toBeGreaterThanOrEqual(
        translationBounds!.y + translationBounds!.height,
    );
    expect(definitionBounds!.width).toBeGreaterThanOrEqual(
        translationBounds!.width,
    );
    const example = editor.getByRole('textbox', {
        name: /^Context example \(/,
    });
    const exampleTranslation = editor.getByRole('textbox', {
        name: /^Example translation \(/,
    });
    await expectWordPairGeometry(
        example.locator('xpath=ancestor::div[div/label][1]'),
        exampleTranslation.locator('xpath=ancestor::div[div/label][1]'),
        layout,
    );
    await expect(example).toHaveAttribute('lang', 'en');
    await expect(exampleTranslation).toHaveAttribute('lang', 'es');
    await expect(example).toHaveAttribute('dir', 'ltr');
    await expect(exampleTranslation).toHaveAttribute('dir', 'ltr');
}

async function expectOwnerWordPair(
    page: Page,
    translation: string,
    layout: 'columns' | 'stacked',
    singleExample = false,
    audioExpected = true,
) {
    const card = page.getByRole('listitem').filter({ hasText: 'work of art' });
    const sourceWord = card.locator('strong[lang="en"]');
    const translatedWord = card.locator('strong[lang="es"]');
    await expect(translatedWord).toHaveText(translation);
    await expectWordPairGeometry(sourceWord, translatedWord, layout);
    if (layout === 'columns') {
        const [sourceText, translatedText] = await Promise.all([
            sourceWord.locator('span').first().boundingBox(),
            translatedWord.locator('span').first().boundingBox(),
        ]);
        expect(Math.abs(sourceText!.y - translatedText!.y)).toBeLessThan(2);
    }
    await expect(sourceWord).toHaveAttribute('dir', 'ltr');
    await expect(translatedWord).toHaveAttribute('dir', 'ltr');
    const transcription = card.getByText('(wɜːk əv ɑːt)', { exact: true });
    await expect(transcription).toBeVisible();
    await expect(card.locator('[data-field="transcription"]')).toHaveCount(0);
    const [sourceTextBounds, transcriptionBounds] = await Promise.all([
        sourceWord.boundingBox(),
        transcription.boundingBox(),
    ]);
    expect(transcriptionBounds!.y).toBeGreaterThanOrEqual(
        sourceTextBounds!.y + sourceTextBounds!.height,
    );
    const fontSizes = await Promise.all([
        sourceWord.evaluate((element) =>
            parseFloat(getComputedStyle(element).fontSize),
        ),
        transcription.evaluate((element) =>
            parseFloat(getComputedStyle(element).fontSize),
        ),
    ]);
    expect(fontSizes[1]).toBeLessThan(fontSizes[0]!);
    const actions = card.getByRole('button', { name: /Card actions, card/ });
    await expect(actions).toBeVisible();
    const [sourceBounds, translationBounds, definitionBounds] =
        await Promise.all([
            sourceWord.boundingBox(),
            translatedWord.boundingBox(),
            card
                .getByText('An object made for artistic expression.', {
                    exact: true,
                })
                .boundingBox(),
        ]);
    expect(definitionBounds!.y).toBeGreaterThanOrEqual(
        Math.max(
            sourceBounds!.y + sourceBounds!.height,
            translationBounds!.y + translationBounds!.height,
        ),
    );
    const example = card.locator('dl > div[data-field="example"]');
    const exampleTranslation = card.locator(
        'dl > div[data-field="exampleTranslation"]',
    );
    if (singleExample) {
        await expect(exampleTranslation).toHaveCount(0);
        const [exampleBounds, definitionRowBounds] = await Promise.all([
            example.boundingBox(),
            card.locator('dl > div[data-field="definition"]').boundingBox(),
        ]);
        expect(
            Math.abs(exampleBounds!.width - definitionRowBounds!.width),
        ).toBeLessThanOrEqual(1);
    } else {
        await expectWordPairGeometry(example, exampleTranslation, layout);
        await expect(
            exampleTranslation.locator('dd > span:first-child'),
        ).toHaveAttribute('lang', 'es');
    }
    await expect(example.locator('dd > span:first-child')).toHaveAttribute(
        'lang',
        'en',
    );
    for (const row of singleExample
        ? [example]
        : [example, exampleTranslation]) {
        const audioButtons = row.getByRole('button');
        if (!audioExpected) {
            await expect(audioButtons).toHaveCount(0);
            continue;
        }
        await expect(audioButtons.first()).toBeVisible();
        await expect
            .poll(async () => {
                const rowBounds = await row.boundingBox();
                const buttonBounds = await Promise.all(
                    (await audioButtons.all()).map((button) =>
                        button.boundingBox(),
                    ),
                );
                if (!rowBounds || buttonBounds.some((bounds) => !bounds))
                    return false;
                return buttonBounds.every(
                    (bounds) =>
                        bounds!.x >= rowBounds.x - 1 &&
                        bounds!.y >= rowBounds.y - 1 &&
                        bounds!.x + bounds!.width <=
                            rowBounds.x + rowBounds.width + 1 &&
                        bounds!.y + bounds!.height <=
                            rowBounds.y + rowBounds.height + 1,
                );
            }, 'example audio controls should fit completely inside their row')
            .toBe(true);
    }
}

test.describe('dictionary platform journeys', () => {
    // @user-flow dictionary-platform/owner-creates-edits-and-restores-dictionary
    test('owner creates, edits, archives, and restores dictionary content', async ({
        page,
    }, testInfo) => {
        const assertNoBrowserErrors = captureBrowserErrors(page);
        const name = `Studio Spanish ${runId}`;
        await signUpAndVerify(page, syntheticEmail(testInfo, 'owner'), '/');
        await page.getByRole('link', { name: 'Dictionaries' }).click();
        await expect(
            page.getByRole('heading', { name: 'My dictionaries' }),
        ).toBeVisible();
        await expect(
            page.getByRole('complementary', { name: 'Application sidebar' }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Collapse sidebar' }).click();
        await expect(
            page.getByRole('button', { name: 'Expand sidebar' }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Expand sidebar' }).click();
        await page.setViewportSize({ width: 320, height: 900 });
        const menuButton = page.getByRole('button', {
            name: 'Open navigation',
        });
        await menuButton.click();
        await expect(
            page.getByRole('dialog', { name: 'Main navigation' }),
        ).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(menuButton).toBeFocused();
        await page.setViewportSize({ width: 1280, height: 900 });
        await createDictionary(page, name);
        const translationContext =
            'Visual arts, galleries, and professional studio practice.';
        await addPopulatedCard(page, translationContext, true);
        await expectOwnerWordPair(page, 'obra de arte', 'columns');
        const desktopScreenshot = testInfo.outputPath(
            'transcription-desktop.png',
        );
        await page.screenshot({ path: desktopScreenshot });
        await testInfo.attach('transcription-desktop', {
            path: desktopScreenshot,
            contentType: 'image/png',
        });
        await page.setViewportSize({ width: 768, height: 900 });
        await expectOwnerWordPair(page, 'obra de arte', 'columns');
        await page.setViewportSize({ width: 320, height: 900 });
        await expectOwnerWordPair(page, 'obra de arte', 'stacked');
        const narrowScreenshot = testInfo.outputPath(
            'transcription-narrow.png',
        );
        await page.screenshot({ path: narrowScreenshot });
        await testInfo.attach('transcription-narrow', {
            path: narrowScreenshot,
            contentType: 'image/png',
        });
        await page.evaluate(() => {
            document.documentElement.style.fontSize = '200%';
        });
        const addCard = page.getByRole('button', { name: 'Add card' });
        await expectOwnerWordPair(page, 'obra de arte', 'stacked');
        await addCard.focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await expect(addCard).toBeFocused();
        expect(
            await addCard.evaluate(
                (element) => getComputedStyle(element).outlineStyle,
            ),
        ).not.toBe('none');
        expect(
            await page.evaluate(
                () =>
                    document.documentElement.scrollWidth <=
                    document.documentElement.clientWidth + 1,
            ),
        ).toBe(true);
        await addCard.click();
        const compactEditor = page.getByRole('dialog', { name: 'Add card' });
        await expect(compactEditor).toBeVisible();
        await expectEditorWordPair(compactEditor, 'stacked');
        expect(
            await page.evaluate(
                () =>
                    document.documentElement.scrollWidth <=
                    document.documentElement.clientWidth + 1,
            ),
        ).toBe(true);
        const draftSource = compactEditor.getByLabel(
            /^Source word or phrase \(/,
        );
        const draftTranslation = compactEditor.getByLabel(/^Translation \(/);
        await draftSource.fill('s'.repeat(200));
        await draftTranslation.fill('t'.repeat(200));
        await expectEditorWordPair(compactEditor, 'stacked');
        for (const input of [draftSource, draftTranslation]) {
            const inputBounds = await input.boundingBox();
            expect(inputBounds!.x).toBeGreaterThanOrEqual(0);
            expect(inputBounds!.x + inputBounds!.width).toBeLessThanOrEqual(
                320,
            );
        }
        await draftSource.focus();
        await page.keyboard.press('Tab');
        await expect(
            compactEditor.getByRole('button', {
                name: 'Regenerate Translation',
                exact: true,
            }),
        ).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(draftTranslation).toBeFocused();
        await draftTranslation.fill('');
        await draftSource.fill('temporary draft');
        await page.keyboard.press('Escape');
        const discardDraft = page.getByRole('dialog', {
            name: 'Discard this draft?',
        });
        await expect(discardDraft).toBeVisible();
        await discardDraft
            .getByRole('button', { name: 'Keep writing' })
            .click();
        await expect(compactEditor).toBeVisible();
        await expect(draftSource).toHaveValue('temporary draft');

        await compactEditor
            .getByRole('button', { name: 'Cancel' })
            .first()
            .click();
        await expect(discardDraft).toBeVisible();
        await discardDraft
            .getByRole('button', { name: 'Keep writing' })
            .click();
        await expect(draftSource).toHaveValue('temporary draft');

        await compactEditor
            .getByRole('button', { name: 'Discard draft' })
            .last()
            .click();
        await expect(discardDraft).toBeVisible();
        await discardDraft
            .getByRole('button', { name: 'Discard draft' })
            .click();
        await expect(compactEditor).not.toBeVisible();

        await addCard.click();
        await expect(compactEditor).toBeVisible();
        await compactEditor
            .getByRole('button', { name: 'Discard draft' })
            .last()
            .click();
        await expect(discardDraft).not.toBeVisible();
        await expect(compactEditor).not.toBeVisible();
        await page.evaluate(() => {
            document.documentElement.style.fontSize = '';
        });
        await page.setViewportSize({ width: 1280, height: 720 });

        // One enabled example field fills the row; dormant values stay intact.
        const singleExampleSettings = await openDictionarySettings(page);
        await singleExampleSettings.getByLabel('Example translation').uncheck();
        await singleExampleSettings
            .getByRole('button', { name: 'Save settings' })
            .click();
        await expect(
            singleExampleSettings.getByText('Dictionary settings saved.', {
                exact: true,
            }),
        ).toBeVisible();
        await singleExampleSettings
            .getByRole('button', { name: 'Cancel', exact: true })
            .first()
            .click();
        await expect(singleExampleSettings).not.toBeVisible();
        await addCard.click();
        const singleExampleEditor = page.getByRole('dialog', {
            name: 'Add card',
        });
        const singleExampleField = singleExampleEditor
            .getByRole('textbox', { name: /^Context example \(/ })
            .locator('xpath=ancestor::div[div/label][1]');
        const singleDefinitionField = singleExampleEditor
            .getByRole('textbox', { name: /^Definition \(/ })
            .locator('xpath=ancestor::div[div/label][1]');
        await expect(
            singleExampleEditor.getByRole('textbox', {
                name: /^Example translation \(/,
            }),
        ).toHaveCount(0);
        const [singleExampleBounds, singleDefinitionBounds] = await Promise.all(
            [
                singleExampleField.boundingBox(),
                singleDefinitionField.boundingBox(),
            ],
        );
        expect(
            Math.abs(
                singleExampleBounds!.width - singleDefinitionBounds!.width,
            ),
        ).toBeLessThanOrEqual(1);
        await singleExampleEditor
            .getByRole('button', { name: 'Discard draft' })
            .last()
            .click();
        const pairedExampleSettings = await openDictionarySettings(page);
        await pairedExampleSettings.getByLabel('Example translation').check();
        await pairedExampleSettings
            .getByRole('button', { name: 'Save settings' })
            .click();
        await expect(
            pairedExampleSettings.getByText('Dictionary settings saved.', {
                exact: true,
            }),
        ).toBeVisible();
        await pairedExampleSettings
            .getByRole('button', { name: 'Cancel', exact: true })
            .first()
            .click();

        await expect(pairedExampleSettings).not.toBeVisible();
        await chooseCardAction(page, 'work of art', 'Edit');
        let cardEditor = page.getByRole('dialog', { name: 'Edit card' });
        await expect(cardEditor).toBeVisible();
        await expectEditorWordPair(cardEditor, 'columns');
        await page.setViewportSize({ width: 768, height: 900 });
        await expectEditorWordPair(cardEditor, 'columns');
        await page.evaluate(() => {
            document.documentElement.style.fontSize = '200%';
        });
        await expectEditorWordPair(cardEditor, 'stacked');
        await page.evaluate(() => {
            document.documentElement.style.fontSize = '';
        });
        await page.setViewportSize({ width: 1280, height: 720 });
        await expect(
            cardEditor.getByText(translationContext, { exact: true }),
        ).toBeVisible();
        await cardEditor.getByLabel('Update context').check();
        await cardEditor
            .getByRole('textbox', { name: /Card context/ })
            .fill('Insurance appraisal of valuable artworks.');
        await cardEditor.getByLabel(/^Translation \(/).fill('pieza de arte');
        await cardEditor.getByLabel(/^Example translation \(/).fill('');
        let releaseCardSave: (() => void) | undefined;
        const cardSaveGate = new Promise<void>((resolve) => {
            releaseCardSave = resolve;
        });
        const cardRoute = '**/dictionaries/*/cards/*';
        await page.route(cardRoute, async (route) => {
            if (route.request().method() === 'PATCH') await cardSaveGate;
            await route.continue();
        });
        await page.getByRole('button', { name: 'Save card' }).click();
        const pendingEditor = cardEditor;
        await expect(
            pendingEditor
                .getByRole('button', { name: 'Close', exact: true })
                .first(),
        ).toBeDisabled();
        await expect(
            pendingEditor
                .getByRole('button', { name: 'Close', exact: true })
                .last(),
        ).toBeDisabled();
        await expect(addCard).toBeDisabled();
        releaseCardSave?.();
        await expect(
            page.getByText('pieza de arte', { exact: true }),
        ).toBeVisible();
        await page.unroute(cardRoute);
        await expectOwnerWordPair(page, 'pieza de arte', 'columns', true);

        await chooseCardAction(page, 'work of art', 'Edit');
        cardEditor = page.getByRole('dialog', { name: 'Edit card' });
        await expect(
            cardEditor.getByRole('textbox', { name: /Card context/ }),
        ).toHaveValue('Insurance appraisal of valuable artworks.');
        await cardEditor.getByLabel('Update context').uncheck();
        await expect(
            cardEditor.getByRole('textbox', { name: /Card context/ }),
        ).toHaveCount(0);
        await expect(
            cardEditor.getByText(translationContext, { exact: true }),
        ).toBeVisible();
        await cardEditor
            .getByLabel(/^Example translation \(/)
            .fill('La galería adquirió la obra de arte.');
        await cardEditor.getByRole('button', { name: 'Save card' }).click();

        await chooseCardAction(page, 'work of art', 'Edit');
        cardEditor = page.getByRole('dialog', { name: 'Edit card' });
        await expect(
            cardEditor.getByRole('textbox', { name: /Card context/ }),
        ).toHaveCount(0);
        await expect(
            cardEditor.getByText(translationContext, { exact: true }),
        ).toBeVisible();
        await cardEditor
            .getByRole('button', { name: 'Close', exact: true })
            .first()
            .click();

        await chooseCardAction(page, 'work of art', 'Archive');
        await expect(page.getByText('Card archived.')).toBeVisible();
        await page
            .getByRole('group', { name: 'Card status' })
            .getByRole('button', { name: 'Archived', exact: true })
            .click();
        await expectOwnerWordPair(
            page,
            'pieza de arte',
            'columns',
            false,
            false,
        );
        await page.setViewportSize({ width: 320, height: 900 });
        await expectOwnerWordPair(
            page,
            'pieza de arte',
            'stacked',
            false,
            false,
        );
        await page.setViewportSize({ width: 1280, height: 720 });
        await chooseCardAction(page, 'work of art', 'Restore');
        await expect(page.getByText('Card restored.')).toBeVisible();

        await page.getByRole('link', { name: /Back to dictionaries/ }).click();
        await chooseDictionaryLibraryAction(page, name, 'Dictionary settings');
        await expect(page).toHaveURL(/\/dictionaries$/);
        const librarySettings = page.getByRole('dialog', {
            name: 'Dictionary settings',
        });
        await expect(librarySettings).toBeVisible();
        await librarySettings
            .getByRole('button', { name: 'Cancel' })
            .last()
            .click();
        await chooseDictionaryLibraryAction(page, name, 'Archive');
        await expect(page.getByText(/Dictionary archived/)).toBeVisible();
        await page
            .getByRole('group', { name: 'Dictionary status' })
            .getByRole('button', { name: 'Archived', exact: true })
            .click();
        await chooseDictionaryLibraryAction(page, name, 'Restore');
        await expect(
            page.getByText('Dictionary restored as private.'),
        ).toBeVisible();
        await page
            .getByRole('group', { name: 'Dictionary status' })
            .getByRole('button', { name: 'Active', exact: true })
            .click();
        await expect(page.getByRole('heading', { name })).toBeVisible();
        assertNoBrowserErrors();
    });

    // @user-flow dictionary-platform/anonymous-reader-forks-unlisted-dictionary
    test('anonymous reader keeps the capability in the fragment and forks privately', async ({
        page,
    }, testInfo) => {
        const assertNoBrowserErrors = captureBrowserErrors(page);
        const requestedUrls: string[] = [];
        page.on('request', (request) => requestedUrls.push(request.url()));
        const name = `Shared studio terms ${runId}`;
        const privateTranslationContext =
            'Private publisher guidance for future AI generations.';
        const publisherEmail = syntheticEmail(testInfo, 'publisher');
        await signUpAndVerify(page, publisherEmail, '/dictionaries');
        await createDictionary(page, name);
        await addPopulatedCard(page, privateTranslationContext);
        const sourceEditorUrl = page.url();

        const rotateResponse = page.waitForResponse(
            (response) =>
                response.url().endsWith('/share-key/rotate') &&
                response.status() === 200,
        );
        await chooseDictionarySecondaryAction(page, 'Sharing');
        await page.getByRole('button', { name: 'Create sharing link' }).click();
        const rotated = (await (await rotateResponse).json()) as {
            capability: { shareId: string; shareKey: string };
        };
        const { shareId, shareKey } = rotated.capability;
        await expect(
            page.getByRole('button', { name: 'Copy link' }),
        ).toBeVisible();

        await page.goto('/security');
        await page.getByRole('button', { name: 'Sign out here' }).click();
        await expect(page).toHaveURL(/\/login$/);

        const sharedResponse = page.waitForResponse((response) => {
            const url = new URL(response.url());
            return (
                url.port === backendPort &&
                url.pathname === `/shared/dictionaries/${shareId}` &&
                response.status() === 200
            );
        });
        await page.goto(`/shared/dictionaries/${shareId}#${shareKey}`);
        const publicResponse = await sharedResponse;
        const publicRequest = publicResponse.request();
        expect(publicRequest.headers()['x-languon-share-key']).toBe(shareKey);
        expect(publicResponse.headers()['cache-control']).toBe(
            'private, no-store',
        );
        expect(publicResponse.headers()['referrer-policy']).toBe('no-referrer');
        await expect(page.getByRole('heading', { name })).toBeVisible();
        await expect(
            page.getByText('work of art', { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText('Unlisted · no index', { exact: true }),
        ).toBeVisible();
        await expect(page.getByText(publisherEmail)).toHaveCount(0);
        await expect(page.getByText(privateTranslationContext)).toHaveCount(0);
        await page.getByRole('link', { name: 'Sign in to fork' }).click();
        await expect(page).toHaveURL(
            `/login?returnTo=${encodeURIComponent(
                `/shared/dictionaries/${shareId}`,
            )}#${shareKey}`,
        );
        const createAccount = page.getByRole('link', {
            name: 'Create an account',
        });
        await expect(createAccount).toBeVisible();
        const signupHref = new URL(
            (await createAccount.getAttribute('href'))!,
            page.url(),
        );
        expect(signupHref.hash).toBe(`#${shareKey}`);
        expect(signupHref.searchParams.get('returnTo')).toBe(
            `/shared/dictionaries/${shareId}`,
        );
        await createAccount.click();
        await expect(page).toHaveURL(
            `/signup?returnTo=${encodeURIComponent(
                `/shared/dictionaries/${shareId}`,
            )}#${shareKey}`,
        );
        expect(page.url()).toContain(`#${shareKey}`);
        await page.getByLabel('Email').fill(syntheticEmail(testInfo, 'reader'));
        await page.getByLabel('Password', { exact: true }).fill(password);
        await page.getByRole('button', { name: 'Create account' }).click();
        await page.getByLabel('Verification code').fill('0000');
        await page.getByRole('button', { name: 'Verify email' }).click();
        await expect(
            page.getByRole('button', { name: 'Fork privately' }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Fork privately' }).click();
        await expect(page).toHaveURL(/\/dictionaries\/[0-9a-f-]+$/);
        await expect(page.getByRole('heading', { name })).toBeVisible();
        await expect(page.getByText('Private', { exact: true })).toBeVisible();
        const forkSettings = await openDictionarySettings(page);
        await expect(forkSettings.getByLabel('Dictionary context')).toHaveValue(
            '',
        );
        await forkSettings
            .getByRole('button', { name: 'Cancel', exact: true })
            .first()
            .click();
        expect(requestedUrls.every((url) => !url.includes(shareKey))).toBe(
            true,
        );
        expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(
            [],
        );
        expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual(
            [],
        );

        await page.goto('/security');
        await page.getByRole('button', { name: 'Sign out here' }).click();
        await page.getByLabel('Email').fill(publisherEmail);
        await page.getByLabel('Password', { exact: true }).fill(password);
        await page
            .getByRole('button', { name: 'Sign in', exact: true })
            .click();
        await expect(page).toHaveURL('/');
        await page.goto(sourceEditorUrl);
        const rerotateResponse = page.waitForResponse(
            (response) =>
                response.url().endsWith('/share-key/rotate') &&
                response.status() === 200,
        );
        await chooseDictionarySecondaryAction(page, 'Sharing');
        await page.getByRole('button', { name: 'Rotate sharing link' }).click();
        const rerotated = (await (await rerotateResponse).json()) as {
            capability: { shareId: string; shareKey: string };
        };
        await page.goto(`/shared/dictionaries/${shareId}#${shareKey}`);
        await expect(
            page.getByRole('heading', { name: 'Dictionary unavailable' }),
        ).toBeVisible();
        await page.goto(sourceEditorUrl);
        await page.getByRole('link', { name: /Back to dictionaries/ }).click();
        await chooseDictionaryLibraryAction(page, name, 'Archive');
        await expect(page.getByText(/Dictionary archived/)).toBeVisible();
        await page.goto(sourceEditorUrl);
        await expect(
            page.getByText('Restore it to edit settings, cards, and sharing.'),
        ).toBeVisible();
        await page.goto(
            `/shared/dictionaries/${rerotated.capability.shareId}#${rerotated.capability.shareKey}`,
        );
        await expect(
            page.getByRole('heading', { name: 'Dictionary unavailable' }),
        ).toBeVisible();
        assertNoBrowserErrors();
    });

    // @user-flow dictionary-platform/card-ai-proposal-survives-review-and-conflict
    test('card AI proposal survives reload and recovers from a stale review conflict', async ({
        context,
        page,
    }, testInfo) => {
        const assertNoBrowserErrors = captureBrowserErrors(
            page,
            (path, status) =>
                status === 409 &&
                ((path.endsWith('/accept') &&
                    path.startsWith('/dictionary-generation-jobs/')) ||
                    /^\/dictionaries\/[^/]+\/cards\/[^/]+$/.test(path)),
        );
        const name = `Persistent proposal ${runId}`;
        await signUpAndVerify(
            page,
            syntheticEmail(testInfo, 'generation-owner'),
            '/dictionaries',
        );
        await createDictionary(page, name);
        await addPopulatedCard(page);

        await chooseCardAction(page, 'work of art', 'Edit');
        const staleEditor = page.getByRole('dialog', { name: 'Edit card' });
        await staleEditor
            .getByLabel(/^Translation \(/)
            .fill('edición local obsoleta');
        const manualConcurrentPage = await context.newPage();
        const assertNoManualConcurrentBrowserErrors =
            captureBrowserErrors(manualConcurrentPage);
        await manualConcurrentPage.goto(page.url());
        await expect(
            manualConcurrentPage.getByRole('heading', { name }),
        ).toBeVisible();
        await chooseCardAction(manualConcurrentPage, 'work of art', 'Edit');
        await manualConcurrentPage
            .getByLabel(/^Translation \(/)
            .fill('obra de arte actualizada');
        await manualConcurrentPage
            .getByRole('button', { name: 'Save card' })
            .click();
        await expect(
            manualConcurrentPage.getByText('obra de arte actualizada', {
                exact: true,
            }),
        ).toBeVisible();
        assertNoManualConcurrentBrowserErrors();
        await manualConcurrentPage.close();

        await staleEditor.getByRole('button', { name: 'Save card' }).click();
        await expect(
            staleEditor.getByRole('button', {
                name: 'Reload current version',
            }),
        ).toBeVisible();
        await staleEditor
            .getByRole('button', { name: 'Reload current version' })
            .click();
        await expect(staleEditor).not.toBeVisible();
        await expect(
            page.getByText('obra de arte actualizada', { exact: true }),
        ).toBeVisible();

        await chooseCardAction(
            page,
            'work of art',
            'Rewrite full card with AI',
        );
        let review = page.getByRole('dialog', {
            name: 'Regenerate card with AI',
        });
        await review
            .getByLabel('Instruction for this review (optional)')
            .fill('Keep the vocabulary suitable for an art studio.');
        await review.getByRole('button', { name: 'Generate proposal' }).click();
        await expect(
            review.getByRole('button', { name: 'Accept and update card' }),
        ).toBeVisible({ timeout: 20_000 });
        await expect(page).toHaveURL(/generationCard=.*generationJob=/);

        await page.reload();
        review = page.getByRole('dialog', { name: 'Regenerate card with AI' });
        await expect(
            review.getByRole('button', { name: 'Accept and update card' }),
        ).toBeVisible({ timeout: 20_000 });
        await expect(
            review
                .getByRole('region', { name: /^Translation \(/ })
                .getByRole('paragraph')
                .filter({ hasText: /^obra de arte actualizada$/ }),
        ).toBeVisible();
        await page.setViewportSize({ width: 320, height: 900 });
        await page.evaluate(() => {
            document.documentElement.style.fontSize = '200%';
        });
        const acceptProposal = review.getByRole('button', {
            name: 'Accept and update card',
        });
        await acceptProposal.focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await expect(acceptProposal).toBeFocused();
        expect(
            await page.evaluate(
                () =>
                    document.documentElement.scrollWidth <=
                    document.documentElement.clientWidth + 1,
            ),
        ).toBe(true);
        await page.evaluate(() => {
            document.documentElement.style.fontSize = '';
        });
        await page.setViewportSize({ width: 1280, height: 720 });

        const concurrentPage = await context.newPage();
        const assertNoConcurrentBrowserErrors =
            captureBrowserErrors(concurrentPage);
        const editorUrl = new URL(page.url());
        editorUrl.search = '';
        await concurrentPage.goto(editorUrl.toString());
        await expect(
            concurrentPage.getByRole('heading', { name }),
        ).toBeVisible();
        await chooseCardAction(concurrentPage, 'work of art', 'Edit');
        await concurrentPage
            .getByLabel(/^Translation \(/)
            .fill('obra artística concurrente');
        await concurrentPage.getByRole('button', { name: 'Save card' }).click();
        await expect(
            concurrentPage.getByText('obra artística concurrente', {
                exact: true,
            }),
        ).toBeVisible();
        assertNoConcurrentBrowserErrors();
        await concurrentPage.close();

        const proposedTranslation = review
            .getByRole('region', { name: /^Translation \(/ })
            .getByLabel('Proposed replacement');
        await proposedTranslation.fill('obra de arte revisada');
        await review
            .getByRole('button', { name: 'Accept and update card' })
            .click();
        await expect(
            review.getByText('Card changed since generation'),
        ).toBeVisible();
        await review
            .getByRole('button', { name: 'Reload and compare' })
            .click();
        await expect(
            review.getByRole('heading', {
                name: 'Current card after reload',
            }),
        ).toBeVisible();
        await expect(
            review.getByText('obra artística concurrente', { exact: true }),
        ).toBeVisible();
        await expect(proposedTranslation).toHaveValue('obra de arte revisada');

        await review
            .getByLabel('Instruction for this review (optional)')
            .fill('Use the current card and keep the art context.');
        const previousGenerationUrl = page.url();
        const regenerateResponse = page.waitForResponse(
            (response) =>
                response.url().endsWith('/regenerate') &&
                response.status() === 202,
        );
        await review
            .getByRole('button', { name: 'Regenerate', exact: true })
            .click();
        await regenerateResponse;
        await expect(page).not.toHaveURL(previousGenerationUrl);
        await expect(
            review.getByRole('button', { name: 'Accept and update card' }),
        ).toBeVisible({ timeout: 20_000 });
        await review
            .getByRole('region', { name: /^Translation \(/ })
            .getByLabel('Proposed replacement')
            .fill('obra de arte final');
        await review
            .getByRole('button', { name: 'Accept and update card' })
            .click();
        await expect(
            review.getByText('The reviewed proposal was accepted.', {
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            page.getByText('obra de arte final', { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText('Human + AI', { exact: true }),
        ).toBeVisible();
        assertNoBrowserErrors();
    });

    // @user-flow dictionary-platform/batch-generation-review-commits-selected-cards
    test('pasted-term review survives reload, retries failures, and commits selected cards atomically', async ({
        context,
        page,
    }, testInfo) => {
        test.setTimeout(90_000);
        const assertNoBrowserErrors = captureBrowserErrors(
            page,
            (path, status) =>
                status === 409 &&
                path.startsWith('/dictionary-generation-jobs/') &&
                path.endsWith('/accept'),
        );
        await signUpAndVerify(
            page,
            syntheticEmail(testInfo, 'batch-owner'),
            '/dictionaries',
        );
        await createDictionary(page, `Batch studio ${runId}`);

        await chooseDictionarySecondaryAction(
            page,
            'Generate cards from pasted terms',
        );
        let batch = page.getByRole('dialog', {
            name: 'Generate cards from pasted terms',
        });
        const retryableLongTerm = 'a'.repeat(161);
        await batch
            .getByLabel('Terms or phrases')
            .fill(`canvas\nbank\nbank\n${retryableLongTerm}`);
        await batch.getByLabel(/^Context/).fill('Art and finance vocabulary');
        await batch.getByRole('button', { name: 'Generate cards' }).click();
        await expect(
            batch.getByRole('heading', { name: 'Review generated cards' }),
        ).toBeVisible({ timeout: 20_000 });
        await expect(page).toHaveURL(/batchGenerationJob=[0-9a-f-]+/);
        const originalReviewUrl = page.url();

        await page.reload();
        batch = page.getByRole('dialog', {
            name: 'Generate cards from pasted terms',
        });
        await expect(
            batch.getByRole('heading', { name: 'Review generated cards' }),
        ).toBeVisible({ timeout: 20_000 });
        await expect(
            batch.getByText('A matching source appears earlier in this batch.'),
        ).toBeVisible();
        await expect(
            batch.getByRole('checkbox', { name: 'Retry row 4' }),
        ).toBeChecked();

        await page.setViewportSize({ width: 320, height: 900 });
        await page.evaluate(() => {
            document.documentElement.style.fontSize = '200%';
        });
        const includeFirst = batch.getByRole('checkbox', {
            name: 'Include row 1',
        });
        await includeFirst.focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await expect(includeFirst).toBeFocused();
        expect(
            await page.evaluate(
                () =>
                    document.documentElement.scrollWidth <=
                    document.documentElement.clientWidth + 1,
            ),
        ).toBe(true);
        await page.evaluate(() => {
            document.documentElement.style.fontSize = '';
        });
        await page.setViewportSize({ width: 1280, height: 720 });

        const retryResponse = page.waitForResponse(
            (response) =>
                response.url().endsWith('/retry-pasted-terms') &&
                response.status() === 202,
        );
        await batch
            .getByRole('button', { name: 'Retry selected failures' })
            .click();
        await retryResponse;
        await expect(page).not.toHaveURL(originalReviewUrl);
        await expect(
            batch.getByText('No generated cards remain in this review.'),
        ).toBeVisible({ timeout: 20_000 });
        await expect(batch.getByText(retryableLongTerm)).toBeVisible();

        await page.goto(originalReviewUrl);
        batch = page.getByRole('dialog', {
            name: 'Generate cards from pasted terms',
        });
        await expect(
            batch.getByRole('heading', { name: 'Review generated cards' }),
        ).toBeVisible({ timeout: 20_000 });
        await batch.getByLabel('Translation').first().fill('toile révisée');
        await batch.getByRole('button', { name: 'Remove row' }).nth(2).click();
        await batch.getByRole('button', { name: 'Add 2 cards' }).click();
        await expect(
            batch.getByText('The selected cards were added together.'),
        ).toBeVisible();
        await expect(
            batch.getByText('The dictionary changed'),
        ).not.toBeVisible();
        await expect(
            page.getByText('toile révisée', { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText('Human + AI', { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText('AI-generated', { exact: true }),
        ).toBeVisible();
        await batch
            .getByRole('button', { name: 'Close batch generation' })
            .click();

        await page.getByRole('link', { name: /Back to dictionaries/ }).click();
        const conflictName = `Empty batch conflict ${runId}`;
        await createDictionary(page, conflictName);
        await chooseDictionarySecondaryAction(
            page,
            'Generate cards from pasted terms',
        );
        batch = page.getByRole('dialog', {
            name: 'Generate cards from pasted terms',
        });
        await batch.getByLabel('Terms or phrases').fill('empty pair term');
        await batch.getByRole('button', { name: 'Generate cards' }).click();
        await expect(
            batch.getByRole('heading', { name: 'Review generated cards' }),
        ).toBeVisible({ timeout: 20_000 });

        const concurrentPage = await context.newPage();
        const assertNoConcurrentBrowserErrors =
            captureBrowserErrors(concurrentPage);
        const editorUrl = new URL(page.url());
        editorUrl.search = '';
        await concurrentPage.goto(editorUrl.toString());
        await expect(
            concurrentPage.getByRole('heading', { name: conflictName }),
        ).toBeVisible();
        const concurrentSettings = await openDictionarySettings(concurrentPage);
        await concurrentSettings
            .getByLabel('Translate from')
            .selectOption('de');
        await concurrentSettings
            .getByRole('button', { name: 'Save settings' })
            .click();
        await expect(
            concurrentPage.getByText('Dictionary settings saved.'),
        ).toBeVisible();
        assertNoConcurrentBrowserErrors();
        await concurrentPage.close();

        await batch.getByRole('button', { name: 'Add 1 cards' }).click();
        await expect(batch.getByText('The dictionary changed')).toBeVisible();
        await batch
            .getByRole('button', { name: 'Reload current versions' })
            .click();
        await expect(batch.getByText('The dictionary changed')).toBeVisible();
        await expect(
            batch.getByRole('button', { name: 'Add 1 cards' }),
        ).toBeDisabled();
        await batch
            .getByRole('button', { name: 'Close batch generation' })
            .click();
        await expect(
            page.getByRole('listitem').filter({ hasText: 'empty pair term' }),
        ).toHaveCount(0);
        assertNoBrowserErrors();
    });

    // @user-flow dictionary-platform/document-generation-cleans-original-and-commits-final-review
    test('document generation cleans the upload before one final editable review', async ({
        page,
    }, testInfo) => {
        test.skip(
            process.env.AUTH_E2E_DOCUMENT_SERVICES !== 'true',
            'Requires the guarded disposable MinIO document service.',
        );
        test.setTimeout(90_000);
        const assertNoBrowserErrors = captureBrowserErrors(
            page,
            (path, status) => path === '/auth/sign-up' && status === 429,
        );
        await signUpAndVerifyOrSignInAfterRateLimit(
            page,
            syntheticEmail(testInfo, 'document-owner'),
            '/dictionaries',
            syntheticEmail(testInfo, 'owner'),
        );
        await createDictionary(page, `Document studio ${runId}`);

        await chooseDictionarySecondaryAction(
            page,
            'Generate cards from a document',
        );
        let review = page.getByRole('dialog', {
            name: 'Generate cards from a document',
        });
        const retryableLongTerm = 'a'.repeat(161);
        await review.getByLabel('Document').setInputFiles({
            buffer: Buffer.from(`canvas\nbank\n${retryableLongTerm}`, 'utf8'),
            mimeType: 'text/plain',
            name: 'terms.txt',
        });
        await review
            .getByLabel(/^Generation instruction/)
            .fill('Use concise studio vocabulary.');
        await review
            .getByRole('button', { name: 'Upload and generate cards' })
            .click();
        await expect(page).toHaveURL(/documentGenerationJob=[0-9a-f-]+/);
        await expect(
            review.getByRole('heading', { name: 'Review generated cards' }),
        ).toBeVisible({ timeout: 30_000 });
        const originalDocumentReviewUrl = page.url();

        await page.reload();
        review = page.getByRole('dialog', {
            name: 'Generate cards from a document',
        });
        await expect(
            review.getByRole('heading', { name: 'Review generated cards' }),
        ).toBeVisible({ timeout: 30_000 });
        await expect(review.getByText('Extracted term: canvas')).toBeVisible();
        await expect(review.getByText('Extracted term: bank')).toBeVisible();
        await expect(
            review.getByRole('checkbox', {
                name: 'Retry extracted term 3',
            }),
        ).toBeChecked();

        const retryResponse = page.waitForResponse(
            (response) =>
                response.url().endsWith('/retry-document-terms') &&
                response.status() === 202,
        );
        await review
            .getByRole('button', { name: 'Retry selected failures' })
            .click();
        await retryResponse;
        await expect(page).toHaveURL(/batchGenerationJob=[0-9a-f-]+/);
        const successor = page.getByRole('dialog', {
            name: 'Generate cards from pasted terms',
        });
        await expect(
            successor.getByText('No generated cards remain in this review.'),
        ).toBeVisible({ timeout: 20_000 });
        await expect(successor.getByText(retryableLongTerm)).toBeVisible();

        await page.goto(originalDocumentReviewUrl);
        review = page.getByRole('dialog', {
            name: 'Generate cards from a document',
        });
        await expect(
            review.getByRole('heading', { name: 'Review generated cards' }),
        ).toBeVisible({ timeout: 20_000 });

        await review.getByLabel('Translation').first().fill('lienzo revisado');
        await review
            .getByRole('button', { name: 'Remove card' })
            .nth(1)
            .click();

        await page.setViewportSize({ width: 320, height: 900 });
        await page.evaluate(() => {
            document.documentElement.style.fontSize = '200%';
        });
        const includeFirst = review.getByRole('checkbox', {
            name: 'Include extracted term 1',
        });
        await includeFirst.focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await expect(includeFirst).toBeFocused();
        expect(
            await page.evaluate(
                () =>
                    document.documentElement.scrollWidth <=
                    document.documentElement.clientWidth + 1,
            ),
        ).toBe(true);
        await page.evaluate(() => {
            document.documentElement.style.fontSize = '';
        });
        await page.setViewportSize({ width: 1280, height: 720 });

        await review.getByRole('button', { name: 'Add 1 cards' }).click();
        await expect(
            review.getByText('Selected document cards were added.'),
        ).toBeVisible();
        await expect(
            page.getByText('lienzo revisado', { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText('Human + AI', { exact: true }),
        ).toBeVisible();
        assertNoBrowserErrors();
    });

    // @user-flow dictionary-platform/quizlet-import-and-export-round-trip
    test('previews a Quizlet import and exports formula-safe ordered CSV', async ({
        page,
    }, testInfo) => {
        await page.addInitScript(() => {
            Object.defineProperty(window, 'showSaveFilePicker', {
                configurable: true,
                value: undefined,
            });
        });
        const assertNoBrowserErrors = captureBrowserErrors(
            page,
            (path, status) => path === '/auth/sign-up' && status === 429,
        );
        await signUpAndVerifyOrSignInAfterRateLimit(
            page,
            syntheticEmail(testInfo, 'interchange-owner'),
            '/dictionaries',
            syntheticEmail(testInfo, 'owner'),
        );

        await createDictionary(page, `Quizlet transfer ${runId}`);
        await chooseDictionarySecondaryAction(page, 'Import cards');
        const longUnbrokenSource = 'a'.repeat(200);
        const importer = page.getByRole('dialog', {
            name: 'Preview and import cards',
        });
        await importer.getByLabel('Column separator').selectOption('comma');
        await importer
            .getByRole('checkbox', {
                name: 'The first row contains column names',
            })
            .check();
        await importer
            .getByLabel('Import text')
            .fill(
                [
                    'source,translation',
                    '"=SUM(1,2)","fórmula"',
                    '"café","coffee"',
                    '"bad"x,value',
                    '"café","coffee house"',
                    `"${longUnbrokenSource}","long source"`,
                ].join('\n'),
            );
        await importer.getByRole('button', { name: 'Preview import' }).click();
        await expect(
            importer.getByText('4 ready, 1 need attention, 5 total'),
        ).toBeVisible();
        await expect(
            importer.getByText(
                '1 duplicate source rows will be imported with warnings.',
            ),
        ).toBeVisible();
        const enrichmentSwitch = importer.getByRole('switch', {
            name: 'Enrich selected pairs with AI',
        });
        await enrichmentSwitch.focus();
        await page.keyboard.press('Space');
        await expect(enrichmentSwitch).toBeChecked();

        await page.setViewportSize({ width: 320, height: 900 });
        await page.evaluate(() => {
            document.documentElement.style.fontSize = '200%';
        });
        await importer
            .getByRole('button', { name: 'Generate 4 card reviews' })
            .focus();
        await expect(
            importer.getByRole('button', {
                name: 'Generate 4 card reviews',
            }),
        ).toBeFocused();
        expect(
            await page.evaluate(
                () =>
                    document.documentElement.scrollWidth <=
                    document.documentElement.clientWidth + 1,
            ),
        ).toBe(true);
        await page.evaluate(() => {
            document.documentElement.style.fontSize = '';
        });
        await page.setViewportSize({ width: 1280, height: 720 });
        await importer
            .getByRole('button', { name: 'Generate 4 card reviews' })
            .click();
        let review = page.getByRole('dialog', {
            name: 'Generate cards from pasted terms',
        });
        await expect(
            review.getByRole('heading', { name: 'Review generated cards' }),
        ).toBeVisible({ timeout: 20_000 });
        await expect(page).toHaveURL(
            /\/dictionaries\/[0-9a-f-]+\?batchGenerationJob=[0-9a-f-]+/u,
        );
        await page.reload();
        review = page.getByRole('dialog', {
            name: 'Generate cards from pasted terms',
        });
        await expect(
            review.getByRole('heading', { name: 'Review generated cards' }),
        ).toBeVisible({ timeout: 20_000 });
        await review.getByRole('button', { name: 'Add 4 cards' }).click();
        await expect(
            review.getByText('The selected cards were added together.'),
        ).toBeVisible();
        await expect(page.getByText('fórmula', { exact: true })).toBeVisible();
        await expect(
            page.getByText('Human + AI', { exact: true }).first(),
        ).toBeVisible();
        await review.getByRole('button', { name: 'Cancel' }).click();

        await chooseDictionarySecondaryAction(page, 'Export');
        const exporter = page.getByRole('dialog', {
            name: 'Export active cards',
        });
        const downloadPromise = page.waitForEvent('download');
        await exporter
            .getByRole('button', { name: 'Download Quizlet CSV' })
            .click();
        const download = await downloadPromise;
        const downloadPath = await download.path();
        expect(downloadPath).not.toBeNull();
        const csv = await readFile(downloadPath!, 'utf8');
        expect(csv).toContain('source,translation\r\n');
        expect(csv).toContain('"\'=SUM(1,2)",fórmula\r\n');
        expect(csv.indexOf('fórmula')).toBeLessThan(csv.indexOf('coffee'));
        expect(csv).toContain('café,coffee\r\n');
        expect(csv).toContain('café,coffee house\r\n');
        expect(csv).toContain(`${longUnbrokenSource},long source\r\n`);
        assertNoBrowserErrors();
    });

    // @user-flow dictionary-platform/inline-ai-card-authoring-preserves-field-choices
    test('creates the displayed local version after automatic inline AI application', async ({
        page,
    }, testInfo) => {
        test.setTimeout(90_000);
        const assertNoBrowserErrors = captureBrowserErrors(
            page,
            (path, status) => path === '/auth/sign-up' && status === 429,
        );
        await signUpAndVerifyOrSignInAfterRateLimit(
            page,
            syntheticEmail(testInfo, 'inline-authoring'),
            '/dictionaries',
            syntheticEmail(testInfo, 'owner'),
        );
        await createDictionary(page, `Inline AI Spanish ${runId}`);
        const settings = await openDictionarySettings(page);
        const inheritedContext = 'Fine-art studio terminology';
        await settings.getByLabel('Dictionary context').fill(inheritedContext);
        await settings.getByLabel('Definition').check();
        await settings.getByLabel('Context example').check();
        await settings.getByLabel('Example translation').check();
        await settings.getByRole('button', { name: 'Save settings' }).click();
        await expect(
            page.getByText('Dictionary settings saved.'),
        ).toBeVisible();
        await settings
            .getByRole('button', { name: 'Cancel', exact: true })
            .first()
            .click();

        await page.getByRole('button', { name: 'Add card' }).click();
        let editor = page.getByRole('dialog', { name: 'Add card' });
        await expect(
            editor.getByText(inheritedContext, { exact: true }),
        ).toBeVisible();
        const source = editor.getByRole('textbox', {
            name: /^Source word or phrase \(/,
        });
        const translation = editor.getByRole('textbox', {
            name: /^Translation \(/,
        });
        const definition = editor.getByRole('textbox', {
            name: /^Definition \(/,
        });
        await source.fill('teh atelier');
        await editor
            .getByRole('button', { name: 'Regenerate Source', exact: true })
            .click();
        await expect(source).toHaveValue('the atelier', { timeout: 20_000 });
        await expect(
            editor.getByRole('navigation', { name: 'Card form versions' }),
        ).toHaveCount(0);
        await expect(translation).toHaveValue('');
        await expect(editor.getByTestId('ai-review-source')).toHaveCount(0);
        await expect(
            editor.getByRole('button', { name: /^(Accept|Reject)/ }),
        ).toHaveCount(0);
        await expect(
            page.getByRole('listitem').filter({ hasText: 'the atelier' }),
        ).toHaveCount(0);

        await editor
            .getByRole('button', {
                name: 'Generate Translation with AI',
                exact: true,
            })
            .click();
        await expect(translation).toHaveValue('the atelier (es)', {
            timeout: 20_000,
        });
        await expect(definition).not.toHaveValue('');
        await expect(
            editor.getByRole('textbox', { name: /^Context example \(/ }),
        ).not.toHaveValue('');
        await expect(
            editor.getByRole('textbox', { name: /^Example translation \(/ }),
        ).not.toHaveValue('');
        await expect(editor.getByText('Version 2 of 2')).toBeVisible();
        const displayedTranslation = await translation.inputValue();
        await editor
            .getByRole('button', {
                name: 'Regenerate Translation',
                exact: true,
            })
            .click();
        await expect(editor.getByText('Version 3 of 3')).toBeVisible({
            timeout: 20_000,
        });
        await expect(translation).not.toHaveValue(displayedTranslation);
        await editor
            .getByRole('button', { name: 'Previous form version' })
            .click();
        await expect(editor.getByText('Version 2 of 3')).toBeVisible();
        await expect(translation).toHaveValue(displayedTranslation);
        await expect(
            editor.getByRole('button', {
                name: 'Regenerate Translation',
                exact: true,
            }),
        ).toBeDisabled();
        await definition.fill('A manually refined place where artists work.');
        await page.setViewportSize({ width: 320, height: 900 });
        await page.evaluate(() => {
            document.documentElement.style.fontSize = '200%';
        });
        expect(
            await page.evaluate(
                () =>
                    document.documentElement.scrollWidth <=
                    document.documentElement.clientWidth + 1,
            ),
        ).toBe(true);
        await page.evaluate(() => {
            document.documentElement.style.fontSize = '';
        });
        await page.setViewportSize({ width: 1280, height: 720 });
        await editor
            .getByRole('button', { name: 'Create card', exact: true })
            .click();
        await expect(editor).not.toBeVisible();
        await expect(
            page.getByText(displayedTranslation, { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText('A manually refined place where artists work.', {
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            page.getByText('Human + AI', { exact: true }).first(),
        ).toBeVisible();
        await page.reload();
        await expect(
            page.getByText(displayedTranslation, { exact: true }),
        ).toBeVisible();

        // Non-Source content preserves the initial new-card version, even for Source generation.
        await page.getByRole('button', { name: 'Add card' }).click();
        editor = page.getByRole('dialog', { name: 'Add card' });
        const secondSource = editor.getByRole('textbox', {
            name: /^Source word or phrase \(/,
        });
        const secondTranslation = editor.getByRole('textbox', {
            name: /^Translation \(/,
        });
        await secondSource.fill('teh studio');
        await secondTranslation.fill('manual studio');
        await editor
            .getByRole('button', { name: 'Regenerate Source', exact: true })
            .click();
        await expect(secondSource).toHaveValue('the studio', {
            timeout: 20_000,
        });
        await expect(editor.getByText('Version 2 of 2')).toBeVisible();
        await editor
            .getByRole('button', { name: 'Previous form version' })
            .click();
        await expect(secondSource).toHaveValue('teh studio');
        await expect(secondTranslation).toHaveValue('manual studio');
        await editor
            .getByRole('button', { name: 'Create card', exact: true })
            .click();
        await expect(editor).not.toBeVisible();
        await expect(
            page.getByText('teh studio', { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText('manual studio', { exact: true }),
        ).toBeVisible();
        assertNoBrowserErrors();
    });

    // @user-flow dictionary-platform/saved-card-inline-ai-authoring-preserves-advanced-rewrite
    test('automatically saves full inline forms while history remains preview-only and advanced rewrite remains available', async ({
        page,
    }, testInfo) => {
        test.setTimeout(90_000);
        const assertNoBrowserErrors = captureBrowserErrors(
            page,
            (path, status) => path === '/auth/sign-up' && status === 429,
        );
        await signUpAndVerifyOrSignInAfterRateLimit(
            page,
            syntheticEmail(testInfo, 'saved-inline-authoring'),
            '/dictionaries',
            syntheticEmail(testInfo, 'owner'),
        );
        await createDictionary(page, `Saved inline AI Spanish ${runId}`);
        await addPopulatedCard(page);
        await chooseCardAction(page, 'work of art', 'Edit');
        const editor = page.getByRole('dialog', { name: 'Edit card' });
        const translation = editor.getByRole('textbox', {
            name: /^Translation \(/,
        });
        const definition = editor.getByRole('textbox', {
            name: /^Definition \(/,
        });
        const manualDefinition =
            'Manual refinement included in the automatic save.';
        const overrideContext =
            'A gallery discussing the meaning of an artwork.';
        await definition.fill(manualDefinition);
        await editor.getByLabel('Set context').check();
        await editor
            .getByRole('textbox', { name: /Card context/ })
            .fill(overrideContext);
        // A Source-only success saves unrelated manual values as part of the complete form.
        await editor
            .getByRole('textbox', { name: /^Source word or phrase \(/ })
            .fill('teh work of art');
        await editor
            .getByRole('button', { name: 'Regenerate Source', exact: true })
            .click();
        await expect(
            editor.getByText('Generated content saved.', { exact: true }),
        ).toBeVisible({ timeout: 20_000 });
        await expect(editor).toBeVisible();
        await expect(editor.getByText('Version 2 of 2')).toBeVisible();
        await expect(definition).toHaveValue(manualDefinition);
        const normalizedSource = await editor
            .getByRole('textbox', { name: /^Source word or phrase \(/ })
            .inputValue();
        const card = page
            .getByRole('listitem')
            .filter({ hasText: normalizedSource });
        await expect(
            card.getByText(manualDefinition, { exact: true }),
        ).toBeVisible();

        await editor
            .getByRole('button', { name: 'Regenerate all fields', exact: true })
            .click();
        await expect(translation).toHaveValue(`${normalizedSource} (es)`, {
            timeout: 20_000,
        });
        await expect(
            editor.getByText('Generated content saved.', { exact: true }),
        ).toBeVisible({ timeout: 20_000 });
        await expect(editor.getByText('Version 3 of 3')).toBeVisible();
        await expect(
            editor.getByRole('textbox', { name: /Card context/ }),
        ).toHaveValue(overrideContext);
        const savedTranslation = await translation.inputValue();
        await expect(
            card.getByText(savedTranslation, { exact: true }),
        ).toBeVisible();
        await editor
            .getByRole('button', { name: 'Previous form version' })
            .click();
        await expect(editor.getByText('Version 2 of 3')).toBeVisible();
        await expect(translation).toHaveValue('obra de arte');
        await expect(
            editor.getByRole('button', {
                name: 'Regenerate all fields',
                exact: true,
            }),
        ).toBeDisabled();
        // Navigation is a local preview; the dictionary still shows the saved latest result.
        await expect(
            card.getByText(savedTranslation, { exact: true }),
        ).toBeVisible();
        await editor
            .getByRole('button', { name: 'Save card', exact: true })
            .click();
        await expect(editor).not.toBeVisible();
        await page.reload();
        await expect(
            page.getByText('obra de arte', { exact: true }),
        ).toBeVisible();
        await expect(
            page.getByText(manualDefinition, { exact: true }),
        ).toBeVisible();
        await chooseCardAction(page, normalizedSource, 'Edit');
        const reopened = page.getByRole('dialog', { name: 'Edit card' });
        await expect(
            reopened.getByRole('navigation', { name: 'Card form versions' }),
        ).toHaveCount(0);
        await expect(
            reopened.getByRole('textbox', { name: /Card context/ }),
        ).toHaveValue(overrideContext);
        await reopened
            .getByRole('button', { name: 'Close', exact: true })
            .last()
            .click();

        await chooseCardAction(
            page,
            normalizedSource,
            'Rewrite full card with AI',
        );
        const advanced = page.getByRole('dialog', {
            name: 'Regenerate card with AI',
        });
        await expect(
            advanced.getByRole('button', {
                name: 'Generate proposal',
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            advanced.getByLabel('Instruction for this review (optional)'),
        ).toBeVisible();
        assertNoBrowserErrors();
    });
});
