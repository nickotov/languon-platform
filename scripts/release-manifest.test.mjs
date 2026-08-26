import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import {
    resolveBranchHead,
    resolveReleaseCommit,
    validateVersion,
} from './release-ref.mjs';
import { IMAGE_NAMES, validateManifest } from './release-manifest.mjs';

const SOURCE_SHA = 'a'.repeat(40);
const DIGEST = 'b'.repeat(64);
const generationBudget = {
    maxInputTokensPerAttempt: 65_536,
    maxOutputTokensPerAttempt: 1_024,
    inputCostMicrosPerMillionTokens: 1_000_000,
    outputCostMicrosPerMillionTokens: 4_000_000,
    maxCostMicrosPerAttempt: 70_000,
};

function fixture(overrides = {}) {
    return {
        schemaVersion: 2,
        identity: 'v1.2.3',
        version: 'v1.2.3',
        sourceSha: SOURCE_SHA,
        verified: true,
        workflowRun: 1234,
        createdAt: '2026-08-18T00:00:00.000Z',
        migration: { compatibility: 'expand', ledger: 'drizzle-tree-sha' },
        dictionaryJobs: {
            phase: 'expand',
            workerProcessable: ['single-card:v1'],
            apiReadable: ['single-card:v1'],
            apiCancellable: ['single-card:v1'],
            apiDiscardable: ['single-card:v1'],
            apiAcceptable: ['single-card:v1'],
            apiEnqueued: [],
            webReadable: ['single-card:v1'],
            retireFormats: [],
            generationBudget,
        },
        images: Object.fromEntries(
            IMAGE_NAMES.map((name) => [
                name,
                `ghcr.io/nickkotov/languon-platform/${name}@sha256:${DIGEST}`,
            ]),
        ),
        ...overrides,
    };
}

test('accepts only stable vMAJOR.MINOR.PATCH release versions', () => {
    assert.equal(validateVersion('v0.1.0'), 'v0.1.0');
    for (const invalid of [
        '1.2.3',
        'v1.2',
        'v01.2.3',
        'v1.2.3-rc.1',
        'latest',
        '',
    ]) {
        assert.throws(
            () => validateVersion(invalid),
            /stable vMAJOR\.MINOR\.PATCH/,
        );
    }
});

test('resolves stage head and permits only release commits contained in main', async () => {
    const directory = await mkdtemp(
        path.join(tmpdir(), 'languon-release-ref-'),
    );
    const git = (args) =>
        execFileSync('git', args, {
            cwd: directory,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        }).trim();

    try {
        git(['init', '--quiet', '--initial-branch=main']);
        git(['config', 'user.name', 'Release Test']);
        git(['config', 'user.email', 'release-test@example.invalid']);
        await writeFile(path.join(directory, 'fixture.txt'), 'main\n');
        git(['add', 'fixture.txt']);
        git(['commit', '--quiet', '-m', 'main fixture']);
        const mainSha = git(['rev-parse', 'HEAD']);
        git(['tag', 'v1.2.3']);
        git(['update-ref', 'refs/remotes/origin/main', mainSha]);
        git(['update-ref', 'refs/remotes/origin/stage', mainSha]);

        assert.equal(
            resolveReleaseCommit('v1.2.3', 'origin/main', directory),
            mainSha,
        );
        assert.equal(resolveBranchHead('origin/stage', directory), mainSha);

        git(['checkout', '--quiet', '--orphan', 'divergent']);
        await writeFile(path.join(directory, 'fixture.txt'), 'divergent\n');
        git(['add', 'fixture.txt']);
        git(['commit', '--quiet', '-m', 'divergent fixture']);
        git(['tag', 'v2.0.0']);
        assert.throws(
            () => resolveReleaseCommit('v2.0.0', 'origin/main', directory),
            /does not point to a commit contained in origin\/main/,
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test('accepts an exact, verified GHCR digest manifest', () => {
    assert.deepEqual(validateManifest(fixture()), fixture());
});

test('rejects mutable, missing, extra, or unverified image sets', () => {
    assert.throws(
        () =>
            validateManifest(
                fixture({
                    images: {
                        ...fixture().images,
                        backend: 'ghcr.io/example/backend:latest',
                    },
                }),
            ),
        /backend image must be a permitted sha256 digest reference/,
    );
    const { admin: _admin, ...missingAdmin } = fixture().images;
    assert.throws(
        () => validateManifest(fixture({ images: missingAdmin })),
        /exactly: backend, web, admin, migrator/,
    );
    assert.throws(
        () =>
            validateManifest(
                fixture({
                    images: {
                        ...fixture().images,
                        unexpected: fixture().images.web,
                    },
                }),
            ),
        /exactly: backend, web, admin, migrator/,
    );
    assert.throws(
        () => validateManifest(fixture({ verified: false })),
        /not build-ready/,
    );
});

test('rejects deployment identity and migration substitution', () => {
    assert.throws(
        () =>
            validateManifest(fixture(), {
                imagePrefix: 'ghcr.io/another/repository/',
            }),
        /does not belong/,
    );
    assert.throws(
        () => validateManifest(fixture(), { sourceSha: 'c'.repeat(40) }),
        /does not match expected commit/,
    );
    assert.throws(
        () => validateManifest(fixture(), { version: 'v1.2.4' }),
        /does not match expected release/,
    );
    assert.throws(
        () =>
            validateManifest(
                fixture({
                    migration: { compatibility: 'contract', ledger: 'x' },
                }),
            ),
        /Contract\/destructive migrations/,
    );
});

test('create CLI writes a canonical manifest once and validate CLI checks expectations', async () => {
    const directory = await mkdtemp(
        path.join(tmpdir(), 'languon-release-manifest-'),
    );
    const output = path.join(directory, 'manifest.json');
    const args = [
        'scripts/release-manifest.mjs',
        'create',
        '--output',
        output,
        '--source-sha',
        SOURCE_SHA,
        '--identity',
        'stage-a',
        '--version',
        '',
        '--workflow-run',
        '99',
        '--migration-compatibility',
        'expand',
        '--migration-ledger',
        'ledger',
        '--dictionary-job-phase',
        'expand',
        '--dictionary-job-worker-processable',
        'single-card:v1',
        '--dictionary-job-api-readable',
        'single-card:v1',
        '--dictionary-job-api-cancellable',
        'single-card:v1',
        '--dictionary-job-api-discardable',
        'single-card:v1',
        '--dictionary-job-api-acceptable',
        'single-card:v1',
        '--dictionary-job-web-readable',
        'single-card:v1',
        '--dictionary-job-max-input-tokens-per-attempt',
        '65536',
        '--dictionary-job-max-output-tokens-per-attempt',
        '1024',
        '--dictionary-job-input-cost-micros-per-million-tokens',
        '1000000',
        '--dictionary-job-output-cost-micros-per-million-tokens',
        '4000000',
        '--dictionary-job-max-cost-micros-per-attempt',
        '70000',
        ...IMAGE_NAMES.flatMap((name) => [
            '--image',
            `${name}=ghcr.io/nickkotov/languon-platform/${name}@sha256:${DIGEST}`,
        ]),
    ];

    try {
        const created = spawnSync(process.execPath, args, { encoding: 'utf8' });
        assert.equal(created.status, 0, created.stderr);
        const manifest = JSON.parse(await readFile(output, 'utf8'));
        assert.equal(manifest.version, null);
        assert.equal(manifest.sourceSha, SOURCE_SHA);
        assert.equal(manifest.migration.ledger, 'ledger');
        assert.deepEqual(manifest.dictionaryJobs.apiEnqueued, []);
        assert.deepEqual(manifest.dictionaryJobs.workerProcessable, [
            'single-card:v1',
        ]);
        assert.deepEqual(manifest.dictionaryJobs.retireFormats, []);
        assert.deepEqual(
            manifest.dictionaryJobs.generationBudget,
            generationBudget,
        );

        const duplicate = spawnSync(process.execPath, args, {
            encoding: 'utf8',
        });
        assert.notEqual(duplicate.status, 0);

        const checked = spawnSync(
            process.execPath,
            [
                'scripts/release-manifest.mjs',
                'validate',
                '--input',
                output,
                '--expected-source-sha',
                SOURCE_SHA,
                '--expected-image-prefix',
                'ghcr.io/nickkotov/languon-platform/',
            ],
            { encoding: 'utf8' },
        );
        assert.equal(checked.status, 0, checked.stderr);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
