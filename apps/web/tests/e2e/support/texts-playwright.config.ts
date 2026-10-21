import { defineConfig, devices } from '@playwright/test';
const env = Object.fromEntries(
    Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
    ),
);
export default defineConfig({
    testDir: '..',
    testMatch: [
        'texts.journeys.spec.ts',
        'sidebar-navigation.journeys.spec.ts',
        'app-shell.journeys.spec.ts',
    ],
    workers: 1,
    fullyParallel: false,
    timeout: 90_000,
    expect: { timeout: 15_000 },
    reporter: 'list',
    outputDir: `../../../.next/playwright/texts-results/${env.AUTH_E2E_RUN_ID ?? 'local'}`,
    use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3335',
        viewport: { width: 1440, height: 1000 },
        actionTimeout: 15_000,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    webServer: [
        {
            command:
                'pnpm --filter @languon/backend exec tsx tests/support/texts-web-server.ts',
            env: { ...env, APP_ENV: 'test', TEXTS_WEB_FIXTURE: 'true' },
            url: 'http://127.0.0.1:4005/livez',
            timeout: 120_000,
            reuseExistingServer: process.env.TEXTS_WEB_REUSE_SERVERS === 'true',
        },
        {
            command: 'pnpm exec next dev --turbopack -p 3335 -H 127.0.0.1',
            env: {
                ...env,
                AUTH_E2E_DIST_DIR: '.next-texts-e2e',
                NEXT_PUBLIC_API_URL: '/api',
                WEB_API_PROXY_TARGET: 'http://127.0.0.1:4005',
            },
            url: 'http://localhost:3335',
            timeout: 120_000,
            reuseExistingServer: process.env.TEXTS_WEB_REUSE_SERVERS === 'true',
        },
    ],
});
