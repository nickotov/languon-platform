import assert from 'node:assert/strict';
import test from 'node:test';
import {
    flows,
    selectFlows,
    validateRegistry,
    assertPassingReport,
} from './registry.mjs';
import { infrastructure, assertFreePorts, execute } from './runtime.mjs';
import { browserCommand } from '../run-critical-flows.mjs';
import { createServer } from 'node:net';

test('registry is extensible, unique and rejects accidental empty or malformed selectors', () => {
    validateRegistry();
    assert.deepEqual(selectFlows(['--', '--list']), selectFlows(['--list']));
    assert.throws(() => validateRegistry([]));
    assert.throws(() => validateRegistry([flows[0], flows[0]]));
    assert.throws(() => selectFlows(['--flow', 'unknown']));
    assert.throws(() => selectFlows(['--flow']));
    assert.throws(() => selectFlows(['--config', 'arbitrary']));
    assert.deepEqual(
        selectFlows(['--flow', 'authentication']).map((flow) => flow.id),
        ['authentication'],
    );
});

const report = (
    status = 'passed',
    expectedStatus = 'passed',
    overall = 'expected',
) => ({
    suites: [
        {
            suites: [
                {
                    specs: [
                        {
                            tests: [
                                {
                                    expectedStatus,
                                    status: overall,
                                    results: [{ status }],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    ],
});
test('critical gate rejects zero, skipped, expected failure, flaky and interrupted tests', () => {
    assert.equal(assertPassingReport(report()), 1);
    assert.throws(
        () => assertPassingReport(report(), { minimumTests: 2 }),
        /missing required/,
    );
    for (const input of [
        { suites: [] },
        report('skipped', 'skipped'),
        report('failed', 'failed'),
        report('passed', 'passed', 'flaky'),
        report('interrupted'),
    ])
        assert.throws(() => assertPassingReport(input));
});

test('every environment points exclusively at dedicated loopback services and disables reuse', () => {
    for (const flow of flows) {
        const { env, ports } = infrastructure(flow);
        assert.equal(new URL(env.AUTH_E2E_DATABASE_URL).hostname, '127.0.0.1');
        assert.match(new URL(env.AUTH_E2E_DATABASE_URL).pathname, /test$/);
        assert.ok(!ports.includes(5432) && !ports.includes(6379));
        assert.equal(env.AUTH_E2E_REUSE_SERVERS, 'false');
        assert.equal(env.ADMIN_E2E_REUSE_SERVERS, 'false');
        assert.ok(browserCommand(flow).includes('--retries=0'));
    }
});

test('occupied ports fail rather than borrowing or stopping an existing server', async () => {
    const server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
        await assert.rejects(
            assertFreePorts([server.address().port]),
            /occupied/,
        );
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});

// Docker may print image-pull progress to stderr before returning an immutable ID.
test('captured stdout excludes stderr progress used by owned-container cleanup', async () => {
    const result = await execute(
        process.execPath,
        [
            '-e',
            "process.stderr.write('pull progress'); process.stdout.write('owned-id\\n')",
        ],
        { capture: true },
    );
    assert.equal(result, 'owned-id');
});

test('affected flow selection expands dependencies once and rejects missing or cyclic prerequisites', () => {
    assert.deepEqual(
        selectFlows(['--flow', 'text-generation']).map((flow) => flow.id),
        ['setup-to-generation', 'text-generation'],
    );
    assert.equal(
        selectFlows([]).filter((flow) => flow.id === 'setup-to-generation')
            .length,
        1,
    );
    assert.throws(
        () => validateRegistry([{ ...flows[0], dependsOn: ['absent'] }]),
        /Unknown/,
    );
    assert.throws(
        () => validateRegistry([{ ...flows[0], dependsOn: [flows[0].id] }]),
        /Cyclic/,
    );
});

test('actual merged environment rejects unsafe scenario overrides and strips inherited targets and credentials', async () => {
    const { createFlowEnvironment } = await import('./runtime.mjs');
    const context = { runId: 'test', report: '/tmp/report.json' };
    for (const key of [
        'DATABASE_URL',
        'AUTH_TEST_DATABASE_URL',
        'AUTH_E2E_REUSE_SERVERS',
        'DICTIONARY_GENERATION_PROVIDER_MODE',
        'DEEPSEEK_API_KEY',
    ]) {
        assert.throws(
            () =>
                createFlowEnvironment(
                    { ...flows[0], env: { [key]: 'unsafe' } },
                    context,
                ),
            /Unsafe/,
        );
    }
    const result = createFlowEnvironment(flows[0], context, {
        PATH: '/usr/bin',
        DATABASE_URL: 'postgres://production/',
        AUTH_E2E_REUSE_SERVERS: 'true',
        DEEPSEEK_API_KEY: 'must-not-propagate',
        DICTIONARY_GENERATION_PROVIDER_MODE: 'live',
    });
    assert.equal(result.DATABASE_URL, undefined);
    assert.equal(result.DEEPSEEK_API_KEY, undefined);
    assert.equal(result.AUTH_E2E_REUSE_SERVERS, 'false');
    assert.equal(result.DICTIONARY_GENERATION_PROVIDER_MODE, 'deterministic');
    assert.equal(result.ADMIN_E2E_SETUP_JOURNEY, 'true');
});

test('interruption prevents new work while allowing owned cleanup commands', async () => {
    const { setInterrupted } = await import('./runtime.mjs');
    setInterrupted(true);
    try {
        assert.throws(
            () => execute(process.execPath, ['-e', 'process.exit(0)']),
            /interrupted/,
        );
        await execute(process.execPath, ['-e', 'process.exit(0)'], {
            cleanup: true,
        });
    } finally {
        setInterrupted(false);
    }
});

test('actual cleanup path survives interruption and recovers an ID lost after container creation', async () => {
    const { cleanupOwned } = await import('../run-critical-flows.mjs');
    const { setInterrupted } = await import('./runtime.mjs');
    const id = 'a'.repeat(64);
    const calls = [];
    setInterrupted(true);
    try {
        await cleanupOwned([], {
            runId: 'owned-run',
            requested: ['owned-name'],
            run: async (command, args, options) => {
                assert.equal(options.cleanup, true);
                // Exercise the real execution guard while the run is interrupted.
                await execute(
                    process.execPath,
                    ['-e', 'process.exit(0)'],
                    options,
                );
                calls.push([command, args]);
                return args[0] === 'inspect' ? `${id} owned-run` : id;
            },
        });
        assert.deepEqual(calls.at(-1), ['docker', ['rm', '--force', id]]);
        await assert.rejects(
            cleanupOwned([], {
                runId: 'ours',
                requested: ['foreign'],
                run: async (_command, args) => {
                    assert.equal(args[0], 'inspect');
                    return `${id} not-ours`;
                },
            }),
            /could not all/,
        );
    } finally {
        setInterrupted(false);
    }
});
