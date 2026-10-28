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
    if (flow.app !== 'backend')
        throw new Error('Expected backend execution flow');
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

async function runFlow(flow, output, runId) {
    const infra = infrastructure(flow);
    await assertFreePorts(infra.ports);
    const owned = [];
    const requested = [];
    const report = resolve(output, `${flow.id}.json`);
    const env = createFlowEnvironment(flow, { runId, report });
    try {
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
            if (kind === 'postgres')
                args.push(
                    '--env',
                    'POSTGRES_USER=critical',
                    '--env',
                    'POSTGRES_PASSWORD=critical_test_only',
                    '--env',
                    `POSTGRES_DB=${infra.database}`,
                    'postgres:17-alpine',
                );
            else args.push('redis:7-alpine');
            requested.push(name);
            const id = await execute('docker', args, { capture: true });
            owned.push(id);
            let ready = false;
            for (let attempt = 0; attempt < 60; attempt++) {
                try {
                    await execute(
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
            if (!ready) throw new Error(`${kind} did not become ready`);
        }
        await execute(
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
        const count = (
            flow.app === 'backend'
                ? assertPassingBackendReport
                : assertPassingReport
        )(JSON.parse(await readFile(report, 'utf8')), flow);
        console.log(`[critical] ${flow.id}: ${count} passed, no skips`);
        return { id: flow.id, status: 'passed', tests: count };
    } finally {
        await cleanupOwned(owned, { runId, requested });
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
            if (label !== runId || !/^[a-f0-9]{64}$/.test(id))
                throw new Error(
                    `Cannot prove ownership of critical container ${name}`,
                );
            ids.add(id);
        } catch (error) {
            if (!/No such (?:container|object)/i.test(error.message))
                cleanupErrors.push(error);
        }
    }
    for (const id of [...ids].reverse()) {
        try {
            await run('docker', ['rm', '--force', '--volumes', id], {
                capture: true,
                cleanup: true,
            });
        } catch (error) {
            if (!/No such container/i.test(error.message))
                cleanupErrors.push(error);
        }
    }
    if (cleanupErrors.length)
        throw new AggregateError(
            cleanupErrors,
            'Owned critical-flow services could not all be removed; inspect the reported container IDs.',
        );
}

export async function main(args = process.argv.slice(2)) {
    validateRegistry();
    const selected = selectFlows(args);
    if (args.includes('--list')) {
        for (const flow of selected)
            console.log(
                `${flow.id}\t${flow.prerequisite}\t${flow.app === 'backend' ? flow.files.join(', ') : `${flow.file}: ${flow.grep}`}`,
            );
        return;
    }
    const runId = randomUUID();
    const output = resolve('test-results/critical-flows', runId);
    await mkdir(output, { recursive: true });
    console.log(`[critical] Evidence: ${output}`);
    const results = [];
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
            await execute('pnpm', [
                'exec',
                'turbo',
                'run',
                'build',
                '--filter=@languon/contracts',
                '--filter=@languon/database',
                '--filter=@languon/languages',
                '--filter=@languon/prompts',
            ]);
            for (const flow of selected) {
                try {
                    results.push(await runFlow(flow, output, runId));
                } catch (error) {
                    results.push({
                        id: flow.id,
                        status: 'failed',
                        error: error.message,
                    });
                    throw error;
                } finally {
                    await writeFile(
                        resolve(output, 'summary.json'),
                        JSON.stringify(
                            {
                                selected: selected.map((flow) => flow.id),
                                results,
                            },
                            null,
                            2,
                        ),
                    );
                }
            }
        });
        assertNotInterrupted();
    } finally {
        process.off('SIGINT', interrupt);
        process.off('SIGTERM', interrupt);
        setInterrupted(false);
        await rm(lock, { recursive: true });
    }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
