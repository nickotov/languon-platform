import { createHash } from 'node:crypto';

import { defineConfig, devices } from '@playwright/test';

function readLocalHttpOrigin(name: string, value: string): URL {
    const url = new URL(value);
    const isLoopback =
        url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    const isPlainOrigin =
        url.protocol === 'http:' &&
        url.username === '' &&
        url.password === '' &&
        url.pathname === '/' &&
        url.search === '' &&
        url.hash === '' &&
        /^\d+$/.test(url.port);

    if (!isLoopback || !isPlainOrigin) {
        throw new Error(
            `${name} must be a credential-free loopback http origin with an explicit numeric port.`,
        );
    }

    return url;
}

const webUrl = readLocalHttpOrigin(
    'AUTH_E2E_WEB_ORIGIN',
    process.env.AUTH_E2E_WEB_ORIGIN ?? 'http://localhost:3333',
);
const backendUrl = readLocalHttpOrigin(
    'AUTH_E2E_BACKEND_ORIGIN',
    process.env.AUTH_E2E_BACKEND_ORIGIN ?? 'http://localhost:4000',
);
const webOrigin = webUrl.origin;
const backendOrigin = backendUrl.origin;
const databaseUrl = process.env.AUTH_E2E_DATABASE_URL;
const redisUrl = process.env.AUTH_E2E_REDIS_URL;
const runId =
    process.env.AUTH_E2E_RUN_ID ?? `${Date.now().toString(36)}-${process.pid}`;
process.env.AUTH_E2E_RUN_ID = runId;
const redisNamespace = `languon:auth:e2e:${createHash('sha256')
    .update(runId)
    .digest('hex')
    .slice(0, 24)}`;

if (!databaseUrl || !redisUrl) {
    throw new Error(
        'AUTH_E2E_DATABASE_URL and AUTH_E2E_REDIS_URL must point to disposable local test services.',
    );
}

if (!/(?:e2e|test)/i.test(new URL(databaseUrl).pathname)) {
    throw new Error(
        "AUTH_E2E_DATABASE_URL must name a dedicated database containing 'e2e' or 'test'.",
    );
}

for (const [name, value] of [
    ['AUTH_E2E_DATABASE_URL', databaseUrl],
    ['AUTH_E2E_REDIS_URL', redisUrl],
] as const) {
    const hostname = new URL(value).hostname;
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
        throw new Error(
            `${name} must point to a loopback service for safe E2E.`,
        );
    }
}

const backendPort = backendUrl.port;
const webPort = webUrl.port;
const reuseExistingServer = process.env.AUTH_E2E_REUSE_SERVERS === 'true';
const documentServicesEnabled =
    process.env.AUTH_E2E_DOCUMENT_SERVICES === 'true';
const documentStorageOrigin = documentServicesEnabled
    ? readLocalHttpOrigin(
          'AUTH_E2E_DOCUMENT_S3_ENDPOINT',
          process.env.AUTH_E2E_DOCUMENT_S3_ENDPOINT ?? 'http://127.0.0.1:59000',
      ).origin
    : undefined;
const documentApiAccessKey =
    process.env.AUTH_E2E_DOCUMENT_API_ACCESS_KEY ?? 'languon-document-api-test';
const documentApiSecretKey =
    process.env.AUTH_E2E_DOCUMENT_API_SECRET_KEY ??
    'languon-document-api-test-secret';
const documentWorkerAccessKey =
    process.env.AUTH_E2E_DOCUMENT_WORKER_ACCESS_KEY ??
    'languon-document-worker-test';
const documentWorkerSecretKey =
    process.env.AUTH_E2E_DOCUMENT_WORKER_SECRET_KEY ??
    'languon-document-worker-test-secret';
const dictionaryJobFormats = [
    'single-card:v1',
    'card-authoring:v1',
    'pasted-terms:v1',
    'import-pairs:v1',
    ...(documentServicesEnabled ? ['document-terms:v1'] : []),
].join(',');

export default defineConfig({
    expect: { timeout: 10_000 },
    forbidOnly: Boolean(process.env.CI),
    fullyParallel: false,
    outputDir: '.next/playwright/test-results',
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    reporter: [['list']],
    retries: process.env.CI ? 2 : 0,
    testDir: './tests/e2e',
    timeout: 45_000,
    use: {
        baseURL: webOrigin,
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        video: 'retain-on-failure',
    },
    webServer: [
        {
            command:
                'pnpm --filter @languon/backend db:migrate && pnpm --filter @languon/backend exec tsx src/index.ts',
            env: {
                APP_ENV: 'development',
                AUTH_ALLOWED_ORIGINS: webOrigin,
                AUTH_CODE_HMAC_SECRET:
                    'e2e-only-code-secret-do-not-use-outside-local-tests',
                AUTH_JWT_SECRET:
                    'e2e-only-jwt-secret-do-not-use-outside-local-tests-1',
                DICTIONARY_HMAC_SECRET:
                    'e2e-only-dictionary-secret-do-not-use-outside-local-tests',
                AUTH_REDIS_NAMESPACE: redisNamespace,
                AUTH_WEBAUTHN_RP_ID: webUrl.hostname,
                BACKEND_PORT: backendPort,
                DATABASE_URL: databaseUrl,
                DICTIONARY_JOB_API_ACCEPTABLE_FORMATS: dictionaryJobFormats,
                DICTIONARY_JOB_API_CANCELLABLE_FORMATS: dictionaryJobFormats,
                DICTIONARY_JOB_API_DISCARDABLE_FORMATS: dictionaryJobFormats,
                DICTIONARY_JOB_API_ENQUEUED_FORMATS: dictionaryJobFormats,
                DICTIONARY_JOB_API_READABLE_FORMATS: dictionaryJobFormats,
                DICTIONARY_DOCUMENT_OCR_MODE: documentServicesEnabled
                    ? 'deterministic'
                    : 'unavailable',
                DICTIONARY_DOCUMENT_STORAGE_API_ACCESS_KEY_ID:
                    documentApiAccessKey,
                DICTIONARY_DOCUMENT_STORAGE_API_SECRET_ACCESS_KEY:
                    documentApiSecretKey,
                DICTIONARY_DOCUMENT_STORAGE_BUCKET: 'languon-document-test',
                DICTIONARY_DOCUMENT_STORAGE_ENDPOINT:
                    documentStorageOrigin ?? '',
                DICTIONARY_DOCUMENT_STORAGE_FORCE_PATH_STYLE: 'true',
                DICTIONARY_DOCUMENT_STORAGE_MODE: documentServicesEnabled
                    ? 's3'
                    : 'unavailable',
                DICTIONARY_DOCUMENT_STORAGE_REGION: 'us-east-1',
                REDIS_URL: redisUrl,
            },
            reuseExistingServer,
            stderr: 'pipe',
            stdout: 'pipe',
            timeout: 120_000,
            url: `${backendOrigin}/health`,
        },
        {
            command: `until curl --fail --silent ${backendOrigin}/health >/dev/null; do sleep 0.1; done; pnpm --filter @languon/backend dictionary:worker`,
            env: {
                APP_ENV: 'test',
                DICTIONARY_GENERATION_PROVIDER_MODE: 'deterministic',
                DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS: dictionaryJobFormats,
                DICTIONARY_DOCUMENT_OCR_MODE: documentServicesEnabled
                    ? 'deterministic'
                    : 'unavailable',
                DICTIONARY_DOCUMENT_FINGERPRINT_HMAC_SECRET:
                    'e2e-only-document-fingerprint-secret-32-bytes',
                DICTIONARY_DOCUMENT_RUNTIME_MODE: documentServicesEnabled
                    ? 'deterministic'
                    : 'unavailable',
                DICTIONARY_DOCUMENT_STORAGE_BUCKET: 'languon-document-test',
                DICTIONARY_DOCUMENT_STORAGE_ENDPOINT:
                    documentStorageOrigin ?? '',
                DICTIONARY_DOCUMENT_STORAGE_FORCE_PATH_STYLE: 'true',
                DICTIONARY_DOCUMENT_STORAGE_MODE: documentServicesEnabled
                    ? 's3'
                    : 'unavailable',
                DICTIONARY_DOCUMENT_STORAGE_REGION: 'us-east-1',
                DICTIONARY_DOCUMENT_STORAGE_WORKER_ACCESS_KEY_ID:
                    documentWorkerAccessKey,
                DICTIONARY_DOCUMENT_STORAGE_WORKER_SECRET_ACCESS_KEY:
                    documentWorkerSecretKey,
                DICTIONARY_WORKER_DATABASE_URL: databaseUrl,
                DICTIONARY_WORKER_CONCURRENCY: '1',
                DICTIONARY_WORKER_DRAIN_TIMEOUT_MS: '5000',
                DICTIONARY_WORKER_POLL_INTERVAL_MS: '50',
                DICTIONARY_WORKER_READINESS_TIMEOUT_MS: '5000',
                RELEASE_SHA: 'development',
            },
            reuseExistingServer,
            stderr: 'pipe',
            stdout: 'pipe',
            timeout: 120_000,
            wait: { stdout: /Dictionary worker .* ready/ },
        },
        {
            command: `pnpm exec next dev --turbopack -p ${webPort} -H 127.0.0.1`,
            env: {
                AUTH_E2E_DIST_DIR: '.next-e2e',
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
