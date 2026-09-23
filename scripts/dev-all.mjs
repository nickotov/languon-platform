import {
    createEnvironmentRedactor,
    StreamingRedactor,
} from '../web-dev-panel/src/logs.mjs';
import { execFile, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

export const developmentCommands = {
    infrastructure: [
        'docker',
        'compose',
        '--file',
        'compose.yaml',
        '--env-file',
        '.env.local',
        'up',
        '-d',
        '--wait',
        '--wait-timeout',
        '120',
        'postgres',
        'redis',
    ],
    dependencies: [
        'pnpm',
        'exec',
        'turbo',
        'run',
        'build',
        '--env-mode=loose',
        '--filter=@languon/backend^...',
    ],
    migrations: ['pnpm', 'db:migrate'],
    applications: [
        'pnpm',
        'exec',
        'turbo',
        'run',
        'dev',
        '--env-mode=loose',
        '--filter=!@languon/mobile',
        '--filter=!@languon/web-dev-panel',
    ],
    dictionary: ['pnpm', 'dev:dictionary-worker'],
};

export function validateDevelopmentEnvironment(environment) {
    for (const key of ['APP_ENV', 'NODE_ENV']) {
        if (environment[key] !== 'development') {
            throw new Error(`${key} must be development for dev:all.`);
        }
    }
    if (
        environment.POSTGRES_HOST &&
        !localHosts.has(environment.POSTGRES_HOST)
    ) {
        throw new Error(
            'POSTGRES_HOST must be localhost or a loopback address.',
        );
    }
    for (const key of [
        'DATABASE_URL',
        'MIGRATION_DATABASE_URL',
        'DICTIONARY_WORKER_DATABASE_URL',
        'REDIS_URL',
    ]) {
        const value = environment[key];
        if (!value && key !== 'DATABASE_URL' && key !== 'REDIS_URL') continue;
        let url;
        try {
            url = new URL(value);
        } catch {
            throw new Error(`${key} must be a valid local URL.`);
        }
        const redis = key === 'REDIS_URL';
        const port = redis
            ? environment.REDIS_PORT || '6379'
            : environment.POSTGRES_PORT || '5432';
        const protocols = redis ? ['redis:'] : ['postgres:', 'postgresql:'];
        if (
            !protocols.includes(url.protocol) ||
            !localHosts.has(url.hostname) ||
            (url.port || (redis ? '6379' : '5432')) !== port ||
            url.search ||
            url.hash
        ) {
            throw new Error(
                `${key} must target the local Compose service port without URL query overrides.`,
            );
        }
        if (
            !redis &&
            decodeURIComponent(url.pathname.slice(1)) !==
                (environment.POSTGRES_DB || 'languon')
        ) {
            throw new Error(
                `${key} must target POSTGRES_DB (default languon).`,
            );
        }
    }
}

async function descendantPids(rootPids) {
    if (process.platform === 'win32') return [];
    const output = await new Promise((resolveOutput, reject) => {
        execFile(
            'ps',
            ['-A', '-o', 'pid=,ppid='],
            { encoding: 'utf8' },
            (error, stdout) => (error ? reject(error) : resolveOutput(stdout)),
        );
    });
    const rows = output
        .trim()
        .split('\n')
        .map((row) => row.trim().split(/\s+/).map(Number));
    const owned = new Set(rootPids);
    let added;
    do {
        added = false;
        for (const [pid, parent] of rows) {
            if (owned.has(parent) && !owned.has(pid)) {
                owned.add(pid);
                added = true;
            }
        }
    } while (added);
    for (const pid of rootPids) owned.delete(pid);
    return [...owned].reverse();
}

function signalPid(pid, signal) {
    try {
        process.kill(pid, signal);
    } catch (error) {
        if (error.code !== 'ESRCH') throw error;
    }
}

export async function runDevelopment({
    cwd = repositoryRoot,
    environment = process.env,
    commands = developmentCommands,
    signals = process,
    graceMs = 1500,
    stdout = process.stdout,
    stderr = process.stderr,
    log = (message) => console.log(`[dev:all] ${message}`),
} = {}) {
    let fileEnvironment;
    try {
        fileEnvironment = parseEnv(
            await readFile(resolve(cwd, '.env.local'), 'utf8'),
        );
    } catch (error) {
        if (error.code === 'ENOENT')
            throw new Error(
                '.env.local is required. Copy .env.example to .env.local and review its local settings first.',
                { cause: error },
            );
        throw error;
    }
    // Match Node's loadEnvFile precedence used by backend commands.
    const childEnvironment = { ...fileEnvironment, ...environment };
    validateDevelopmentEnvironment(childEnvironment);
    const children = new Set();
    let stopping = false;
    let cleanup;
    const redactionEnvironment = { ...childEnvironment };
    for (const key of [
        'DATABASE_URL',
        'MIGRATION_DATABASE_URL',
        'DICTIONARY_WORKER_DATABASE_URL',
        'REDIS_URL',
    ]) {
        if (childEnvironment[key]) {
            const password = new URL(childEnvironment[key]).password;
            if (password)
                redactionEnvironment[`${key}_PASSWORD`] =
                    decodeURIComponent(password);
        }
    }
    const redact = createEnvironmentRedactor(redactionEnvironment);
    let interrupted = false;

    const stop = () => {
        if (cleanup) return cleanup;
        stopping = true;
        cleanup = (async () => {
            // Keep the inherited process group so the panel's force-kill still
            // owns every descendant. Snapshot before terminating pnpm parents.
            const roots = [...children]
                .filter(
                    ({ child }) =>
                        child.exitCode === null && child.signalCode === null,
                )
                .map(({ child }) => child.pid)
                .filter(Boolean);
            let descendants = [];
            try {
                descendants = await descendantPids(roots);
            } catch {
                log(
                    'Could not inspect descendants; stopping direct processes.',
                );
            }
            const pids = new Set([...descendants, ...roots]);
            if (process.platform === 'win32') {
                await Promise.all(
                    [...children]
                        .filter(({ child }) => child.pid)
                        .map(
                            ({ child }) =>
                                new Promise((done) => {
                                    execFile(
                                        'taskkill.exe',
                                        ['/PID', String(child.pid), '/T', '/F'],
                                        () => done(),
                                    );
                                }),
                        ),
                );
            } else {
                for (const pid of descendants) signalPid(pid, 'SIGTERM');
                // Give launchers a chance to reap children before terminating them.
                if (descendants.length)
                    await new Promise((done) => setTimeout(done, 100));
                for (const pid of roots) signalPid(pid, 'SIGTERM');
                if (pids.size)
                    await new Promise((done) => setTimeout(done, graceMs));
                for (const pid of pids) signalPid(pid, 'SIGKILL');
            }
            await Promise.all([...children].map(({ done }) => done));
        })();
        return cleanup;
    };
    const interrupt = () => {
        interrupted = true;
        void stop();
    };
    signals.on('SIGINT', interrupt);
    signals.on('SIGTERM', interrupt);

    function start(name) {
        if (stopping) return null;
        log(`Starting ${name}…`);
        const [executable, ...args] = commands[name];
        const child = spawn(executable, args, {
            cwd,
            env: childEnvironment,
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: false,
            detached: false,
        });
        for (const [stream, target] of [
            [child.stdout, stdout],
            [child.stderr, stderr],
        ]) {
            const redactor = new StreamingRedactor({
                redact,
                onText: (text) => target.write(text),
            });
            stream.on('data', (chunk) => redactor.write(chunk));
            stream.on('end', () => redactor.end());
        }
        const record = { child, done: null };
        record.done = new Promise((done) => {
            child.once('error', () =>
                done({ name, code: 1, failedToStart: true }),
            );
            child.once('exit', (code, signal) => done({ name, code, signal }));
        });
        children.add(record);
        return record.done;
    }

    try {
        for (const name of ['infrastructure', 'dependencies', 'migrations']) {
            const done = start(name);
            if (!done) break;
            const result = await done;
            if (stopping) break;
            if (result.code !== 0)
                throw new Error(
                    `${name} ${result.failedToStart ? 'could not start; check Docker/pnpm installation' : 'failed; review the output above'}. No app processes were started.`,
                );
        }
        if (!stopping) {
            const running = ['applications', 'dictionary'].map(start);
            log(
                'Applications and dictionary worker launched; wait for their ready messages. Stop this command to stop them. PostgreSQL and Redis remain running.',
            );
            const result = await Promise.race(running);
            if (!stopping)
                throw new Error(
                    `${result.name} exited unexpectedly; stopping the remaining app processes.`,
                );
        }
    } finally {
        await stop();
        signals.off('SIGINT', interrupt);
        signals.off('SIGTERM', interrupt);
    }
    return interrupted ? 130 : 0;
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
    if (process.argv.length > 2) {
        console.error('[dev:all] This command takes no arguments.');
        process.exitCode = 1;
    } else {
        runDevelopment()
            .then((code) => {
                process.exitCode = code;
            })
            .catch((error) => {
                console.error(`[dev:all] ${error.message}`);
                process.exitCode = 1;
            });
    }
}
