#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import process from 'node:process';
import { SEMVER_PATTERN, SHA_PATTERN } from './release-manifest.mjs';

function git(args, cwd) {
    return execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
}

function validateVersion(version) {
    if (!SEMVER_PATTERN.test(version)) {
        throw new Error(
            'Release tag must be a stable vMAJOR.MINOR.PATCH version',
        );
    }
    return version;
}

function resolveReleaseCommit(
    version,
    mainRef = 'origin/main',
    cwd = process.cwd(),
) {
    validateVersion(version);
    const sourceSha = git(['rev-list', '-n', '1', `refs/tags/${version}`], cwd);
    if (!SHA_PATTERN.test(sourceSha))
        throw new Error(`Unable to resolve ${version} to a commit`);

    try {
        execFileSync(
            'git',
            ['merge-base', '--is-ancestor', sourceSha, mainRef],
            { cwd, stdio: 'ignore' },
        );
    } catch {
        throw new Error(
            `Release ${version} does not point to a commit contained in ${mainRef}`,
        );
    }

    return sourceSha;
}

function resolveBranchHead(branchRef = 'origin/stage', cwd = process.cwd()) {
    const sourceSha = git(['rev-parse', `${branchRef}^{commit}`], cwd);
    if (!SHA_PATTERN.test(sourceSha))
        throw new Error(`Unable to resolve ${branchRef}`);
    return sourceSha;
}

function writeOutput(name, value) {
    const output = process.env.GITHUB_OUTPUT;
    if (!output) {
        process.stdout.write(`${value}\n`);
        return;
    }
    appendFileSync(output, `${name}=${value}\n`);
}

function main() {
    const [command, value] = process.argv.slice(2);
    if (command === 'release')
        writeOutput('source_sha', resolveReleaseCommit(value));
    else if (command === 'stage')
        writeOutput('source_sha', resolveBranchHead(value || 'origin/stage'));
    else
        throw new Error(
            'Usage: release-ref.mjs release <version> | stage [remote-ref]',
        );
}

if (
    process.argv[1] &&
    import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
    try {
        main();
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    }
}

export { resolveBranchHead, resolveReleaseCommit, validateVersion };
