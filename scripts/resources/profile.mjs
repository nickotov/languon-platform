#!/usr/bin/env node
import { createWriteStream, existsSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { Agent, request as httpsRequest } from 'node:https';

import { resourceProfileConfig } from './config.mjs';
import {
    defaultDashboardPath,
    defaultHistoryPath,
    parseHistory,
    renderDashboard,
} from './dashboard.mjs';
import {
    DEFAULT_THRESHOLDS,
    PROFILE_SCHEMA_VERSION,
    comparability,
    configFingerprint,
    createHostFingerprint,
    normalizeContainerStats,
    summarizeLoad,
    summarizeSamples,
    thresholdFlags,
    unavailableBuildPeak,
    validateObservation,
} from './lib.mjs';
import { createResourceRuntime } from './runtime.mjs';

const repositoryRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../..',
);

function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: { ...process.env, ...options.env },
        stdio: options.capture === false ? 'inherit' : 'pipe',
    });
    if (result.status !== 0 && !options.allowFailure) {
        throw new Error(
            `${command} ${args.join(' ')} failed (${result.status}): ${(result.stderr || result.stdout || '').trim()}`,
        );
    }
    return result;
}

function gitValue(args) {
    return run('git', args).stdout.trim();
}

function dockerVersion() {
    return run('docker', [
        'version',
        '--format',
        '{{.Server.Version}}',
    ]).stdout.trim();
}

function diskUsedPercent() {
    const lines = run('df', ['-Pk', repositoryRoot])
        .stdout.trim()
        .split(/\r?\n/);
    return (
        Number.parseFloat(
            lines.at(-1)?.trim().split(/\s+/)[4]?.replace('%', ''),
        ) || null
    );
}

function dockerStatsForIds(ids) {
    if (ids.length === 0) return [];
    const output = run('docker', [
        'stats',
        '--no-stream',
        '--format',
        '{{json .}}',
        ...ids,
    ]).stdout;
    return normalizeContainerStats(
        output
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line) => JSON.parse(line)),
    );
}

function dockerStats(projectNames) {
    const ids = (
        projectNames.length
            ? projectNames.flatMap((project) =>
                  run(
                      'docker',
                      [
                          'ps',
                          '--filter',
                          `label=com.docker.compose.project=${project}`,
                          '--format',
                          '{{.ID}}',
                      ],
                      { allowFailure: true },
                  ).stdout.split(/\s+/),
              )
            : run('docker', ['ps', '--format', '{{.ID}}'], {
                  allowFailure: true,
              }).stdout.split(/\s+/)
    ).filter(Boolean);
    return dockerStatsForIds(ids);
}

const wait = (milliseconds) =>
    new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

async function sampleResources(projectNames, seconds, intervalMs) {
    const samples = [];
    const deadline = Date.now() + seconds * 1_000;
    do {
        samples.push({
            recordedAt: new Date().toISOString(),
            containers: dockerStats(projectNames),
        });
        if (Date.now() < deadline) await wait(intervalMs);
    } while (Date.now() < deadline);
    return { samples, summary: summarizeSamples(samples) };
}

function httpsGet(url, agent) {
    return new Promise((resolvePromise, reject) => {
        const request = httpsRequest(url, { agent }, (response) => {
            response.resume();
            response.once('end', () =>
                resolvePromise({
                    ok: response.statusCode >= 200 && response.statusCode < 400,
                    status: response.statusCode,
                }),
            );
        });
        request.setTimeout(10_000, () =>
            request.destroy(new Error('Load request timed out.')),
        );
        request.once('error', reject);
        request.end();
    });
}

async function runLoad(urls, seconds, concurrency, tlsCaPath) {
    const samples = [];
    const startedAt = Date.now();
    const deadline = startedAt + seconds * 1_000;
    const agent = tlsCaPath
        ? new Agent({
              ca: await readFile(tlsCaPath),
              keepAlive: true,
              maxSockets: concurrency,
          })
        : undefined;
    async function worker(workerIndex) {
        let requestIndex = workerIndex;
        while (Date.now() < deadline) {
            const url = urls[requestIndex % urls.length];
            requestIndex += concurrency;
            const started = performance.now();
            try {
                const response = agent
                    ? await httpsGet(url, agent)
                    : await fetch(url, {
                          signal: AbortSignal.timeout(10_000),
                      });
                samples.push({
                    ok: response.ok,
                    status: response.status,
                    latencyMs: performance.now() - started,
                });
            } catch {
                samples.push({
                    ok: false,
                    status: 0,
                    latencyMs: performance.now() - started,
                });
            }
        }
    }
    await Promise.all(
        Array.from({ length: concurrency }, (_, index) => worker(index)),
    );
    agent?.destroy();
    return summarizeLoad(samples, Date.now() - startedAt);
}

async function buildImage(
    build,
    revision,
    rawDirectory,
    cleanBuild,
    builderName,
) {
    const logPath = resolve(rawDirectory, `build-${build.service}.log`);
    const cachePath = resolve(
        repositoryRoot,
        '.artifacts/resource-profile/build-cache',
        build.service,
    );
    await mkdir(dirname(cachePath), { recursive: true, mode: 0o700 });
    const log = createWriteStream(logPath, { flags: 'w', mode: 0o600 });
    const args = [
        'buildx',
        'build',
        '--builder',
        builderName,
        '--load',
        ...(cleanBuild ? ['--no-cache'] : []),
        ...(!cleanBuild && existsSync(cachePath)
            ? ['--cache-from', `type=local,src=${cachePath}`]
            : []),
        '--cache-to',
        `type=local,dest=${cachePath},mode=min`,
        '--build-arg',
        `RELEASE_SHA=${revision}`,
        '--file',
        build.dockerfile,
        '--tag',
        build.image,
        build.context,
    ];
    const startedAt = Date.now();
    const child = spawn('docker', args, {
        cwd: repositoryRoot,
        env: process.env,
    });
    child.stdout.pipe(log);
    child.stderr.pipe(log);
    let finished = false;
    const completion = new Promise((resolvePromise, reject) => {
        child.once('error', (error) => {
            finished = true;
            reject(error);
        });
        child.once('close', (code) => {
            finished = true;
            resolvePromise(code);
        });
    });
    const builderIds = run(
        'docker',
        [
            'ps',
            '--filter',
            `name=buildx_buildkit_${builderName}0`,
            '--format',
            '{{.ID}}',
        ],
        { allowFailure: true },
    )
        .stdout.split(/\s+/)
        .filter(Boolean);
    const resourceSamples = [];
    while (!finished) {
        if (builderIds.length) {
            resourceSamples.push({
                containers: dockerStatsForIds(builderIds),
            });
        }
        if (!finished) await wait(500);
    }
    const exitCode = await completion;
    log.end();
    if (exitCode !== 0)
        throw new Error(
            `Production image build failed for ${build.service}; see ${logPath}`,
        );
    const inspect = JSON.parse(
        run('docker', ['image', 'inspect', build.image]).stdout,
    )[0];
    const buildResources = summarizeSamples(resourceSamples);
    return {
        service: build.service,
        durationMs: Date.now() - startedAt,
        imageSizeBytes: inspect.Size,
        imageId: String(inspect.Id).replace(/^sha256:/, ''),
        buildPeakCpuPercent: buildResources.cpuPeakPercent,
        buildPeakMemoryBytes: buildResources.memoryPeakBytes,
        buildPeakAvailable: builderIds.length > 0 && resourceSamples.length > 0,
        buildPeakUnavailableReason:
            builderIds.length > 0 && resourceSamples.length > 0
                ? null
                : unavailableBuildPeak().buildPeakUnavailableReason,
    };
}

async function profileRuntime(config, rawDirectory, revision) {
    const resourceRuntime = createResourceRuntime({
        run,
        repositoryRoot,
        rawDirectory,
        config: {
            ...config,
            runtime: { ...config.runtime, releaseSha: revision },
        },
    });
    const { blue, green, data, edge } = resourceRuntime.projects;
    const steadyProjects = [blue, data, edge];
    try {
        await resourceRuntime.prepare();
        const idle = await sampleResources(
            steadyProjects,
            config.runtime.idleSeconds,
            config.runtime.sampleIntervalMs,
        );
        const loadPromise = runLoad(
            config.runtime.urls,
            config.runtime.loadSeconds,
            config.runtime.concurrency,
            resourceRuntime.tlsCertificatePath,
        );
        const loadResources = await sampleResources(
            steadyProjects,
            config.runtime.loadSeconds,
            config.runtime.sampleIntervalMs,
        );
        const load = await loadPromise;
        resourceRuntime.overlap();
        const overlapLoadPromise = runLoad(
            config.runtime.urls,
            config.runtime.loadSeconds,
            config.runtime.concurrency,
            resourceRuntime.tlsCertificatePath,
        );
        const overlapResources = await sampleResources(
            [blue, green, data, edge],
            config.runtime.loadSeconds,
            config.runtime.sampleIntervalMs,
        );
        const overlapLoad = await overlapLoadPromise;
        await writeFile(
            resolve(rawDirectory, 'runtime-samples.json'),
            JSON.stringify(
                {
                    idle: idle.samples,
                    load: loadResources.samples,
                    overlap: overlapResources.samples,
                },
                null,
                2,
            ),
            { mode: 0o600 },
        );
        return {
            idle: { resources: idle.summary },
            load: { resources: loadResources.summary, load },
            overlap: { resources: overlapResources.summary, load: overlapLoad },
        };
    } finally {
        resourceRuntime.cleanup();
    }
}

export function parseArguments(argv) {
    const has = (flag) => argv.includes(flag);
    return {
        record: has('--record'),
        buildOnly: has('--build-only'),
        reuseBuildCache: has('--reuse-build-cache'),
    };
}

export function assertLocalDocker(runCommand = run, environment = process.env) {
    if (environment.DOCKER_HOST) {
        throw new Error('Unset DOCKER_HOST before resource profiling.');
    }
    const endpoint = runCommand('docker', [
        'context',
        'inspect',
        '--format',
        '{{(index .Endpoints "docker").Host}}',
    ]).stdout.trim();
    if (!endpoint.startsWith('unix://')) {
        throw new Error(`Refusing non-local Docker endpoint: ${endpoint}`);
    }
}

export async function runProfile(options = {}) {
    const config = options.config ?? resourceProfileConfig;
    if (options.record && options.buildOnly)
        throw new Error(
            '--record requires the complete runtime profile; remove --build-only',
        );
    const revision = gitValue(['rev-parse', 'HEAD']);
    const dirty = gitValue(['status', '--porcelain']).length > 0;
    if (options.record && dirty)
        throw new Error(
            'Refusing --record from a dirty worktree; commit or omit --record',
        );
    assertLocalDocker();
    run('docker', ['info']);
    const recordedAt = new Date().toISOString();
    const runId = `${recordedAt.replaceAll(':', '').replaceAll('.', '')}-${revision.slice(0, 12)}`;
    const rawDirectory = resolve(
        repositoryRoot,
        '.artifacts/resource-profile/runs',
        runId,
    );
    await mkdir(rawDirectory, { recursive: true, mode: 0o700 });
    const resolvedConfig = {
        ...config,
        images: config.builds,
        thresholds: config.thresholds ?? DEFAULT_THRESHOLDS,
        runtime: {
            ...config.runtime,
            projectName: `${config.runtime.projectName}-${process.pid}-${Date.now().toString(36)}`,
        },
    };
    const builds = [];
    const builderName = `languon-profile-${process.pid}-${Date.now().toString(36)}`;
    run('docker', [
        'buildx',
        'create',
        '--name',
        builderName,
        '--driver',
        'docker-container',
    ]);
    try {
        run('docker', [
            'buildx',
            'inspect',
            '--builder',
            builderName,
            '--bootstrap',
        ]);
        for (const build of config.builds) {
            builds.push(
                await buildImage(
                    build,
                    revision,
                    rawDirectory,
                    !options.reuseBuildCache,
                    builderName,
                ),
            );
        }
    } finally {
        run('docker', ['buildx', 'rm', builderName], { allowFailure: true });
    }
    const runtime = options.buildOnly
        ? {}
        : await profileRuntime(resolvedConfig, rawDirectory, revision);
    let history = [];
    try {
        history = parseHistory(await readFile(defaultHistoryPath, 'utf8'));
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    const observation = {
        schemaVersion: PROFILE_SCHEMA_VERSION,
        recordedAt,
        revision,
        dirty,
        profileVersion: config.profileVersion,
        configFingerprint: configFingerprint({
            builds: config.builds,
            runtime: config.runtime,
        }),
        host: createHostFingerprint({
            dockerVersion: dockerVersion(),
            diskUsedPercent: diskUsedPercent(),
        }),
        builds,
        runtime,
        comparability: null,
        flags: [],
    };
    observation.comparability = comparability(observation, history.at(-1));
    observation.flags = thresholdFlags(observation, config.thresholds);
    validateObservation(observation);
    const rawResult = resolve(rawDirectory, 'result.json');
    await writeFile(rawResult, `${JSON.stringify(observation, null, 2)}\n`, {
        mode: 0o600,
    });
    if (options.record)
        await appendFile(
            defaultHistoryPath,
            `${JSON.stringify(observation)}\n`,
            'utf8',
        );
    await mkdir(dirname(defaultDashboardPath), { recursive: true });
    await writeFile(
        defaultDashboardPath,
        renderDashboard([...history, observation]),
        'utf8',
    );
    return {
        observation,
        rawDirectory,
        dashboardPath: defaultDashboardPath,
        recorded: options.record,
    };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    try {
        const result = await runProfile(parseArguments(process.argv.slice(2)));
        console.log(`Resource profile: ${result.rawDirectory}`);
        console.log(`Dashboard: ${result.dashboardPath}`);
        console.log(
            `History: ${result.recorded ? 'recorded' : 'not recorded (pass --record)'}`,
        );
        if (result.observation.flags.length)
            console.log(
                `Threshold flags: ${result.observation.flags.join(', ')}`,
            );
    } catch (error) {
        console.error(`Resource profile failed: ${error.message}`);
        process.exitCode = 1;
    }
}
