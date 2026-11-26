import {
    expect,
    type Locator,
    type Page,
    type TestInfo,
} from '@playwright/test';

const fixture = {
    Website: 'https://lessons.example.test/reading',
    Image: 'https://images.example.test/diagram.svg',
};

async function insertEmbed(page: Page, kind: keyof typeof fixture) {
    await page.getByRole('button', { name: 'Add block', exact: true }).click();
    await page
        .getByRole('button', { name: 'Basic blocks', exact: true })
        .click();

    await page.getByRole('button', { name: kind, exact: true }).click();
    const form = page.getByRole('dialog', { name: kind, exact: true });
    await form
        .getByRole('textbox', { name: `${kind} URL` })
        .fill(fixture[kind]);

    await form.getByRole('button', { name: 'Insert', exact: true }).click();
    await expect(form).toBeHidden();
}

async function verifyModalSize(page: Page, dialog: Locator) {
    const viewport = page.viewportSize()!;
    await expect(dialog).toBeInViewport();
    const bounds = (await dialog.boundingBox())!;
    for (const dimension of ['width', 'height'] as const) {
        expect(bounds[dimension]).toBeGreaterThanOrEqual(
            0.85 * viewport[dimension],
        );

        expect(bounds[dimension]).toBeLessThanOrEqual(
            0.91 * viewport[dimension],
        );
    }
}

async function capture(page: Page, info: TestInfo, name: string) {
    const path = info.outputPath(name + '.png');
    await page.screenshot({ path, animations: 'disabled' });
    await info.attach(name, { path, contentType: 'image/png' });
}

function card(section: Locator, kind: keyof typeof fixture) {
    const source = section.page().locator(`a[href="${fixture[kind]}"]`);

    return section.getByRole('figure').filter({ has: source });
}

export async function verifyKnowledgeEmbeds(page: Page, info: TestInfo) {
    let websiteLoads = 0;
    let imageLoads = 0;
    await page.route(fixture.Website, async (route) => {
        websiteLoads++;
        await route.fulfill({
            contentType: 'text/html',
            body: '<h1>Fixture lesson</h1>',
        });
    });

    await page.route(fixture.Image, async (route) => {
        imageLoads++;
        await route.fulfill({
            contentType: 'image/svg+xml',
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="teal"/></svg>',
        });
    });

    await page.getByRole('button', { name: 'New note', exact: true }).click();
    await expect(page).toHaveURL(/\/knowledge\/[0-9a-f-]{36}$/u);
    const editor = page.locator('#knowledge-workspace-editor');
    await page
        .getByRole('textbox', { name: 'Title', exact: true })
        .fill('Embedded lesson');

    await insertEmbed(page, 'Website');
    await insertEmbed(page, 'Image');
    await expect(
        editor.getByRole('button', { name: 'Load preview' }),
    ).toHaveCount(2);

    expect([websiteLoads, imageLoads]).toEqual([0, 0]);
    const editorImage = card(editor, 'Image');
    await editorImage.getByRole('button', { name: 'Load preview' }).click();
    await expect(editorImage.getByRole('img')).toHaveJSProperty(
        'naturalWidth',
        600,
    );

    const saved = page.waitForResponse(
        (response) =>
            response.url().endsWith('/save') && response.status() === 200,
    );

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await saved;
    await page.reload();
    await expect(
        editor.getByRole('button', { name: 'Load preview' }),
    ).toHaveCount(2);

    await page
        .getByRole('button', { name: 'Document actions', exact: true })
        .click();

    await page
        .getByRole('menuitemcheckbox', { name: 'Learner preview' })
        .click();

    const reader = page.getByRole('region', { name: 'Learner preview' });
    const websiteCard = card(reader, 'Website');
    const imageCard = card(reader, 'Image');
    await expect(
        websiteCard.getByRole('link', { name: 'Open in new tab' }),
    ).toHaveAttribute('href', fixture.Website);

    await expect(
        imageCard.getByRole('link', { name: 'Open in new tab' }),
    ).toHaveAttribute('href', fixture.Image);

    expect(websiteLoads).toBe(0);
    const websiteLabel = 'Website · lessons.example.test';
    const imageLabel = 'Image · images.example.test';
    await websiteCard.getByRole('button', { name: 'Load preview' }).click();
    const outer = websiteCard.frameLocator('iframe');
    await expect(outer.locator('iframe')).toHaveAttribute('sandbox', '');
    await expect(
        outer
            .frameLocator('iframe')
            .getByRole('heading', { name: 'Fixture lesson' }),
    ).toBeVisible();

    const expandWebsite = websiteCard.getByRole('button', { name: 'Expand' });
    await expandWebsite.click();
    const websiteDialog = page.getByRole('dialog', { name: websiteLabel });
    await verifyModalSize(page, websiteDialog);
    await expect(
        websiteDialog
            .frameLocator('iframe')
            .frameLocator('iframe')
            .getByRole('heading', { name: 'Fixture lesson' }),
    ).toBeVisible();

    await capture(page, info, 'website-expanded-desktop');
    await page.keyboard.press('Escape');
    await expect(expandWebsite).toBeFocused();
    await page.setViewportSize({ width: 390, height: 844 });
    await imageCard.getByRole('button', { name: 'Load preview' }).click();
    await expect(
        imageCard.getByRole('img', { name: imageLabel }),
    ).toHaveJSProperty('naturalWidth', 600);

    const expandImage = imageCard.getByRole('button', { name: 'Expand' });
    await expandImage.click();
    const imageDialog = page.getByRole('dialog', { name: imageLabel });
    await verifyModalSize(page, imageDialog);
    const expandedImage = imageDialog.getByRole('img', { name: imageLabel });
    await expect(expandedImage).toHaveJSProperty('naturalHeight', 300);
    await expect(expandedImage).toHaveCSS('object-fit', 'contain');
    await capture(page, info, 'image-expanded-mobile');
    await imageDialog.getByRole('button', { name: 'Close preview' }).click();
    await expect(expandImage).toBeFocused();
}
