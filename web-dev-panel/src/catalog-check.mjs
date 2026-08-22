#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCatalog } from './catalog.mjs';

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const panelDirectory = resolve(sourceDirectory, '..');
const repositoryRoot = resolve(panelDirectory, '..');

try {
    const catalog = await loadCatalog({
        catalogPath: resolve(panelDirectory, 'commands.json'),
        repositoryRoot,
    });
    if (catalog.issues.length > 0) {
        throw new Error(
            [
                'Web dev panel catalog needs review:',
                ...catalog.issues.map((issue) => `- ${issue}`),
                'Invoke $web-dev-panel to review and reconcile the catalog.',
            ].join('\n'),
        );
    }
    const placeholderDescriptions = catalog.commands.filter(({ description }) =>
        description.startsWith('Runs the reviewed root package script'),
    );
    if (placeholderDescriptions.length > 0) {
        throw new Error(
            `Web dev panel descriptions need review: ${placeholderDescriptions
                .map(({ id }) => id)
                .join(', ')}`,
        );
    }
    console.log(
        `Web dev panel catalog: ${catalog.commands.length} reviewed command(s).`,
    );
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}
