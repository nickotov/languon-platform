import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';
import { assertDisposableEnvironment } from './run-texts-e2e.mjs';

export function assertTextsCombinedEnvironment(environment) {
    assertDisposableEnvironment(environment);
    if (
        new URL(environment.AUTH_TEST_DATABASE_URL).pathname !==
        '/languon_auth_texts_ui_web_test'
    )
        throw new Error(
            'Combined Texts journeys require the exclusive UI web test database.',
        );
    const database = new URL(environment.AUTH_TEST_DATABASE_URL);
    const redis = new URL(environment.AUTH_TEST_REDIS_URL);
    if (
        database.port !== '55443' ||
        redis.port !== '56443' ||
        redis.pathname !== '/1'
    )
        throw new Error(
            'Combined Texts journeys require PostgreSQL55443 and Redis56443/1.',
        );
    if (environment.TEXTS_WEB_REUSE_SERVERS === 'true')
        throw new Error(
            'Combined journeys require fresh owned servers; stop debug servers first.',
        );
}
async function requireFreePort(port) {
    await new Promise((resolve, reject) => {
        const probe = createServer();
        probe.once('error', () =>
            reject(
                new Error(
                    `Stop the debug server on loopback port ${port} before combined Texts verification.`,
                ),
            ),
        );
        probe.listen(port, '127.0.0.1', () => probe.close(resolve));
    });
}
async function execute(script, environment) {
    await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [script], {
            stdio: 'inherit',
            env: environment,
        });
        const stop = () => child.kill('SIGTERM');
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
        function cleanup() {
            process.removeListener('SIGINT', stop);
            process.removeListener('SIGTERM', stop);
        }
        child.once('error', (error) => {
            cleanup();
            reject(error);
        });
        child.once('exit', (code) => {
            cleanup();
            if (code === 0) resolve();
            else reject(new Error(`${script} failed (${code ?? 'signal'}).`));
        });
    });
}
export async function runTextsCombined(environment = process.env) {
    assertTextsCombinedEnvironment(environment);
    await requireFreePort(4005);
    await requireFreePort(3335);
    await execute('scripts/run-texts-e2e.mjs', environment);
    await execute('scripts/run-texts-web-e2e.mjs', environment);
}
if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    runTextsCombined().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
