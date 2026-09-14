import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    compatibleCommandIds,
    sectionActiveRuns,
    sectionStartSelections,
} from '../public/selection.js';

const testDirectory = dirname(fileURLToPath(import.meta.url));

test('production bulk selection contains no conflicting command pair', async () => {
    const catalog = JSON.parse(
        await readFile(resolve(testDirectory, '..', 'commands.json'), 'utf8'),
    );
    const commands = catalog.commands.map((command) => ({
        ...command,
        available: command.enabled,
        run: null,
    }));
    const selected = new Set(compatibleCommandIds(commands));
    assert.ok(selected.size > 1);
    for (const command of commands.filter(({ id }) => selected.has(id))) {
        assert.equal(
            command.conflictsWith.some((id) => selected.has(id)),
            false,
            `${command.id} conflicts with its bulk selection`,
        );
    }
});

test('production catalog exposes the worker and keeps migrations individual-only', async () => {
    const catalog = JSON.parse(
        await readFile(resolve(testDirectory, '..', 'commands.json'), 'utf8'),
    );
    const byId = new Map(
        catalog.commands.map((command) => [command.id, command]),
    );

    assert.deepEqual(
        {
            batchEligible: byId.get('dev:dictionary-worker')?.batchEligible,
            enabled: byId.get('dev:dictionary-worker')?.enabled,
            kind: byId.get('dev:dictionary-worker')?.kind,
        },
        { batchEligible: true, enabled: true, kind: 'service' },
    );
    assert.deepEqual(
        {
            batchEligible: byId.get('db:migrate')?.batchEligible,
            enabled: byId.get('db:migrate')?.enabled,
            kind: byId.get('db:migrate')?.kind,
        },
        { batchEligible: false, enabled: true, kind: 'task' },
    );
});

test('custom-section start preserves every member and fails closed on missing IDs', () => {
    const commands = [
        {
            actualRevision: 'sha256:alpha',
            id: 'alpha',
        },
        {
            actualRevision: 'sha256:disabled',
            available: false,
            batchEligible: false,
            id: 'disabled',
            runtimeReason: 'requires an interactive terminal',
        },
    ];
    assert.deepEqual(sectionStartSelections(commands, ['alpha', 'disabled']), {
        missingIds: [],
        nonBatchIds: [],
        unavailable: [
            {
                id: 'disabled',
                reason: 'requires an interactive terminal',
            },
        ],
        selections: [],
    });
    assert.deepEqual(sectionStartSelections(commands, ['alpha', 'missing']), {
        missingIds: ['missing'],
        nonBatchIds: [],
        unavailable: [],
        selections: [],
    });
});

test('custom-section start rejects a non-batch member even when it is alone', () => {
    const commands = [
        {
            actualRevision: 'sha256:single-only',
            batchEligible: false,
            id: 'single-only',
        },
    ];

    assert.deepEqual(sectionStartSelections(commands, ['single-only']), {
        missingIds: [],
        nonBatchIds: ['single-only'],
        unavailable: [],
        selections: [],
    });
});

test('custom-section stop targets only active current member runs', () => {
    const commands = [
        {
            id: 'alpha',
            run: { id: 'run-alpha', status: 'running' },
        },
        {
            id: 'beta',
            run: { id: 'run-beta', status: 'succeeded' },
        },
        {
            id: 'outside',
            run: { id: 'run-outside', status: 'running' },
        },
    ];
    assert.deepEqual(sectionActiveRuns(commands, ['alpha', 'beta']), [
        { commandId: 'alpha', runId: 'run-alpha' },
    ]);
});
