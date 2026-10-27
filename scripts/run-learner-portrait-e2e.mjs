import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withPreservedFile } from './run-contextual-assistant-e2e.mjs';

const testFile =
    'tests/integration/modules/learner-portraits/learner-portrait.journeys.test.ts';

/**
 * Runs only against caller-confirmed disposable infrastructure. The journey
 * resets its own schema, so this command deliberately has no local default.
 */
export async function runLearnerPortraitE2e(run = execute) {
    assertDisposableEnvironment(process.env);
    const browserArgs =
        process.argv.slice(2).at(0) === '--'
            ? process.argv.slice(3)
            : process.argv.slice(2);
    await withPreservedFile(
        fileURLToPath(new URL('../apps/web/next-env.d.ts', import.meta.url)),
        async () => {
            await run([
                'pnpm',
                '--filter',
                '@languon/backend',
                'exec',
                'vitest',
                'run',
                testFile,
            ]);
            await run([
                'pnpm',
                '--filter',
                '@languon/web',
                'exec',
                'playwright',
                'test',
                '--config',
                'tests/e2e/support/learner-portrait-playwright.config.ts',
                ...browserArgs,
            ]);
        },
    );
}

export function assertDisposableEnvironment(environment) {
    if (environment.ALLOW_DISPOSABLE_DATABASE_TESTS !== 'true') {
        throw new Error(
            'Set ALLOW_DISPOSABLE_DATABASE_TESTS=true for the dedicated disposable PostgreSQL target.',
        );
    }
    const databaseUrl = environment.AUTH_TEST_DATABASE_URL;
    const databaseConfirmation = environment.AUTH_TEST_DATABASE_CONFIRM;
    if (!databaseUrl || !databaseConfirmation) {
        throw new Error(
            'AUTH_TEST_DATABASE_URL and AUTH_TEST_DATABASE_CONFIRM are required; this runner has no database default.',
        );
    }
    const database = new URL(databaseUrl);
    const databaseName = database.pathname.slice(1);
    if (
        !['postgres:', 'postgresql:'].includes(database.protocol) ||
        !['127.0.0.1', 'localhost'].includes(database.hostname) ||
        !database.port ||
        database.port === '5432' ||
        !databaseName.startsWith('languon_auth_portrait_') ||
        !databaseName.endsWith('_test') ||
        databaseConfirmation !== databaseName
    ) {
        throw new Error(
            'AUTH_TEST_DATABASE_URL must name the confirmed dedicated loopback languon_auth_portrait_*_test database on a non-default port.',
        );
    }
    if (environment.ALLOW_DISPOSABLE_REDIS_TESTS !== 'true') {
        throw new Error(
            'Set ALLOW_DISPOSABLE_REDIS_TESTS=true for the dedicated disposable Redis target.',
        );
    }
    const redisUrl = environment.AUTH_TEST_REDIS_URL;
    const redisConfirmation = environment.AUTH_TEST_REDIS_CONFIRM;
    if (!redisUrl || !redisConfirmation) {
        throw new Error(
            'AUTH_TEST_REDIS_URL and AUTH_TEST_REDIS_CONFIRM are required; this runner has no Redis default.',
        );
    }
    const redis = new URL(redisUrl);
    const redisDatabase = redis.pathname.slice(1);
    if (
        redis.protocol !== 'redis:' ||
        !['127.0.0.1', 'localhost'].includes(redis.hostname) ||
        !redis.port ||
        redis.port === '6379' ||
        !Number.isInteger(Number(redisDatabase)) ||
        Number(redisDatabase) < 1 ||
        Number(redisDatabase) > 15 ||
        redisConfirmation !== `${redis.hostname}:${redis.port}/${redisDatabase}`
    ) {
        throw new Error(
            'AUTH_TEST_REDIS_URL must name the confirmed loopback Redis database 1-15 on a non-default port.',
        );
    }
}

function execute([command, ...args]) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            env: {
                ...process.env,
                APP_ENV: 'test',
                LEARNER_PORTRAIT_WEB_FIXTURE: 'true',
                LEARNER_PORTRAIT_WEB_RUNNER: 'true',
                AUTH_E2E_RUN_ID:
                    process.env.AUTH_E2E_RUN_ID ??
                    `learner-portrait-${Date.now().toString(36)}`,
            },
            stdio: 'inherit',
        });
        child.once('error', reject);
        child.once('exit', (code, signal) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(
                new Error(
                    `${command} ${args.join(' ')} failed${signal ? ` with signal ${signal}` : ` with exit code ${code ?? 'unknown'}`}.`,
                ),
            );
        });
    });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
    await runLearnerPortraitE2e().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
