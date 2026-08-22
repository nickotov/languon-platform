import { defineConfig } from '@playwright/test';

export default defineConfig({
    expect: { timeout: 5_000 },
    fullyParallel: false,
    reporter: 'line',
    testDir: './test/e2e',
    use: {
        baseURL: 'http://127.0.0.1:4411',
        trace: 'retain-on-failure',
    },
    webServer: {
        command: 'node test/fixture-server.mjs',
        reuseExistingServer: false,
        timeout: 10_000,
        url: 'http://127.0.0.1:4411/health',
    },
});
