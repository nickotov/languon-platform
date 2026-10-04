import { spawn } from 'node:child_process';

const testFile =
    'tests/integration/modules/text-ai/user-ai-model-preferences.journeys.test.ts';

/**
 * Runs only against a caller-supplied disposable target. Container lifecycle is
 * intentionally outside this command: it must never infer localhost:5432 or a
 * shared Redis database as a suitable E2E target.
 */
export async function runUserAiModelPreferencesE2e(run = execute) {
    assertDisposableEnvironment(process.env);
    await run([
        'pnpm',
        '--filter',
        '@languon/backend',
        'exec',
        'vitest',
        'run',
        testFile,
    ]);
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
        !databaseName.startsWith('languon_auth_') ||
        !databaseName.endsWith('_test') ||
        databaseConfirmation !== databaseName
    ) {
        throw new Error(
            'AUTH_TEST_DATABASE_URL must name the confirmed dedicated loopback languon_auth_*_test database on a non-default port.',
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
            env: process.env,
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
    await runUserAiModelPreferencesE2e().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
