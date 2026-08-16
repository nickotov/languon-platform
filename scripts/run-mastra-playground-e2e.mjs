import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const containerName = 'languon-mastra-playground-e2e';
const localPort = '55434';
let started = false;

export async function runMastraPlaygroundE2e() {
    const existing = await run(
        ['docker', 'container', 'inspect', containerName],
        { allowFailure: true, quiet: true },
    );
    if (existing.code === 0) {
        throw new Error(
            `Refusing to reuse existing Docker container ${containerName}.`,
        );
    }

    try {
        await run([
            'docker',
            'run',
            '--detach',
            '--rm',
            '--name',
            containerName,
            '--label',
            'languon.test=mastra-playground',
            '--publish',
            `127.0.0.1:${localPort}:5432`,
            '--env',
            'POSTGRES_DB=languon',
            '--env',
            'POSTGRES_USER=languon',
            '--env',
            'POSTGRES_PASSWORD=languon-mastra-test',
            'postgres:17-alpine',
        ]);
        started = true;
        await waitForPostgres();
        await run(
            [
                'pnpm',
                '--filter',
                '@languon/backend',
                'exec',
                'vitest',
                'run',
                'tests/e2e/mastra-development-harness.journey.test.ts',
            ],
            {
                environment: {
                    ...process.env,
                    ALLOW_MASTRA_PLAYGROUND_DATABASE_TESTS: 'true',
                    MASTRA_PLAYGROUND_TEST_ADMIN_DATABASE_URL: `postgres://languon:languon-mastra-test@127.0.0.1:${localPort}/postgres`,
                },
            },
        );
    } finally {
        if (started) {
            await run(['docker', 'stop', '--time', '3', containerName], {
                allowFailure: true,
                quiet: true,
            });
        }
    }
}

async function waitForPostgres() {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        const result = await run(
            [
                'docker',
                'exec',
                containerName,
                'pg_isready',
                '--username',
                'languon',
                '--dbname',
                'postgres',
            ],
            { allowFailure: true, quiet: true },
        );
        if (result.code === 0) return;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('Disposable Mastra PostgreSQL did not become ready.');
}

function run(
    [executable, ...args],
    { allowFailure = false, environment = process.env, quiet = false } = {},
) {
    return new Promise((resolve, reject) => {
        const child = spawn(executable, args, {
            env: environment,
            stdio: quiet ? 'ignore' : 'inherit',
        });
        child.once('error', reject);
        child.once('exit', (code, signal) => {
            const result = { code: code ?? (signal ? 1 : 0), signal };
            if (!allowFailure && result.code !== 0) {
                reject(
                    new Error(
                        `${[executable, ...args].join(' ')} exited with code ${result.code}.`,
                    ),
                );
                return;
            }
            resolve(result);
        });
    });
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    await runMastraPlaygroundE2e().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
