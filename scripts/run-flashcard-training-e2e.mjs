import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const databaseName = 'languon_auth_flashcards_e2e_test';
const postgresName = 'languon-flashcard-e2e-postgres';
const redisName = 'languon-flashcard-e2e-redis';

export async function runFlashcardTrainingE2e(run = execute) {
    const started = [];
    // Never reuse a pre-existing container, even if it has our expected name.
    for (const name of [postgresName, redisName]) {
        const result = await run(['docker', 'container', 'inspect', name], {
            allowFailure: true,
            quiet: true,
        });
        if (result.code === 0)
            throw new Error(`Refusing to reuse existing container ${name}.`);
    }
    try {
        await run([
            'docker',
            'run',
            '--detach',
            '--rm',
            '--name',
            postgresName,
            '--label',
            'languon.test=flashcard-training',
            '--publish',
            '127.0.0.1:55445:5432',
            '--tmpfs',
            '/var/lib/postgresql/data:rw',
            '--env',
            `POSTGRES_DB=${databaseName}`,
            '--env',
            'POSTGRES_USER=learning',
            '--env',
            'POSTGRES_PASSWORD=learning-local',
            'postgres:17-alpine',
        ]);
        started.push(postgresName);
        await run([
            'docker',
            'run',
            '--detach',
            '--rm',
            '--name',
            redisName,
            '--label',
            'languon.test=flashcard-training',
            '--publish',
            '127.0.0.1:55446:6379',
            'redis:7-alpine',
            'redis-server',
            '--save',
            '',
            '--appendonly',
            'no',
        ]);
        started.push(redisName);
        await ready(run, [
            'docker',
            'exec',
            postgresName,
            'pg_isready',
            '--username',
            'learning',
            '--dbname',
            databaseName,
        ]);
        await ready(run, ['docker', 'exec', redisName, 'redis-cli', 'ping']);
        await run(
            [
                'pnpm',
                '--filter',
                '@languon/backend',
                'exec',
                'vitest',
                'run',
                'tests/integration/modules/learning/learning-composed-routes.test.ts',
            ],
            {
                environment: {
                    ...process.env,
                    ALLOW_DISPOSABLE_DATABASE_TESTS: 'true',
                    AUTH_TEST_DATABASE_URL: `postgresql://learning:learning-local@127.0.0.1:55445/${databaseName}`,
                    AUTH_TEST_DATABASE_CONFIRM: databaseName,
                    ALLOW_DISPOSABLE_REDIS_TESTS: 'true',
                    AUTH_TEST_REDIS_URL: 'redis://127.0.0.1:55446/1',
                    AUTH_TEST_REDIS_CONFIRM: '127.0.0.1:55446/1',
                },
            },
        );
    } finally {
        for (const name of started.reverse()) {
            await run(['docker', 'stop', '--time', '3', name], {
                allowFailure: true,
                quiet: true,
            });
        }
    }
}

async function ready(run, command) {
    for (let attempt = 0; attempt < 40; attempt++) {
        if (
            (await run(command, { allowFailure: true, quiet: true })).code === 0
        )
            return;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(
        'Disposable flashcard test infrastructure did not become ready.',
    );
}

function execute(
    [command, ...args],
    { allowFailure = false, quiet = false, environment = process.env } = {},
) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            env: environment,
            stdio: quiet ? 'ignore' : 'inherit',
        });
        child.once('error', reject);
        child.once('exit', (code, signal) => {
            if (!allowFailure && (code !== 0 || signal)) {
                reject(
                    new Error(
                        `Flashcard test command failed: ${command} (exit ${code ?? 'unknown'}, signal ${signal ?? 'none'}).`,
                    ),
                );
            } else resolve({ code: code ?? 1 });
        });
    });
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    await runFlashcardTrainingE2e().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
