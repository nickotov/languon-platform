import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
    generateDashboard,
    parseHistory,
    renderDashboard,
} from './dashboard.mjs';
import {
    PROFILE_SCHEMA_VERSION,
    appendJsonLine,
    comparability,
    normalizeContainerStats,
    parseByteSize,
    percentile,
    summarizeLoad,
    summarizeSamples,
    thresholdFlags,
    unavailableBuildPeak,
    validateObservation,
} from './lib.mjs';
import { assertLocalDocker, parseArguments } from './profile.mjs';
import { createResourceRuntime } from './runtime.mjs';

function observation(overrides = {}) {
    return {
        schemaVersion: PROFILE_SCHEMA_VERSION,
        recordedAt: '2026-08-18T12:00:00.000Z',
        revision: 'a'.repeat(40),
        dirty: false,
        profileVersion: 'production-v1',
        configFingerprint: 'config-1',
        host: { id: 'host-1', diskUsedPercent: 40 },
        builds: [{ service: 'web', durationMs: 1_000, imageSizeBytes: 10_000 }],
        runtime: {},
        comparability: { comparable: false, reason: 'no-previous-observation' },
        flags: [],
        ...overrides,
    };
}

test('normalizes Docker units and container stats', () => {
    assert.equal(parseByteSize('1.5GiB'), 1.5 * 1024 ** 3);
    assert.equal(parseByteSize('250 MB'), 250_000_000);
    assert.equal(parseByteSize('invalid'), null);
    assert.deepEqual(
        normalizeContainerStats([
            {
                Name: 'web',
                CPUPerc: '12.50%',
                MemUsage: '128MiB / 1GiB',
                MemPerc: '12.5%',
            },
        ]),
        [
            {
                service: 'web',
                cpuPercent: 12.5,
                memoryBytes: 128 * 1024 ** 2,
                memoryPercent: 12.5,
            },
        ],
    );
});

test('does not attribute unrelated container usage to BuildKit resource peak', () => {
    assert.deepEqual(unavailableBuildPeak(), {
        buildPeakCpuPercent: null,
        buildPeakMemoryBytes: null,
        buildPeakAvailable: false,
        buildPeakUnavailableReason:
            'Docker BuildKit does not expose build-scoped CPU/RSS portably; unrelated containers are not sampled.',
    });
});

test('summarizes resource samples and HTTP load deterministically', () => {
    const resources = summarizeSamples([
        {
            containers: [
                {
                    service: 'web',
                    cpuPercent: 10,
                    memoryBytes: 100,
                    memoryPercent: 2,
                },
            ],
        },
        {
            containers: [
                {
                    service: 'web',
                    cpuPercent: 40,
                    memoryBytes: 120,
                    memoryPercent: 3,
                },
            ],
        },
    ]);
    assert.equal(resources.cpuPeakPercent, 40);
    assert.equal(resources.memoryPeakBytes, 120);
    assert.equal(percentile([4, 1, 3, 2], 95), 4);
    assert.deepEqual(
        summarizeLoad(
            [
                { ok: true, latencyMs: 10 },
                { ok: false, latencyMs: 30 },
            ],
            1_000,
        ),
        {
            requests: 2,
            errors: 1,
            errorRatePercent: 50,
            requestsPerSecond: 2,
            latencyMs: { p50: 10, p95: 30, p99: 30, max: 30 },
        },
    );
});

test('marks threshold regressions across runtime phases and disk', () => {
    const current = observation({
        host: { id: 'host-1', diskUsedPercent: 71 },
        runtime: {
            load: {
                resources: { cpuPeakPercent: 71, memoryPeakPercent: 20 },
                load: { errorRatePercent: 0.2, latencyMs: { p95: 1_100 } },
            },
        },
    });
    assert.deepEqual(thresholdFlags(current), [
        'load.cpu',
        'load.errors',
        'load.latency-p95',
        'host.disk',
    ]);
});

test('requires the same profile, config, and host for comparisons', () => {
    const previous = observation();
    assert.deepEqual(comparability(observation(), previous), {
        comparable: true,
        reason: 'same-profile-and-host',
    });
    assert.equal(
        comparability(observation({ host: { id: 'host-2' } }), previous).reason,
        'host-fingerprint-changed',
    );
    assert.equal(
        comparability(observation({ configFingerprint: 'config-2' }), previous)
            .reason,
        'profile-config-changed',
    );
    assert.equal(
        comparability(observation({ dirty: true }), previous).reason,
        'dirty-worktree',
    );
});

test('validates and appends one normalized observation per JSONL line', () => {
    const value = observation();
    assert.equal(validateObservation(value), value);
    const text = appendJsonLine('', value);
    assert.equal(parseHistory(text).length, 1);
    assert.throws(
        () => parseHistory(`${text}{"schemaVersion":99}\n`),
        /line 2/,
    );
});

test('renders a self-contained CSP dashboard without embedding executable history', async () => {
    const maliciousRevision = '</script><script>alert(1)</script>';
    const html = renderDashboard([
        observation({ revision: maliciousRevision }),
    ]);
    assert.match(html, /Content-Security-Policy/);
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.doesNotMatch(html, /https?:\/\//);

    const directory = await mkdtemp(
        join(tmpdir(), 'languon-resource-dashboard-'),
    );
    const historyPath = join(directory, 'history.jsonl');
    const outputPath = join(directory, 'dashboard.html');
    await import('node:fs/promises').then(({ writeFile }) =>
        writeFile(historyPath, `${JSON.stringify(observation())}\n`),
    );
    const result = await generateDashboard({ historyPath, outputPath });
    assert.equal(result.observations, 1);
    assert.match(
        await readFile(outputPath, 'utf8'),
        /Languon resource profile/,
    );
});

test('parses explicit record, build-only, and build-cache options', () => {
    assert.deepEqual(
        parseArguments(['--record', '--build-only', '--reuse-build-cache']),
        {
            record: true,
            buildOnly: true,
            reuseBuildCache: true,
        },
    );
});

test('resource profiling refuses remote Docker engines', () => {
    assert.throws(
        () =>
            assertLocalDocker(
                () => ({ stdout: 'unix:///var/run/docker.sock\n' }),
                { DOCKER_HOST: 'tcp://shared:2375' },
            ),
        /Unset DOCKER_HOST/,
    );
    assert.throws(
        () => assertLocalDocker(() => ({ stdout: 'ssh://shared\n' }), {}),
        /non-local Docker endpoint/,
    );
    assert.doesNotThrow(() =>
        assertLocalDocker(
            () => ({ stdout: 'unix:///var/run/docker.sock\n' }),
            {},
        ),
    );
});

test('uses isolated stage Compose projects for steady and overlap phases', async () => {
    const directory = await mkdtemp(
        join(tmpdir(), 'languon-resource-runtime-'),
    );
    const calls = [];
    const runtime = createResourceRuntime({
        run(command, args, options) {
            calls.push({ command, args, options });
            if (command === 'openssl') {
                writeFileSync(args[args.indexOf('-keyout') + 1], 'test-key');
                writeFileSync(args[args.indexOf('-out') + 1], 'test-cert');
            }
            return { status: 0, stdout: '', stderr: '' };
        },
        repositoryRoot: '/repository',
        rawDirectory: directory,
        config: {
            builds: ['backend', 'web', 'admin', 'migrator'].map((service) => ({
                service,
                image: `profile/${service}:local`,
            })),
            runtime: {
                projectName: 'isolated-profile',
                releaseSha: 'a'.repeat(40),
            },
        },
    });

    await runtime.prepare();
    runtime.overlap();
    runtime.cleanup();

    const commandText = calls
        .map(({ command, args }) => `${command} ${args.join(' ')}`)
        .join('\n');
    assert.match(
        commandText,
        /--project-name isolated-profile-blue up --detach --wait/,
    );
    assert.match(
        commandText,
        /--project-name isolated-profile-green up --detach --wait/,
    );
    assert.match(commandText, /stage-data\.compose\.yaml/);
    assert.match(commandText, /edge\.compose\.yaml/);
    assert.match(commandText, /down --volumes --remove-orphans/);
    assert.doesNotMatch(
        commandText,
        /resource-profile-only-not-a-production-secret/,
    );

    const upstream = await readFile(
        join(directory, 'nginx/active-upstream.conf'),
        'utf8',
    );
    assert.match(upstream, /server blue-backend:4000/);
});
