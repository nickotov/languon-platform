import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const filenames = ['FEATURE.md', 'EXEC_PLAN.md', 'EVIDENCE.md', 'REVIEW.md'];

export async function createFeature(repositoryRoot, args) {
    const supplied = args[0] === '--' ? args.slice(1) : args;
    const [slug, ...titleParts] = supplied;
    if (
        !slug ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
        /^\d+-/.test(slug)
    ) {
        throw new Error(
            'Usage: pnpm feature:new -- <kebab-case-slug> "Optional title" (omit the numeric prefix)',
        );
    }
    const featuresDirectory = join(repositoryRoot, '.agent', 'features');
    const templatesDirectory = join(repositoryRoot, '.agent', 'templates');
    const title = titleParts.length
        ? titleParts.join(' ')
        : slug
              .split('-')
              .map((word) => word[0].toUpperCase() + word.slice(1))
              .join(' ');
    const date = new Date().toISOString().slice(0, 10);
    // Read all templates before reserving a folder: failures leave no partial workspace.
    const templates = await Promise.all(
        filenames.map((name) =>
            readFile(join(templatesDirectory, name), 'utf8'),
        ),
    );
    await mkdir(featuresDirectory, { recursive: true });
    const lock = join(featuresDirectory, '.create-feature.lock');
    try {
        await mkdir(lock);
    } catch (error) {
        if (error.code === 'EEXIST')
            throw new Error(
                'Another feature creation is in progress. Retry after it finishes; if interrupted, inspect and remove the stale .agent/features/.create-feature.lock directory.',
                { cause: error },
            );
        throw error;
    }
    let targetDirectory;
    let created = false;
    try {
        const entries = (
            await readdir(featuresDirectory, { withFileTypes: true })
        ).filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'));
        if (entries.some((entry) => entry.name.replace(/^\d+-/, '') === slug)) {
            throw new Error(
                `Feature workspace already exists for slug: ${slug}`,
            );
        }
        const numbers = entries.map((entry) =>
            Number(entry.name.match(/^(\d+)-/)?.[1] ?? 0),
        );
        const next = Math.max(0, ...numbers) + 1;
        if (!Number.isSafeInteger(next))
            throw new Error(
                'Feature counter exceeds the supported integer range.',
            );
        const folder = `${String(next).padStart(3, '0')}-${slug}`;
        targetDirectory = join(featuresDirectory, folder);
        await mkdir(targetDirectory);
        created = true;
        for (const [index, name] of filenames.entries()) {
            const content = templates[index]
                .replaceAll('{{FEATURE_NAME}}', title)
                .replaceAll('{{FEATURE_SLUG}}', slug)
                .replaceAll('{{FEATURE_FOLDER}}', folder)
                .replaceAll('{{DATE}}', date);
            await writeFile(join(targetDirectory, name), content, {
                flag: 'wx',
            });
        }
        return targetDirectory;
    } catch (error) {
        if (created)
            await rm(targetDirectory, { recursive: true, force: true });
        throw error;
    } finally {
        await rm(lock, { recursive: true, force: true });
    }
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
    try {
        const target = await createFeature(
            resolve(dirname(scriptPath), '..'),
            process.argv.slice(2),
        );
        console.log(`Created ${target}`);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
