import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, type APIRequestContext } from '@playwright/test';
import postgres from 'postgres';

export const backendOrigin =
    process.env.ADMIN_E2E_BACKEND_ORIGIN ?? 'http://localhost:4000';
export const adminOrigin =
    process.env.ADMIN_E2E_ADMIN_ORIGIN ?? 'http://localhost:3001';
export const webOrigin =
    process.env.ADMIN_E2E_WEB_ORIGIN ?? 'http://localhost:3333';
export const password = 'Critical!Local-password-2026';
export const databaseUrl = process.env.ADMIN_E2E_DATABASE_URL!;
const root = resolve(import.meta.dirname, '../../../../..');
const formats =
    'single-card:v2,text-detection:v2,text-translation:v3,text-selection-card:v1';

function environment() {
    return {
        ...process.env,
        APP_ENV: 'development',
        ADMIN_BASE_URL: adminOrigin,
        AUTH_ALLOWED_ORIGINS: `${adminOrigin},${webOrigin}`,
        AUTH_CODE_HMAC_SECRET:
            'admin-e2e-code-secret-do-not-use-outside-local-tests',
        AUTH_JWT_SECRET: 'admin-e2e-jwt-secret-do-not-use-outside-local-tests',
        DICTIONARY_HMAC_SECRET:
            'admin-e2e-dictionary-secret-do-not-use-outside-local-tests',
        AUTH_WEBAUTHN_RP_ID: new URL(adminOrigin).hostname,
        DATABASE_URL: databaseUrl,
        REDIS_URL: process.env.ADMIN_E2E_REDIS_URL!,
    };
}

export async function inspectReadiness() {
    // A separate process keeps the doctor's tsx loader independent of Playwright's loader.
    const directory = await mkdtemp(resolve(tmpdir(), 'languon-doctor-e2e-'));
    const envFile = resolve(directory, 'runtime.env');
    const values = {
        APP_ENV: 'development',
        DATABASE_URL: databaseUrl,
        DICTIONARY_AI_DEEPSEEK_CREDENTIAL_CONFIGURED: 'true',
        DEEPSEEK_API_KEY: 'synthetic-test-key',
        DICTIONARY_AI_MANAGED_ROUTING_ENABLED: 'true',
        DICTIONARY_AI_CREDIT_ENFORCEMENT_ENABLED: 'true',
        TEXTS_AI_ENABLED: 'true',
        DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS: formats,
        DICTIONARY_JOB_API_ENQUEUED_FORMATS: formats,
        DICTIONARY_JOB_API_ACCEPTABLE_FORMATS: formats,
        DICTIONARY_JOB_API_READABLE_FORMATS: formats,
        DICTIONARY_JOB_API_CANCELLABLE_FORMATS: formats,
        DICTIONARY_JOB_API_DISCARDABLE_FORMATS: formats,
    };
    await writeFile(
        envFile,
        Object.entries(values)
            .map(([key, value]) => `${key}=${value}`)
            .join('\n'),
        { mode: 0o600 },
    );
    try {
        let stdout: string;
        try {
            ({ stdout } = await promisify(execFile)(
                process.execPath,
                [
                    'scripts/dev-doctor.mjs',
                    '--env-file',
                    envFile,
                    '--capability',
                    'texts',
                    '--json',
                ],
                { cwd: root },
            ));
        } catch (error) {
            if (
                !error ||
                typeof error !== 'object' ||
                !('stdout' in error) ||
                typeof error.stdout !== 'string' ||
                !error.stdout.trim().startsWith('{')
            )
                throw error;
            stdout = error.stdout;
        }
        return JSON.parse(stdout) as {
            ready: boolean;
            checks: Array<{ id: string; status: string; message: string }>;
        };
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

export async function createUser(request: APIRequestContext, email: string) {
    const signup = await request.post(`${backendOrigin}/auth/sign-up`, {
        data: { email, password },
        headers: { Origin: adminOrigin },
    });
    expect(signup.status()).toBe(202);
    const { verification } = await signup.json();
    const verified = await request.post(
        `${backendOrigin}/auth/email-verification/verify`,
        {
            data: { flowId: verification.flowId, code: '0000' },
            headers: { Origin: adminOrigin },
        },
    );
    expect(verified.status()).toBe(200);
    return (await verified.json()).user.id as string;
}

export async function bootstrapOwner(email: string) {
    await promisify(execFile)(
        'pnpm',
        [
            '--filter',
            '@languon/backend',
            'admin:membership',
            'grant',
            '--email',
            email,
            '--reason',
            'Bootstrap disposable critical journey owner',
            '--confirm',
            'admin-membership-change',
        ],
        { cwd: root, env: environment() },
    );
}

/** Exercise the public setup CLI with a short-lived token kept out of arguments. */
export async function applyDemoProfile(token: string, learnerId: string) {
    const directory = await mkdtemp(resolve(tmpdir(), 'languon-setup-e2e-'));
    const envFile = resolve(directory, 'runtime.env');
    await writeFile(
        envFile,
        `APP_ENV=test\nDATABASE_URL=${databaseUrl}\nDICTIONARY_AI_PROVIDER_FIXTURE_MODE=deterministic\nRELEASE_SHA=development\n`,
        { mode: 0o600 },
    );
    try {
        const { stdout } = await promisify(execFile)(
            process.execPath,
            [
                'scripts/dev-configure.mjs',
                '--profile',
                'deterministic-demo',
                '--origin',
                backendOrigin,
                '--admin-origin',
                adminOrigin,
                '--learner-id',
                learnerId,
                '--apply',
                '--env-file',
                envFile,
                '--confirm-database',
                new URL(databaseUrl).pathname.slice(1),
            ],
            {
                cwd: root,
                env: {
                    ...environment(),
                    APP_ENV: 'test',
                    DICTIONARY_AI_PROVIDER_FIXTURE_MODE: 'deterministic',
                    LANGUON_DEV_ADMIN_TOKEN: token,
                },
            },
        );
        expect(stdout).toContain('Setup requests completed');
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

export async function startWorker() {
    const output: string[] = [];
    const worker = spawn(
        'pnpm',
        [
            '--filter',
            '@languon/backend',
            'exec',
            'tsx',
            'src/infrastructure/worker/dictionary-worker-command.ts',
            'run',
        ],
        {
            cwd: root,
            env: {
                ...environment(),
                APP_ENV: 'test',
                DEEPSEEK_API_KEY: 'synthetic-test-key',
                KIE_API_KEY: 'synthetic-test-key',
                DICTIONARY_AI_PROVIDER_FIXTURE_MODE: 'deterministic',
                DICTIONARY_GENERATION_PROVIDER_MODE: 'mastra',
                DICTIONARY_JOB_API_ENQUEUED_FORMATS: formats,
                DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS: formats,
                DICTIONARY_WORKER_DATABASE_URL: databaseUrl,
                DICTIONARY_WORKER_POLL_INTERVAL_MS: '50',
                DICTIONARY_WORKER_READINESS_TIMEOUT_MS: '1000',
                RELEASE_SHA: 'development',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        },
    );
    worker.stdout?.on('data', (chunk) => output.push(String(chunk)));
    worker.stderr?.on('data', (chunk) => output.push(String(chunk)));
    const sql = postgres(databaseUrl, { max: 1 });
    try {
        await expect
            .poll(
                async () => {
                    if (worker.exitCode !== null)
                        throw new Error(
                            `Fixture worker exited: ${output.join('').slice(-2000)}`,
                        );
                    const rows =
                        await sql`select id from dictionary_ai_worker_observations where model_id = 'deepseek-flash' and status = 'available'`;
                    return rows.length;
                },
                { timeout: 20000 },
            )
            .toBeGreaterThan(0);
        return worker;
    } catch (error) {
        await stopWorker(worker);
        throw error;
    } finally {
        await sql.end();
    }
}

export async function stopWorker(worker?: ChildProcess) {
    if (!worker || worker.exitCode !== null) return;
    worker.kill('SIGTERM');
    await Promise.race([
        new Promise<void>((resolveExit) =>
            worker.once('exit', () => resolveExit()),
        ),
        delay(5000).then(() => {
            if (worker.exitCode === null) worker.kill('SIGKILL');
        }),
    ]);
}
