#!/usr/bin/env node
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { main as deployMain } from './cli.mjs';
import { runCommand } from './lib/runner.mjs';

const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..',
);
const localDirectory = path.join(root, 'infra/deploy/.local');
const runtimeDirectory = path.join(localDirectory, 'runtime');
const stateDirectory = path.join(localDirectory, 'state');
const configPath = path.join(localDirectory, 'stage.env');
const manifestPath = path.join(localDirectory, 'manifest.json');
const tlsDirectory = path.join(localDirectory, 'tls');
const tlsCertificatePath = path.join(tlsDirectory, 'tls.crt');
const tlsPrivateKeyPath = path.join(tlsDirectory, 'tls.key');
const adminHtpasswdPath = path.join(localDirectory, 'admin.htpasswd');
const registryPort = '5500';
const projectPrefix = 'languon-local-stage';
const releaseShaFallback = '0000000000000000000000000000000000000000';

async function assertLocalDocker() {
    if (process.env.DOCKER_HOST)
        throw new Error('Unset DOCKER_HOST before a local rehearsal.');
    const { stdout } = await runCommand(
        'docker',
        [
            'context',
            'inspect',
            '--format',
            '{{(index .Endpoints "docker").Host}}',
        ],
        { capture: true },
    );
    if (!stdout.trim().startsWith('unix://')) {
        throw new Error(`Refusing non-local Docker endpoint: ${stdout.trim()}`);
    }
}

async function sourceSha() {
    return await runCommand('git', ['rev-parse', 'HEAD'], {
        cwd: root,
        capture: true,
    }).then(
        ({ stdout }) => stdout.trim(),
        () => releaseShaFallback,
    );
}

async function startRegistry() {
    const exists = await runCommand(
        'docker',
        ['inspect', 'languon-local-registry'],
        {
            capture: true,
        },
    ).then(
        () => true,
        () => false,
    );
    if (!exists) {
        await runCommand('docker', [
            'run',
            '--detach',
            '--name',
            'languon-local-registry',
            '--publish',
            `127.0.0.1:${registryPort}:5000`,
            'registry:2.8.3@sha256:a3d8aaa63ed8681a604f1dea0aa03f100d5895b6a58ace528858a7b332415373',
        ]);
    }
}

async function buildManifest(sha) {
    const dockerfiles = {
        backend: 'prod.backend.Dockerfile',
        web: 'prod.web.Dockerfile',
        admin: 'prod.admin.Dockerfile',
        migrator: 'prod.migrator.Dockerfile',
    };
    const images = {};
    for (const [service, dockerfile] of Object.entries(dockerfiles)) {
        const tag = `localhost:${registryPort}/languon/${service}:local-${sha.slice(0, 12)}`;
        await runCommand('docker', [
            'build',
            '--build-arg',
            `RELEASE_SHA=${sha}`,
            '--file',
            path.join(root, 'infra/docker', dockerfile),
            '--tag',
            tag,
            root,
        ]);
        await runCommand('docker', ['push', tag]);
        const { stdout } = await runCommand(
            'docker',
            ['image', 'inspect', '--format', '{{index .RepoDigests 0}}', tag],
            { capture: true },
        );
        images[service] = stdout.trim();
    }
    await writeFile(
        manifestPath,
        `${JSON.stringify(
            {
                schemaVersion: 2,
                identity: `local-${sha.slice(0, 12)}`,
                version: null,
                sourceSha: sha,
                verified: true,
                workflowRun: 1,
                createdAt: new Date().toISOString(),
                images,
                migration: { compatibility: 'expand', ledger: 'drizzle' },
                dictionaryJobs: {
                    phase: 'expand',
                    workerProcessable: ['single-card:v1'],
                    apiReadable: ['single-card:v1'],
                    apiCancellable: ['single-card:v1'],
                    apiDiscardable: ['single-card:v1'],
                    apiAcceptable: ['single-card:v1'],
                    apiEnqueued: [],
                    webReadable: ['single-card:v1'],
                    retireFormats: [],
                    generationBudget: {
                        maxInputTokensPerAttempt: 65_536,
                        maxOutputTokensPerAttempt: 1_024,
                        inputCostMicrosPerMillionTokens: 1_000_000,
                        outputCostMicrosPerMillionTokens: 4_000_000,
                        maxCostMicrosPerAttempt: 70_000,
                    },
                },
            },
            null,
            2,
        )}\n`,
        { mode: 0o600 },
    );
}

async function generateLocalTlsCertificate() {
    await mkdir(tlsDirectory, { recursive: true, mode: 0o700 });
    await runCommand('openssl', [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=DNS:localhost,IP:127.0.0.1',
        '-keyout',
        tlsPrivateKeyPath,
        '-out',
        tlsCertificatePath,
    ]);
    await chmod(tlsPrivateKeyPath, 0o600);
    await chmod(tlsCertificatePath, 0o600);
}

async function writeConfig() {
    const secretA = 'local-rehearsal-jwt-secret-0000000000000001';
    const secretB = 'local-rehearsal-code-secret-000000000000002';
    const passwordDigest = createHash('sha1')
        .update('local-admin-only')
        .digest('base64');
    await writeFile(adminHtpasswdPath, `admin:{SHA}${passwordDigest}\n`, {
        mode: 0o600,
    });
    await writeFile(
        configPath,
        [
            'ADMIN_BASE_URL=https://localhost:18444',
            `ADMIN_HTPASSWD_PATH=${adminHtpasswdPath}`,
            'AUTH_ALLOWED_ORIGINS=https://localhost:18443,https://localhost:18444',
            `AUTH_CODE_HMAC_SECRET=${secretB}`,
            `AUTH_JWT_SECRET=${secretA}`,
            `DICTIONARY_HMAC_SECRET=${secretA}-dictionary`,
            'AUTH_WEBAUTHN_RP_ID=localhost',
            'DATABASE_URL=postgres://languon_local:languon_local@stage-postgres:5432/languon_local',
            'DICTIONARY_WORKER_DATABASE_URL=postgres://languon_local:languon_local@stage-postgres:5432/languon_local',
            'DICTIONARY_GENERATION_MAX_INPUT_TOKENS=65536',
            'DICTIONARY_GENERATION_MAX_OUTPUT_TOKENS=1024',
            'DICTIONARY_GENERATION_INPUT_COST_MICROS_PER_MILLION_TOKENS=1000000',
            'DICTIONARY_GENERATION_OUTPUT_COST_MICROS_PER_MILLION_TOKENS=4000000',
            'DICTIONARY_GENERATION_MAX_COST_MICROS_PER_ATTEMPT=70000',
            'MIGRATION_DATABASE_URL=postgres://languon_local:languon_local@stage-postgres:5432/languon_local',
            'REDIS_URL=redis://:languon_local@stage-redis:6379/0',
            `DEPLOY_PROJECT_PREFIX=${projectPrefix}`,
            'EDGE_SUBNET=172.30.250.0/24',
            'PUBLIC_BIND_ADDRESS=127.0.0.1',
            'PUBLIC_BASE_URL=https://localhost:18443',
            'PUBLIC_HTTP_PORT=18080',
            'PUBLIC_HTTPS_PORT=18443',
            'ADMIN_BIND_ADDRESS=127.0.0.1',
            'ADMIN_PORT=18444',
            `TLS_CA_PATH=${tlsCertificatePath}`,
            `TLS_CERTIFICATE_PATH=${tlsCertificatePath}`,
            `TLS_PRIVATE_KEY_PATH=${tlsPrivateKeyPath}`,
            '',
        ].join('\n'),
        { mode: 0o600 },
    );
}

async function startData() {
    const environment = {
        ...process.env,
        DEPLOY_PROJECT_PREFIX: projectPrefix,
        POSTGRES_DB: 'languon_local',
        POSTGRES_USER: 'languon_local',
        POSTGRES_PASSWORD: 'languon_local',
        REDIS_PASSWORD: 'languon_local',
    };
    for (const network of [`${projectPrefix}-edge`, `${projectPrefix}-data`]) {
        const exists = await runCommand(
            'docker',
            ['network', 'inspect', network],
            { capture: true },
        ).then(
            () => true,
            () => false,
        );
        if (!exists) {
            const args = ['network', 'create'];
            if (network.endsWith('-edge'))
                args.push('--subnet', '172.30.250.0/24');
            args.push(network);
            await runCommand('docker', args);
        }
    }
    await runCommand(
        'docker',
        [
            'compose',
            '--project-name',
            `${projectPrefix}-data`,
            '--file',
            path.join(root, 'infra/deploy/compose/stage-data.compose.yaml'),
            'up',
            '--detach',
            '--wait',
        ],
        { env: environment },
    );
}

async function invoke(command) {
    process.env.LANGUON_LOCAL_REHEARSAL = 'true';
    await deployMain([
        command,
        '--environment',
        'stage',
        '--manifest',
        manifestPath,
        '--config',
        configPath,
        '--state-directory',
        stateDirectory,
        '--runtime-directory',
        runtimeDirectory,
        '--allow-local-registry',
        'true',
        '--drain-seconds',
        '30',
    ]);
}

async function proveFailedMigrationPreservesActive() {
    const original = await readFile(configPath, 'utf8');
    await writeFile(
        configPath,
        original.replace(
            'MIGRATION_DATABASE_URL=postgres://languon_local:languon_local@stage-postgres:5432/languon_local',
            'MIGRATION_DATABASE_URL=postgres://languon_local:languon_local@missing-postgres:5432/languon_local',
        ),
        { mode: 0o600 },
    );
    let failed = false;
    try {
        await invoke('deploy');
    } catch {
        failed = true;
    } finally {
        await writeFile(configPath, original, { mode: 0o600 });
    }
    if (!failed) throw new Error('Expected disposable migration failure.');
    await invoke('verify');
}

async function writeSecondManifestForSameImages() {
    const value = JSON.parse(await readFile(manifestPath, 'utf8'));
    value.identity = `${value.identity}-second`;
    value.workflowRun += 1;
    value.createdAt = new Date().toISOString();
    await writeFile(manifestPath, `${JSON.stringify(value, null, 2)}\n`, {
        mode: 0o600,
    });
}

async function prepare() {
    await mkdir(localDirectory, { recursive: true, mode: 0o700 });
    await startRegistry();
    const sha = await sourceSha();
    await buildManifest(sha);
    await generateLocalTlsCertificate();
    await writeConfig();
    await startData();
}

async function down() {
    const composeFile = path.join(root, 'infra/deploy/compose');
    const env = {
        ...process.env,
        ADMIN_BIND_ADDRESS: '127.0.0.1',
        ADMIN_BASE_URL: 'https://localhost:18444',
        ADMIN_HTPASSWD_PATH: adminHtpasswdPath,
        ADMIN_PORT: '18444',
        ADMIN_IMAGE:
            'local-cleanup.invalid/admin@sha256:0000000000000000000000000000000000000000000000000000000000000000',
        APP_ENV: 'test',
        AUTH_ALLOWED_ORIGINS: 'https://localhost:18443',
        AUTH_CODE_HMAC_SECRET: 'local-cleanup-placeholder',
        AUTH_JWT_SECRET: 'local-cleanup-placeholder',
        DICTIONARY_HMAC_SECRET: 'local-cleanup-dictionary-placeholder',
        AUTH_WEBAUTHN_RP_ID: 'localhost',
        BACKEND_IMAGE:
            'local-cleanup.invalid/backend@sha256:0000000000000000000000000000000000000000000000000000000000000000',
        DATABASE_URL: 'postgres://cleanup:cleanup@stage-postgres:5432/cleanup',
        DICTIONARY_WORKER_DATABASE_URL:
            'postgres://cleanup:cleanup@stage-postgres:5432/cleanup',
        DEPLOY_PROJECT_PREFIX: projectPrefix,
        DEPLOY_RUNTIME_DIR: runtimeDirectory,
        DEPLOY_SLOT: 'cleanup',
        EDGE_SUBNET: '172.30.250.0/24',
        POSTGRES_DB: 'languon_local',
        POSTGRES_PASSWORD: 'languon_local',
        POSTGRES_USER: 'languon_local',
        PUBLIC_BIND_ADDRESS: '127.0.0.1',
        PUBLIC_HTTP_PORT: '18080',
        PUBLIC_HTTPS_PORT: '18443',
        REDIS_PASSWORD: 'languon_local',
        REDIS_URL: 'redis://:cleanup@stage-redis:6379/0',
        RELEASE_SHA: releaseShaFallback,
        TLS_CERTIFICATE_PATH: tlsCertificatePath,
        TLS_PRIVATE_KEY_PATH: tlsPrivateKeyPath,
        WEB_IMAGE:
            'local-cleanup.invalid/web@sha256:0000000000000000000000000000000000000000000000000000000000000000',
    };
    for (const slot of ['blue', 'green']) {
        await runCommand(
            'docker',
            [
                'compose',
                '--project-name',
                `${projectPrefix}-${slot}`,
                '--file',
                path.join(composeFile, 'apps.compose.yaml'),
                'down',
                '--remove-orphans',
            ],
            { env },
        ).catch(() => {});
    }
    for (const [project, file, extra] of [
        [`${projectPrefix}-edge`, 'edge.compose.yaml', []],
        [`${projectPrefix}-data`, 'stage-data.compose.yaml', ['--volumes']],
    ]) {
        await runCommand(
            'docker',
            [
                'compose',
                '--project-name',
                project,
                '--file',
                path.join(composeFile, file),
                'down',
                ...extra,
                '--remove-orphans',
            ],
            { env },
        ).catch(() => {});
    }
    await runCommand('docker', [
        'container',
        'rm',
        '--force',
        'languon-local-registry',
    ]).catch(() => {});
    for (const network of [`${projectPrefix}-edge`, `${projectPrefix}-data`]) {
        await runCommand('docker', ['network', 'rm', network], {
            capture: true,
        }).catch(() => {});
    }
    await rm(localDirectory, { recursive: true, force: true });
}

async function main() {
    const command = process.argv[2];
    if (
        !['deploy', 'verify', 'rollback', 'journey', 'down'].includes(command)
    ) {
        throw new Error(
            'Usage: local-rehearsal.mjs <deploy|verify|rollback|journey|down>',
        );
    }
    await assertLocalDocker();
    if (command === 'down') return await down();
    if (command === 'deploy' || command === 'journey') await prepare();
    await invoke(command === 'journey' ? 'deploy' : command);
    if (command === 'journey') {
        await invoke('verify');
        await proveFailedMigrationPreservesActive();
        await writeSecondManifestForSameImages();
        await invoke('deploy');
        await invoke('rollback');
        await invoke('verify');
    }
}

main().catch((error) => {
    process.stderr.write(
        `Local deployment rehearsal failed: ${error.message}\n`,
    );
    process.exitCode = 1;
});
