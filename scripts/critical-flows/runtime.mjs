import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { validateFeatureFlags } from './registry.mjs';

let interrupted = false;

export function setInterrupted(value) {
    interrupted = value;
}

export function assertNotInterrupted() {
    if (interrupted)
        throw new Error(
            'Critical-flow run interrupted; owned services will be cleaned up.',
        );
}

export function execute(command, args, options = {}) {
    if (!options.cleanup) assertNotInterrupted();
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
            ...options,
        });
        let output = '';
        let errors = '';
        child.stdout?.on('data', (data) => {
            output += data;
        });
        child.stderr?.on('data', (data) => {
            errors += data;
        });
        const stop = () => child.kill('SIGTERM');
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
        const cleanup = () => {
            process.off('SIGINT', stop);
            process.off('SIGTERM', stop);
        };
        child.once('error', (error) => {
            cleanup();
            reject(error);
        });
        child.once('exit', (code) => {
            cleanup();
            if (code === 0) resolve(output.trim());
            else
                reject(
                    new Error(
                        `${command} exited ${code}${errors || output ? `: ${errors || output}` : ''}`,
                    ),
                );
        });
    });
}

export async function assertFreePorts(ports) {
    for (const port of ports)
        await new Promise((resolve, reject) => {
            const server = createServer();
            server.once('error', (error) =>
                reject(
                    new Error(
                        error.code === 'EADDRINUSE'
                            ? `Critical-flow port ${port} is occupied; no existing service will be stopped or reused.`
                            : `Cannot inspect critical-flow port ${port}: ${error.code}. Run with permission to bind local ports.`,
                    ),
                ),
            );
            server.listen(port, '127.0.0.1', () => server.close(resolve));
        });
}

export function infrastructure(flow) {
    const fixture = {
        texts: [55487, 56487, 'languon_auth_texts_ui_web_test', 3335, 4005],
        assistant: [
            55488,
            56488,
            'languon_auth_assistant_web_test',
            3336,
            4006,
        ],
        portrait: [
            55486,
            56486,
            'languon_auth_portrait_critical_test',
            3337,
            4007,
        ],
    }[flow.app] ?? [
        55485,
        56485,
        'languon_admin_e2e_critical_test',
        3435,
        4435,
        3436,
    ];
    const [pg, redis, database, web, backend, admin] = fixture;
    const databaseUrl = `postgres://critical:critical_test_only@127.0.0.1:${pg}/${database}`;
    const redisUrl = `redis://127.0.0.1:${redis}/1`;
    return {
        ports: fixture.filter((value) => typeof value === 'number'),
        pg,
        redis,
        database,
        env: {
            APP_ENV: 'test',
            ALLOW_DISPOSABLE_DATABASE_TESTS: 'true',
            ALLOW_DISPOSABLE_REDIS_TESTS: 'true',
            AUTH_TEST_DATABASE_URL: databaseUrl,
            AUTH_TEST_DATABASE_CONFIRM: database,
            AUTH_TEST_REDIS_URL: redisUrl,
            AUTH_TEST_REDIS_CONFIRM: `127.0.0.1:${redis}/1`,
            AUTH_E2E_DATABASE_URL: databaseUrl,
            AUTH_E2E_REDIS_URL: redisUrl,
            ADMIN_E2E_DATABASE_URL: databaseUrl,
            ADMIN_E2E_REDIS_URL: redisUrl,
            AUTH_E2E_WEB_ORIGIN: `http://localhost:${web}`,
            AUTH_E2E_BACKEND_ORIGIN: `http://localhost:${backend}`,
            ADMIN_E2E_WEB_ORIGIN: `http://localhost:${web}`,
            ADMIN_E2E_BACKEND_ORIGIN: `http://localhost:${backend}`,
            ADMIN_E2E_ADMIN_ORIGIN: `http://localhost:${admin ?? web}`,
            AUTH_E2E_REUSE_SERVERS: 'false',
            ADMIN_E2E_REUSE_SERVERS: 'false',
            TEXTS_WEB_REUSE_SERVERS: 'false',
            DICTIONARY_GENERATION_PROVIDER_MODE: 'deterministic',
            DICTIONARY_AI_PROVIDER_FIXTURE_MODE: 'deterministic',
        },
    };
}

/** Only reviewed scenario flags vary; connection and execution controls remain runner-owned. */
export function createFlowEnvironment(
    flow,
    { runId, report },
    parent = process.env,
) {
    validateFeatureFlags(flow.env);
    const inherited = Object.fromEntries(
        [
            'PATH',
            'HOME',
            'PNPM_HOME',
            'CI',
            'TMPDIR',
            'PLAYWRIGHT_BROWSERS_PATH',
        ]
            .filter((key) => parent[key])
            .map((key) => [key, parent[key]]),
    );
    return {
        ...inherited,
        ...flow.env,
        ...infrastructure(flow).env,
        AUTH_E2E_RUN_ID: runId,
        AUTH_E2E_DIST_DIR: '.next-critical-e2e',
        CONTEXTUAL_ASSISTANT_RUNNER: 'true',
        CONTEXTUAL_ASSISTANT_FIXTURE: 'true',
        LEARNER_PORTRAIT_WEB_RUNNER: 'true',
        LEARNER_PORTRAIT_WEB_FIXTURE: 'true',
        PLAYWRIGHT_JSON_OUTPUT_FILE: report,
    };
}
