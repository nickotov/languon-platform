#!/usr/bin/env node

import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { validateEnvironment } from '../infra/deploy/lib/config.mjs';
import { validateAdminOperatorRequest } from '../infra/deploy/lib/admin-operator.mjs';
import { readReleaseManifest } from '../infra/deploy/lib/manifest.mjs';
import { runCommand } from '../infra/deploy/lib/runner.mjs';

function usage(status = 1) {
    process.stdout.write(`Usage:
  pnpm admin:membership:remote -- <grant|revoke|list|prune> \\
    --environment <stage|production> --target <user@host> --manifest <path> [options]

Mutation flags:
  --email <address>             Target user for grant or revoke
  --actor-email <address>       Existing owner performing the operation
  --reason <text>               Required 5-500 character audit reason
  --confirm admin-membership-change

Connection flags:
  --config <remote path>        Default: /etc/languon/<environment>.env
  --ssh-key <local path>        Default: ~/.ssh/id_ed25519
  --known-hosts <local path>    Default: ~/.ssh/known_hosts
  --ssh-port <number>           Default: 22
  --remote-root <remote dir>    Default: /opt/languon/releases
  --state-directory <remote dir> Default: /var/lib/languon/<environment>

The first owner grant omits --actor-email. Every later grant/revoke and every
prune command requires an active owner actor. The active deployment must match
the supplied immutable manifest.
`);
    process.exit(status);
}

function fail(message) {
    throw new Error(message);
}

function expandPath(value) {
    if (value?.startsWith('~/')) {
        return path.join(process.env.HOME || '', value.slice(2));
    }
    return value;
}

export function parseRemoteAdminArguments(values) {
    if (values.includes('--help') || values.includes('-h')) usage(0);
    const [action, ...rest] = values;
    if (!['grant', 'list', 'prune', 'revoke'].includes(action ?? '')) {
        fail('The command must be grant, revoke, list, or prune.');
    }
    const options = new Map();
    for (let index = 0; index < rest.length; index += 2) {
        const flag = rest[index];
        const value = rest[index + 1];
        if (!flag?.startsWith('--') || value === undefined) {
            fail(`Invalid option near ${flag ?? 'end of command'}.`);
        }
        if (options.has(flag.slice(2))) fail(`Duplicate option ${flag}.`);
        options.set(flag.slice(2), value);
    }
    const known = new Set([
        'actor-email',
        'config',
        'confirm',
        'email',
        'environment',
        'known-hosts',
        'manifest',
        'reason',
        'remote-root',
        'ssh-key',
        'ssh-port',
        'state-directory',
        'target',
    ]);
    for (const key of options.keys()) {
        if (!known.has(key)) fail(`Unknown option --${key}.`);
    }
    const request = validateAdminOperatorRequest({
        action,
        ...(options.has('actor-email')
            ? { actorEmail: options.get('actor-email') }
            : {}),
        ...(options.has('confirm') ? { confirm: options.get('confirm') } : {}),
        ...(options.has('email') ? { email: options.get('email') } : {}),
        ...(options.has('reason') ? { reason: options.get('reason') } : {}),
    });
    return { options, request };
}

async function assertReadable(filePath) {
    try {
        await access(filePath, constants.R_OK);
    } catch {
        fail(`Cannot access required file: ${filePath}`);
    }
}

function sshOptions(key, knownHosts, port) {
    return [
        '-i',
        key,
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

export function validateRemoteAdminPath(value, name) {
    if (
        !value.startsWith('/') ||
        !/^\/[A-Za-z0-9._/-]+$/.test(value) ||
        path.posix.normalize(value) !== value
    ) {
        fail(
            `${name} must be a normalized absolute remote path using only letters, numbers, dot, underscore, dash, and slash.`,
        );
    }
    return value;
}

export function validateRemoteAdminTarget(value) {
    if (!/^[A-Za-z_][A-Za-z0-9_-]*@[A-Za-z0-9.-]+$/.test(value ?? '')) {
        fail('--target must use the user@host form.');
    }
    return value;
}

async function main() {
    const { options, request } = parseRemoteAdminArguments(
        process.argv.slice(2),
    );
    const environment = validateEnvironment(options.get('environment'));
    const target = options.get('target');
    const manifestInput = options.get('manifest');
    if (!target) fail('--target is required.');
    validateRemoteAdminTarget(target);
    if (!manifestInput) fail('--manifest is required.');
    const home = process.env.HOME;
    if (!home) fail('HOME is required for default SSH paths.');
    const key = expandPath(
        options.get('ssh-key') || path.join(home, '.ssh/id_ed25519'),
    );
    const knownHosts = expandPath(
        options.get('known-hosts') || path.join(home, '.ssh/known_hosts'),
    );
    const manifestPath = path.resolve(manifestInput);
    const [manifest] = await Promise.all([
        readReleaseManifest(manifestPath),
        assertReadable(key),
        assertReadable(knownHosts),
        assertReadable(manifestPath),
    ]);
    const port = Number(options.get('ssh-port') || '22');
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
        fail('--ssh-port must be between 1 and 65535.');
    }
    const repositoryRoot = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '..',
    );
    const remoteRoot = validateRemoteAdminPath(
        options.get('remote-root') || '/opt/languon/releases',
        '--remote-root',
    );
    const remoteDir = path.posix.join(remoteRoot, manifest.sourceSha);
    const remoteRequest = path.posix.join(
        remoteDir,
        `admin-request-${randomUUID()}.json`,
    );
    const remoteManifest = path.posix.join(remoteDir, 'release-manifest.json');
    const remoteConfig = validateRemoteAdminPath(
        options.get('config') || `/etc/languon/${environment}.env`,
        '--config',
    );
    const stateDirectory = validateRemoteAdminPath(
        options.get('state-directory') || `/var/lib/languon/${environment}`,
        '--state-directory',
    );
    const temporaryDirectory = await mkdtemp(
        path.join(os.tmpdir(), 'languon-admin-remote-'),
    );
    const requestPath = path.join(temporaryDirectory, 'request.json');
    await writeFile(requestPath, `${JSON.stringify(request)}\n`, {
        mode: 0o600,
    });

    const sshArgs = sshOptions(key, knownHosts, port);
    const scpArgs = [
        '-i',
        key,
        '-o',
        'IdentitiesOnly=yes',
        '-o',
        'StrictHostKeyChecking=yes',
        '-o',
        `UserKnownHostsFile=${knownHosts}`,
        '-P',
        String(port),
    ];
    const runLocal = (command, args, runOptions = {}) =>
        runCommand(command, args, { ...runOptions, cwd: repositoryRoot });
    const runRemote = (args, runOptions = {}) =>
        runCommand('ssh', [...sshArgs, target, ...args], runOptions);

    try {
        await runRemote([
            'test',
            '-f',
            path.posix.join(remoteDir, 'infra/deploy/admin-cli.mjs'),
        ]);
        await runLocal('scp', [
            ...scpArgs,
            requestPath,
            `${target}:${remoteRequest}`,
        ]);
        await runRemote(['chmod', '600', remoteRequest]);
        const result = await runRemote(
            [
                'node',
                path.posix.join(remoteDir, 'infra/deploy/admin-cli.mjs'),
                '--environment',
                environment,
                '--manifest',
                remoteManifest,
                '--config',
                remoteConfig,
                '--request',
                remoteRequest,
                '--state-directory',
                stateDirectory,
            ],
            { capture: true },
        );
        process.stdout.write(
            result.stdout || result.stderr || 'Admin command completed.\n',
        );
    } finally {
        await runRemote(['rm', '-f', remoteRequest]).catch(() => {});
        await rm(temporaryDirectory, { recursive: true, force: true });
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        process.stderr.write(`Remote admin command failed: ${error.message}\n`);
        process.exitCode = 1;
    });
}
