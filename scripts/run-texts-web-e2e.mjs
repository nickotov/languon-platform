import { spawn } from 'node:child_process';
import { assertDisposableEnvironment } from './run-texts-e2e.mjs';
assertDisposableEnvironment(process.env);
if (
    new URL(process.env.AUTH_TEST_DATABASE_URL).pathname !==
    '/languon_auth_texts_ui_web_test'
)
    throw new Error('Texts web runner requires its exclusive UI web database.');
const databaseTarget = new URL(process.env.AUTH_TEST_DATABASE_URL);
const redisTarget = new URL(process.env.AUTH_TEST_REDIS_URL);
if (
    databaseTarget.port !== '55443' ||
    redisTarget.port !== '56443' ||
    redisTarget.pathname !== '/1'
)
    throw new Error(
        'Texts web runner requires PostgreSQL port 55443 and Redis port 56443 database 1.',
    );
const child = spawn(
    'pnpm',
    [
        '--filter',
        '@languon/web',
        'exec',
        'playwright',
        'test',
        '--config',
        'tests/e2e/support/texts-playwright.config.ts',
        ...process.argv.slice(2),
    ],
    {
        stdio: 'inherit',
        env: {
            ...process.env,
            TEXTS_WEB_FIXTURE: 'true',
            APP_ENV: 'test',
            AUTH_E2E_RUN_ID:
                process.env.AUTH_E2E_RUN_ID ??
                `texts-${Date.now().toString(36)}`,
        },
    },
);
const interrupt = () => child.kill('SIGINT');
const terminate = () => child.kill('SIGTERM');
process.once('SIGINT', interrupt);
process.once('SIGTERM', terminate);
function cleanup() {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
}
child.once('error', (error) => {
    cleanup();
    console.error(error.message);
    process.exitCode = 1;
});
child.once('exit', (code) => {
    cleanup();
    process.exitCode = code ?? 1;
});
