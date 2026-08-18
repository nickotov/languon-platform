#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const journalPath = resolve(
    repositoryRoot,
    'apps/backend/drizzle/meta/_journal.json',
);
const classificationPath = resolve(
    repositoryRoot,
    'apps/backend/drizzle/deployment.json',
);

export function validateMigrationClassification(
    classification,
    journal,
    reviewedMigrationsSha256 = classification?.reviewedMigrationsSha256,
) {
    if (classification?.schemaVersion !== 1) {
        throw new Error(
            'Migration deployment classification must use schemaVersion 1.',
        );
    }
    const latest = journal?.entries?.at(-1)?.tag;
    if (!latest || classification.reviewedThrough !== latest) {
        throw new Error(
            `Migration deployment classification is stale: review through ${latest ?? 'the latest journal entry'}.`,
        );
    }
    if (
        !/^[a-f0-9]{64}$/.test(classification.reviewedMigrationsSha256 ?? '') ||
        classification.reviewedMigrationsSha256 !== reviewedMigrationsSha256
    ) {
        throw new Error(
            'Migration deployment classification does not match the reviewed migration content.',
        );
    }
    if (
        !['none', 'expand', 'migrate', 'contract'].includes(
            classification.compatibility,
        )
    ) {
        throw new Error(
            'Migration compatibility must be none, expand, migrate, or contract.',
        );
    }
    if (classification.compatibility === 'contract') {
        throw new Error(
            'Contract migrations cannot precede blue/green traffic switching; ship them in a later release after the old application is retired.',
        );
    }
    if (
        typeof classification.rationale !== 'string' ||
        classification.rationale.trim().length < 20
    ) {
        throw new Error(
            'Migration classification requires a reviewed rationale.',
        );
    }
    return classification.compatibility;
}

async function migrationContentHash(directory) {
    const files = [];
    async function visit(current, relative = '') {
        for (const entry of await readdir(current, { withFileTypes: true })) {
            const childRelative = relative
                ? `${relative}/${entry.name}`
                : entry.name;
            if (childRelative === 'deployment.json') continue;
            const child = resolve(current, entry.name);
            if (entry.isDirectory()) await visit(child, childRelative);
            else if (entry.isFile()) files.push([childRelative, child]);
        }
    }
    await visit(directory);
    const hash = createHash('sha256');
    for (const [relative, file] of files.sort(([a], [b]) =>
        a.localeCompare(b),
    )) {
        hash.update(relative)
            .update('\0')
            .update(await readFile(file))
            .update('\0');
    }
    return hash.digest('hex');
}

export async function readMigrationClassification(paths = {}) {
    const [classification, journal] = await Promise.all([
        readFile(paths.classificationPath ?? classificationPath, 'utf8').then(
            JSON.parse,
        ),
        readFile(paths.journalPath ?? journalPath, 'utf8').then(JSON.parse),
    ]);
    const contentHash = await migrationContentHash(
        dirname(paths.classificationPath ?? classificationPath),
    );
    return validateMigrationClassification(
        classification,
        journal,
        contentHash,
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    try {
        console.log(await readMigrationClassification());
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
