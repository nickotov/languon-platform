import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import {
    selectFlows,
    validateRegistry,
    assertPassingReport,
    assertPassingBackendReport,
} from './critical-flows/registry.mjs';
import {
    execute,
    assertFreePorts,
    infrastructure,
    createFlowEnvironment,
    setInterrupted,
    assertNotInterrupted,
} from './critical-flows/runtime.mjs';
import { withPreservedFile } from './run-contextual-assistant-e2e.mjs';

export function browserCommand(flow) {
    const configs = {
        texts: 'texts',
        assistant: 'contextual-assistant',
        portrait: 'learner-portrait',
    };

    return [
        '--filter',
        `@languon/${flow.app === 'admin' ? 'admin' : 'web'}`,
        'exec',
        'playwright',
        'test',
        ...(configs[flow.app]
            ? [
                  '--config',
                  `tests/e2e/support/${configs[flow.app]}-playwright.config.ts`,
              ]
            : []),
        flow.file,
        '--grep',
        flow.grep,
        '--retries=0',
        '--reporter=list,json',
    ];
}

export function backendCommand(flow, report) {
    validateRegistry([flow]);
    if (flow.app !== 'backend') {
        throw new Error('Expected backend execution flow');
    }

    return [
        '--filter',
        '@languon/backend',
        'exec',
        'vitest',
        'run',
        ...flow.files,
        '--no-file-parallelism',
        // Disposable setup replays the complete financial migration history.
        '--hookTimeout=30000',
        '--retry=0',
        '--reporter=default',
        '--reporter=../../scripts/critical-flows/backend-retry-reporter.mjs',
        '--reporter=json',
        `--outputFile=${report}`,
    ];
}

export async function measurePhase(
    timings,
    phase,
    action,
    now = () => performance.now(),
) {
    const start = now();
    try {
        return await action();
    } finally {
        timings[phase] = Math.round(now() - start);
    }
}

export function executionPlan(selected) {
    const fullIds = new Set(selectFlows([]).map((flow) => flow.id));
    const selectedIds = new Set(selected.map((flow) => flow.id));
    const comprehensive =
        selectedIds.size === fullIds.size &&
        [...fullIds].every((id) => selectedIds.has(id));

    return {
        scope: comprehensive ? 'comprehensive' : 'selected-flows',
        flows: selected.map((flow) => ({
            id: flow.id,
            prerequisite: flow.prerequisite,
            minimumTests: flow.minimumTests,
            files: flow.app === 'backend' ? flow.files : [flow.file],
            command: [
                'pnpm',
                ...(flow.app === 'backend'
                    ? backendCommand(flow, `<evidence>/${flow.id}.json`)
                    : browserCommand(flow)),
            ],
        })),
    };
}

export async function runFlow(
    flow,
    output,
    runId,
    {
        timings = {},
        run = execute,
        checkPorts = assertFreePorts,
        cleanup = cleanupOwned,
        loadReport = readFile,
    } = {},
) {
    const infra = infrastructure(flow);
    const owned = [];
    const requested = [];
    const report = resolve(output, `${flow.id}.json`);
    const env = createFlowEnvironment(flow, { runId, report });
    const started = performance.now();
    try {
        await measurePhase(timings, 'setupMs', async () => {
            await checkPorts(infra.ports);
            for (const kind of ['postgres', 'redis']) {
                const name = `languon-critical-${runId}-${kind}`;
                const args = [
                    'run',
                    '--detach',
                    '--rm',
                    '--name',
                    name,
                    '--label',
                    `languon.critical-run=${runId}`,
                    '--publish',
                    `127.0.0.1:${kind === 'postgres' ? infra.pg : infra.redis}:${kind === 'postgres' ? 5432 : 6379}`,
                ];

                if (kind === 'postgres') {
                    args.push(
                        '--env',
                        'POSTGRES_USER=critical',
                        '--env',
                        'POSTGRES_PASSWORD=critical_test_only',
                        '--env',
                        `POSTGRES_DB=${infra.database}`,
                        'postgres:17-alpine',
                    );
                } else {
                    args.push('redis:7-alpine');
                }

                requested.push(name);
                const id = await run('docker', args, { capture: true });
                owned.push(id);
                let ready = false;
                for (let attempt = 0; attempt < 60; attempt++) {
                    try {
                        await run(
                            'docker',
                            [
                                'exec',
                                id,
                                ...(kind === 'postgres'
                                    ? [
                                          'pg_isready',
                                          '-U',
                                          'critical',
                                          '-d',
                                          infra.database,
                                      ]
                                    : ['redis-cli', 'ping']),
                            ],
                            { capture: true },
                        );

                        ready = true;
                        break;
                    } catch {
                        assertNotInterrupted();
                        await delay(500);
                    }
                }

                if (!ready) {
                    throw new Error(`${kind} did not become ready`);
                }
            }
        });

        const count = await measurePhase(timings, 'executionMs', async () => {
            await run(
                'pnpm',
                flow.app === 'backend'
                    ? backendCommand(flow, report)
                    : [
                          ...browserCommand(flow),
                          '--output',
                          resolve(output, `${flow.id}-artifacts`),
                      ],
                { env },
            );

            return (
                flow.app === 'backend'
                    ? assertPassingBackendReport
                    : assertPassingReport
            )(JSON.parse(await loadReport(report, 'utf8')), flow);
        });

        console.log(`[critical] ${flow.id}: ${count} passed, no skips`);

        return { id: flow.id, status: 'passed', tests: count, timings };
    } finally {
        try {
            await measurePhase(timings, 'cleanupMs', () =>
                cleanup(owned, { runId, requested }),
            );
        } finally {
            timings.totalMs = Math.round(performance.now() - started);
        }
    }
}

export async function cleanupOwned(
    owned,
    { run = execute, runId, requested = [] } = {},
) {
    const cleanupErrors = [];
    const ids = new Set(owned);
    // docker run can create a container before an interrupt prevents returning its ID.
    // Resolve only this invocation's unpredictable requested names and verify their label.
    for (const name of requested) {
        try {
            const details = await run(
                'docker',
                [
                    'inspect',
                    '--type',
                    'container',
                    '--format',
                    '{{.Id}} {{index .Config.Labels "languon.critical-run"}}',
                    name,
                ],
                { capture: true, cleanup: true },
            );
            const [id, label] = details.trim().split(/\s+/u);
            if (label !== runId || !/^[a-f0-9]{64}$/.test(id)) {
                throw new Error(
                    `Cannot prove ownership of critical container ${name}`,
                );
            }

            ids.add(id);
        } catch (error) {
            if (!/No such (?:container|object)/i.test(error.message)) {
                cleanupErrors.push(error);
            }
        }
    }

    for (const id of [...ids].reverse()) {
        try {
            await run('docker', ['rm', '--force', '--volumes', id], {
                capture: true,
                cleanup: true,
            });
        } catch (error) {
            if (!/No such container/i.test(error.message)) {
                cleanupErrors.push(error);
            }
        }
    }

    if (cleanupErrors.length) {
        throw new AggregateError(
            cleanupErrors,
            'Owned critical-flow services could not all be removed; inspect the reported container IDs.',
        );
    }
}

export async function main(args = process.argv.slice(2)) {
    validateRegistry();
    const selected = selectFlows(args);
    if (args.includes('--plan')) {
        console.log(JSON.stringify(executionPlan(selected), null, 2));

        return;
    }

    if (args.includes('--list')) {
        for (const flow of selected) {
            console.log(
                `${flow.id}\t${flow.prerequisite}\t${flow.app === 'backend' ? flow.files.join(', ') : `${flow.file}: ${flow.grep}`}`,
            );
        }

        return;
    }

    const runId = randomUUID();
    const output = resolve('test-results/critical-flows', runId);
    await mkdir(output, { recursive: true });
    console.log(`[critical] Evidence: ${output}`);
    const results = [];
    const started = performance.now();
    const timings = {};
    let status = 'failed';
    const lock = resolve('test-results/critical-flows/.runner-lock');
    try {
        await mkdir(lock);
    } catch {
        throw new Error(
            'Another critical runner owns the workspace lock. If a process was forcibly killed, verify it has stopped before removing test-results/critical-flows/.runner-lock.',
        );
    }

    const interrupt = () => setInterrupted(true);
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', interrupt);
    try {
        await withPreservedFile(resolve('apps/web/next-env.d.ts'), async () => {
            // Build workspace dependencies once before starting any app server.
            await measurePhase(timings, 'buildMs', () =>
                execute('pnpm', [
                    'exec',
                    'turbo',
                    'run',
                    'build',
                    '--filter=@languon/contracts',
                    '--filter=@languon/database',
                    '--filter=@languon/languages',
                    '--filter=@languon/prompts',
                ]),
            );

            for (const flow of selected) {
                const flowTimings = {};
                try {
                    results.push(
                        await runFlow(flow, output, runId, {
                            timings: flowTimings,
                        }),
                    );
                } catch (error) {
                    results.push({
                        id: flow.id,
                        status: 'failed',
                        error: error.message,
                        timings: flowTimings,
                    });

                    throw error;
                } finally {
                    await writeFile(
                        resolve(output, 'summary.json'),
                        JSON.stringify(
                            {
                                status: 'incomplete',
                                selected: selected.map((entry) => entry.id),
                                results,
                                timings,
                            },
                            null,
                            2,
                        ),
                    );
                }
            }
        });

        assertNotInterrupted();
        status = 'passed';
    } finally {
        process.off('SIGINT', interrupt);
        process.off('SIGTERM', interrupt);
        setInterrupted(false);
        await rm(lock, { recursive: true });
        timings.totalMs = Math.round(performance.now() - started);
        await writeFile(
            resolve(output, 'summary.json'),
            JSON.stringify(
                {
                    status,
                    selected: selected.map((flow) => flow.id),
                    results,
                    timings,
                },
                null,
                2,
            ),
        );

        console.log(
            `[critical] ${status} in ${timings.totalMs}ms (build ${timings.buildMs ?? 0}ms)`,
        );
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
