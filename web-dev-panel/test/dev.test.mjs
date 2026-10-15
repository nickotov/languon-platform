import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { startDevelopmentPanel } from '../src/dev.mjs';

function launcher(platform = 'darwin') {
    const parent = new EventEmitter();
    const child = new EventEmitter();
    const signals = [];
    const events = [];
    child.kill = (signal) => signals.push(signal);
    return {
        parent,
        child,
        signals,
        events,
        options: {
            panelDirectory: '/fixture/web-dev-panel',
            platform,
            parent,
            restart: async () => events.push('restart'),
            spawnChild: (executable, args, options) => {
                events.push('spawn');
                assert.equal(executable, process.execPath);
                assert.deepEqual(args, ['src/main.mjs']);
                assert.deepEqual(options, {
                    cwd: '/fixture/web-dev-panel',
                    stdio: 'inherit',
                    shell: false,
                });
                return child;
            },
        },
    };
}

test('launcher waits for restart completion before spawning main', async () => {
    const state = launcher();
    let release;
    state.options.restart = () =>
        new Promise((done) => {
            release = done;
        });
    const started = startDevelopmentPanel(state.options);
    assert.deepEqual(state.events, []);
    release();
    assert.equal(await started, state.child);
    assert.deepEqual(state.events, ['spawn']);
    state.child.emit('close', 0, null);
});

test('failed restart never spawns a replacement', async () => {
    const state = launcher();
    state.options.restart = async () => {
        throw new Error('refused');
    };
    await assert.rejects(startDevelopmentPanel(state.options), /refused/u);
    assert.deepEqual(state.events, []);
});

test('Windows launches the fixed-port main without POSIX process inspection', async () => {
    const state = launcher('win32');
    await startDevelopmentPanel(state.options);
    assert.deepEqual(state.events, ['spawn']);
    state.child.emit('close', 1, null);
    assert.equal(state.parent.exitCode, 1);
});

test('launcher forwards terminal signals and removes handlers after child shutdown', async () => {
    const state = launcher();
    await startDevelopmentPanel(state.options);
    assert.deepEqual(state.events, ['restart', 'spawn']);
    state.parent.emit('SIGINT');
    state.parent.emit('SIGTERM');
    assert.deepEqual(state.signals, ['SIGINT', 'SIGTERM']);
    state.child.emit('close', 0, null);
    assert.equal(state.parent.exitCode, 0);
    assert.equal(state.parent.listenerCount('SIGINT'), 0);
    assert.equal(state.parent.listenerCount('SIGTERM'), 0);
});

test('launcher propagates signal exit status', async () => {
    const state = launcher();
    await startDevelopmentPanel(state.options);
    state.child.emit('close', null, 'SIGINT');
    assert.equal(state.parent.exitCode, 130);
});
