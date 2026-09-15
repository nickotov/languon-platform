import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
    assertDictionaryGenerationBudgetConfig,
    assertDictionaryWorkerDatabasePrivileges,
    DICTIONARY_WORKER_DATABASE_PRIVILEGE_QUERY,
    Deployment,
} from '../lib/deployment.mjs';
import { validateReleaseManifest } from '../lib/manifest.mjs';
import { runCommand } from '../lib/runner.mjs';

const digest = 'a'.repeat(64);
const baseCapabilities = {
    workerProcessable: ['single-card:v1'],
    apiReadable: ['single-card:v1'],
    apiCancellable: ['single-card:v1'],
    apiDiscardable: ['single-card:v1'],
    apiAcceptable: ['single-card:v1'],
    webReadable: ['single-card:v1'],
    generationBudget: {
        maxInputTokensPerAttempt: 65_536,
        maxOutputTokensPerAttempt: 1_024,
        inputCostMicrosPerMillionTokens: 1_000_000,
        outputCostMicrosPerMillionTokens: 4_000_000,
        maxCostMicrosPerAttempt: 70_000,
    },
};

function release(identity, phase, apiEnqueued, capabilityOverrides = {}) {
    const sourceSha = identity === 'expand' ? 'b'.repeat(40) : 'c'.repeat(40);
    return validateReleaseManifest({
        schemaVersion: 2,
        identity,
        version: null,
        sourceSha,
        verified: true,
        workflowRun: identity === 'expand' ? 1 : 2,
        createdAt: '2026-08-21T10:00:00.000Z',
        migration: { compatibility: 'expand', ledger: 'drizzle' },
        dictionaryJobs: {
            phase,
            ...baseCapabilities,
            apiEnqueued,
            retireFormats: [],
            ...capabilityOverrides,
        },
        images: Object.fromEntries(
            ['backend', 'web', 'admin', 'migrator'].map((name) => [
                name,
                `ghcr.io/test/languon-${name}@sha256:${digest}`,
            ]),
        ),
    });
}

function historicalRelease() {
    const { dictionaryJobs: _, ...manifest } = release('legacy', 'expand', []);
    return validateReleaseManifest({
        ...manifest,
        schemaVersion: 1,
        identity: 'legacy',
        sourceSha: 'd'.repeat(40),
    });
}

const config = {
    ADMIN_BASE_URL: 'https://admin.stage.test',
    ADMIN_HTPASSWD_PATH: '/safe/admin.htpasswd',
    AUTH_ALLOWED_ORIGINS: 'https://stage.test',
    AUTH_CODE_HMAC_SECRET: 'a',
    AUTH_JWT_SECRET: 'b',
    DICTIONARY_HMAC_SECRET: 'c',
    AUTH_WEBAUTHN_RP_ID: 'stage.test',
    DATABASE_URL: 'postgres://u:p@stage-postgres:5432/db',
    DICTIONARY_WORKER_DATABASE_URL:
        'postgres://worker:p@stage-postgres:5432/db',
    MIGRATION_DATABASE_URL: 'postgres://m:p@stage-postgres:5432/db',
    REDIS_URL: 'redis://stage-redis:6379',
    DEPLOY_PROJECT_PREFIX: 'dictionary-overlap',
    EDGE_SUBNET: '172.30.99.0/24',
    PUBLIC_BASE_URL: 'https://stage.test',
    TLS_CERTIFICATE_PATH: '/tls/cert',
    TLS_PRIVATE_KEY_PATH: '/tls/key',
    DICTIONARY_GENERATION_PROVIDER_MODE: 'mastra',
    DICTIONARY_GENERATION_MODEL_API_KEY: 'synthetic-deployment-test-key',
    DICTIONARY_GENERATION_MODEL_BASE_URL: 'https://models.example.test',
    DICTIONARY_GENERATION_MODEL_ID: 'provider/model-v1',
    DICTIONARY_GENERATION_MAX_INPUT_TOKENS: '65536',
    DICTIONARY_GENERATION_MAX_OUTPUT_TOKENS: '1024',
    DICTIONARY_GENERATION_INPUT_COST_MICROS_PER_MILLION_TOKENS: '1000000',
    DICTIONARY_GENERATION_OUTPUT_COST_MICROS_PER_MILLION_TOKENS: '4000000',
    DICTIONARY_GENERATION_MAX_COST_MICROS_PER_ATTEMPT: '70000',
};

test('release budget metadata is bound to the deployed API and worker policy', async () => {
    const manifest = release('expand', 'expand', []);
    assert.doesNotThrow(() =>
        assertDictionaryGenerationBudgetConfig(manifest, config),
    );
    assert.throws(
        () =>
            assertDictionaryGenerationBudgetConfig(manifest, {
                ...config,
                DICTIONARY_GENERATION_MAX_COST_MICROS_PER_ATTEMPT: '69999',
            }),
        /budget must match.*MAX_COST_MICROS_PER_ATTEMPT/,
    );
    const inactiveConfig = Object.fromEntries(
        Object.entries(config).filter(
            ([name]) => !name.startsWith('DICTIONARY_GENERATION_'),
        ),
    );
    assert.throws(
        () => assertDictionaryGenerationBudgetConfig(manifest, inactiveConfig),
        /budget must match/,
    );
    const { calls, deployment } = await fixture(manifest);
    deployment.config = {
        ...config,
        DICTIONARY_GENERATION_MAX_COST_MICROS_PER_ATTEMPT: '69999',
    };
    await assert.rejects(
        () => deployment.deploy(),
        /budget must match.*MAX_COST_MICROS_PER_ATTEMPT/,
    );
    assert.equal(calls.length, 0);
});

async function fixture(manifest, behavior = {}) {
    const directory = await mkdtemp(
        path.join(os.tmpdir(), 'languon-dictionary-overlap-'),
    );
    const calls = [];
    const environments = [];
    let deployment;
    const runner = async (command, args, options = {}) => {
        calls.push([command, ...args]);
        environments.push(options.env ?? {});
        if (
            args.includes('--eval') &&
            args.some((value) =>
                String(value).includes('dictionary_generation_jobs'),
            )
        ) {
            return {
                stdout: JSON.stringify(
                    behavior.retirementCounts ?? {
                        queuedOrRunning: 0,
                        reviewableProposals: 0,
                        documentAwaitingUploads: 0,
                        documentProcessingUploads: 0,
                        documentCleanupUploads: 0,
                        documentTombstoneVersions: 0,
                        documentActiveCapabilities: 0,
                    },
                ),
                stderr: '',
            };
        }
        if (
            behavior.failWorkerReadiness === true &&
            args.includes('up') &&
            args.includes('--wait') &&
            args.includes('dictionary-overlap-green')
        ) {
            throw new Error('private worker readiness failed');
        }
        if (args.includes('sh') && args.includes('-c')) {
            throw new Error('no draining nginx workers');
        }
        return {
            stdout: args.some((value) => String(value).startsWith('http'))
                ? (options.env?.RELEASE_SHA ?? deployment.manifest.sourceSha)
                : '',
            stderr: '',
        };
    };
    return {
        calls,
        directory,
        environments,
        deployment: (deployment = new Deployment({
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
        })),
    };
}

test('expand, activate, slot overlap, and rollback preserve full dictionary job resolution', async () => {
    const expand = release('expand', 'expand', []);
    const activate = release('activate', 'activate', ['single-card:v1']);
    const { calls, deployment, environments } = await fixture(expand);

    await deployment.deploy();
    const beforeActivation = calls.length;
    deployment.manifest = activate;
    await deployment.deploy();

    const activationCalls = calls
        .slice(beforeActivation)
        .map((call) => call.join(' '));
    const startsCandidate = activationCalls.findIndex(
        (line) =>
            line.includes('dictionary-overlap-green') &&
            line.includes('up --detach --no-build'),
    );
    const stopsFloor = activationCalls.findIndex(
        (line) =>
            line.includes('dictionary-overlap-blue') && line.includes('down'),
    );
    assert.ok(startsCandidate >= 0 && startsCandidate < stopsFloor);
    assert.equal(
        environments.some(
            (environment) =>
                environment.DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS ===
                    'single-card:v1' &&
                environment.DICTIONARY_JOB_API_ENQUEUED_FORMATS ===
                    'single-card:v1',
        ),
        true,
    );

    const beforeRollback = calls.length;
    const rollback = await deployment.rollback();
    assert.equal(rollback.outcome, 'rolled-back');
    assert.equal(
        calls
            .slice(beforeRollback)
            .some((call) =>
                call.join(' ').includes('run --rm --no-deps migrator'),
            ),
        false,
    );

    const compose = await readFile(
        'infra/deploy/compose/apps.compose.yaml',
        'utf8',
    );
    assert.match(compose, /dictionary-worker:/);
    assert.match(compose, /dictionary-worker-command\.js/);
    assert.equal(
        (compose.match(/image: \$\{BACKEND_IMAGE/g) ?? []).length,
        3,
        'backend HTTP, dictionary worker, and account-purge roles must reuse one immutable backend image',
    );
});

test('card-authoring activation propagates every worker, API, and web capability through slot overlap', async () => {
    const format = 'card-authoring:v1';
    const lifecycle = {
        workerProcessable: [format],
        apiReadable: [format],
        apiCancellable: [format],
        apiDiscardable: [format],
        apiAcceptable: [format],
        webReadable: [format],
    };
    const expand = release('expand', 'expand', [], lifecycle);
    const activate = release('activate', 'activate', [format], lifecycle);
    const { deployment, environments } = await fixture(expand);

    await deployment.deploy();
    deployment.manifest = activate;
    await deployment.deploy();

    const activated = environments.find(
        (environment) =>
            environment.RELEASE_SHA === activate.sourceSha &&
            environment.DICTIONARY_JOB_API_ENQUEUED_FORMATS === format,
    );
    assert.ok(activated);
    assert.equal(activated.DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS, format);
    assert.equal(activated.DICTIONARY_JOB_API_READABLE_FORMATS, format);
    assert.equal(activated.DICTIONARY_JOB_API_CANCELLABLE_FORMATS, format);
    assert.equal(activated.DICTIONARY_JOB_API_DISCARDABLE_FORMATS, format);
    assert.equal(activated.DICTIONARY_JOB_API_ACCEPTABLE_FORMATS, format);
    assert.equal(activated.DICTIONARY_JOB_WEB_READABLE_FORMATS, format);
});

test('activate, steady expand patch, and rollback restore the activated release', async () => {
    const expand = release('expand', 'expand', []);
    const activate = release('activate', 'activate', ['single-card:v1']);
    const steady = release('steady', 'expand', ['single-card:v1']);
    const { deployment, directory } = await fixture(expand);
    await deployment.deploy();
    deployment.manifest = activate;
    await deployment.deploy();
    deployment.manifest = steady;
    await deployment.deploy();

    const rollback = await deployment.rollback();

    assert.equal(rollback.outcome, 'rolled-back');
    const state = JSON.parse(
        await readFile(
            path.join(directory, 'state/deployment-state.json'),
            'utf8',
        ),
    );
    assert.equal(state.current.identity, 'activate');
    assert.deepEqual(state.current.dictionaryJobs.apiEnqueued, [
        'single-card:v1',
    ]);
});

test('rollback from initial expand to schema-v1 runs the drain gate without retirement metadata', async () => {
    const legacy = historicalRelease();
    const expand = release('expand', 'expand', []);
    const { calls, deployment } = await fixture(legacy);
    await deployment.deploy();
    deployment.manifest = expand;
    await deployment.deploy();
    const beforeRollback = calls.length;

    const rollback = await deployment.rollback();

    assert.equal(rollback.outcome, 'rolled-back');
    const rollbackCalls = calls
        .slice(beforeRollback)
        .map((call) => call.join(' '));
    assert.equal(
        rollbackCalls.some((line) =>
            line.includes('dictionary_generation_jobs'),
        ),
        true,
    );
    assert.equal(
        rollbackCalls.some((line) =>
            line.includes('run --rm --no-deps migrator'),
        ),
        false,
    );
});

test('activation fails before migration when the rollback floor cannot resolve its format', async () => {
    const activate = release('activate', 'activate', ['single-card:v1']);
    const { calls, deployment, directory } = await fixture(activate);
    await assert.rejects(
        () => deployment.deploy(),
        /Rollback-floor release workerProcessable/,
    );
    assert.equal(calls.length, 0);
    const audit = JSON.parse(
        (
            await readFile(
                path.join(directory, 'state/deployment-audit.jsonl'),
                'utf8',
            )
        ).trim(),
    );
    assert.equal(audit.failurePhase, 'preflight');
});

test('activation fails before migration when the live provider remains disabled', async () => {
    const expand = release('expand', 'expand', []);
    const activate = release('activate', 'activate', ['single-card:v1']);
    const { calls, deployment } = await fixture(expand);
    await deployment.deploy();
    const beforeActivation = calls.length;
    deployment.manifest = activate;
    deployment.config = {
        ...deployment.config,
        DICTIONARY_GENERATION_PROVIDER_MODE: 'unavailable',
    };

    await assert.rejects(
        () => deployment.deploy(),
        /requires a configured live provider/,
    );
    assert.equal(calls.length, beforeActivation);
});

test('stop-enqueue keeps live provider required until processable work drains', async () => {
    const expand = release('expand', 'expand', []);
    const activate = release('activate', 'activate', ['single-card:v1']);
    const stopEnqueue = release('stop-enqueue', 'expand', []);
    const { calls, deployment } = await fixture(expand);
    await deployment.deploy();
    deployment.manifest = activate;
    await deployment.deploy();
    const beforeStopEnqueue = calls.length;
    deployment.manifest = stopEnqueue;
    deployment.config = {
        ...deployment.config,
        DICTIONARY_GENERATION_PROVIDER_MODE: 'unavailable',
    };

    await assert.rejects(
        () => deployment.deploy(),
        /worker-processable.*live provider/i,
    );
    assert.equal(calls.length, beforeStopEnqueue);
});

test('budget incompatibility fails before migration and preserves rollback safety', async () => {
    const expand = release('expand', 'expand', []);
    const activate = release('activate', 'activate', ['single-card:v1']);
    const { calls, deployment } = await fixture(expand);
    await deployment.deploy();

    const beforeActivation = calls.length;
    deployment.manifest = release(
        'underpriced-activate',
        'activate',
        ['single-card:v1'],
        {
            generationBudget: {
                ...baseCapabilities.generationBudget,
                inputCostMicrosPerMillionTokens: 500_000,
            },
        },
    );
    deployment.config = {
        ...config,
        DICTIONARY_GENERATION_INPUT_COST_MICROS_PER_MILLION_TOKENS: '500000',
    };
    await assert.rejects(
        () => deployment.deploy(),
        /Rollback-floor worker cannot claim/,
    );
    assert.equal(calls.length, beforeActivation);

    deployment.manifest = activate;
    deployment.config = { ...config };
    await deployment.deploy();
    const beforeSteady = calls.length;
    deployment.manifest = release(
        'underpriced-steady',
        'expand',
        ['single-card:v1'],
        {
            generationBudget: {
                ...baseCapabilities.generationBudget,
                outputCostMicrosPerMillionTokens: 3_000_000,
            },
        },
    );
    deployment.config = {
        ...config,
        DICTIONARY_GENERATION_OUTPUT_COST_MICROS_PER_MILLION_TOKENS: '3000000',
    };
    await assert.rejects(
        () => deployment.deploy(),
        /Rollback-floor worker cannot claim/,
    );
    assert.equal(calls.length, beforeSteady);

    deployment.manifest = release('steady', 'expand', ['single-card:v1']);
    deployment.config = { ...config };
    await deployment.deploy();
    const rollback = await deployment.rollback();
    assert.equal(rollback.outcome, 'rolled-back');
});

test('format retirement is blocked until jobs and reviewable proposals are drained', async () => {
    const expand = release('expand', 'expand', []);
    const retire = release('retire', 'expand', [], {
        workerProcessable: [],
        apiReadable: [],
        apiCancellable: [],
        apiDiscardable: [],
        apiAcceptable: [],
        webReadable: [],
        retireFormats: ['single-card:v1'],
    });
    const behavior = {};
    const { calls, deployment, directory } = await fixture(expand, behavior);
    await deployment.deploy();
    const beforeRetirement = calls.length;
    behavior.retirementCounts = {
        queuedOrRunning: 1,
        reviewableProposals: 2,
        documentAwaitingUploads: 0,
        documentProcessingUploads: 0,
        documentCleanupUploads: 0,
        documentTombstoneVersions: 0,
        documentActiveCapabilities: 0,
    };
    deployment.manifest = retire;

    await assert.rejects(
        () => deployment.deploy(),
        /cannot retire while 1 queued\/running jobs and 2 reviewable proposals remain/,
    );
    const retirementCalls = calls.slice(beforeRetirement);
    assert.equal(
        retirementCalls.some((call) =>
            call.join(' ').includes('dictionary_generation_jobs'),
        ),
        true,
    );
    assert.equal(
        retirementCalls.some((call) =>
            call.join(' ').includes('run --rm --no-deps migrator'),
        ),
        false,
    );
    const audit = JSON.parse(
        (
            await readFile(
                path.join(directory, 'state/deployment-audit.jsonl'),
                'utf8',
            )
        )
            .trim()
            .split('\n')
            .at(-1),
    );
    assert.equal(audit.failurePhase, 'retirement-preflight');
});

test('document format retirement is blocked by every surviving upload lifecycle obligation', async () => {
    const retainedFormat = 'single-card:v1';
    const documentFormat = 'document-terms:v1';
    const expand = release('expand', 'expand', [], {
        workerProcessable: [retainedFormat, documentFormat],
        apiReadable: [retainedFormat, documentFormat],
        apiCancellable: [retainedFormat, documentFormat],
        apiDiscardable: [retainedFormat, documentFormat],
        apiAcceptable: [retainedFormat, documentFormat],
        webReadable: [retainedFormat, documentFormat],
    });
    const retire = release('retire', 'expand', [], {
        workerProcessable: [retainedFormat],
        apiReadable: [retainedFormat],
        apiCancellable: [retainedFormat],
        apiDiscardable: [retainedFormat],
        apiAcceptable: [retainedFormat],
        webReadable: [retainedFormat],
        retireFormats: [documentFormat],
    });
    const behavior = {
        retirementCounts: {
            queuedOrRunning: 0,
            reviewableProposals: 0,
            documentAwaitingUploads: 1,
            documentProcessingUploads: 2,
            documentCleanupUploads: 3,
            documentTombstoneVersions: 4,
            documentActiveCapabilities: 5,
        },
    };
    const { deployment } = await fixture(expand, behavior);
    await deployment.deploy();
    deployment.manifest = retire;

    await assert.rejects(
        () => deployment.deploy(),
        /document blockers: 1 awaiting uploads, 2 processing uploads, 3 cleanup uploads, 4 retained tombstones, and 5 active capabilities/,
    );
});

test('format retirement proceeds after the database is fully drained', async () => {
    const expand = release('expand', 'expand', []);
    const retire = release('retire', 'expand', [], {
        workerProcessable: [],
        apiReadable: [],
        apiCancellable: [],
        apiDiscardable: [],
        apiAcceptable: [],
        webReadable: [],
        retireFormats: ['single-card:v1'],
    });
    const { calls, deployment } = await fixture(expand, {
        retirementCounts: {
            queuedOrRunning: 0,
            reviewableProposals: 0,
            documentAwaitingUploads: 0,
            documentProcessingUploads: 0,
            documentCleanupUploads: 0,
            documentTombstoneVersions: 0,
            documentActiveCapabilities: 0,
        },
    });
    await deployment.deploy();
    const beforeRetirement = calls.length;
    deployment.manifest = retire;

    await deployment.deploy();
    const retirementCalls = calls
        .slice(beforeRetirement)
        .map((call) => call.join(' '));
    const preflight = retirementCalls.findIndex((line) =>
        line.includes('dictionary_generation_jobs'),
    );
    const migration = retirementCalls.findIndex((line) =>
        line.includes('run --rm --no-deps migrator'),
    );
    assert.ok(preflight >= 0 && preflight < migration);
});

test('unhealthy private worker readiness blocks activation before traffic switch', async () => {
    const expand = release('expand', 'expand', []);
    const activate = release('activate', 'activate', ['single-card:v1']);
    const behavior = {};
    const { calls, deployment, directory } = await fixture(expand, behavior);
    await deployment.deploy();
    const beforeActivation = calls.length;
    behavior.failWorkerReadiness = true;
    deployment.manifest = activate;

    await assert.rejects(
        () => deployment.deploy(),
        /private worker readiness failed/,
    );
    const activationCalls = calls
        .slice(beforeActivation)
        .map((call) => call.join(' '));
    assert.equal(
        activationCalls.some(
            (line) =>
                line.includes('dictionary-overlap-green') &&
                line.includes('up --detach --no-build --wait'),
        ),
        true,
    );
    assert.equal(
        activationCalls.some((line) => line.includes('nginx -s reload')),
        false,
    );
    const state = JSON.parse(
        await readFile(
            path.join(directory, 'state/deployment-state.json'),
            'utf8',
        ),
    );
    assert.equal(state.activeSlot, 'blue');
});

test(
    'worker database preflight accepts full grants and rejects partial roles',
    {
        skip: process.env.LANGUON_DEPLOY_DB_E2E !== 'true',
        timeout: 60_000,
    },
    async () => {
        const container = `languon-worker-privileges-${process.pid}`;
        const postgresImage =
            'postgres:17-alpine@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193';
        const postgres = (args, options = {}) =>
            runCommand(
                'docker',
                [
                    'exec',
                    '--interactive',
                    '--env',
                    'PGPASSWORD=postgres',
                    container,
                    'psql',
                    '--host',
                    '127.0.0.1',
                    '--username',
                    'postgres',
                    '--dbname',
                    'postgres',
                    '--no-psqlrc',
                    ...args,
                ],
                { capture: true, ...options },
            );
        try {
            await runCommand(
                'docker',
                [
                    'run',
                    '--detach',
                    '--name',
                    container,
                    '--env',
                    'POSTGRES_PASSWORD=postgres',
                    postgresImage,
                ],
                { capture: true },
            );
            let ready = false;
            for (let attempt = 0; attempt < 40; attempt += 1) {
                ready = await postgres(['--command', 'select 1']).then(
                    () => true,
                    () => false,
                );
                if (ready) break;
                await new Promise((resolve) => setTimeout(resolve, 250));
            }
            assert.equal(ready, true, 'disposable PostgreSQL did not start');
            await postgres(['--file', '-'], {
                input: [
                    "create role languon_dictionary_worker login password 'worker-test';",
                    "create role worker_select_only login password 'select-test';",
                    "create role worker_missing_insert login password 'insert-test';",
                    "create role worker_missing_update login password 'update-test';",
                    "create role worker_excess_auth login password 'excess-test';",
                    "create role worker_excess_generation login password 'generation-excess-test';",
                    'create table dictionary_generation_jobs (id integer primary key);',
                    'create table dictionary_generation_proposals (id integer primary key);',
                    'create table dictionary_generation_provider_circuit (id integer primary key);',
                    'create table dictionary_document_uploads (id integer primary key);',
                    'create table dictionary_document_object_versions (id integer primary key);',
                    'create table dictionary_document_extractions (id integer primary key);',
                    'create table dictionary_settings (id integer primary key);',
                    'create table dictionaries (id integer primary key);',
                    'create table dictionary_cards (id integer primary key, dictionary_id integer not null, source text not null, sort_key bigint not null, translation text not null);',
                    'create table dictionary_card_revisions (id integer primary key);',
                    'create table dictionary_idempotency_keys (id integer primary key);',
                    'create table users (id integer primary key);',
                    'create table user_emails (id integer primary key);',
                    'create table password_credentials (id integer primary key);',
                    'create table auth_verification_challenges (id integer primary key);',
                    'create table auth_sessions (id integer primary key);',
                    'create table auth_passkeys (id integer primary key);',
                    'create table auth_security_events (id integer primary key);',
                    'create table admin_memberships (id integer primary key);',
                    'create table admin_audit_events (id integer primary key);',
                    'insert into dictionary_generation_jobs values (1);',
                    'insert into dictionary_settings values (1);',
                    'grant usage on schema public to worker_select_only, worker_missing_insert, worker_missing_update;',
                    'grant select on dictionary_generation_jobs, dictionary_generation_proposals, dictionary_generation_provider_circuit, dictionary_settings to worker_select_only, worker_missing_insert, worker_missing_update;',
                    'grant update on dictionary_generation_jobs, dictionary_generation_proposals, dictionary_generation_provider_circuit to worker_missing_insert;',
                    'grant insert on dictionary_generation_proposals, dictionary_generation_provider_circuit to worker_missing_update;',
                ].join('\n'),
            });
            const grants = await readFile(
                'infra/deploy/sql/dictionary-worker-role.sql',
                'utf8',
            );
            await postgres(
                [
                    '--set',
                    'dictionary_worker_role=languon_dictionary_worker',
                    '--file',
                    '-',
                ],
                { input: grants },
            );
            await postgres(['--file', '-'], {
                input: [
                    'grant languon_dictionary_worker to worker_excess_auth;',
                    'grant insert, update, delete, truncate, references, trigger on auth_sessions to worker_excess_auth;',
                    'grant languon_dictionary_worker to worker_excess_generation;',
                    'grant delete on dictionary_generation_jobs to worker_excess_generation;',
                    'grant select on dictionaries to worker_excess_generation;',
                    'grant select (translation) on dictionary_cards to worker_excess_generation;',
                    'grant create on schema public to worker_excess_generation;',
                ].join('\n'),
            });
            const queryAs = (username, password, statement) =>
                runCommand(
                    'docker',
                    [
                        'exec',
                        '--env',
                        `PGPASSWORD=${password}`,
                        container,
                        'psql',
                        '--host',
                        '127.0.0.1',
                        '--username',
                        username,
                        '--dbname',
                        'postgres',
                        '--no-psqlrc',
                        '--tuples-only',
                        '--no-align',
                        '--set',
                        'ON_ERROR_STOP=1',
                        '--command',
                        statement,
                    ],
                    { capture: true },
                );
            const worker = (statement) =>
                queryAs('languon_dictionary_worker', 'worker-test', statement);
            const readPrivileges = async (username, password) => {
                const { stdout } = await queryAs(
                    username,
                    password,
                    DICTIONARY_WORKER_DATABASE_PRIVILEGE_QUERY,
                );
                const values = stdout
                    .trim()
                    .split('|')
                    .map((value) => value === 't');
                const [
                    jobs,
                    proposals,
                    providerCircuit,
                    documentUploads,
                    documentObjectVersions,
                    documentExtractions,
                    settings,
                    dictionaryCardDuplicateColumns,
                    jobsUnexpected,
                    proposalsUnexpected,
                    providerCircuitUnexpected,
                    documentUploadsUnexpected,
                    documentObjectVersionsUnexpected,
                    documentExtractionsUnexpected,
                    settingsUnexpected,
                    dictionaries,
                    dictionaryCards,
                    dictionaryCardsUnexpectedColumns,
                    dictionaryCardRevisions,
                    dictionaryIdempotencyKeys,
                    schemaCreate,
                    users,
                    userEmails,
                    passwordCredentials,
                    authVerificationChallenges,
                    authSessions,
                    authPasskeys,
                    authSecurityEvents,
                    adminMemberships,
                    adminAuditEvents,
                ] = values;
                return {
                    jobs,
                    proposals,
                    providerCircuit,
                    documentUploads,
                    documentObjectVersions,
                    documentExtractions,
                    settings,
                    dictionaryCardDuplicateColumns,
                    jobsUnexpected,
                    proposalsUnexpected,
                    providerCircuitUnexpected,
                    documentUploadsUnexpected,
                    documentObjectVersionsUnexpected,
                    documentExtractionsUnexpected,
                    settingsUnexpected,
                    dictionaries,
                    dictionaryCards,
                    dictionaryCardsUnexpectedColumns,
                    dictionaryCardRevisions,
                    dictionaryIdempotencyKeys,
                    schemaCreate,
                    users,
                    userEmails,
                    passwordCredentials,
                    authVerificationChallenges,
                    authSessions,
                    authPasskeys,
                    authSecurityEvents,
                    adminMemberships,
                    adminAuditEvents,
                };
            };
            const fullPrivileges = await readPrivileges(
                'languon_dictionary_worker',
                'worker-test',
            );
            assert.doesNotThrow(() =>
                assertDictionaryWorkerDatabasePrivileges(fullPrivileges),
            );
            for (const [username, password, expectedRequired] of [
                [
                    'worker_select_only',
                    'select-test',
                    {
                        jobs: false,
                        proposals: false,
                        providerCircuit: false,
                        settings: true,
                    },
                ],
                [
                    'worker_missing_insert',
                    'insert-test',
                    {
                        jobs: true,
                        proposals: false,
                        providerCircuit: false,
                        settings: true,
                    },
                ],
                [
                    'worker_missing_update',
                    'update-test',
                    {
                        jobs: false,
                        proposals: false,
                        providerCircuit: false,
                        settings: true,
                    },
                ],
            ]) {
                const partialPrivileges = await readPrivileges(
                    username,
                    password,
                );
                assert.deepEqual(
                    {
                        jobs: partialPrivileges.jobs,
                        proposals: partialPrivileges.proposals,
                        providerCircuit: partialPrivileges.providerCircuit,
                        settings: partialPrivileges.settings,
                    },
                    expectedRequired,
                );
                assert.throws(
                    () =>
                        assertDictionaryWorkerDatabasePrivileges(
                            partialPrivileges,
                        ),
                    /least-privilege boundary/,
                );
            }
            const excessivePrivileges = await readPrivileges(
                'worker_excess_auth',
                'excess-test',
            );
            assert.deepEqual(
                {
                    jobs: excessivePrivileges.jobs,
                    proposals: excessivePrivileges.proposals,
                    providerCircuit: excessivePrivileges.providerCircuit,
                    settings: excessivePrivileges.settings,
                },
                {
                    jobs: true,
                    proposals: true,
                    providerCircuit: true,
                    settings: true,
                },
            );
            assert.equal(excessivePrivileges.authSessions, true);
            assert.throws(
                () =>
                    assertDictionaryWorkerDatabasePrivileges(
                        excessivePrivileges,
                    ),
                /least-privilege boundary/,
            );
            const excessiveGenerationPrivileges = await readPrivileges(
                'worker_excess_generation',
                'generation-excess-test',
            );
            assert.equal(excessiveGenerationPrivileges.jobsUnexpected, true);
            assert.equal(excessiveGenerationPrivileges.dictionaries, true);
            assert.equal(
                excessiveGenerationPrivileges.dictionaryCardsUnexpectedColumns,
                true,
            );
            assert.equal(excessiveGenerationPrivileges.schemaCreate, true);
            assert.throws(
                () =>
                    assertDictionaryWorkerDatabasePrivileges(
                        excessiveGenerationPrivileges,
                    ),
                /least-privilege boundary/,
            );
            await worker(
                'select * from dictionary_generation_jobs; update dictionary_generation_jobs set id = 1 where id = 1; insert into dictionary_generation_proposals values (1); update dictionary_generation_proposals set id = 1 where id = 1; insert into dictionary_generation_provider_circuit values (1); update dictionary_generation_provider_circuit set id = 1 where id = 1; select * from dictionary_settings;',
            );
            await worker(
                'select * from dictionary_document_uploads; update dictionary_document_uploads set id = 1 where id = 1; insert into dictionary_document_object_versions values (1); update dictionary_document_object_versions set id = 1 where id = 1; insert into dictionary_document_extractions values (1); update dictionary_document_extractions set id = 1 where id = 1;',
            );
            await worker(
                'select id, dictionary_id, source, sort_key from dictionary_cards;',
            );
            await assert.rejects(() =>
                worker('select translation from dictionary_cards;'),
            );
            for (const table of [
                'users',
                'user_emails',
                'password_credentials',
                'auth_verification_challenges',
                'auth_sessions',
                'auth_passkeys',
                'auth_security_events',
                'admin_memberships',
                'admin_audit_events',
            ]) {
                await assert.rejects(() => worker(`select * from ${table};`));
            }
        } finally {
            await runCommand('docker', ['rm', '--force', container], {
                capture: true,
            }).catch(() => undefined);
        }
    },
);
