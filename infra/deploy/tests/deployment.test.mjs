import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Deployment } from '../lib/deployment.mjs';

const sha = 'b'.repeat(40);
const digest = 'a'.repeat(64);
const manifest = {
    schemaVersion: 1,
    identity: 'stage-test',
    version: null,
    sourceSha: sha,
    verified: true,
    workflowRun: 1,
    createdAt: '2026-08-18T10:00:00.000Z',
    migration: { compatibility: 'expand', ledger: 'drizzle' },
    images: Object.fromEntries(
        ['backend', 'web', 'admin', 'migrator'].map((name) => [
            name,
            `ghcr.io/test/languon-${name}@sha256:${digest}`,
        ]),
    ),
};
const config = {
    ADMIN_BASE_URL: 'https://admin.stage.test',
    ADMIN_HTPASSWD_PATH: '/safe/admin.htpasswd',
    AUTH_ALLOWED_ORIGINS: 'https://stage.test',
    AUTH_CODE_HMAC_SECRET: 'a',
    AUTH_JWT_SECRET: 'b',
    AUTH_WEBAUTHN_RP_ID: 'stage.test',
    DATABASE_URL: 'postgres://u:p@stage-postgres:5432/db',
    MIGRATION_DATABASE_URL: 'postgres://m:p@stage-postgres:5432/db',
    REDIS_URL: 'redis://stage-redis:6379',
    DEPLOY_PROJECT_PREFIX: 'test-stage',
    EDGE_SUBNET: '172.30.99.0/24',
    PUBLIC_BASE_URL: 'https://stage.test',
    TLS_CERTIFICATE_PATH: '/tls/cert',
    TLS_PRIVATE_KEY_PATH: '/tls/key',
};

async function fixture(behavior = {}) {
    const directory = await mkdtemp(
        path.join(os.tmpdir(), 'languon-deploy-test-'),
    );
    const calls = [];
    const environments = [];
    const runner = async (command, args, options = {}) => {
        calls.push([command, ...args]);
        environments.push(options.env ?? {});
        if (
            behavior.failMigration &&
            args.includes('migrator') &&
            args.includes('run')
        ) {
            throw new Error('migration fixture failed');
        }
        if (
            behavior.failNginxTest &&
            args.includes('nginx') &&
            args.includes('-t')
        ) {
            throw new Error('nginx fixture failed');
        }
        if (
            behavior.failReadiness &&
            args.some((value) => String(value).includes('-backend:4000/readyz'))
        ) {
            throw new Error('readiness fixture failed');
        }
        if (
            behavior.failCleanup &&
            args.includes('--project-name') &&
            args.includes('test-stage-blue') &&
            args.includes('down')
        ) {
            throw new Error('cleanup fixture failed');
        }
        if (args.includes('sh') && args.includes('-c'))
            throw new Error('no old workers');
        return {
            stdout: args.some((value) => String(value).startsWith('http'))
                ? (behavior.responseSha ?? options.env?.RELEASE_SHA ?? sha)
                : '',
            stderr: '',
        };
    };
    return {
        calls,
        environments,
        directory,
        deployment: new Deployment({
            environment: 'stage',
            config,
            configPath: '/unused',
            manifest,
            repositoryRoot: path.resolve('.'),
            runtimeDirectory: path.join(directory, 'runtime'),
            stateDirectory: path.join(directory, 'state'),
            runner,
            drainSeconds: 0,
            pollMilliseconds: 1,
        }),
    };
}

test('orders migration before inactive start, readiness, switch, smoke and cleanup', async () => {
    const { deployment, calls } = await fixture();
    const audit = await deployment.deploy();
    const rendered = calls.map((call) => call.join(' '));
    const migration = rendered.findIndex((line) =>
        line.includes('run --rm --no-deps migrator'),
    );
    const start = rendered.findIndex((line) =>
        line.includes('up --detach --no-build'),
    );
    const readiness = rendered.findIndex((line) =>
        line.includes('blue-backend:4000/readyz'),
    );
    const nginx = rendered.findIndex((line) =>
        line.includes('edge.compose.yaml'),
    );
    assert.ok(migration >= 0 && migration < start);
    assert.ok(start < readiness && readiness < nginx);
    assert.equal(audit.outcome, 'succeeded');
    assert.equal(audit.newSlot, 'blue');
    assert.equal(audit.actor.includes('\n'), false);
});

test('migration failure never starts or switches a slot and records bounded audit', async () => {
    const { deployment, calls, directory } = await fixture({
        failMigration: true,
    });
    await assert.rejects(() => deployment.deploy(), /migration fixture failed/);
    const rendered = calls.map((call) => call.join(' '));
    assert.equal(
        rendered.some((line) => line.includes('up --detach --no-build')),
        false,
    );
    assert.equal(
        rendered.some((line) => line.includes('nginx -s reload')),
        false,
    );
    const audit = JSON.parse(
        (
            await readFile(
                path.join(directory, 'state/deployment-audit.jsonl'),
                'utf8',
            )
        ).trim(),
    );
    assert.equal(audit.failurePhase, 'migration');
    assert.equal(audit.outcome, 'failed');
});

test('readiness failure preserves the active slot and removes only the candidate', async () => {
    const behavior = {};
    const { deployment, calls, directory } = await fixture(behavior);
    await deployment.deploy();
    behavior.failReadiness = true;
    const beforeFailure = calls.length;

    await assert.rejects(() => deployment.deploy(), /readiness fixture failed/);

    const state = JSON.parse(
        await readFile(
            path.join(directory, 'state/deployment-state.json'),
            'utf8',
        ),
    );
    const failureCalls = calls
        .slice(beforeFailure)
        .map((call) => call.join(' '));
    assert.equal(state.activeSlot, 'blue');
    assert.equal(
        failureCalls.some(
            (line) =>
                line.includes('test-stage-green') && line.includes('down'),
        ),
        true,
    );
    assert.equal(
        failureCalls.some((line) => line.includes('nginx -s reload')),
        false,
    );
});

test('production backup gate is bound to production evidence', async () => {
    const { deployment, calls } = await fixture();
    deployment.environment = 'production';
    deployment.config = {
        ...deployment.config,
        BACKUP_MANIFEST_PATH: '/backup/latest.json',
    };
    await deployment.verifyBackupGate();
    assert.deepEqual(calls.at(-1).slice(1, 4), [
        'check-fresh',
        '--environment',
        'production',
    ]);
});

test('failed NGINX validation restores the previously mounted upstream file', async () => {
    const { deployment, directory } = await fixture({ failNginxTest: true });
    await deployment.prepare();
    const upstream = path.join(directory, 'runtime/active-upstream.conf');
    const original = await readFile(upstream, 'utf8');
    await assert.rejects(
        () => deployment.validateAndSwitch('blue', true),
        /nginx fixture failed/,
    );
    assert.equal(await readFile(upstream, 'utf8'), original);
});

test('runtime directory is mounted so atomic upstream replacement is visible to NGINX', async () => {
    const compose = await readFile(
        'infra/deploy/compose/edge.compose.yaml',
        'utf8',
    );
    assert.match(compose, /DEPLOY_RUNTIME_DIR[^\n]*:\/etc\/nginx\/languon:ro/);
    assert.doesNotMatch(compose, /active-upstream\.conf:\/etc/);
});

test('stage and production application environments map explicitly', async () => {
    const stage = (await fixture()).deployment.commandEnvironment('blue');
    assert.equal(stage.APP_ENV, 'staging');
    const production = (await fixture()).deployment;
    production.environment = 'production';
    assert.equal(production.commandEnvironment('blue').APP_ENV, 'production');
});

test('rollback redeploys the previous images without running an older migrator', async () => {
    const behavior = {};
    const { deployment, calls, environments } = await fixture(behavior);
    await deployment.deploy();
    const secondDigest = 'c'.repeat(64);
    deployment.manifest = {
        ...manifest,
        identity: 'stage-second',
        sourceSha: 'c'.repeat(40),
        images: Object.fromEntries(
            ['backend', 'web', 'admin', 'migrator'].map((name) => [
                name,
                `ghcr.io/test/languon-${name}@sha256:${secondDigest}`,
            ]),
        ),
    };
    behavior.responseSha = deployment.manifest.sourceSha;
    await deployment.deploy();
    const beforeRollback = calls.length;

    behavior.responseSha = manifest.sourceSha;
    const audit = await deployment.rollback();
    const rollbackCalls = calls
        .slice(beforeRollback)
        .map((call) => call.join(' '));

    assert.equal(
        rollbackCalls.some((line) =>
            line.includes('run --rm --no-deps migrator'),
        ),
        false,
    );
    const rollbackEnvironments = environments.slice(beforeRollback);
    assert.equal(
        rollbackEnvironments.some(
            (environment) =>
                environment.BACKEND_IMAGE === manifest.images.backend,
        ),
        true,
    );
    assert.equal(
        rollbackEnvironments.some(
            (environment) =>
                environment.BACKEND_IMAGE ===
                deployment.manifest.images.backend,
        ),
        true,
    );
    assert.equal(
        rollbackEnvironments.some((environment) =>
            environment.BACKEND_IMAGE?.includes(secondDigest),
        ),
        false,
    );
    assert.equal(audit.outcome, 'rolled-back');
});

test('cleanup failure preserves the committed new slot and state', async () => {
    const behavior = {};
    const { deployment, calls, directory } = await fixture(behavior);
    await deployment.deploy();
    behavior.failCleanup = true;
    const beforeFailure = calls.length;

    await assert.rejects(() => deployment.deploy(), /cleanup fixture failed/);

    const state = JSON.parse(
        await readFile(
            path.join(directory, 'state/deployment-state.json'),
            'utf8',
        ),
    );
    const failureCalls = calls
        .slice(beforeFailure)
        .map((call) => call.join(' '));
    assert.equal(state.activeSlot, 'green');
    assert.equal(
        failureCalls.some(
            (line) =>
                line.includes('test-stage-green') && line.includes('down'),
        ),
        false,
    );
    assert.equal(
        failureCalls.filter((line) => line.includes('nginx -s reload')).length,
        1,
    );
});

test('audit persistence failure never tears down the committed new slot', async () => {
    const { deployment, calls, directory } = await fixture();
    await deployment.deploy();
    const beforeFailure = calls.length;
    deployment.appendAudit = async () => {
        throw new Error('audit fixture failed');
    };

    await assert.rejects(() => deployment.deploy(), /audit fixture failed/);

    const state = JSON.parse(
        await readFile(
            path.join(directory, 'state/deployment-state.json'),
            'utf8',
        ),
    );
    const failureCalls = calls
        .slice(beforeFailure)
        .map((call) => call.join(' '));
    assert.equal(state.activeSlot, 'green');
    assert.equal(
        failureCalls.some(
            (line) =>
                line.includes('test-stage-green') && line.includes('down'),
        ),
        false,
    );
});
