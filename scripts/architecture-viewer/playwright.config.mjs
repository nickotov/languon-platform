import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './test/e2e',
    fullyParallel: false,
    reporter: 'line',
    outputDir: '../../test-results/architecture-diagrams',
    use: {
        baseURL: 'http://127.0.0.1:4412',
        trace: 'retain-on-failure',
        browserName: 'chromium',
    },
    webServer: {
        command: 'node scripts/architecture-viewer/server.mjs --port 4412',
        cwd: new URL('../..', import.meta.url).pathname,
        reuseExistingServer: false,
        url: 'http://127.0.0.1:4412/health',
        timeout: 15_000,
    },
});
