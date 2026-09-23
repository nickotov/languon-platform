import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
    developmentCommands,
    runDevelopment,
    validateDevelopmentEnvironment,
} from './dev-all.mjs';

const environment = {
    APP_ENV: 'development',
    NODE_ENV: 'development',
    DATABASE_URL: 'postgres://fixture:fixture@localhost:5432/languon',
    REDIS_URL: 'redis://localhost:6379',
};

test('guards reject remote, deployed, mismatched and overridden database targets', () => {
    validateDevelopmentEnvironment(environment);
    assert.doesNotThrow(() =>
        validateDevelopmentEnvironment({
            ...environment,
            ACCOUNT_PURGE_DATABASE_URL: 'postgres://unused.invalid/other',
        }),
    );
    for (const overrides of [
        { APP_ENV: 'production' },
        { NODE_ENV: 'production' },
        {
            DATABASE_URL:
                'postgres://fixture:fixture@remote.invalid:5432/languon',
        },
        { MIGRATION_DATABASE_URL: 'postgres://localhost:5432/production' },
        { DICTIONARY_WORKER_DATABASE_URL: 'postgres://localhost:5433/languon' },
        { REDIS_URL: 'redis://remote.invalid:6379' },
        { REDIS_PORT: '6380' },
    ])
        assert.throws(() =>
            validateDevelopmentEnvironment({ ...environment, ...overrides }),
        );
});

test('fixed commands wait for infrastructure and preserve Turbo build prerequisites', () => {
    assert.ok(developmentCommands.infrastructure.includes('--wait'));
    assert.ok(developmentCommands.infrastructure.includes('--env-file'));
    assert.ok(
        developmentCommands.dependencies.includes(
            '--filter=@languon/backend^...',
        ),
    );
    assert.ok(!developmentCommands.applications.includes('--parallel'));
    assert.ok(developmentCommands.applications.includes('--env-mode=loose'));
});

async function fixture(t, failAt, hangAt) {
    const cwd = await mkdtemp(join(tmpdir(), 'languon-dev-all-'));
    t.after(() => rm(cwd, { recursive: true, force: true }));
    await writeFile(
        join(cwd, '.env.local'),
        Object.entries(environment)
            .map(([key, value]) => `${key}=${value}`)
            .join('\n'),
    );
    const script = join(cwd, 'fixture.mjs');
    await writeFile(
        script,
        `import { appendFileSync } from 'node:fs';
const name = process.argv[2];
appendFileSync('events', name + ':' + process.pid + '\\n');
if (name === ${JSON.stringify(failAt)}) process.exit(7);
if (['applications', 'dictionary', ${JSON.stringify(hangAt)}].includes(name)) setInterval(() => {}, 1000);
`,
    );
    const commands = Object.fromEntries(
        Object.keys(developmentCommands).map((name) => [
            name,
            [process.execPath, script, name],
        ]),
    );
    const events = async () => {
        try {
            return (await readFile(join(cwd, 'events'), 'utf8'))
                .trim()
                .split('\n');
        } catch {
            return [];
        }
    };
    const signals = new EventEmitter();
    return {
        cwd,
        commands,
        events,
        signals,
        environment: { PATH: process.env.PATH },
        graceMs: 30,
        log: () => {},
    };
}

async function waitFor(predicate) {
    for (let attempt = 0; attempt < 200; attempt++) {
        if (await predicate()) return;
        await new Promise((done) => setTimeout(done, 10));
    }
    throw new Error('Synthetic startup timed out');
}

test('missing local environment produces actionable failure', async () => {
    await assert.rejects(
        runDevelopment({ cwd: join(tmpdir(), 'missing-dev-all-fixture') }),
        /Copy .env.example/,
    );
});

test('setup runs in order, then all services stop on command stop', async (t) => {
    const options = await fixture(t);
    const running = runDevelopment(options);
    await waitFor(async () => (await options.events()).length === 5);
    options.signals.emit('SIGTERM');
    assert.equal(await running, 130);
    const events = await options.events();
    assert.deepEqual(
        events.slice(0, 3).map((line) => line.split(':')[0]),
        ['infrastructure', 'dependencies', 'migrations'],
    );
    for (const line of events)
        assert.throws(() => process.kill(Number(line.split(':')[1]), 0), {
            code: 'ESRCH',
        });
    assert.equal(options.signals.listenerCount('SIGTERM'), 0);
});

for (const name of ['infrastructure', 'dependencies', 'migrations']) {
    test(`failure in ${name} never launches later services`, async (t) => {
        const options = await fixture(t, name);
        await assert.rejects(
            runDevelopment(options),
            new RegExp(`${name} failed`),
        );
        const names = (await options.events()).map(
            (line) => line.split(':')[0],
        );
        assert.equal(names.at(-1), name);
        assert.ok(!names.includes('applications'));
    });
}

test('stop during setup prevents migrations and application startup', async (t) => {
    const options = await fixture(t, undefined, 'infrastructure');
    const running = runDevelopment(options);
    await waitFor(async () => (await options.events()).length === 1);
    options.signals.emit('SIGINT');
    assert.equal(await running, 130);
    assert.equal((await options.events()).length, 1);
});

test('unexpected service failure stops its siblings', async (t) => {
    const options = await fixture(t, 'dictionary');
    await assert.rejects(
        runDevelopment(options),
        /dictionary exited unexpectedly/,
    );
    for (const line of await options.events())
        assert.throws(() => process.kill(Number(line.split(':')[1]), 0), {
            code: 'ESRCH',
        });
});

test('runner redacts secrets loaded from its own file across output chunks', async (t) => {
    const options = await fixture(t);
    const secret = 'fixture-secret-not-in-parent';
    await writeFile(
        join(options.cwd, '.env.local'),
        Object.entries({ ...environment, PROVIDER_API_KEY: secret })
            .map(([key, value]) => `${key}=${value}`)
            .join('\n'),
    );
    options.commands.infrastructure = [
        process.execPath,
        '-e',
        `process.stdout.write(${JSON.stringify(secret.slice(0, 12))}); setTimeout(() => process.stdout.write(${JSON.stringify(secret.slice(12))} + '\\n'), 20);`,
    ];
    options.commands.dependencies = [process.execPath, '-e', 'process.exit(1)'];
    let output = '';
    options.stdout = {
        write: (text) => {
            output += text;
        },
    };
    await assert.rejects(runDevelopment(options), /dependencies failed/);
    assert.equal(output, '[REDACTED]\n');
});

test('stop cleans a synthetic nested service process as well as its launcher', async (t) => {
    const options = await fixture(t);
    options.commands.applications = [
        process.execPath,
        '-e',
        `
        const { spawn } = require('node:child_process');
        const { appendFileSync } = require('node:fs');
        const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
        appendFileSync('nested', String(child.pid));
        setInterval(() => {}, 1000);
    `,
    ];
    const running = runDevelopment(options);
    let pid;
    t.after(() => {
        if (pid) {
            try {
                process.kill(pid, 'SIGKILL');
            } catch {
                // Already stopped by the runner.
            }
        }
    });
    await waitFor(async () => {
        try {
            pid = Number(await readFile(join(options.cwd, 'nested'), 'utf8'));
            return true;
        } catch {
            return false;
        }
    });
    options.signals.emit('SIGTERM');
    assert.equal(await running, 130);
    await waitFor(() => {
        try {
            process.kill(pid, 0);
            return false;
        } catch (error) {
            return error.code === 'ESRCH';
        }
    });
});
