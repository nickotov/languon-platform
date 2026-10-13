import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    normalizeSharedSpeech,
    normalizeModelPricing,
    assertSharedSpeechOverlap,
} from '../lib/shared-speech.mjs';
import {
    Deployment,
    assertDictionaryWorkerDatabasePrivileges,
} from '../lib/deployment.mjs';

const speech = {
    phase: 'compatibility',
    apiEnqueued: [],
    apiReadable: [1],
    workerProcessable: [1],
    webReadable: [1],
    adminReadable: [1],
    purgeReadable: [1],
    billingSchemas: ['speech-generation:v1'],
};
const pricing = {
    phase: 'compatibility',
    apiAdmitted: [],
    workerProcessable: [1],
};
const floor = { sharedSpeech: speech, modelPricing: pricing };
const enabled = {
    sharedSpeech: { ...speech, phase: 'enabled', apiEnqueued: [1] },
    modelPricing: { ...pricing, phase: 'enabled', apiAdmitted: [1] },
};

test('historical releases cannot implicitly admit shared speech or revised pricing', () => {
    assert.deepEqual(normalizeSharedSpeech().apiEnqueued, []);
    assert.deepEqual(normalizeModelPricing().apiAdmitted, []);
    assert.throws(
        () => assertSharedSpeechOverlap({}, enabled),
        /Rollback floor/,
    );
    assert.throws(() => assertSharedSpeechOverlap(enabled, {}), /Next worker/);
});

test('shared speech rollout requires complete readers and typed success settlement support', () => {
    assert.deepEqual(
        normalizeSharedSpeech(enabled.sharedSpeech),
        enabled.sharedSpeech,
    );
    assert.throws(
        () =>
            normalizeSharedSpeech({
                ...enabled.sharedSpeech,
                billingSchemas: [],
            }),
        /billing/,
    );
    assert.throws(
        () =>
            normalizeSharedSpeech({
                ...enabled.sharedSpeech,
                billingSchemas: ['arbitrary:v1'],
            }),
        /billing/,
    );
    assert.throws(
        () =>
            normalizeSharedSpeech({
                ...enabled.sharedSpeech,
                purgeReadable: [],
            }),
        /purgeReadable/,
    );
    assert.throws(
        () => normalizeSharedSpeech({ ...speech, apiEnqueued: [1] }),
        /Only enabled/,
    );
    assert.throws(
        () => normalizeSharedSpeech({ ...speech, workerProcessable: [1, 1] }),
        /unique/,
    );
    assert.doesNotThrow(() => assertSharedSpeechOverlap(floor, enabled));
    assert.doesNotThrow(() => assertSharedSpeechOverlap(enabled, floor));
    assert.throws(
        () =>
            assertSharedSpeechOverlap(
                { ...floor, sharedSpeech: { ...speech, billingSchemas: [] } },
                enabled,
            ),
        /billing schema/,
    );
});

test('editable-price jobs require revision-aware worker rollback compatibility', () => {
    assert.throws(
        () => normalizeModelPricing({ ...pricing, apiAdmitted: [1] }),
        /Only enabled/,
    );
    assert.throws(
        () =>
            normalizeModelPricing({
                ...enabled.modelPricing,
                workerProcessable: [],
            }),
        /cannot cover/,
    );
    assert.throws(
        () => assertSharedSpeechOverlap({ sharedSpeech: speech }, enabled),
        /model pricing/,
    );
    assert.throws(
        () => assertSharedSpeechOverlap(enabled, { sharedSpeech: speech }),
        /previous model pricing/,
    );
});

test('release-derived speech flags override stale operator enablement and carry both namespaces', () => {
    const deployment = new Deployment({
        environment: 'stage',
        config: {
            SPEECH_PLAYBACK_ENABLED: 'true',
            SPEECH_GENERATION_ENABLED: 'true',
        },
        manifest: {
            images: {
                backend: 'fixture',
                web: 'fixture',
                admin: 'fixture',
                migrator: 'fixture',
            },
        },
        repositoryRoot: '/tmp/repository',
        runtimeDirectory: '/tmp/runtime',
        stateDirectory: '/tmp/state',
    });
    const old = deployment.commandEnvironment('blue');
    assert.equal(old.SPEECH_PLAYBACK_ENABLED, 'false');
    assert.equal(old.SPEECH_GENERATION_ENABLED, 'false');
    assert.equal(old.SPEECH_WORKER_PROCESSABLE_VERSIONS, '');
    deployment.manifest = { ...deployment.manifest, ...floor };
    const expanded = deployment.commandEnvironment('blue');
    assert.equal(expanded.SPEECH_PLAYBACK_ENABLED, 'true');
    assert.equal(expanded.SPEECH_GENERATION_ENABLED, 'false');
    assert.equal(expanded.SPEECH_WORKER_PROCESSABLE_VERSIONS, '1');
    deployment.manifest = { ...deployment.manifest, ...enabled };
    const active = deployment.commandEnvironment('blue');
    assert.equal(active.SPEECH_GENERATION_ENABLED, 'true');
    assert.equal(active.SPEECH_API_ENQUEUED_VERSIONS, '1');
    assert.equal(active.AI_MODEL_PRICE_API_ADMITTED_VERSIONS, '1');
    assert.equal(active.AI_MODEL_PRICE_WORKER_PROCESSABLE_VERSIONS, '1');
});

test('production preflight rejects missing shared execution or mutable pricing privilege', () => {
    assert.throws(
        () =>
            assertDictionaryWorkerDatabasePrivileges(
                {},
                { sharedSpeech: true },
            ),
        /Shared speech/,
    );
    assert.throws(
        () =>
            assertDictionaryWorkerDatabasePrivileges(
                {},
                { modelPricing: true },
            ),
        /immutable model price/,
    );
});

test('speech deployment grants and preflight name the authoritative schema tables', async () => {
    const schema = await readFile(
        'apps/backend/src/modules/speech/infrastructure/schema.ts',
        'utf8',
    );
    const jobTable = schema.match(
        /speechJobsTable\s*=\s*pgTable\(\s*'([^']+)'/u,
    )?.[1];
    assert.equal(jobTable, 'speech_jobs');
    const worker = await readFile(
        'infra/deploy/sql/dictionary-worker-role.sql',
        'utf8',
    );
    const purge = await readFile(
        'infra/deploy/sql/account-purge-worker-role.sql',
        'utf8',
    );
    const deployment = await readFile(
        'infra/deploy/lib/deployment.mjs',
        'utf8',
    );
    for (const source of [worker, purge, deployment]) {
        assert.ok(source.includes(jobTable));
        assert.ok(!source.includes('speech_generation_jobs'));
    }
});
