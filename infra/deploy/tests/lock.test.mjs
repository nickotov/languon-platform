import assert from 'node:assert/strict';
import { fork, spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { acquireDeployLock } from '../lib/lock.mjs';

async function deadProcessId() {
    const child = spawn(process.execPath, [
        '-e',
        'setInterval(() => {}, 1000)',
    ]);
    const pid = child.pid;
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
    return pid;
}

test('serializes live deployments', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'deploy-lock-'));
    const release = await acquireDeployLock(directory, 'first');
    await assert.rejects(
        () => acquireDeployLock(directory, 'second'),
        /already running/,
    );
    await release();
});

test('recovers a lock whose owner process no longer exists', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'deploy-lock-'));
    const lockPath = path.join(directory, 'deploy.lock');
    await writeFile(lockPath, `${await deadProcessId()}\n`, { mode: 0o600 });
    const release = await acquireDeployLock(directory, 'replacement');
    assert.equal(typeof release, 'function');
    await release();
});

test('simultaneous cross-process stale-lock recovery admits exactly one owner', async () => {
    const contenderPath = new URL('./lock-contender.mjs', import.meta.url);
    for (let trial = 0; trial < 5; trial += 1) {
        const directory = await mkdtemp(path.join(os.tmpdir(), 'deploy-lock-'));
        const lockPath = path.join(directory, 'deploy.lock');
        await writeFile(lockPath, `${await deadProcessId()}\n`, {
            mode: 0o600,
        });

        const contenders = Array.from({ length: 12 }, (_, index) => {
            const child = fork(
                contenderPath,
                [directory, `replacement-${index}`],
                {
                    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
                },
            );
            return {
                child,
                exit: new Promise((resolve) => child.once('exit', resolve)),
            };
        });
        const results = await Promise.all(
            contenders.map(
                ({ child }) =>
                    new Promise((resolve) => child.once('message', resolve)),
            ),
        );
        const owners = contenders.filter(
            (_, index) => results[index].status === 'acquired',
        );
        assert.equal(owners.length, 1);
        owners[0].child.send('release');
        await Promise.all(contenders.map(({ exit }) => exit));
    }
});
