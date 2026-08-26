import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
    runRemoteAdminOperator,
    validateAdminOperatorRequest,
} from '../lib/admin-operator.mjs';
import {
    parseRemoteAdminArguments,
    validateRemoteAdminPath,
    validateRemoteAdminTarget,
} from '../../../scripts/admin-membership-remote.mjs';

const sha = 'b'.repeat(40);
const digest = 'a'.repeat(64);
const manifest = {
    schemaVersion: 1,
    identity: 'stage-admin-test',
    version: null,
    sourceSha: sha,
    verified: true,
    workflowRun: 12,
    createdAt: '2026-08-20T10:00:00.000Z',
    migration: { compatibility: 'expand', ledger: 'drizzle' },
    images: Object.fromEntries(
        ['backend', 'web', 'admin', 'migrator'].map((name) => [
            name,
            `ghcr.io/test/languon-${name}@sha256:${digest}`,
        ]),
    ),
};

const config = [
    'ADMIN_BASE_URL=https://admin.stage.test',
    'ADMIN_HTPASSWD_PATH=/safe/admin.htpasswd',
    'AUTH_ALLOWED_ORIGINS=https://stage.test',
    'AUTH_CODE_HMAC_SECRET=a',
    'AUTH_JWT_SECRET=b',
    'DICTIONARY_HMAC_SECRET=c',
    'AUTH_WEBAUTHN_RP_ID=stage.test',
    'DATABASE_URL=postgres://u:p@stage-postgres:5432/db',
    'DICTIONARY_WORKER_DATABASE_URL=postgres://worker:p@stage-postgres:5432/db',
    'MIGRATION_DATABASE_URL=postgres://m:p@stage-postgres:5432/db',
    'REDIS_URL=redis://stage-redis:6379',
    'DEPLOY_PROJECT_PREFIX=test-stage',
    'EDGE_SUBNET=172.30.99.0/24',
    'PUBLIC_BASE_URL=https://stage.test',
    'TLS_CERTIFICATE_PATH=/tls/cert',
    'TLS_PRIVATE_KEY_PATH=/tls/key',
].join('\n');

async function createFixture(activeManifest = manifest) {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'admin-operator-'));
    const stateDirectory = path.join(directory, 'state');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(stateDirectory);
    const manifestPath = path.join(directory, 'manifest.json');
    const configPath = path.join(directory, 'deploy.env');
    await writeFile(manifestPath, JSON.stringify(manifest));
    await writeFile(configPath, `${config}\n`, { mode: 0o600 });
    await writeFile(
        path.join(stateDirectory, 'deployment-state.json'),
        JSON.stringify({
            activeSlot: 'green',
            current: activeManifest,
            previous: null,
        }),
        { mode: 0o600 },
    );
    return { configPath, directory, manifestPath, stateDirectory };
}

test('validates remote mutation requests and literal confirmation', () => {
    assert.deepEqual(
        validateAdminOperatorRequest({
            action: 'grant',
            confirm: 'admin-membership-change',
            email: 'owner@example.test',
            reason: 'Initial owner bootstrap',
        }),
        {
            action: 'grant',
            confirm: 'admin-membership-change',
            email: 'owner@example.test',
            reason: 'Initial owner bootstrap',
        },
    );
    assert.throws(
        () =>
            validateAdminOperatorRequest({
                action: 'revoke',
                confirm: 'yes',
                email: 'owner@example.test',
                reason: 'Rotate owner access',
            }),
        /literal admin-membership-change/,
    );
    assert.throws(
        () => validateAdminOperatorRequest({ action: 'list', reason: 'extra' }),
        /does not accept mutation fields/,
    );
});

test('remote argument parser rejects unknown flags before opening SSH', () => {
    assert.throws(
        () =>
            parseRemoteAdminArguments([
                'list',
                '--target',
                'root@example.test',
                '--shell-command',
                'whoami',
            ]),
        /Unknown option --shell-command/,
    );
});

test('rejects shell-active SSH targets and remote paths', () => {
    assert.throws(
        () => validateRemoteAdminTarget('root@host;touch-pwned'),
        /user@host form/,
    );
    assert.throws(
        () =>
            validateRemoteAdminPath(
                '/opt/releases;touch-pwned',
                '--remote-root',
            ),
        /normalized absolute remote path/,
    );
    assert.equal(
        validateRemoteAdminPath('/opt/languon/releases', '--remote-root'),
        '/opt/languon/releases',
    );
});

test('runs the built operator in the active immutable backend slot', async () => {
    const fixture = await createFixture();
    const calls = [];
    const result = await runRemoteAdminOperator({
        ...fixture,
        environment: 'stage',
        repositoryRoot: fixture.directory,
        request: validateAdminOperatorRequest({
            action: 'revoke',
            actorEmail: 'actor@example.test',
            confirm: 'admin-membership-change',
            email: 'owner@example.test',
            reason: 'Owner access is no longer required',
        }),
        runner: async (command, args, options) => {
            calls.push({ args, command, options });
            return { stdout: '{"result":"revoked"}\n', stderr: '' };
        },
    });
    assert.equal(result.releaseIdentity, manifest.identity);
    assert.equal(calls.length, 1);
    const call = calls[0];
    assert.equal(call.command, 'docker');
    assert.ok(call.args.includes('test-stage-green'));
    assert.ok(call.args.includes(manifest.images.backend) === false);
    assert.equal(call.options.env.BACKEND_IMAGE, manifest.images.backend);
    assert.deepEqual(call.args.slice(-2), [
        'dist/infrastructure/administration/admin-command.js',
        '--request-stdin',
    ]);
    assert.deepEqual(JSON.parse(call.options.input), {
        actorEmail: 'actor@example.test',
        command: 'revoke',
        confirm: 'admin-membership-change',
        email: 'owner@example.test',
        reason: 'Owner access is no longer required',
    });
});

test('refuses a manifest that is not the active release', async () => {
    const fixture = await createFixture({ ...manifest, identity: 'older' });
    await assert.rejects(
        () =>
            runRemoteAdminOperator({
                ...fixture,
                environment: 'stage',
                repositoryRoot: fixture.directory,
                request: { action: 'list' },
                runner: async () => {
                    throw new Error('must not run');
                },
            }),
        /not the active release/,
    );
});
