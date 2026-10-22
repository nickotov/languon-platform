import { expect, test } from '@playwright/test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadCatalog } from '../../catalog.mjs';
import { createDiagramServer } from '../../server.mjs';

// @user-flow-revision development-cleanup-and-architecture-diagrams sha256:6633b46af7d06664

// @user-flow development-cleanup-and-architecture-diagrams/explore-current-architecture
test('browse every real diagram, inspect sources and use navigation at desktop and mobile widths', async ({
    page,
    baseURL,
}) => {
    const errors = [];
    const external = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });
    page.on('requestfailed', (request) =>
        errors.push(`${request.url()}: ${request.failure()?.errorText}`),
    );
    page.on('response', (response) => {
        if (response.status() >= 400)
            errors.push(`${response.status()} ${response.url()}`);
    });
    page.on('request', (request) => {
        if (!request.url().startsWith(`${baseURL}/`))
            external.push(request.url());
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    const navigation = page.getByRole('navigation', { name: 'Diagrams' });
    await expect(navigation.getByRole('link')).toHaveCount(9);
    const titles = await navigation.getByRole('link').allTextContents();
    for (const title of titles) {
        await navigation
            .getByRole('link', { name: title, exact: true })
            .click();
        await expect(
            page.getByRole('heading', { name: title, level: 1, exact: true }),
        ).toBeVisible();
        await expect(page.locator('#canvas svg')).toHaveAttribute(
            'aria-label',
            title,
        );
        await expect(page.locator('#render-status')).toBeEmpty();
        await expect(page.locator('#freshness')).toHaveAttribute(
            'data-stale',
            'false',
        );
    }
    await navigation
        .getByRole('link', { name: 'System context', exact: true })
        .click();
    await expect(page.locator('#canvas svg')).toHaveAttribute(
        'aria-label',
        'System context',
    );
    const initialZoom = await page.locator('#zoom-level').textContent();
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect(page.locator('#zoom-level')).not.toHaveText(initialZoom);
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await expect(page.locator('#zoom-level')).toHaveText(initialZoom);
    await page.locator('#sources-details summary').click();
    await expect(page.locator('#sources')).toContainText(
        'apps/backend/src/app.ts',
    );
    await expect(page.locator('#mermaid-source')).toContainText('flowchart');
    await page.locator('#notes-details summary').click();
    await expect(page.locator('#notes')).toContainText('Reconciliation');
    await page.locator('#notes-details summary').click();
    await page.locator('#sources-details summary').click();
    await page.getByLabel('Find a diagram').fill('zz-no-match');
    await expect(page.getByText('No matching diagrams.')).toBeVisible();
    await page.getByLabel('Find a diagram').fill('knowledge');
    await expect(
        navigation.getByRole('link', {
            name: 'Conversations and Knowledge workspace',
            exact: true,
        }),
    ).toBeVisible();
    expect(await navigation.getByRole('link').count()).toBeLessThan(9);
    await page.getByLabel('Find a diagram').fill('');
    await page.getByRole('button', { name: 'Refresh sources' }).click();
    await expect(page.locator('#canvas svg')).toHaveAttribute(
        'aria-label',
        'System context',
    );
    await page.reload();
    await expect(page.locator('#canvas svg')).toHaveAttribute(
        'aria-label',
        'System context',
    );
    if (process.env.DIAGRAM_EVIDENCE === 'true')
        await page.screenshot({
            path: '.agent/features/045-development-cleanup-and-architecture-diagrams/evidence/viewer-desktop.png',
            fullPage: true,
        });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(navigation).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Fit', exact: true }),
    ).toBeVisible();
    expect(
        await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        ),
    ).toBe(true);
    await page.getByLabel('Find a diagram').focus();
    await page.keyboard.press('Tab');
    await expect(navigation.getByRole('link').first()).toBeFocused();
    if (process.env.DIAGRAM_EVIDENCE === 'true')
        await page.screenshot({
            path: '.agent/features/045-development-cleanup-and-architecture-diagrams/evidence/viewer-mobile.png',
            fullPage: true,
        });
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
});

// @user-flow development-cleanup-and-architecture-diagrams/recover-diagram-review-and-load-failures
test('show source drift and recover from real render and network failures', async ({
    page,
}) => {
    const root = await mkdtemp(join(tmpdir(), 'languon-diagram-browser-'));
    await mkdir(join(root, 'docs/diagrams'), { recursive: true });
    const documentPath = join(root, 'docs/diagrams/fixture.md');
    const document = `---
type: diagram
title: Synthetic review flow
summary: Real server with isolated source inputs.
source_paths:
    - source.ts
source_fingerprint: pending
reviewed: 2026-10-19
---

# Synthetic review flow

\`\`\`mermaid
flowchart LR
    Request --> Result
\`\`\`

<img src=x onerror=untrusted()>
`;
    await writeFile(join(root, 'source.ts'), 'export const revision = 1;');
    await writeFile(documentPath, document);
    await loadCatalog(root, { stamp: true });
    const viewer = createDiagramServer({ root });
    const origin = await viewer.listen(0);
    let listening = true;
    const failed = [];
    const exceptions = [];
    page.on('pageerror', (error) => exceptions.push(error.message));
    page.on('requestfailed', (request) => failed.push(request.url()));
    try {
        await page.goto(origin);
        await expect(page.locator('#canvas svg')).toHaveAttribute(
            'aria-label',
            'Synthetic review flow',
        );
        await expect(page.locator('#freshness')).toHaveAttribute(
            'data-stale',
            'false',
        );
        await page.locator('#notes-details summary').click();
        await expect(page.locator('#notes')).toContainText(
            '<img src=x onerror=untrusted()>',
        );
        await expect(page.locator('#notes img')).toHaveCount(0);
        await writeFile(join(root, 'source.ts'), 'export const revision = 2;');
        await page.getByRole('button', { name: 'Refresh sources' }).click();
        await expect(page.locator('#freshness')).toHaveAttribute(
            'data-stale',
            'true',
        );
        await expect(page.locator('#freshness')).toContainText(
            'diagram needs review',
        );
        await loadCatalog(root, { stamp: true });
        await page.getByRole('button', { name: 'Refresh sources' }).click();
        await expect(page.locator('#freshness')).toHaveAttribute(
            'data-stale',
            'false',
        );

        // A malformed authored diagram passes metadata discovery but fails the real renderer.
        await writeFile(
            documentPath,
            document.replace('Request --> Result', 'A -->|unfinished'),
        );
        await page.getByRole('button', { name: 'Refresh sources' }).click();
        await expect(page.locator('#render-status')).toContainText(
            'Unable to render this diagram',
        );
        await page.locator('#sources-details summary').click();
        await expect(page.locator('#mermaid-source')).toContainText(
            'A -->|unfinished',
        );
        await writeFile(documentPath, document);
        await loadCatalog(root, { stamp: true });
        await page.getByRole('button', { name: 'Refresh sources' }).click();
        await expect(page.locator('#canvas svg')).toHaveAttribute(
            'aria-label',
            'Synthetic review flow',
        );
        await expect(page.locator('#render-status')).toBeEmpty();

        await viewer.close();
        listening = false;
        await page.getByRole('button', { name: 'Refresh sources' }).click();
        await expect(page.getByRole('alert')).toContainText(
            'Unable to load diagrams',
        );
        await viewer.listen(Number(new URL(origin).port));
        listening = true;
        await page.getByRole('button', { name: 'Refresh sources' }).click();
        await expect(page.getByRole('alert')).toBeHidden();
        await expect(page.locator('#canvas svg')).toHaveAttribute(
            'aria-label',
            'Synthetic review flow',
        );
        expect(failed.length).toBeGreaterThan(0);
        expect(failed.every((url) => url === `${origin}/api/diagrams`)).toBe(
            true,
        );
        expect(exceptions).toEqual([]);
    } finally {
        if (listening) await viewer.close();
        await rm(root, { recursive: true, force: true });
    }
});
