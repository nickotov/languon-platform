#!/usr/bin/env node

import { access, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { validateEnvironment } from '../infra/deploy/lib/config.mjs';
import { readReleaseManifest } from '../infra/deploy/lib/manifest.mjs';
import { runCommand } from '../infra/deploy/lib/runner.mjs';

function fail(message) {
    throw new Error(message);
}

function usage(status = 1) {
    process.stdout.write(`Usage:
  deploy-remote.mjs [deploy|verify|rollback] --environment <stage|production> --target <user@host> --manifest <path>

Command:
  deploy (default) | verify | rollback

Required flags:
  --environment <stage|production>
  --target <user@host> (or --host + --user)
  --manifest <path>

Examples:
  node scripts/deploy-remote.mjs deploy \
    --environment stage \
    --target root@${'<host>'} \
    --manifest .release/languon-stage-manifest.json \
    --config /etc/languon/stage.env

  node scripts/deploy-remote.mjs verify \
    --environment production \
    --target deploy@${'<host>'} \
    --manifest /tmp/languon-release.json \
    --config /etc/languon/production.env

Options:
  --config <remote path>          Remote config path (default: /etc/languon/<environment>.env)
  --host <host> --user <user>     alternative target split form
  --ssh-key <path>                SSH private key path (default: ~/.ssh/id_ed25519)
  --known-hosts <path>            SSH known_hosts file (default: ~/.ssh/known_hosts)
  --remote-root <dir>             Remote release root (default: /opt/languon/releases)
  --runtime-directory <dir>        Remote runtime path (default: /opt/languon/runtime/<environment>)
  --state-directory <dir>          Remote deploy state path (default: /var/lib/languon/<environment>)
  --drain-seconds <number>        Graceful connection drain timeout (default: 300)
  --allow-local-registry <true|false>  Permit localhost/docker registry digests
  --local-config <path>           Copy this local deploy config to remote host temporarily
  --audit-path <path>             Save raw remote JSON output locally
  --ssh-port <number>             SSH port (default: 22)
`);
    process.exit(status);
}

function expandPath(input) {
    if (!input) return input;
    if (input.startsWith('~/')) {
        return path.join(process.env.HOME || '', input.slice(2));
    }
    return input;
}

function parseArguments(values) {
    if (values.includes('--help') || values.includes('-h')) usage(0);

    const options = new Map();
    let command = 'deploy';

    if (values.length > 0 && !values[0].startsWith('--')) {
        command = values[0];
        values = values.slice(1);
    }

    for (let index = 0; index < values.length; index += 1) {
        const key = values[index];
        if (!key.startsWith('--')) {
            fail(`Unexpected argument: ${key}`);
        }
        const value = values[index + 1];
        if (value === undefined || value.startsWith('--')) {
            fail(`Missing value for ${key}`);
        }
        options.set(key.slice(2), value);
        index += 1;
    }

    return { command, options };
}

function sshOptionArgs({ sshKey, knownHosts, port }) {
    return [
        '-i',
        sshKey,
        '-o',
        'IdentitiesOnly=yes',
        '-o',
        'StrictHostKeyChecking=yes',
        '-o',
        `UserKnownHostsFile=${knownHosts}`,
        '-p',
        String(port),
    ];
}

function parseTrailingJson(stdout) {
    const candidate = stdout
        .trim()
        .split('\n')
        .reverse()
        .find((line) => line.trim().startsWith('{'));
    if (!candidate) return;
    return JSON.parse(candidate);
}

async function assertReadablePath(target) {
    try {
        await access(target, constants.R_OK);
    } catch {
        fail(`Cannot access required file: ${target}`);
    }
}

async function main() {
    const { command, options } = parseArguments(process.argv.slice(2));

    if (!['deploy', 'verify', 'rollback'].includes(command)) {
        fail(`Unknown command: ${command}`);
    }

    const environment = validateEnvironment(options.get('environment'));
    const host = options.get('host');
    const user = options.get('user');
    const manifestPath = options.get('manifest');

    const explicitTarget = options.get('target');
    const envTarget = process.env.DEPLOY_HOST
        ? `${process.env.DEPLOY_USER ? `${process.env.DEPLOY_USER}@` : ''}${process.env.DEPLOY_HOST}`
        : null;

    const target =
        explicitTarget || (host && user ? `${user}@${host}` : envTarget);
    if (!target) {
        fail('Either --target, or both --host and --user are required.');
    }

    if (!manifestPath) fail('--manifest is required.');

    const manifestAbsolutePath = path.resolve(manifestPath);
    const manifest = await readReleaseManifest(manifestAbsolutePath, {
        allowLocalRegistry: options.get('allow-local-registry') === 'true',
    });

    const repositoryRoot = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '..',
    );

    const runLocal = (command, args, options = {}) => {
        return runCommand(command, args, {
            ...options,
            cwd: repositoryRoot,
        });
    };

    const runRemote = (args, options = {}) =>
        runCommand('ssh', [...optionsForSsh, target, ...args], options);

    const home = process.env.HOME;
    if (!home) fail('HOME is required for default SSH paths.');

    const sshKey = expandPath(
        options.get('ssh-key') || path.join(home, '.ssh', 'id_ed25519'),
    );
    const knownHosts = expandPath(
        options.get('known-hosts') || path.join(home, '.ssh', 'known_hosts'),
    );
    const remoteRoot = options.get('remote-root') || '/opt/languon/releases';
    const remoteDir = path.posix.join(remoteRoot, manifest.sourceSha);
    const remoteScript = path.posix.join(
        remoteDir,
        'scripts',
        'deploy-release.mjs',
    );
    const remoteManifest = path.posix.join(remoteDir, 'release-manifest.json');

    const config = options.get('config')
        ? options.get('config')
        : `/etc/languon/${environment}.env`;
    let localConfig = options.get('local-config');
    let remoteConfig = config;

    const runtimeDirectory = options.get('runtime-directory')
        ? options.get('runtime-directory')
        : `/opt/languon/runtime/${environment}`;
    const stateDirectory = options.get('state-directory')
        ? options.get('state-directory')
        : `/var/lib/languon/${environment}`;
    const drainSeconds = Number(options.get('drain-seconds') || '300');
    if (!Number.isFinite(drainSeconds) || drainSeconds < 1) {
        fail('--drain-seconds must be a positive number');
    }

    const knownHostPort = Number(options.get('ssh-port') || '22');
    if (
        !Number.isFinite(knownHostPort) ||
        knownHostPort < 1 ||
        knownHostPort > 65535
    ) {
        fail('--ssh-port must be between 1 and 65535');
    }

    await assertReadablePath(sshKey);
    await assertReadablePath(knownHosts);
    await assertReadablePath(manifestAbsolutePath);

    if (localConfig) {
        localConfig = path.resolve(localConfig);
        await assertReadablePath(localConfig);
        remoteConfig = path.posix.join(remoteDir, 'deploy.env');
    }

    const optionsForSsh = sshOptionArgs({
        sshKey,
        knownHosts,
        port: knownHostPort,
    });

    await runRemote([
        'install',
        '-d',
        path.posix.join(remoteDir, 'infra', 'backup'),
        path.posix.join(remoteDir, 'infra', 'deploy'),
        path.posix.join(remoteDir, 'infra', 'nginx'),
        path.posix.join(remoteDir, 'scripts'),
    ]);

    const scpBase = [...optionsForSsh];

    const remoteBundle = [
        {
            local: 'infra/backup/.',
            remote: `${remoteDir}/infra/backup/`,
            recursive: true,
        },
        {
            local: 'infra/deploy/cli.mjs',
            remote: `${remoteDir}/infra/deploy/`,
            recursive: false,
        },
        {
            local: 'infra/deploy/admin-cli.mjs',
            remote: `${remoteDir}/infra/deploy/`,
            recursive: false,
        },
        {
            local: 'infra/deploy/lib',
            remote: `${remoteDir}/infra/deploy/`,
            recursive: true,
        },
        {
            local: 'infra/deploy/compose',
            remote: `${remoteDir}/infra/deploy/`,
            recursive: true,
        },
        {
            local: 'infra/nginx/nginx.conf',
            remote: `${remoteDir}/infra/nginx/`,
            recursive: false,
        },
        {
            local: 'infra/nginx/edge-entrypoint.sh',
            remote: `${remoteDir}/infra/nginx/`,
            recursive: false,
        },
        {
            local: 'scripts/deploy-release.mjs',
            remote: `${remoteDir}/scripts/`,
            recursive: false,
        },
    ];

    for (const bundle of remoteBundle) {
        await runLocal(
            'scp',
            [
                ...scpBase,
                bundle.recursive ? '-r' : undefined,
                bundle.local,
                `${target}:${bundle.remote}`,
            ].filter((value) => value !== undefined),
        );
    }

    await runLocal('scp', [
        ...scpBase,
        manifestAbsolutePath,
        `${target}:${remoteManifest}`,
    ]);

    if (localConfig) {
        await runLocal('scp', [
            ...scpBase,
            localConfig,
            `${target}:${remoteConfig}`,
        ]);
        await runRemote(['chmod', '600', remoteConfig]);
    }

    const remoteCommand = [
        'node',
        remoteScript,
        command,
        '--environment',
        environment,
        '--manifest',
        remoteManifest,
        '--config',
        remoteConfig,
        '--runtime-directory',
        runtimeDirectory,
        '--state-directory',
        stateDirectory,
        '--drain-seconds',
        String(drainSeconds),
    ];

    const remoteResult = await runRemote(remoteCommand, { capture: true });

    const stdout = remoteResult.stdout || '';
    if (stdout.trim()) {
        process.stdout.write(stdout);
    } else {
        process.stdout.write(
            remoteResult.stderr || 'Deployment command returned no output.\n',
        );
    }

    const auditPath = options.get('audit-path');
    if (auditPath) {
        await writeFile(auditPath, stdout, { mode: 0o600 });
        process.stdout.write(`Saved deployment audit to ${auditPath}\n`);
    }

    if (stdout.trim()) {
        parseTrailingJson(stdout);
    }
}

main().catch((error) => {
    process.stderr.write(`Remote deploy failed: ${error.message}\n`);
    process.exitCode = 1;
});
