import { defineConfig, devices } from '@playwright/test';
if (process.env.CONTEXTUAL_ASSISTANT_RUNNER !== 'true')
    throw new Error(
        'Run contextual assistant Playwright through pnpm test:e2e:contextual-assistant so tracked Next type generation is restored on exit.',
    );
const env = Object.fromEntries(
    Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
    ),
);
export default defineConfig({
    testDir: '..',
    testMatch:
        /(?:contextual-assistant|knowledge-workspace)\.journeys\.spec\.ts/,
    workers: 1,
    fullyParallel: false,
    timeout: 120_000,
    expect: { timeout: 20_000 },
    reporter: 'list',
    outputDir: `../../../.next/playwright/contextual-assistant-results/${env.AUTH_E2E_RUN_ID ?? 'local'}`,
    use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:3336',
        viewport: { width: 1440, height: 1000 },
        actionTimeout: 15_000,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    webServer: [
        {
            command:
                'pnpm --filter @languon/backend exec tsx tests/support/contextual-assistant-web-server.ts',
            env: {
                ...env,
                APP_ENV: 'test',
                CONTEXTUAL_ASSISTANT_FIXTURE: 'true',
            },
            url: 'http://127.0.0.1:4006/livez',
            timeout: 120_000,
            reuseExistingServer: false,
        },
        {
            command: 'pnpm exec next dev --turbopack -p 3336 -H 127.0.0.1',
            env: {
                ...env,
                AUTH_E2E_DIST_DIR: '.next-contextual-assistant-e2e',
                NEXT_PUBLIC_API_URL: '/api',
                WEB_API_PROXY_TARGET: 'http://127.0.0.1:4006',
            },
            url: 'http://localhost:3336',
            timeout: 120_000,
            reuseExistingServer: false,
        },
    ],
});
