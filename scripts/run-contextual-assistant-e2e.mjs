import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, rm } from 'node:fs/promises';

/** Next type generation may rewrite this tracked file even with an isolated distDir. */
export async function withPreservedFile(path, work) {
    let original;
    try {
        original = await readFile(path);
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    try {
        return await work();
    } finally {
        if (original === undefined) await rm(path, { force: true });
        else await writeFile(path, original);
    }
}

/** No inferred/default target: this suite owns a separate disposable database. */
export function assertContextualAssistantEnvironment(environment) {
    const database = new URL(environment.AUTH_TEST_DATABASE_URL ?? 'invalid:');
    const redis = new URL(environment.AUTH_TEST_REDIS_URL ?? 'invalid:');
    if (
        environment.ALLOW_DISPOSABLE_DATABASE_TESTS !== 'true' ||
        environment.ALLOW_DISPOSABLE_REDIS_TESTS !== 'true' ||
        !['postgres:', 'postgresql:'].includes(database.protocol) ||
        !['127.0.0.1', 'localhost'].includes(database.hostname) ||
        database.port !== '55444' ||
        database.pathname !== '/languon_auth_assistant_web_test' ||
        environment.AUTH_TEST_DATABASE_CONFIRM !==
            'languon_auth_assistant_web_test' ||
        redis.protocol !== 'redis:' ||
        !['127.0.0.1', 'localhost'].includes(redis.hostname) ||
        redis.port !== '56444' ||
        redis.pathname !== '/1' ||
        environment.AUTH_TEST_REDIS_CONFIRM !== `${redis.hostname}:56444/1`
    )
        throw new Error(
            'Contextual assistant journeys require confirmed exclusive loopback PostgreSQL 55444/languon_auth_assistant_web_test and Redis 56444/1.',
        );
}

export async function runContextualAssistantE2e(
    run = execute,
    args = process.argv.slice(2),
) {
    assertContextualAssistantEnvironment(process.env);
    const browserArgs = args[0] === '--' ? args.slice(1) : args;
    await withPreservedFile(
        fileURLToPath(new URL('../apps/web/next-env.d.ts', import.meta.url)),
        async () => {
            await run('pnpm', [
                '--filter',
                '@languon/backend',
                'exec',
                'vitest',
                'run',
                'tests/integration/modules/conversations/contextual-assistant.journeys.test.ts',
            ]);
            await run('pnpm', [
                '--filter',
                '@languon/web',
                'exec',
                'playwright',
                'test',
                '--config',
                'tests/e2e/support/contextual-assistant-playwright.config.ts',
                ...browserArgs,
            ]);
        },
    );
}
function execute(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: 'inherit',
            env: {
                ...process.env,
                APP_ENV: 'test',
                CONTEXTUAL_ASSISTANT_FIXTURE: 'true',
                CONTEXTUAL_ASSISTANT_RUNNER: 'true',
                AUTH_E2E_RUN_ID:
                    process.env.AUTH_E2E_RUN_ID ??
                    `assistant-${Date.now().toString(36)}`,
            },
        });
        const interrupt = () => child.kill('SIGINT');
        const terminate = () => child.kill('SIGTERM');
        process.once('SIGINT', interrupt);
        process.once('SIGTERM', terminate);
        const cleanup = () => {
            process.removeListener('SIGINT', interrupt);
            process.removeListener('SIGTERM', terminate);
        };
        child.once('error', (error) => {
            cleanup();
            reject(error);
        });
        child.once('exit', (code, signal) => {
            cleanup();
            if (code === 0) resolve();
            else
                reject(
                    new Error(
                        `Contextual assistant command failed (${signal ?? code}).`,
                    ),
                );
        });
    });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await runContextualAssistantE2e().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
