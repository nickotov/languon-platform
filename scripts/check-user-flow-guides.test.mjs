import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseFrontmatter, validateGuide } from './check-user-flow-guides.mjs';
import {
    computeE2eRevision,
    readE2eTestFiles,
    scanRepositoryTestFiles,
    sectionsByHeading,
    validateE2eMarkerRegistry,
    validateE2eTestFiles,
} from './check-user-flow-guides.mjs';
import { inspectUserFlowE2e } from './user-flow-e2e.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const validGuide = `---
feature: example-feature
title: Example Feature
status: current
last_verified: 2026-08-13
surfaces:
  - browser
  - api
source_paths:
  - apps/web/src/example/**
e2e_command: web-playwright
e2e_tests:
  - apps/web/tests/e2e/example.spec.ts
e2e_scenarios:
  - primary-journey
related_features:
  - shared-example
---

# Example Feature

## What this verifies

Scope.

## Start the development environment

Start it.

## Browser verification

Use a browser.

## API verification

Call the API.

## E2E coverage

- \`primary-journey\` proves the browser and API boundary.

## Expected failure and edge cases

Check failures.

## Automated regression checks

Run tests.

## Troubleshooting

Inspect errors.

## Cleanup

Stop it.
`;

test('accepts a complete indexed guide', () => {
    assert.doesNotThrow(() =>
        validateGuide(
            validGuide,
            'example-feature.md',
            '- [Example Feature](./example-feature.md)',
        ),
    );
});

test('parses scalar and list frontmatter', () => {
    const { metadata } = parseFrontmatter(validGuide, 'example-feature.md');

    assert.equal(metadata.get('feature'), 'example-feature');
    assert.deepEqual(metadata.get('surfaces'), ['browser', 'api']);
    assert.deepEqual(metadata.get('e2e_scenarios'), ['primary-journey']);
});

test('parses lists formatted with the project indentation', () => {
    const formattedGuide = validGuide.replace(/^ {2}- /gm, '    - ');
    const { metadata } = parseFrontmatter(formattedGuide, 'example-feature.md');

    assert.deepEqual(metadata.get('surfaces'), ['browser', 'api']);
    assert.deepEqual(metadata.get('source_paths'), ['apps/web/src/example/**']);
});

test('rejects filename and feature mismatches', () => {
    assert.throws(
        () =>
            validateGuide(
                validGuide,
                'different-feature.md',
                '- [Example Feature](./different-feature.md)',
            ),
        /filename must match feature slug/,
    );
});

test('rejects missing surface sections', () => {
    assert.throws(
        () =>
            validateGuide(
                validGuide.replace('## API verification', '## HTTP examples'),
                'example-feature.md',
                '- [Example Feature](./example-feature.md)',
            ),
        /missing required '## API verification'/,
    );
});

test('rejects empty list items and empty required sections', () => {
    assert.throws(
        () =>
            validateGuide(
                validGuide.replace('  - apps/web/src/example/**', '  -    '),
                'example-feature.md',
                '- [Example Feature](./example-feature.md)',
            ),
        /'source_paths' must be a non-empty list/,
    );
    assert.throws(
        () =>
            validateGuide(
                validGuide.replace('## Cleanup\n\nStop it.', '## Cleanup\n'),
                'example-feature.md',
                '- [Example Feature](./example-feature.md)',
            ),
        /required '## Cleanup' section is empty/,
    );
    assert.throws(
        () =>
            validateGuide(
                validGuide.replace(
                    '## Cleanup\n\nStop it.',
                    '## Cleanup\n\n<!-- later -->\n\n```sh\n```',
                ),
                'example-feature.md',
                '- [Example Feature](./example-feature.md)',
            ),
        /required '## Cleanup' section is empty/,
    );
});

test('rejects unsafe source paths and missing index entries', () => {
    assert.throws(
        () =>
            validateGuide(
                validGuide.replace(
                    'apps/web/src/example/**',
                    '../outside-repository/**',
                ),
                'example-feature.md',
                '- [Example Feature](./example-feature.md)',
            ),
        /must be repository-relative/,
    );
    assert.throws(
        () => validateGuide(validGuide, 'example-feature.md', '# Empty index'),
        /guide is missing from README.md index/,
    );
});

test('requires complete and safe E2E metadata for current guides', () => {
    assert.throws(
        () =>
            validateGuide(
                validGuide.replace('e2e_command: web-playwright\n', ''),
                'example-feature.md',
                '- [Example Feature](./example-feature.md)',
            ),
        /'e2e_command' must be a non-empty scalar/,
    );
    assert.throws(
        () =>
            validateGuide(
                validGuide.replace(
                    'e2e_command: web-playwright',
                    'e2e_command: arbitrary-shell',
                ),
                'example-feature.md',
                '- [Example Feature](./example-feature.md)',
            ),
        /must be a registered command ID/,
    );
    assert.throws(
        () =>
            validateGuide(
                validGuide.replace(
                    'apps/web/tests/e2e/example.spec.ts',
                    'apps/web/tests/e2e/*.spec.ts',
                ),
                'example-feature.md',
                '- [Example Feature](./example-feature.md)',
            ),
        /exact path without glob syntax/,
    );
    assert.throws(
        () =>
            validateGuide(
                validGuide.replace('primary-journey', 'Primary journey'),
                'example-feature.md',
                '- [Example Feature](./example-feature.md)',
            ),
        /must be a kebab-case slug/,
    );
    assert.throws(
        () =>
            validateGuide(
                validGuide.replace(
                    '- `primary-journey` proves the browser and API boundary.',
                    'No scenario mapping yet.',
                ),
                'example-feature.md',
                '- [Example Feature](./example-feature.md)',
            ),
        /must document scenario 'primary-journey'/,
    );
    assert.throws(
        () =>
            validateGuide(
                validGuide.replace(
                    '  - primary-journey\nrelated_features:',
                    '  - primary-journey\n  - primary-journey\nrelated_features:',
                ),
                'example-feature.md',
                '- [Example Feature](./example-feature.md)',
            ),
        /'e2e_scenarios' must not contain duplicates/,
    );
    assert.throws(
        () =>
            validateGuide(
                validGuide.replace(
                    '- `primary-journey` proves the browser and API boundary.',
                    '- `primary-journey`',
                ),
                'example-feature.md',
                '- [Example Feature](./example-feature.md)',
            ),
        /must explain what scenario 'primary-journey' proves/,
    );
    assert.throws(
        () =>
            validateGuide(
                validGuide
                    .replace(
                        '  - primary-journey\nrelated_features:',
                        '  - primary-journey\n  - secondary-journey\nrelated_features:',
                    )
                    .replace(
                        '- `primary-journey` proves the browser and API boundary.',
                        '- `primary-journey` `secondary-journey`',
                    ),
                'example-feature.md',
                '- [Example Feature](./example-feature.md)',
            ),
        /must explain what scenario 'primary-journey' proves/,
    );
    assert.throws(
        () =>
            validateGuide(
                validGuide.replace(
                    'e2e_command: web-playwright',
                    'e2e_command: web-playwright\u001b[31m',
                ),
                'example-feature.md',
                '- [Example Feature](./example-feature.md)',
            ),
        /must not contain control characters/,
    );
});

test('E2E revision changes only with test-relevant guide content', () => {
    const index = '- [Example Feature](./example-feature.md)';
    const original = validateGuide(validGuide, 'example-feature.md', index).e2e;
    const stableEdits = [
        validGuide.replace('2026-08-13', '2026-08-14'),
        validGuide.replace('Run tests.', 'Run the focused tests.'),
    ];
    const revisionChangingEdits = [
        validGuide.replace('Scope.', 'Scope and identity.'),
        validGuide.replace('Start it.', 'Start it and wait for health.'),
        validGuide.replace('Use a browser.', 'Use a browser and reload.'),
        validGuide.replace('Call the API.', 'Call the API twice.'),
        validGuide.replace('Check failures.', 'Check failures and retries.'),
        validGuide.replace(
            'proves the browser and API boundary',
            'proves browser reload and API persistence',
        ),
        validGuide.replaceAll('primary-journey', 'replacement-journey'),
        validGuide
            .replace('  - api\n', '')
            .replace('\n## API verification\n\nCall the API.\n', ''),
    ];

    for (const editedGuide of stableEdits) {
        assert.equal(
            validateGuide(editedGuide, 'example-feature.md', index).e2e
                .revision,
            original.revision,
        );
    }
    for (const editedGuide of revisionChangingEdits) {
        assert.notEqual(
            validateGuide(editedGuide, 'example-feature.md', index).e2e
                .revision,
            original.revision,
        );
    }
    assert.equal(
        computeE2eRevision({
            e2eCommand: original.command,
            e2eCommandId: original.commandId,
            feature: original.feature,
            scenarios: original.scenarios,
            sections: sectionsByHeading(
                parseFrontmatter(validGuide, 'example-feature.md').body,
            ),
            surfaces: ['browser', 'api'],
        }),
        original.revision,
    );
    assert.notEqual(
        computeE2eRevision({
            e2eCommand: 'pnpm changed-command',
            e2eCommandId: original.commandId,
            feature: original.feature,
            scenarios: original.scenarios,
            sections: sectionsByHeading(
                parseFrontmatter(validGuide, 'example-feature.md').body,
            ),
            surfaces: ['browser', 'api'],
        }),
        original.revision,
    );
});

test('validates scenario and revision markers across declared E2E files', () => {
    const e2e = validateGuide(
        validGuide,
        'example-feature.md',
        '- [Example Feature](./example-feature.md)',
    ).e2e;
    const validTest = `// @user-flow-revision example-feature ${e2e.revision}\n// @user-flow example-feature/primary-journey\ntest("journey", () => {});\n`;

    assert.doesNotThrow(() =>
        validateE2eTestFiles(
            e2e,
            new Map([['apps/web/tests/e2e/example.spec.ts', validTest]]),
            'example-feature.md',
        ),
    );
    assert.throws(
        () =>
            validateE2eTestFiles(
                e2e,
                new Map([
                    [
                        'apps/web/tests/e2e/example.spec.ts',
                        validTest.replace(e2e.revision, 'sha256:stale'),
                    ],
                ]),
                'example-feature.md',
            ),
        /must contain exactly one.*@user-flow-revision/,
    );
    assert.throws(
        () =>
            validateE2eTestFiles(
                e2e,
                new Map([
                    [
                        'apps/web/tests/e2e/example.spec.ts',
                        validTest.replace(
                            'primary-journey',
                            'orphaned-journey',
                        ),
                    ],
                ]),
                'example-feature.md',
            ),
        /marks undeclared scenario 'orphaned-journey'/,
    );
    assert.throws(
        () => validateE2eTestFiles(e2e, new Map(), 'example-feature.md'),
        /does not exist/,
    );
    assert.throws(
        () =>
            validateE2eTestFiles(
                e2e,
                new Map([
                    [
                        'apps/web/tests/e2e/example.spec.ts',
                        `${validTest}// @user-flow example-feature/primary-journey\n`,
                    ],
                ]),
                'example-feature.md',
            ),
        /must have exactly one.*found 2/,
    );
});

test('rejects orphaned and unknown markers outside declared test files', () => {
    const e2e = validateGuide(
        validGuide,
        'example-feature.md',
        '- [Example Feature](./example-feature.md)',
    ).e2e;
    const mappings = new Map([['example-feature', e2e]]);

    assert.throws(
        () =>
            validateE2eMarkerRegistry(
                mappings,
                new Map([
                    [
                        'apps/web/tests/e2e/old.spec.ts',
                        '// @user-flow example-feature/primary-journey',
                    ],
                ]),
            ),
        /marker.*orphaned/,
    );
    assert.throws(
        () =>
            validateE2eMarkerRegistry(
                mappings,
                new Map([
                    [
                        'apps/web/tests/e2e/unknown.spec.ts',
                        '// @user-flow removed-feature/old-journey',
                    ],
                ]),
            ),
        /unknown current guide 'removed-feature'/,
    );
    assert.throws(
        () =>
            validateE2eMarkerRegistry(
                mappings,
                new Map([
                    [
                        'apps/web/tests/e2e/example.spec.ts',
                        '// @user-flow-revision example-feature sha256:stale',
                    ],
                ]),
            ),
        /malformed user-flow marker/,
    );
    assert.throws(
        () =>
            validateE2eMarkerRegistry(
                mappings,
                new Map([
                    [
                        'apps/web/tests/e2e/example.spec.ts',
                        '// @user-flow example-feature/old_journey\u001b[31m',
                    ],
                ]),
            ),
        /\\u001b\[31m/,
    );
    assert.throws(
        () =>
            validateE2eMarkerRegistry(
                mappings,
                new Map([
                    [
                        'apps/web/tests/e2e/unsafe\u001b]52;c;payload.spec.ts',
                        '// @user-flow example-feature/primary-journey',
                    ],
                ]),
            ),
        /E2E test path.*\\u001b\]52;c;payload.*must not contain control characters/,
    );
    assert.throws(
        () =>
            validateE2eMarkerRegistry(
                mappings,
                new Map([
                    [
                        'apps/web/tests/e2e/example.spec.ts',
                        '// @user-flow example-feature/old_journey',
                    ],
                ]),
            ),
        /malformed user-flow marker/,
    );
    assert.throws(
        () =>
            validateE2eMarkerRegistry(
                mappings,
                new Map([
                    [
                        'apps/web/tests/e2e/example.spec.ts',
                        '// @user-flow-revision example-feature sha256:0000000000000000',
                    ],
                ]),
            ),
        /revision.*is stale/,
    );
});

test('repository marker scan includes test files outside application roots', async () => {
    const files = await scanRepositoryTestFiles();
    assert.equal(files.has('scripts/check-user-flow-guides.test.mjs'), true);
});

test('declared test reads reject symbolic-link paths', async () => {
    const temporaryDirectory = await mkdtemp(
        join(repositoryRoot, '.user-flow-e2e-test-'),
    );
    const linkPath = join(temporaryDirectory, 'linked.spec.ts');
    const testPath = relative(repositoryRoot, linkPath).replaceAll('\\', '/');
    try {
        await symlink(
            join(repositoryRoot, 'apps/web/tests/e2e/auth.journeys.spec.ts'),
            linkPath,
        );
        await assert.rejects(
            readE2eTestFiles({
                feature: 'example-feature',
                testPaths: [testPath],
            }),
            /must not contain symbolic links/,
        );
    } finally {
        await rm(temporaryDirectory, { force: true, recursive: true });
    }
});

test('does not count a fenced example as an index entry', () => {
    assert.throws(
        () =>
            validateGuide(
                validGuide,
                'example-feature.md',
                '```md\n- [Example Feature](./example-feature.md)\n```',
            ),
        /guide is missing from README.md index/,
    );
    assert.throws(
        () =>
            validateGuide(
                validGuide,
                'example-feature.md',
                '<!-- [Example Feature](./example-feature.md) -->\n`[Example Feature](./example-feature.md)`',
            ),
        /guide is missing from README.md index/,
    );
});

test('agent CLI inspects and checks a mapped user flow without executing it', () => {
    const inspection = spawnSync(
        process.execPath,
        ['scripts/user-flow-e2e.mjs', 'inspect', 'user-authentication'],
        { cwd: repositoryRoot, encoding: 'utf8' },
    );
    assert.equal(inspection.status, 0, inspection.stderr);
    assert.match(inspection.stdout, /User flow: user-authentication/);
    assert.match(
        inspection.stdout,
        /Guide: docs\/user-flows\/user-authentication\.md/,
    );
    assert.match(inspection.stdout, /E2E command ID: web-playwright/);
    assert.match(inspection.stdout, /Status: synchronized/);
    assert.match(inspection.stdout, /signup-verification-refresh-logout/);

    const check = spawnSync(
        process.execPath,
        ['scripts/user-flow-e2e.mjs', 'check', 'user-authentication'],
        { cwd: repositoryRoot, encoding: 'utf8' },
    );
    assert.equal(check.status, 0, check.stderr);
    assert.match(check.stdout, /Validated 1 user-flow guide/);

    const invalid = spawnSync(
        process.execPath,
        ['scripts/user-flow-e2e.mjs', 'run', 'user-authentication'],
        { cwd: repositoryRoot, encoding: 'utf8' },
    );
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /Usage:/);
});

test('inspection reports selected-feature registry errors', async () => {
    const inspection = await inspectUserFlowE2e('user-authentication', {
        repositoryTestFiles: new Map([
            [
                'scripts/orphaned-auth.test.mjs',
                '// @user-flow user-authentication/passkey-lifecycle',
            ],
        ]),
    });

    assert.match(inspection.validationError, /marker.*orphaned/);
});
