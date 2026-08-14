import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const templatesDirectory = join(repositoryRoot, '.agent', 'templates');
const featuresDirectory = join(repositoryRoot, '.agent', 'features');

const argumentsAfterScript = process.argv.slice(2);

if (argumentsAfterScript[0] === '--') {
    argumentsAfterScript.shift();
}

const [slug, ...titleParts] = argumentsAfterScript;
const suppliedTitle = titleParts.length > 0 ? titleParts.join(' ') : undefined;

if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    console.error(
        'Usage: pnpm feature:new -- <kebab-case-slug> "Optional title"',
    );
    process.exitCode = 1;
} else {
    const targetDirectory = join(featuresDirectory, slug);

    try {
        await access(targetDirectory);
        console.error(`Feature workspace already exists: ${targetDirectory}`);
        process.exitCode = 1;
    } catch {
        const title =
            suppliedTitle ??
            slug
                .split('-')
                .map((word) => word[0]?.toUpperCase() + word.slice(1))
                .join(' ');
        const date = new Date().toISOString().slice(0, 10);

        await mkdir(targetDirectory, { recursive: false });

        for (const filename of [
            'FEATURE.md',
            'EXEC_PLAN.md',
            'EVIDENCE.md',
            'REVIEW.md',
        ]) {
            const template = await readFile(
                join(templatesDirectory, filename),
                'utf8',
            );
            const content = template
                .replaceAll('{{FEATURE_NAME}}', title)
                .replaceAll('{{FEATURE_SLUG}}', slug)
                .replaceAll('{{DATE}}', date);

            await writeFile(join(targetDirectory, filename), content);
        }

        console.log(`Created ${targetDirectory}`);
    }
}
