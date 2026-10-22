import { defineConfig, devices } from '@playwright/test';

const adminOrigin =
    process.env.ADMIN_E2E_ADMIN_ORIGIN ?? 'http://localhost:3001';
const webOrigin = process.env.ADMIN_E2E_WEB_ORIGIN ?? 'http://localhost:3333';
const backendOrigin =
    process.env.ADMIN_E2E_BACKEND_ORIGIN ?? 'http://localhost:4000';
const databaseUrl = process.env.ADMIN_E2E_DATABASE_URL;
const redisUrl = process.env.ADMIN_E2E_REDIS_URL;
const e2eRateLimitNamespace = `${Date.now()}-${process.pid}`;
const sentenceServicesEnabled =
    process.env.ADMIN_E2E_SENTENCE_SERVICES === 'true';
const sentenceFixtureRunId =
    process.env.ADMIN_E2E_SENTENCE_RUN_ID ?? e2eRateLimitNamespace;
process.env.ADMIN_E2E_SENTENCE_RUN_ID = sentenceFixtureRunId;

if (!databaseUrl || !redisUrl) {
    throw new Error(
        'ADMIN_E2E_DATABASE_URL and ADMIN_E2E_REDIS_URL must point to disposable local test services.',
    );
}
for (const [name, value] of [
    ['ADMIN_E2E_ADMIN_ORIGIN', adminOrigin],
    ['ADMIN_E2E_WEB_ORIGIN', webOrigin],
    ['ADMIN_E2E_BACKEND_ORIGIN', backendOrigin],
    ['ADMIN_E2E_DATABASE_URL', databaseUrl],
    ['ADMIN_E2E_REDIS_URL', redisUrl],
] as const) {
    const parsed = new URL(value);
    if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
        throw new Error(`${name} must point to a loopback service.`);
    }
}
const databaseName = new URL(databaseUrl).pathname.slice(1);
if (
    !/(?:admin.*e2e|e2e.*admin).*test/i.test(databaseName) ||
    !new URL(databaseUrl).port ||
    new URL(databaseUrl).port === '5432'
) {
    throw new Error(
        'ADMIN_E2E_DATABASE_URL must use a dedicated admin E2E test database on a non-default port.',
    );
}

const backendPort = new URL(backendOrigin).port || '4000';
const adminPort = new URL(adminOrigin).port || '3001';
const webPort = new URL(webOrigin).port || '3333';
const reuseExistingServer = process.env.ADMIN_E2E_REUSE_SERVERS === 'true';
const generationFormats = 'single-card:v2';

export default defineConfig({
    expect: { timeout: 10_000 },
    forbidOnly: Boolean(process.env.CI),
    fullyParallel: false,
    outputDir: '.vite/playwright/test-results',
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    reporter: [['list']],
    retries: process.env.CI ? 2 : 0,
    testDir: './tests/e2e',
    timeout: 60_000,
    use: {
        baseURL: adminOrigin,
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        video: 'retain-on-failure',
    },
    webServer: [
        {
            command:
                'pnpm --filter @languon/backend db:migrate && pnpm --filter @languon/backend exec tsx src/index.ts',
            env: {
                ADMIN_BASE_URL: adminOrigin,
                APP_ENV: 'development',
                AUTH_ALLOWED_ORIGINS: `${adminOrigin},${webOrigin}`,
                AUTH_CODE_HMAC_SECRET: `admin-e2e-code-secret-do-not-use-outside-local-tests-${e2eRateLimitNamespace}`,
                AUTH_JWT_SECRET:
                    'admin-e2e-jwt-secret-do-not-use-outside-local-tests',
                DICTIONARY_HMAC_SECRET:
                    'admin-e2e-dictionary-secret-do-not-use-outside-local-tests',
                AUTH_WEBAUTHN_RP_ID: new URL(adminOrigin).hostname,
                BACKEND_PORT: backendPort,
                DATABASE_URL: databaseUrl,
                LEARNING_SENTENCES_ENABLED: sentenceServicesEnabled
                    ? 'true'
                    : 'false',
                LEARNING_SENTENCE_GENERATION_FORMAT: 'sentence-generation:v2',
                DICTIONARY_AI_DEEPSEEK_CREDENTIAL_CONFIGURED: 'true',
                DICTIONARY_AI_MANAGED_ROUTING_ENABLED: 'true',
                DICTIONARY_AI_CREDIT_ENFORCEMENT_ENABLED: 'true',
                DICTIONARY_AI_KIE_CREDENTIAL_CONFIGURED: 'true',
                DICTIONARY_JOB_API_ACCEPTABLE_FORMATS: generationFormats,
                DICTIONARY_JOB_API_CANCELLABLE_FORMATS: generationFormats,
                DICTIONARY_JOB_API_DISCARDABLE_FORMATS: generationFormats,
                DICTIONARY_JOB_API_ENQUEUED_FORMATS: generationFormats,
                DICTIONARY_JOB_API_READABLE_FORMATS: generationFormats,
                DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS: generationFormats,
                REDIS_URL: redisUrl,
            },
            reuseExistingServer,
            stderr: 'pipe',
            stdout: 'pipe',
            timeout: 120_000,
            url: `${backendOrigin}/livez`,
        },
        ...(sentenceServicesEnabled
            ? [
                  {
                      command: `until curl --fail --silent ${backendOrigin}/livez >/dev/null; do sleep 0.1; done; pnpm --filter @languon/backend exec tsx tests/support/sentence-web-worker.ts`,
                      env: {
                          APP_ENV: 'test',
                          AUTH_E2E_SENTENCE_SERVICES: 'true',
                          AUTH_E2E_DATABASE_URL: databaseUrl,
                          AUTH_E2E_RUN_ID: sentenceFixtureRunId,
                      },
                      reuseExistingServer,
                      stderr: 'pipe' as const,
                      stdout: 'pipe' as const,
                      timeout: 120_000,
                      wait: { stdout: /Sentence browser fixture worker ready/ },
                  },
              ]
            : []),
        {
            command: `pnpm exec vite --host 127.0.0.1 --port ${adminPort}`,
            env: { ADMIN_API_PROXY_TARGET: backendOrigin },
            reuseExistingServer,
            stderr: 'pipe',
            stdout: 'pipe',
            timeout: 120_000,
            url: adminOrigin,
        },
        {
            command: `pnpm --filter @languon/web exec next dev --turbopack -p ${webPort} -H 127.0.0.1`,
            env: {
                AUTH_E2E_DIST_DIR: '.next-admin-e2e',
                NEXT_PUBLIC_API_URL: backendOrigin,
            },
            reuseExistingServer,
            stderr: 'pipe',
            stdout: 'pipe',
            timeout: 120_000,
            url: webOrigin,
        },
    ],
    workers: 1,
});
