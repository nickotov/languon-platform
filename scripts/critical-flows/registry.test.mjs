import assert from 'node:assert/strict';
import test from 'node:test';
import {
    flows,
    selectFlows,
    validateRegistry,
    assertPassingReport,
    assertPassingBackendReport,
    backendExecutionFiles,
    backendExecutionGroups,
    requiredBackendScenarios,
} from './registry.mjs';
import { infrastructure, assertFreePorts, execute } from './runtime.mjs';
import {
    browserCommand,
    backendCommand,
    executionPlan,
    measurePhase,
    runFlow,
} from '../run-critical-flows.mjs';
import { createServer } from 'node:net';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

test('sentence practice uses the reviewed deterministic sentence worker', () => {
    const [flow] = selectFlows(['--flow', 'sentence-practice']);
    assert.equal(flow.file, 'sentence-practice.journeys.spec.ts');
    assert.equal(flow.env.AUTH_E2E_SENTENCE_SERVICES, 'true');
    assert.equal(flow.minimumTests, 2);
    assert.deepEqual(browserCommand(flow).slice(-4), [
        '--grep',
        flow.grep,
        '--retries=0',
        '--reporter=list,json',
    ]);
});

test('dictionary search selects only its bounded store or browser regression', () => {
    const [browser] = selectFlows(['--flow', 'dictionary-card-search']);
    assert.equal(browser.app, 'web');
    assert.equal(browser.minimumTests, 1);
    assert.equal(browser.file, 'dictionary-platform.journeys.spec.ts');
    assert.equal(
        browser.grep,
        'owner searches dictionary cards without losing focus$',
    );

    const [store] = selectFlows(['--flow', 'dictionary-card-search-store']);
    assert.equal(store.app, 'backend');
    assert.equal(store.minimumTests, 5);
    assert.deepEqual(store.files, [
        'tests/integration/modules/dictionaries/infrastructure/drizzle-dictionary-search.test.ts',
    ]);
});

test('dictionary chat snippets select one real assistant browser journey without unrelated execution groups', () => {
    const selected = selectFlows(['--flow', 'dictionary-chat-snippets']);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].app, 'assistant');
    assert.equal(selected[0].file, 'contextual-assistant.journeys.spec.ts');
    assert.equal(selected[0].minimumTests, 1);
    assert.equal(
        selected[0].grep,
        'owned dictionary chat snippets preserve review, ordered reusable insertion and archival replacement$',
    );

    assert.match(
        'chromium contextual-assistant.journeys.spec.ts owned dictionary chat snippets preserve review, ordered reusable insertion and archival replacement',
        new RegExp(selected[0].grep),
    );

    assert.ok(
        browserCommand(selected[0]).includes(
            'tests/e2e/support/contextual-assistant-playwright.config.ts',
        ),
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
    ]) {
        assert.throws(() => assertPassingReport(input));
    }
});

test('every environment points exclusively at dedicated loopback services and disables reuse', () => {
    for (const flow of flows) {
        const { env, ports } = infrastructure(flow);
        assert.equal(new URL(env.AUTH_E2E_DATABASE_URL).hostname, '127.0.0.1');
        assert.match(new URL(env.AUTH_E2E_DATABASE_URL).pathname, /test$/);
        assert.ok(!ports.includes(5432) && !ports.includes(6379));
        assert.equal(env.AUTH_E2E_REUSE_SERVERS, 'false');
        assert.equal(env.ADMIN_E2E_REUSE_SERVERS, 'false');
        if (flow.app === 'backend') {
            assert.ok(
                backendCommand(flow, '/tmp/report.json').includes('--retry=0'),
            );

            assert.match(
                new URL(env.AUTH_TEST_DATABASE_URL).pathname,
                /^\/languon_auth_.*_test$/,
            );
        } else {
            assert.ok(browserCommand(flow).includes('--retries=0'));
        }
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

        assert.deepEqual(calls.at(-1), [
            'docker',
            ['rm', '--force', '--volumes', id],
        ]);

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

const backendFlow = flows.find((flow) => flow.app === 'backend');
// Synthetic valid reports follow file identity, so adding a required suite cannot
// silently shift counts onto another file or erase its mandatory scenario titles.
const backendSuiteCounts = backendExecutionFiles.map((file) =>
    Math.max(
        10,
        requiredBackendScenarios.find((scenario) => scenario.file === file)
            ?.titles.length ?? 0,
    ),
);
const backendTestTotal = backendSuiteCounts.reduce(
    (sum, count) => sum + count,
    0,
);
const backendReport = () => ({
    success: true,
    numTotalTests: backendTestTotal,
    numPassedTests: backendTestTotal,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    numFailedTestSuites: 0,
    numPendingTestSuites: 0,
    testResults: backendExecutionFiles.map((file, index) => ({
        name: new URL(`../../apps/backend/${file}`, import.meta.url).pathname,
        status: 'passed',
        message: '',
        assertionResults: Array.from(
            { length: backendSuiteCounts[index] },
            (_, testIndex) => ({
                title:
                    requiredBackendScenarios.find(
                        (scenario) => scenario.file === file,
                    )?.titles[testIndex] ?? `synthetic-test-${testIndex}`,
                status: 'passed',
                failureMessages: [],
                meta: {
                    criticalRetryCount: 0,
                    criticalRepeatCount: 0,
                    criticalExpectedFailure: false,
                },
            }),
        ),
    })),
});

test('backend gate is in the full registry, runs exact real execution suites serially and rejects altered paths', () => {
    assert.ok(selectFlows([]).includes(backendFlow));
    assert.deepEqual(selectFlows(['--flow', backendFlow.id]), [backendFlow]);
    const command = backendCommand(backendFlow, '/tmp/evidence.json');
    for (const file of backendExecutionFiles) {
        assert.ok(command.includes(file));
    }

    assert.ok(command.includes('--no-file-parallelism'));
    assert.ok(command.includes('--hookTimeout=30000'));
    assert.ok(
        !command.some((argument) => argument.startsWith('--testTimeout')),
    );

    assert.ok(command.includes('--retry=0'));
    assert.ok(!command.includes('--grep') && !command.includes('-t'));
    for (const mutation of [
        { files: backendFlow.files.slice(1) },
        { files: [...backendFlow.files.slice(1), '../arbitrary.test.ts'] },
        { files: [...backendFlow.files, backendFlow.files[0]] },
        { env: { DATABASE_URL: 'unsafe' } },
        { grep: 'one test' },
    ]) {
        assert.throws(() =>
            validateRegistry([{ ...backendFlow, ...mutation }]),
        );
    }
});

test('Vitest evidence must contain every exact required suite, no zero, skips, todos, retries or incomplete results', () => {
    assert.equal(
        assertPassingBackendReport(backendReport(), backendFlow),
        backendTestTotal,
    );

    const variants = [
        (report) => {
            report.testResults[0].assertionResults.pop();
        },
        (report) => {
            report.testResults = [];
        },
        (report) => {
            report.testResults.pop();
        },
        (report) => {
            report.testResults[0].name = '/tmp/unexpected.test.ts';
        },
        (report) => {
            report.testResults[1].name = report.testResults[0].name;
        },
        (report) => {
            report.numTotalTests = 0;
            report.numPassedTests = 0;
        },
        (report) => {
            report.numPendingTests = 1;
        },
        (report) => {
            report.numTodoTests = 1;
        },
        (report) => {
            report.numFailedTestSuites = 1;
        },
        (report) => {
            report.numPassedTests = 51;
        },
        (report) => {
            report.testResults[0].assertionResults[0].status = 'skipped';
        },
        (report) => {
            report.testResults[0].assertionResults[0].meta.criticalRetryCount = 1;
        },
        (report) => {
            report.testResults[0].assertionResults[0].meta = {};
        },
        (report) => {
            report.testResults[0].assertionResults[0].meta.criticalExpectedFailure = true;
        },
        (report) => {
            report.testResults[0].assertionResults = [];
        },
    ];

    for (const change of variants) {
        const report = backendReport();
        change(report);
        assert.throws(
            () => assertPassingBackendReport(report, backendFlow),
            /did not pass cleanly/,
        );
    }
});

test('retry reporter preserves real retry metadata for the JSON gate', async () => {
    const { default: RetryReporter } =
        await import('./backend-retry-reporter.mjs');
    const task = {
        fails: true,
        meta: {},
        result: { retryCount: 1, repeatCount: 0 },
    };

    new RetryReporter().onTestCaseResult({ task });
    assert.deepEqual(task.meta, {
        criticalRetryCount: 1,
        criticalRepeatCount: 0,
        criticalExpectedFailure: true,
    });
});

test('backend gate rejects a removed completion regression despite a passing aggregate count', () => {
    const report = backendReport();
    const required = requiredBackendScenarios[0];
    const result = report.testResults.find((entry) =>
        entry.name.endsWith(required.file),
    );

    result.assertionResults[0].title = 'unrelated passing admission test';
    assert.throws(
        () => assertPassingBackendReport(report, backendFlow),
        /did not pass cleanly/,
    );
});

test('backend gate requires both private sentence generation policy versions', () => {
    for (const version of [1, 2]) {
        const report = backendReport();
        const result = report.testResults.find((entry) =>
            entry.name.endsWith('knowledge-sentence-paid.database.test.ts'),
        );
        const title = `uses the existing provider and financial engine for private generation v${version} and answer feedback`;
        assert.ok(
            result.assertionResults.some((entry) => entry.title === title),
        );

        result.assertionResults.find((entry) => entry.title === title).title =
            'unrelated passing policy test';

        assert.throws(
            () => assertPassingBackendReport(report, backendFlow),
            /did not pass cleanly/,
        );
    }
});

test('speech playback requires real backend speech execution, not browser fixtures alone', () => {
    const selected = selectFlows(['--flow', 'speech-playback']);
    assert.deepEqual(
        selected.map((flow) => flow.id),
        ['ai-speech', 'speech-playback'],
    );

    assert.equal(selected[1].minimumTests, 4);
    assert.ok(
        backendExecutionFiles.includes(
            'tests/integration/modules/speech/openrouter-speech-execution.test.ts',
        ),
    );

    const report = backendReport();
    const speech = report.testResults.find((file) =>
        file.name.endsWith('openrouter-speech-execution.test.ts'),
    );

    speech.assertionResults[0].title = 'only queues a speech job';
    assert.throws(
        () => assertPassingBackendReport(report, backendFlow),
        /did not pass cleanly/,
    );
});

test('AI seams partition all retained suites and stay narrow with reviewed exact commands', () => {
    const seen = new Set();
    for (const [seam, files] of Object.entries(backendExecutionGroups)) {
        const [flow] = selectFlows(['--flow', `ai-${seam}`]);
        assert.deepEqual(flow.files, files);
        assert.deepEqual(
            backendCommand(flow, '/tmp/report.json').filter((arg) =>
                arg.endsWith('.test.ts'),
            ),
            files,
        );

        for (const file of files) {
            assert.ok(!seen.has(file), `duplicate suite: ${file}`);
            seen.add(file);
        }

        assert.throws(() =>
            backendCommand(
                { ...flow, files: files.slice(1) },
                '/tmp/report.json',
            ),
        );

        assert.throws(() =>
            backendCommand({ ...flow, minimumTests: 1 }, '/tmp/report.json'),
        );
    }

    assert.deepEqual([...seen], backendExecutionFiles);
    assert.equal(seen.size, 86);
    assert.deepEqual(
        selectFlows([])
            .filter((flow) => flow.app === 'backend')
            .map((flow) => flow.id),
        ['ai-execution-contracts', 'dictionary-card-search-store'],
    );

    assert.deepEqual(
        selectFlows([
            '--flow',
            'ai-speech',
            '--flow',
            'ai-execution-contracts',
        ]).map((flow) => flow.id),
        ['ai-execution-contracts'],
    );

    assert.ok(
        selectFlows(['--list']).some((flow) => flow.id === 'ai-conversation'),
    );
});

function reportForFlow(flow) {
    const report = backendReport();
    report.testResults = report.testResults.filter((entry) =>
        flow.files.some((file) => entry.name.endsWith(file)),
    );

    report.numTotalTests = report.numPassedTests = report.testResults.reduce(
        (sum, entry) => sum + entry.assertionResults.length,
        0,
    );

    return report;
}

test('each seam enforces its incident scenarios without demanding unrelated suites', () => {
    for (const seam of Object.keys(backendExecutionGroups)) {
        const [flow] = selectFlows(['--flow', `ai-${seam}`]);
        const report = reportForFlow(flow);
        assert.equal(
            assertPassingBackendReport(report, flow),
            report.numTotalTests,
        );

        const required = requiredBackendScenarios.find((entry) =>
            flow.files.includes(entry.file),
        );

        assert.ok(required, `missing retained incident coverage for ${seam}`);
        const result = report.testResults.find((entry) =>
            entry.name.endsWith(required.file),
        );

        result.assertionResults[0].title = 'unrelated passing case';
        assert.throws(
            () => assertPassingBackendReport(report, flow),
            /did not pass cleanly/,
        );
    }
});

test('plans expand prerequisites and make comprehensive versus narrow execution explicit', () => {
    const plan = executionPlan(
        selectFlows(['--plan', '--flow', 'speech-playback']),
    );

    assert.equal(plan.scope, 'selected-flows');
    assert.deepEqual(
        plan.flows.map((flow) => flow.id),
        ['ai-speech', 'speech-playback'],
    );

    assert.deepEqual(plan.flows[0].files, backendExecutionGroups.speech);
    assert.ok(plan.flows.every((flow) => flow.command[0] === 'pnpm'));
    assert.equal(executionPlan(selectFlows(['--plan'])).scope, 'comprehensive');
    assert.throws(() => selectFlows(['--plan', '--flow']), /Usage/);
});

test('a backend aggregate plus a browser subset is not a comprehensive plan', () => {
    for (const args of [
        ['--flow', 'ai-execution-contracts'],
        ['--flow', 'ai-execution-contracts', '--flow', 'speech-playback'],
    ]) {
        assert.equal(executionPlan(selectFlows(args)).scope, 'selected-flows');
    }

    const full = selectFlows([]);
    assert.equal(executionPlan([...full].reverse()).scope, 'comprehensive');
    assert.equal(executionPlan(full.slice(1)).scope, 'selected-flows');
});

test('phase timing survives failure and preserves the original error', async () => {
    const timings = {};
    let tick = 10;
    const error = new Error('phase failed');
    await assert.rejects(
        measurePhase(
            timings,
            'setupMs',
            async () => {
                throw error;
            },
            () => (tick += 20),
        ),
        (actual) => actual === error,
    );

    assert.equal(timings.setupMs, 20);
});

test('runner records setup, execution and cleanup on successful and failed selections', async () => {
    const [flow] = selectFlows(['--flow', 'ai-conversation']);
    for (const failure of [undefined, 'setup', 'execution', 'cleanup']) {
        const timings = {};
        let cleaned = false;
        const promise = runFlow(
            flow,
            '/tmp/critical-evidence',
            'synthetic-run',
            {
                timings,
                checkPorts: async () => {
                    if (failure === 'setup') {
                        throw new Error('setup failed');
                    }
                },
                run: async (command) => {
                    if (command === 'pnpm' && failure === 'execution') {
                        throw new Error('execution failed');
                    }

                    return 'a'.repeat(64);
                },
                cleanup: async () => {
                    cleaned = true;
                    if (failure === 'cleanup') {
                        throw new Error('cleanup failed');
                    }
                },
                loadReport: async () => JSON.stringify(reportForFlow(flow)),
            },
        );

        if (failure) {
            await assert.rejects(promise, new RegExp(`${failure} failed`));
        } else {
            assert.equal((await promise).status, 'passed');
        }

        assert.ok(cleaned);
        for (const phase of [
            'setupMs',
            'cleanupMs',
            'totalMs',
            ...(failure === 'setup' ? [] : ['executionMs']),
        ]) {
            assert.ok(
                Number.isInteger(timings[phase]) && timings[phase] >= 0,
                phase,
            );
        }

        if (failure === 'setup') {
            assert.equal(timings.executionMs, undefined);
        }
    }
});

test('CLI dry runs never build, acquire locks or create evidence with or without selectors', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'critical-plan-'));
    const runner = fileURLToPath(
        new URL('../run-critical-flows.mjs', import.meta.url),
    );

    try {
        for (const args of [
            ['--plan'],
            ['--', '--plan', '--flow', 'ai-conversation'],
        ]) {
            const output = await execute(process.execPath, [runner, ...args], {
                cwd,
                capture: true,
                env: {},
            });
            const plan = JSON.parse(output);
            assert.equal(
                plan.scope,
                args.includes('--flow') ? 'selected-flows' : 'comprehensive',
            );

            assert.deepEqual(await readdir(cwd), []);
        }

        await assert.rejects(
            execute(process.execPath, [runner, '--plan', '--list'], {
                cwd,
                capture: true,
                env: {},
            }),
            /Choose --list or --plan/,
        );

        assert.deepEqual(await readdir(cwd), []);
    } finally {
        await rm(cwd, { recursive: true, force: true });
    }
});
