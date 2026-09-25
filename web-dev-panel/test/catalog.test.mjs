import assert from 'node:assert/strict';
import {
    mkdir,
    mkdtemp,
    readFile,
    realpath,
    symlink,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { loadCatalog, validateCatalogDocument } from '../src/catalog.mjs';
import {
    documentedCommandRevision,
    packageScriptRevision,
} from '../src/source-revision.mjs';

function command(script, value) {
    return {
        batchEligible: true,
        category: 'Quality',
        conflictsWith: [],
        description: 'Runs a safe fixture command.',
        disabledReason: null,
        enabled: true,
        id: script,
        kind: 'task',
        outputProtocol: 'plain',
        source: {
            revision: packageScriptRevision(script, value),
            script,
            type: 'package-script',
        },
        title: 'Fixture',
    };
}

test('requires symmetric declared conflicts', () => {
    const first = command('first', 'node first.mjs');
    const second = command('second', 'node second.mjs');
    first.conflictsWith = ['second'];
    assert.throws(
        () =>
            validateCatalogDocument({ commands: [first, second], version: 1 }),
        /must be symmetric/u,
    );
});

test('accepts reviewed loopback service URLs and rejects unsafe URLs', () => {
    const safe = command('safe', 'node safe.mjs');
    safe.serviceUrls = [
        { label: 'Safe service', url: 'http://localhost:4555' },
    ];
    const catalog = validateCatalogDocument({ commands: [safe], version: 1 });
    assert.deepEqual(catalog.commands[0].serviceUrls, safe.serviceUrls);

    for (const unsafeUrl of [
        'https://example.com',
        'http://user:secret@localhost:4555',
        'http://localhost:4555?token=value',
    ]) {
        const unsafe = command('unsafe', 'node unsafe.mjs');
        unsafe.serviceUrls = [{ label: 'Unsafe service', url: unsafeUrl }];
        assert.throws(
            () =>
                validateCatalogDocument({
                    commands: [unsafe],
                    version: 1,
                }),
            /credential-free loopback HTTP\(S\) URL/u,
        );
    }
});

test('materializes added scripts and disables changed reviewed sources', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'web-dev-panel-catalog-'));
    const catalogPath = resolve(root, 'commands.json');
    await writeFile(
        resolve(root, 'package.json'),
        JSON.stringify({
            scripts: { new: 'node new.mjs', safe: 'node changed.mjs' },
        }),
    );
    await writeFile(
        catalogPath,
        JSON.stringify({
            commands: [command('safe', 'node safe.mjs')],
            version: 1,
        }),
    );
    const loaded = await loadCatalog({ catalogPath, repositoryRoot: root });
    assert.equal(
        loaded.commands.find(({ id }) => id === 'safe').available,
        false,
    );
    assert.equal(
        loaded.commands.find(({ id }) => id === 'new').available,
        false,
    );
    assert.match(loaded.issues.join(' '), /changed after review/u);
    assert.match(loaded.issues.join(' '), /has not been reviewed/u);
    assert.equal(
        JSON.parse(await readFile(catalogPath, 'utf8')).commands.length,
        1,
    );
});

test('rejects documented command sources that traverse a symbolic link', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'web-dev-panel-doc-source-'));
    const external = await mkdtemp(
        resolve(tmpdir(), 'web-dev-panel-external-'),
    );
    await mkdir(resolve(root, 'docs'));
    await writeFile(
        resolve(root, 'package.json'),
        JSON.stringify({ scripts: {} }),
    );
    await writeFile(resolve(external, 'commands.md'), 'node safe.mjs\n');
    await symlink(
        resolve(external, 'commands.md'),
        resolve(root, 'docs', 'commands.md'),
    );
    const source = {
        args: ['safe.mjs'],
        command: 'node safe.mjs',
        cwd: '.',
        executable: 'node',
        path: 'docs/commands.md',
        type: 'documented-command',
    };
    const catalogPath = resolve(root, 'commands.json');
    await writeFile(
        catalogPath,
        JSON.stringify({
            commands: [
                {
                    batchEligible: true,
                    category: 'Fixture',
                    conflictsWith: [],
                    description: 'Runs a safe documented fixture.',
                    disabledReason: null,
                    enabled: true,
                    id: 'documented-safe',
                    kind: 'task',
                    outputProtocol: 'plain',
                    source: {
                        ...source,
                        revision: documentedCommandRevision(source),
                    },
                    title: 'Documented safe fixture',
                },
            ],
            version: 1,
        }),
    );
    const loaded = await loadCatalog({ catalogPath, repositoryRoot: root });
    assert.equal(loaded.commands[0].available, false);
    assert.match(loaded.issues[0], /without symbolic links/u);
});

test('constructs package-script execution through a checked pnpm JavaScript entrypoint', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'web-dev-panel-pnpm-entry-'));
    const catalogPath = resolve(root, 'commands.json');
    const entrypoint = resolve(root, 'pnpm.cjs');
    await writeFile(entrypoint, '');
    await writeFile(
        resolve(root, 'package.json'),
        JSON.stringify({ scripts: { safe: 'node safe.mjs' } }),
    );
    await writeFile(
        catalogPath,
        JSON.stringify({
            commands: [command('safe', 'node safe.mjs')],
            version: 1,
        }),
    );
    const loaded = await loadCatalog({
        catalogPath,
        packageManagerEntrypoint: entrypoint,
        repositoryRoot: root,
    });
    assert.deepEqual(loaded.commands[0].execution, {
        args: [await realpath(entrypoint), 'run', 'safe'],
        cwd: root,
        executable: 'node',
    });
});

test('fails command execution closed on Windows without Job Object supervision', async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'web-dev-panel-windows-'));
    const catalogPath = resolve(root, 'commands.json');
    const entrypoint = resolve(root, 'pnpm.cjs');
    await writeFile(entrypoint, '');
    await writeFile(
        resolve(root, 'package.json'),
        JSON.stringify({ scripts: { safe: 'node safe.mjs' } }),
    );
    await writeFile(
        catalogPath,
        JSON.stringify({
            commands: [command('safe', 'node safe.mjs')],
            version: 1,
        }),
    );
    const loaded = await loadCatalog({
        catalogPath,
        packageManagerEntrypoint: entrypoint,
        platform: 'win32',
        repositoryRoot: root,
    });
    assert.equal(loaded.commands[0].available, false);
    assert.equal(loaded.commands[0].execution, null);
    assert.match(loaded.commands[0].runtimeReason, /unavailable on Windows/u);
    assert.deepEqual(loaded.issues, []);
});

test('whole-app startup is individual-only and conflicts with component lifecycle commands', async () => {
    const catalog = JSON.parse(
        await readFile(new URL('../commands.json', import.meta.url), 'utf8'),
    );
    const wholeApp = catalog.commands.find(({ id }) => id === 'dev:all');
    assert.equal(wholeApp.title, 'Start whole app');
    assert.equal(wholeApp.enabled, true);
    assert.equal(wholeApp.kind, 'service');
    assert.equal(wholeApp.batchEligible, false);
    for (const id of [
        'dev',
        'dev:backend',
        'dev:web',
        'dev:admin',
        'dev:dictionary-worker',
        'dev:infra',
        'infra:down',
        'db:migrate',
        'dev:apps:docker',
    ]) {
        assert.ok(wholeApp.conflictsWith.includes(id), id);
        assert.ok(
            catalog.commands
                .find((command) => command.id === id)
                .conflictsWith.includes('dev:all'),
            id,
        );
    }
});
