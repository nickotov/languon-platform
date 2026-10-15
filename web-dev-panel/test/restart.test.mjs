import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { restartExistingPanel } from '../src/restart.mjs';

const panelDirectory = resolve(import.meta.dirname, '..');
const stamp = 'Wed Oct 14 12:00:00 2026';

function inspection({
    command = 'node src/main.mjs',
    cwd = panelDirectory,
    uid = 501,
    survives = false,
} = {}) {
    const signalled = [];
    const calls = [];
    let psCalls = 0;
    return {
        signalled,
        calls,
        options: {
            panelDirectory,
            log: () => {},
            getUid: () => 501,
            signal: (pid) => signalled.push(pid),
            run: async (tool, args) => {
                calls.push([tool, args]);
                if (tool === 'ps') {
                    psCalls++;
                    return {
                        stdout:
                            !survives && psCalls > 2
                                ? ''
                                : `${uid} ${stamp} ${command}\n`,
                    };
                }
                return {
                    stdout: args.includes('cwd')
                        ? `p12345\nfcwd\nn${cwd}\n`
                        : '12345\n',
                };
            },
        },
    };
}

test('verified checkout listener receives one graceful signal and is awaited', async () => {
    const state = inspection();
    await restartExistingPanel(state.options);
    assert.deepEqual(state.signalled, [12345]);
    assert.equal(state.calls.filter(([tool]) => tool === 'ps').length, 3);
});

test('empty port does not signal anything', async () => {
    const state = inspection();
    state.options.run = async () => {
        throw Object.assign(new Error(), { code: 1, stdout: '', stderr: '' });
    };
    await restartExistingPanel(state.options);
    assert.deepEqual(state.signalled, []);
});

for (const [name, overrides] of [
    ['unrelated entrypoint', { command: 'node unrelated.mjs' }],
    ['another checkout', { cwd: '/some/other/checkout/web-dev-panel' }],
    ['another user', { uid: 502 }],
]) {
    test(`refuses ${name} without signalling`, async () => {
        const state = inspection(overrides);
        await assert.rejects(
            restartExistingPanel(state.options),
            /not this checkout's panel/u,
        );
        assert.deepEqual(state.signalled, []);
    });
}

test('failed process inspection never becomes permission to signal', async () => {
    const state = inspection();
    state.options.run = async () => {
        throw Object.assign(new Error(), { code: 'ENOENT' });
    };
    await assert.rejects(
        restartExistingPanel(state.options),
        /Cannot safely inspect/u,
    );
    assert.deepEqual(state.signalled, []);
});

test('changed process identity during inspection is refused', async () => {
    const state = inspection();
    const run = state.options.run;
    let count = 0;
    state.options.run = async (tool, args) => {
        const result = await run(tool, args);
        if (tool === 'ps' && ++count === 2)
            result.stdout = result.stdout.replace('12:00:00', '12:00:01');
        return result;
    };
    await assert.rejects(
        restartExistingPanel(state.options),
        /changed during inspection/u,
    );
    assert.deepEqual(state.signalled, []);
});

test('shutdown timeout never escalates the signal', async () => {
    const state = inspection({ survives: true });
    await assert.rejects(
        restartExistingPanel({ ...state.options, timeoutMs: 0 }),
        /shutdown timed out/u,
    );
    assert.deepEqual(state.signalled, [12345]);
});

test(
    'native inspection stops a synthetic listener and permits a replacement',
    {
        skip:
            process.platform === 'win32'
                ? 'Native restart is macOS/Linux only'
                : false,
    },
    async (t) => {
        const directory = await mkdtemp(
            resolve(tmpdir(), 'languon-panel-restart-'),
        );
        const children = [];
        t.after(async () => {
            for (const child of children) {
                if (child.exitCode === null && child.signalCode === null) {
                    const closed = once(child, 'close');
                    child.kill('SIGTERM');
                    await closed;
                }
            }
            await rm(directory, { recursive: true, force: true });
        });
        await mkdir(resolve(directory, 'src'));
        await writeFile(
            resolve(directory, 'src/main.mjs'),
            `
import { createServer } from 'node:http';
const server = createServer((_request, response) => response.end('fixture'));
server.listen(Number(process.env.FIXTURE_PORT || 0), '127.0.0.1', () => console.log(server.address().port));
process.once('SIGTERM', () => setTimeout(() => server.close(), 100));
`,
        );
        const start = async (port = 0) => {
            const child = spawn(process.execPath, ['src/main.mjs'], {
                cwd: directory,
                env: { ...process.env, FIXTURE_PORT: String(port) },
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            children.push(child);
            const [chunk] = await Promise.race([
                once(child.stdout, 'data'),
                once(child, 'close').then(([code]) => {
                    throw new Error(
                        `Fixture exited before listening (${code}).`,
                    );
                }),
            ]);
            return { child, port: Number(chunk.toString().trim()) };
        };
        const first = await start();
        const closed = once(first.child, 'close');
        await restartExistingPanel({
            panelDirectory: directory,
            port: first.port,
            log: () => {},
        });
        await closed;
        assert.equal(first.child.exitCode, 0);
        const second = await start(first.port);
        assert.notEqual(second.child.pid, first.child.pid);
        assert.equal(
            await (await fetch(`http://127.0.0.1:${first.port}`)).text(),
            'fixture',
        );
        await assert.rejects(
            restartExistingPanel({
                panelDirectory,
                port: first.port,
                log: () => {},
            }),
            /not this checkout's panel/u,
        );
        assert.equal(second.child.exitCode, null);
    },
);
