import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createWebDevPanelServer } from '../src/server.mjs';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const panelRoot = resolve(testDirectory, '..');
const application = createWebDevPanelServer({
    catalogPath: resolve(testDirectory, 'fixture-commands.json'),
    host: '127.0.0.1',
    launchToken: 'web-dev-panel-fixture-launch',
    port: 4411,
    publicDirectory: resolve(panelRoot, 'public'),
    repositoryRoot: resolve(testDirectory, 'fixture-repository'),
});

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => application.close().catch(() => {}));
}
await application.start();
