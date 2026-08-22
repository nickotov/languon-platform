import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import {
    PanelOperationError,
    ProcessManager,
} from '../src/process-manager.mjs';

const revision = `sha256:${'b'.repeat(64)}`;

class FakeCatalog extends EventEmitter {
    constructor(commands) {
        super();
        this.commands = commands;
    }
    async refresh() {}
    getCommand(id) {
        return this.commands.find((command) => command.id === id);
    }
}

function fixtureCommand(id, milliseconds = 2_000, conflictsWith = []) {
    return {
        actualRevision: revision,
        available: true,
        conflictsWith,
        execution: {
            args: ['-e', `setTimeout(() => process.exit(0), ${milliseconds})`],
            cwd: process.cwd(),
            executable: 'node',
        },
        id,
        outputProtocol: 'plain',
    };
}

async function waitForTerminal(manager, id) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const run = manager.snapshot()[id];
        if (run && ['cancelled', 'failed', 'succeeded'].includes(run.status))
            return run;
        await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    }
    throw new Error('run did not become terminal');
}

test('reserves a command before concurrent duplicate starts can race', async () => {
    const manager = new ProcessManager({
        catalogStore: new FakeCatalog([fixtureCommand('alpha')]),
        environment: {},
    });
    const selection = [{ id: 'alpha', sourceRevision: revision }];
    const results = await Promise.allSettled([
        manager.startBatch(selection),
        manager.startBatch(selection),
    ]);
    assert.deepEqual(results.map(({ status }) => status).sort(), [
        'fulfilled',
        'rejected',
    ]);
    const run = manager.snapshot().alpha;
    await manager.stop('alpha', run.id);
    await waitForTerminal(manager, 'alpha');
});

test('rejects an invalid batch without reserving any selected command', async () => {
    const alpha = fixtureCommand('alpha', 2_000, ['beta']);
    const beta = fixtureCommand('beta', 2_000, ['alpha']);
    const manager = new ProcessManager({
        catalogStore: new FakeCatalog([alpha, beta]),
        environment: {},
    });
    await assert.rejects(
        manager.startBatch([
            { id: 'alpha', sourceRevision: revision },
            { id: 'beta', sourceRevision: revision },
        ]),
        (error) =>
            error instanceof PanelOperationError &&
            error.code === 'batch_invalid',
    );
    assert.deepEqual(manager.snapshot(), {});
});

test('a stale run ID cannot stop a newer run', async () => {
    const manager = new ProcessManager({
        catalogStore: new FakeCatalog([fixtureCommand('quick', 25)]),
        environment: {},
    });
    const [first] = await manager.startBatch([
        { id: 'quick', sourceRevision: revision },
    ]);
    await waitForTerminal(manager, 'quick');
    const [second] = await manager.startBatch([
        { id: 'quick', sourceRevision: revision },
    ]);
    await assert.rejects(
        manager.stop('quick', first.id),
        (error) =>
            error instanceof PanelOperationError && error.code === 'stale_run',
    );
    await manager.stop('quick', second.id);
    await waitForTerminal(manager, 'quick');
});

test('shutdown cancels and awaits owned active commands', async () => {
    const manager = new ProcessManager({
        catalogStore: new FakeCatalog([fixtureCommand('service')]),
        environment: {},
    });
    await manager.startBatch([{ id: 'service', sourceRevision: revision }]);
    await manager.shutdown();
    assert.equal(manager.snapshot().service.status, 'cancelled');
});

test(
    'leader exit terminates descendants that retain inherited pipes',
    { skip: process.platform === 'win32' },
    async () => {
        const code = [
            "const { spawn } = require('node:child_process');",
            "spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'inherit' });",
            'setTimeout(() => process.exit(0), 50);',
        ].join(' ');
        const command = fixtureCommand('descendant');
        command.execution.args = ['-e', code];
        const manager = new ProcessManager({
            catalogStore: new FakeCatalog([command]),
            environment: {},
        });
        await manager.startBatch([
            { id: 'descendant', sourceRevision: revision },
        ]);
        const result = await Promise.race([
            waitForTerminal(manager, 'descendant'),
            new Promise((_, reject) =>
                setTimeout(
                    () =>
                        reject(new Error('descendant kept process pipes open')),
                    2_000,
                ),
            ),
        ]);
        assert.equal(result.status, 'succeeded');
    },
);
