import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';

import { loadCatalog } from './catalog.mjs';

// Mermaid's parser sanitizes labels through DOMPurify even without rendering.
// jsdom supplies that DOM; scripts and external resource loading stay disabled.
const dom = new JSDOM('');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const { default: mermaid } = await import('mermaid');

const repositoryRoot = resolve(
    fileURLToPath(new URL('../..', import.meta.url)),
);
const args = process.argv.slice(2).filter((argument) => argument !== '--');
if (args.some((argument) => argument !== '--stamp') || args.length > 1) {
    throw new Error('Usage: pnpm diagrams:check [-- --stamp]');
}
mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
});
const catalog = await loadCatalog(repositoryRoot);
for (const diagram of catalog.diagrams) {
    try {
        await mermaid.parse(diagram.mermaid);
    } catch {
        catalog.issues.push({
            file: diagram.file,
            message: 'Invalid Mermaid syntax.',
        });
    }
}
// Never acknowledge source freshness when the catalog or diagram syntax is invalid.
if (
    args.includes('--stamp') &&
    !catalog.issues.length &&
    catalog.diagrams.length
) {
    await loadCatalog(repositoryRoot, { stamp: true });
}
for (const diagram of catalog.diagrams) {
    const fresh = diagram.fresh || args.includes('--stamp');
    console.log(`${fresh ? 'Current' : 'Needs review'}: ${diagram.file}`);
    if (!fresh) console.log(`  Expected ${diagram.expectedFingerprint}`);
}
for (const issue of catalog.issues)
    console.error(`${issue.file}: ${issue.message}`);
if (!catalog.diagrams.length) console.error('No diagrams found.');
if (
    catalog.issues.length ||
    !catalog.diagrams.length ||
    (!args.includes('--stamp') &&
        catalog.diagrams.some((diagram) => !diagram.fresh))
)
    process.exitCode = 1;
