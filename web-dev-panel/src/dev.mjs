#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { restartExistingPanel } from './restart.mjs';

export async function startDevelopmentPanel({
    panelDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
    platform = process.platform,
    restart = restartExistingPanel,
    spawnChild = spawn,
    parent = process,
} = {}) {
    if (platform !== 'win32') {
        await restart({ panelDirectory });
    }
    const child = spawnChild(process.execPath, ['src/main.mjs'], {
        cwd: panelDirectory,
        stdio: 'inherit',
        shell: false,
    });
    const interrupt = () => child.kill('SIGINT');
    const terminate = () => child.kill('SIGTERM');
    parent.once('SIGINT', interrupt);
    parent.once('SIGTERM', terminate);
    child.once('error', (error) => {
        console.error(error.message);
        parent.exitCode = 1;
    });
    child.once('close', (code, signal) => {
        parent.removeListener('SIGINT', interrupt);
        parent.removeListener('SIGTERM', terminate);
        parent.exitCode = code ?? (signal === 'SIGINT' ? 130 : 143);
    });
    return child;
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    startDevelopmentPanel().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
