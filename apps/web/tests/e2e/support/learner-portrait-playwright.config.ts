import { defineConfig, devices } from '@playwright/test';

if (process.env.LEARNER_PORTRAIT_WEB_RUNNER !== 'true')
    throw new Error(
        'Run learner portrait Playwright through pnpm test:e2e:learner-portrait so its exclusive fixture and tracked Next type file cleanup are applied.',
    );

const env = Object.fromEntries(
    Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
    ),
);

export default defineConfig({
    testDir: '..',
    testMatch: 'learner-portrait.journeys.spec.ts',
    workers: 1,
    fullyParallel: false,
    timeout: 120_000,
    expect: { timeout: 20_000 },
    reporter: 'list',
    outputDir: `../../../.next/playwright/learner-portrait-results/${env.AUTH_E2E_RUN_ID ?? 'local'}`,
    use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3337',
        viewport: { width: 1440, height: 900 },
        actionTimeout: 15_000,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    webServer: [
        {
            command:
                'pnpm --filter @languon/backend exec tsx tests/support/learner-portrait-web-server.ts',
            env: {
                ...env,
                APP_ENV: 'test',
                LEARNER_PORTRAIT_WEB_FIXTURE: 'true',
            },
            url: 'http://127.0.0.1:4007/livez',
            timeout: 120_000,
            reuseExistingServer: false,
        },
        {
            command: 'pnpm exec next dev --turbopack -p 3337 -H 127.0.0.1',
            env: {
                ...env,
                AUTH_E2E_DIST_DIR: '.next-learner-portrait-e2e',
                NEXT_PUBLIC_API_URL: '/api',
                WEB_API_PROXY_TARGET: 'http://127.0.0.1:4007',
            },
            url: 'http://localhost:3337',
            timeout: 120_000,
            reuseExistingServer: false,
        },
    ],
});
