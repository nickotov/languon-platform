import assert from 'node:assert/strict';
import {
    chmod,
    mkdir,
    mkdtemp,
    readFile,
    rm,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
    mastraDevelopmentCommands,
    runMastraDevelopmentHarness,
} from './dev-mastra.mjs';

test('Mastra development command starts only required local infrastructure and workspaces', () => {
    assert.deepEqual(mastraDevelopmentCommands.infrastructure, [
        'docker',
        'compose',
        'up',
        '-d',
        '--wait',
        'postgres',
    ]);
    assert.equal(
        mastraDevelopmentCommands.studio.includes('--request-context-presets'),
        true,
    );
    assert.equal(mastraDevelopmentCommands.studio.includes('--root'), false);
    assert.equal(
        [
            ...mastraDevelopmentCommands.playground,
            ...mastraDevelopmentCommands.promptWatch,
            ...mastraDevelopmentCommands.studio,
        ].some((value) =>
            ['@languon/web', '@languon/admin', '@languon/mobile'].includes(
                value,
            ),
        ),
        false,
    );
});

test('Mastra orchestration requires the repository environment file', async () => {
    await assert.rejects(
        runMastraDevelopmentHarness({
            cwd: join(tmpdir(), 'missing-languon-mastra-environment'),
        }),
        /\.env\.local is required/,
    );
});

test('Mastra orchestration provisions first, injects its gate, propagates failure, and stops its sibling', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'languon-mastra-command-'));
    const binaries = join(directory, 'bin');
    const logFile = join(directory, 'commands.jsonl');
    const executable = `#!/usr/bin/env node
const { appendFileSync } = require('node:fs');
const { basename } = require('node:path');
const executable = basename(process.argv[1]);
const args = process.argv.slice(2);
const record = (event) => appendFileSync(process.env.MASTRA_TEST_LOG, JSON.stringify({ agentSignals: process.env.MASTRA_AGENT_SIGNALS, args, autoDetectUrl: process.env.MASTRA_AUTO_DETECT_URL, event, executable, gate: process.env.MASTRA_DEV_HARNESS, sentinel: process.env.MASTRA_TEST_SENTINEL, telemetryDisabled: process.env.MASTRA_TELEMETRY_DISABLED }) + '\\n');
record('start');
if (executable === 'docker' || args.includes('mastra:playground:provision')) process.exit(0);
if (args.includes('@languon/prompts')) process.exit(17);
process.on('SIGTERM', () => { record('SIGTERM'); process.exit(0); });
setInterval(() => {}, 1_000);
`;

    try {
        await writeFile(join(directory, '.env.local'), 'APP_ENV=test\n');
        await mkdir(binaries, { recursive: true });
        for (const name of ['docker', 'pnpm']) {
            const path = join(binaries, name);
            await writeFile(path, executable);
            await chmod(path, 0o755);
        }

        await assert.rejects(
            runMastraDevelopmentHarness({
                cwd: directory,
                environment: {
                    ...process.env,
                    MASTRA_DEV_HARNESS: 'false',
                    MASTRA_TEST_LOG: logFile,
                    MASTRA_TEST_SENTINEL: 'from-test',
                    PATH: `${binaries}:${process.env.PATH}`,
                },
            }),
            /@languon\/prompts.*exited unexpectedly with code 17/,
        );

        const records = (await readFile(logFile, 'utf8'))
            .trim()
            .split('\n')
            .map((line) => JSON.parse(line));
        assert.deepEqual(
            records.slice(0, 2).map(({ args, executable }) => ({
                args,
                executable,
            })),
            [
                {
                    args: ['compose', 'up', '-d', '--wait', 'postgres'],
                    executable: 'docker',
                },
                {
                    args: [
                        '--filter',
                        '@languon/backend',
                        'mastra:playground:provision',
                    ],
                    executable: 'pnpm',
                },
            ],
        );
        assert.equal(
            records.every(({ gate }) => gate === 'true'),
            true,
        );
        assert.equal(
            records.every(({ autoDetectUrl }) => autoDetectUrl === 'true'),
            true,
        );
        assert.equal(
            records.every(({ agentSignals }) => agentSignals === 'false'),
            true,
        );
        assert.equal(
            records.every(
                ({ telemetryDisabled }) => telemetryDisabled === 'true',
            ),
            true,
        );
        assert.equal(
            records.every(({ sentinel }) => sentinel === 'from-test'),
            true,
        );
        assert.equal(
            records.some(
                ({ args, event }) =>
                    args.includes('mastra') && event === 'SIGTERM',
            ),
            true,
        );
    } finally {
        await rm(directory, { force: true, recursive: true });
    }
});
