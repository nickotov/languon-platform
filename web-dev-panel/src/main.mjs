#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createWebDevPanelServer } from './server.mjs';

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const panelDirectory = resolve(sourceDirectory, '..');
const repositoryRoot = resolve(panelDirectory, '..');
const application = createWebDevPanelServer({
    catalogPath: resolve(panelDirectory, 'commands.json'),
    host: '127.0.0.1',
    port: 4400,
    publicDirectory: resolve(panelDirectory, 'public'),
    repositoryRoot,
});

let stopping = false;
async function stop(signal) {
    if (stopping) return;
    stopping = true;
    console.log(`\nStopping web dev panel (${signal})...`);
    await application.close();
}

process.once('SIGINT', () =>
    stop('SIGINT').catch(() => (process.exitCode = 1)),
);
process.once('SIGTERM', () =>
    stop('SIGTERM').catch(() => (process.exitCode = 1)),
);

try {
    const { launchUrl } = await application.start();
    console.log(`Web dev panel private launch URL: ${launchUrl}`);
    console.log(
        'Command state and logs are memory-only for this server session.',
    );
} catch (error) {
    if (error.code === 'EADDRINUSE') {
        console.error(
            'Web dev panel is already running at http://127.0.0.1:4400.',
        );
    } else {
        console.error(error instanceof Error ? error.message : String(error));
    }
    process.exitCode = 1;
}
