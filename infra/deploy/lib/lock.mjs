import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function ownerDescription(ownerPath) {
    return await readFile(ownerPath, 'utf8')
        .then((value) => value.trim())
        .catch(() => 'unknown');
}

async function acquirePlatformLock(lockPath) {
    await (await open(lockPath, 'a', 0o600)).close();
    const command = process.platform === 'darwin' ? '/usr/bin/lockf' : 'flock';
    const args =
        process.platform === 'darwin'
            ? [
                  '-k',
                  '-t',
                  '0',
                  lockPath,
                  'sh',
                  '-c',
                  'printf "acquired\\n"; cat >/dev/null',
              ]
            : [
                  '--exclusive',
                  '--nonblock',
                  lockPath,
                  'sh',
                  '-c',
                  'printf "acquired\\n"; cat >/dev/null',
              ];
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'ignore'] });
    let exited = false;
    const exitPromise = new Promise((resolve) => {
        child.once('exit', () => {
            exited = true;
            resolve();
        });
    });
    const acquired = await new Promise((resolve, reject) => {
        let settled = false;
        child.once('error', reject);
        child.once('exit', () => {
            if (!settled) resolve(false);
        });
        child.stdout.once('data', (value) => {
            settled = true;
            resolve(String(value).includes('acquired'));
        });
    });
    if (!acquired) return null;
    return async () => {
        if (!exited) {
            child.stdin.end();
            await exitPromise;
        }
    };
}

export async function acquireDeployLock(stateDirectory, identity) {
    await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
    const lockPath = path.join(stateDirectory, 'deploy.lock');
    const ownerPath = path.join(stateDirectory, 'deploy.lock.owner');
    const ownerValue = `${process.pid}:${identity}:${randomUUID()}\n`;
    const unlockPlatform = await acquirePlatformLock(lockPath);
    if (!unlockPlatform) {
        throw new Error(
            `A deployment is already running (${await ownerDescription(ownerPath)}).`,
        );
    }
    try {
        await writeFile(ownerPath, ownerValue, { mode: 0o600 });
    } catch (error) {
        await unlockPlatform();
        throw error;
    }

    let released = false;
    return async () => {
        if (released) return;
        released = true;
        try {
            const currentOwner = await readFile(ownerPath, 'utf8').catch(
                () => null,
            );
            if (currentOwner === ownerValue) {
                await rm(ownerPath, { force: true });
            }
        } finally {
            await unlockPlatform();
        }
    };
}
