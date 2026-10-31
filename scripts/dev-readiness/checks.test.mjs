import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    capabilityRequirements,
    selectCapabilities,
    evaluateReadiness as evaluateRaw,
    validateLocalEnvironment,
} from './checks.mjs';
import { tsImport } from 'tsx/esm/api';
const { createTextAiRouteFingerprint } = await tsImport(
    '../../apps/backend/src/infrastructure/text-ai/route-fingerprint.ts',
    import.meta.url,
);
import { migrationStatus } from './database.mjs';

const evaluateReadiness = (...args) =>
    evaluateRaw(...args).map((check) => ({
        ...check,
        id: check.id.split('/').at(-1),
    }));

const env = {
    APP_ENV: 'development',
    DATABASE_URL: 'postgres://local:secret@127.0.0.1:55444/local_test',
    DICTIONARY_AI_MANAGED_ROUTING_ENABLED: 'true',
    DICTIONARY_AI_DEEPSEEK_CREDENTIAL_CONFIGURED: 'true',
    DEEPSEEK_API_KEY: 'synthetic-private-key',
    TEXTS_AI_ENABLED: 'true',
    DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS: capabilityRequirements
        .flatMap((c) => c.formats)
        .join(','),
};
function snapshot() {
    return {
        routing: {
            configuration: {
                default: {
                    primaryRouteId: 'deepseek/deepseek-flash',
                    fallbackRouteIds: [],
                },
                overrides: {},
                enabledRouteIds: ['deepseek/deepseek-flash'],
                flowTariffs: Object.fromEntries(
                    capabilityRequirements.flatMap((c) =>
                        c.formats.map((format) => [
                            format.split(':')[0],
                            {
                                inputCreditsPerMillionTokens: 100,
                                outputCreditsPerMillionTokens: 300,
                            },
                        ]),
                    ),
                ),
            },
        },
        probes: [
            ...new Set(
                capabilityRequirements.flatMap((c) =>
                    c.formats.map((format) => format.split(':')[0]),
                ),
            ),
        ].map((flow_id) => ({
            route_id: 'deepseek/deepseek-flash',
            flow_id,
            kind: 'flow',
            state: 'passed',
            dispatch_allowed: true,
            fingerprint: createTextAiRouteFingerprint(env)(
                'deepseek/deepseek-flash',
                flow_id,
            ),
            evidence_expires_at: '2099-01-01T00:00:00.000Z',
        })),
        configuration: {
            modelId: 'deepseek-flash',
            providerId: 'deepseek',
            enabledModelIds: ['deepseek-flash'],
        },
        prices: [
            {
                model_id: 'deepseek-flash',
                provider_id: 'deepseek',
                data: {
                    inputUsdPerMillionTokens: '0.3',
                    outputUsdPerMillionTokens: '1.2',
                    cacheReadUsdPerMillionTokens: '0.006',
                },
            },
        ],
        tariffs: [{ model_id: 'deepseek-flash', provider_id: 'deepseek' }],
        settings: {
            default_max_credits_per_action: '10',
            max_provider_cost_usd_per_action: '0.1',
            max_provider_cost_usd_per_account_day: '1',
            max_provider_cost_usd_per_day: '5',
        },
        workers: [
            'text-ai-capacity',
            'texts-execution',
            'conversation-execution',
            'portrait-interview-execution',
            'sentence-execution',
        ].map((kind) => ({
            id: `${kind}:v1/${createHash('sha256').update('fixture\0deepseek\0deepseek-flash').digest('hex')}`,
            worker_id: 'fixture',
            provider_id: 'deepseek',
            adapter_revision: 'openai-compatible:v1',
            model_id: 'deepseek-flash',
            status: 'available',
            text_ai_selection_revision: 1,
            text_ai_capacity_revision: 1,
            texts_capacity_revision: 1,
            texts_execution_revision: 1,
            conversation_capacity_revision: 1,
            conversation_execution_revision: 1,
            learning_execution_revision: 1,
            credit_settlement_revision: 1,
            text_ai_supported_formats: capabilityRequirements.flatMap(
                (c) => c.formats,
            ),
        })),
    };
}

test('refuses remote, query overrides, production, and mismatched database without exposing credentials', () => {
    for (const overrides of [
        { DATABASE_URL: 'postgres://secret@remote.invalid/db' },
        { DATABASE_URL: `${env.DATABASE_URL}?host=remote.invalid` },
        { APP_ENV: 'production' },
        { NODE_ENV: 'production' },
        { POSTGRES_DB: 'other' },
    ])
        assert.throws(
            () => validateLocalEnvironment({ ...env, ...overrides }),
            (error) => !error.message.includes('secret'),
        );
    assert.deepEqual(validateLocalEnvironment(env), {
        host: '127.0.0.1',
        port: '55444',
        database: 'local_test',
    });
});

test('configured setup passes and phase configuration needs no running workers', () => {
    const value = snapshot();
    assert.ok(evaluateReadiness(value, env).every((c) => c.status === 'pass'));
    value.workers = [];
    assert.ok(
        evaluateReadiness(value, env, 'configuration').every(
            (c) => c.status === 'pass',
        ),
    );
    assert.equal(
        evaluateReadiness(value, env).find((c) => c.id === 'texts:worker')
            .status,
        'blocked',
    );
});

test('reproduces old formats and absent prices with precise remediation', () => {
    const value = snapshot();
    value.prices = [];
    value.workers.forEach((worker) => {
        worker.text_ai_supported_formats = ['text-detection:v1'];
    });
    const result = evaluateReadiness(value, {
        ...env,
        DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS: 'text-detection:v1',
    });
    assert.match(
        result.find((c) => c.id === 'texts:worker').message,
        /text-detection:v2/,
    );
    assert.match(
        result
            .filter((c) => c.id === 'texts:environment')
            .map((c) => c.message)
            .join(' '),
        /text-translation:v3/,
    );
    assert.equal(
        result.find((c) => c.id === 'provider-price').status,
        'blocked',
    );
});

test('latest provider price missing required cache rate does not pass', () => {
    const value = snapshot();
    value.prices[0].data.cacheReadUsdPerMillionTokens = null;
    assert.equal(
        evaluateReadiness(value, env).find((c) => c.id === 'provider-price')
            .status,
        'blocked',
    );
});

test('exact nonzero fractional learner balance is usable and unlimited skips zero balance', () => {
    const value = {
        ...snapshot(),
        learnerRequested: true,
        learner: { available_milli: '1', max_credits_per_action: '0.001' },
    };
    assert.match(
        evaluateReadiness(value, env).find((c) => c.id === 'learner-balance')
            .message,
        /0.001/,
    );
    value.learner.available_milli = '0';
    assert.equal(
        evaluateReadiness(value, env).find((c) => c.id === 'learner-balance')
            .status,
        'blocked',
    );
    value.learner.unlimited = true;
    assert.equal(
        evaluateReadiness(value, env).some((c) => c.id === 'learner-balance'),
        false,
    );
});

test('new capability requirements are evaluated without changing runner', () => {
    const result = evaluateReadiness(snapshot(), env, 'runtime', [
        { id: 'future', formats: ['future:v1'] },
    ]);
    assert.equal(
        result.find((c) => c.id === 'future:worker').status,
        'blocked',
    );
});

test('migration hashes distinguish pending from incompatible history', () => {
    const expected = [{ created_at: '1', hash: 'a' }];
    assert.equal(migrationStatus(expected, expected).status, 'pass');
    assert.match(migrationStatus([], expected).message, /1 migrations pending/);
    assert.match(
        migrationStatus([{ created_at: '1', hash: 'b' }], expected).message,
        /history differs/,
    );
});

test('dictionary readiness does not require an unconfigured document pipeline', () => {
    const local = {
        ...env,
        DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS:
            'single-card:v2,card-authoring:v3,pasted-terms:v2,import-pairs:v2',
    };
    const formats = selectCapabilities(local, ['dictionary'])[0].formats;
    assert.ok(formats.includes('pasted-terms:v2'));
    assert.ok(!formats.includes('document-terms:v2'));
    for (const configured of [
        ...[
            'ACCEPTABLE',
            'ENQUEUED',
            'READABLE',
            'CANCELLABLE',
            'DISCARDABLE',
        ].map((operation) => ({
            [`DICTIONARY_JOB_API_${operation}_FORMATS`]: 'document-terms:v2',
        })),
        { DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS: 'document-terms:v2' },
        { DICTIONARY_DOCUMENT_RUNTIME_MODE: 'production' },
        { DICTIONARY_DOCUMENT_STORAGE_MODE: 's3' },
    ]) {
        assert.ok(
            selectCapabilities({ ...local, ...configured }, [
                'dictionary',
            ])[0].formats.includes('document-terms:v2'),
        );
    }
});

test('optional disabled capabilities are omitted unless explicitly requested', () => {
    const disabled = {
        ...env,
        TEXTS_AI_ENABLED: 'false',
        LEARNING_SENTENCES_ENABLED: 'false',
    };
    assert.ok(
        !evaluateReadiness(snapshot(), disabled).some(
            (c) => c.id.startsWith('texts:') || c.id.startsWith('sentences:'),
        ),
    );
    const selected = selectCapabilities(disabled, [
        'texts,sentences',
        'interview',
    ]);
    const result = evaluateReadiness(snapshot(), disabled, 'runtime', selected);
    assert.equal(
        result.find((c) => c.id === 'texts:enabled').status,
        'blocked',
    );
    assert.equal(
        result.find((c) => c.id === 'sentences:enabled').status,
        'blocked',
    );
    assert.ok(!result.some((c) => c.id.startsWith('dictionary:')));
    assert.throws(() => selectCapabilities(env, ['typo']));
});

test('runtime wait is bounded and rejects malformed duration', async () => {
    const { parseWaitMs } = await import('../dev-doctor.mjs');
    assert.equal(parseWaitMs('15000'), 15000);
    for (const value of ['-1', '15001', 'Infinity', '1.5', ''])
        assert.throws(() => parseWaitMs(value));
});

test('free selected interview ignores learner credit balance and budget', () => {
    const value = {
        ...snapshot(),
        learnerRequested: true,
        learner: { available_milli: '0', max_credits_per_action: '0' },
    };
    const registry = selectCapabilities(env, ['interview']);
    assert.ok(
        evaluateReadiness(value, env, 'runtime', registry).every(
            (check) => check.status === 'pass',
        ),
    );
    value.policies = [
        { capability: 'portrait-interview', funding: 'customer' },
    ];
    assert.equal(
        evaluateReadiness(value, env, 'runtime', registry).find(
            (check) => check.id === 'learner-balance',
        ).status,
        'blocked',
    );
});

test('legacy and mismatched worker identities cannot claim execution readiness', () => {
    for (const overrides of [
        { texts_execution_revision: null },
        { provider_id: 'kie' },
        { adapter_revision: 'old:v0' },
        { id: 'forged' },
        { credit_settlement_revision: 0 },
    ]) {
        const value = snapshot();
        value.workers = value.workers.map((worker) => ({
            ...worker,
            ...overrides,
        }));
        assert.equal(
            evaluateReadiness(
                value,
                env,
                'runtime',
                selectCapabilities(env, ['texts']),
            ).find((check) => check.id === 'texts:worker').status,
            'blocked',
        );
    }
});

test('new routing is mandatory and stale learner choices cannot override admin routes', () => {
    const value = snapshot();
    value.learner = { mode: 'explicit', model_id: 'gemini-2.5-pro' };
    assert.ok(
        evaluateReadiness(value, env, 'configuration').every(
            (check) => check.status === 'pass',
        ),
    );
    delete value.routing;
    assert.equal(
        evaluateReadiness(value, env, 'configuration').find(
            (check) => check.id === 'model',
        ).status,
        'blocked',
    );
});

test('all primary and fallback routes and per-flow tariffs are inspected', () => {
    const value = snapshot();
    value.routing.configuration.overrides['text-translation'] = {
        primaryRouteId: 'openrouter/openai/gpt-6-luna',
        fallbackRouteIds: ['deepseek/deepseek-flash'],
    };
    value.routing.configuration.enabledRouteIds.push(
        'openrouter/openai/gpt-6-luna',
    );
    delete value.routing.configuration.flowTariffs['text-translation'];
    const result = evaluateRaw(
        value,
        env,
        'configuration',
        selectCapabilities(env, ['texts']),
    );
    assert.ok(
        result.some(
            (check) =>
                check.id.startsWith(
                    'openrouter/openai/gpt-6-luna/text-translation/',
                ) &&
                check.id.endsWith('credential') &&
                check.status === 'blocked',
        ),
    );
    assert.ok(
        result.some(
            (check) =>
                check.id.startsWith(
                    'deepseek/deepseek-flash/text-translation/',
                ) &&
                check.id.endsWith('customer-tariff') &&
                check.status === 'blocked',
        ),
    );
    assert.ok(!JSON.stringify(result).includes('synthetic-private-key'));
});

test('quick-only, changed credential and hard failures cannot establish flow readiness; unchanged aged success warns', () => {
    const registry = selectCapabilities(env, ['interview']);
    for (const change of [
        (probe) => ({ ...probe, kind: 'quick' }),
        (probe) => ({ ...probe, fingerprint: 'stale' }),
        (probe) => ({
            ...probe,
            state: 'failed',
            failure: 'model_retired',
            dispatch_allowed: false,
            completed_at: '2020-01-01T00:00:00Z',
        }),
    ]) {
        const value = snapshot();
        value.probes = value.probes.map(change);
        assert.equal(
            evaluateReadiness(value, env, 'configuration', registry).find(
                (check) => check.id === 'flow-check',
            ).status,
            'blocked',
        );
    }
    const value = snapshot();
    value.probes.forEach(
        (probe) => (probe.evidence_expires_at = '2020-01-01T00:00:00Z'),
    );
    assert.match(
        evaluateReadiness(value, env, 'configuration', registry).find(
            (check) => check.id === 'flow-check',
        ).message,
        /aged/,
    );
    assert.equal(
        evaluateReadiness(
            value,
            { ...env, DEEPSEEK_API_KEY: 'changed-key' },
            'configuration',
            registry,
        ).find((check) => check.id === 'flow-check').status,
        'blocked',
    );
});

test('EvoLink credential and routing alone cannot approve learner data processing', () => {
    const value = snapshot();
    value.routing.configuration.default.primaryRouteId = 'evolink/gpt-6-luna';
    value.routing.configuration.enabledRouteIds = ['evolink/gpt-6-luna'];
    const check = evaluateReadiness(
        value,
        { ...env, EVOLINK_API_KEY: 'synthetic-evolink' },
        'configuration',
        selectCapabilities(env, ['conversation']),
    ).find((check) => check.id === 'selected-model');
    assert.equal(check.status, 'blocked');
    assert.match(check.message, /processing\/privacy/);
});

test('flow-check diagnostics distinguish missing, invalidated and blocked evidence without changing admission', () => {
    const registry = selectCapabilities(env, ['conversation']);
    const flowCheck = (value, environment = env) =>
        evaluateReadiness(value, environment, 'configuration', registry).find(
            (check) => check.id === 'flow-check',
        );
    const missing = snapshot();
    missing.probes = missing.probes.filter(
        (probe) => probe.flow_id !== 'conversation',
    );
    expectBlocked(flowCheck(missing), /No selected-flow check exists/);

    const quickOnly = snapshot();
    quickOnly.probes = quickOnly.probes.map((probe) => ({
        ...probe,
        kind: 'quick',
    }));
    expectBlocked(flowCheck(quickOnly), /quick response.*does not activate/);

    const changed = flowCheck(snapshot(), {
        ...env,
        DEEPSEEK_API_KEY: 'changed-key',
    });
    expectBlocked(changed, /do not match the current execution identity/);
    assert.match(
        changed.message,
        /Affected route: deepseek\/deepseek-flash; flow: conversation/,
    );
    assert.match(changed.message, /explicitly approve its operator expense/);
    assert.ok(!changed.message.includes('changed-key'));

    const failed = snapshot();
    failed.probes = failed.probes.map((probe) => ({
        ...probe,
        state: 'failed',
        dispatch_allowed: false,
    }));
    expectBlocked(flowCheck(failed), /last matching check failed/);
    assert.match(
        flowCheck(failed).message,
        /Hard failures require a successful explicit recheck/,
    );
    const transient = snapshot();
    transient.probes = transient.probes.map((probe) => ({
        ...probe,
        state: 'failed',
        failure: 'timeout',
        dispatch_allowed: false,
    }));
    const temporaryBlock = flowCheck(transient);
    expectBlocked(
        temporaryBlock,
        /wait for bounded recovery.*before considering another paid check/,
    );
    assert.ok(
        !temporaryBlock.message.includes(
            'then explicitly approve its operator expense and run',
        ),
    );
    // The database authority, not diagnostic wording or elapsed time here,
    // decides whether a prior matching success permits recovery.
    transient.probes.forEach((probe) => (probe.dispatch_allowed = true));
    assert.equal(flowCheck(transient).status, 'pass');
    assert.equal(flowCheck(snapshot()).status, 'pass');
});

function expectBlocked(check, message) {
    assert.equal(check.status, 'blocked');
    assert.match(check.message, message);
}

test('only database-authorized recovery with a prior matching pass can restore readiness', () => {
    const registry = selectCapabilities(env, ['interview']);
    const check = (value) =>
        evaluateReadiness(value, env, 'configuration', registry).find(
            (item) => item.id === 'flow-check',
        ).status;
    const failedOnly = snapshot();
    failedOnly.probes = failedOnly.probes.map((probe) => ({
        ...probe,
        state: 'failed',
        failure: 'timeout',
        completed_at: '2020-01-01T00:00:00Z',
        dispatch_allowed: false,
    }));
    assert.equal(check(failedOnly), 'blocked');
    const recovered = snapshot();
    recovered.probes = recovered.probes.map((probe) => ({
        ...probe,
        state: 'failed',
        failure: 'timeout',
        completed_at: '2020-01-01T00:00:00Z',
        dispatch_allowed: true,
    }));
    assert.equal(check(recovered), 'pass');
    const hardThenTimeout = snapshot();
    hardThenTimeout.probes = hardThenTimeout.probes.map((probe) => ({
        ...probe,
        state: 'failed',
        failure: 'timeout',
        completed_at: '2020-01-01T00:00:00Z',
        dispatch_allowed: false,
    }));
    assert.equal(check(hardThenTimeout), 'blocked');
    const legacySnapshot = snapshot();
    legacySnapshot.probes.forEach((probe) => delete probe.dispatch_allowed);
    assert.equal(check(legacySnapshot), 'blocked');
});

test('knowledge actions reuse Texts routing and require the exact new worker format', () => {
    const selected = selectCapabilities(env, ['knowledge-actions']);
    assert.deepEqual(
        selected.map((capability) => capability.id),
        ['knowledge-actions'],
    );
    assert.deepEqual(selected[0].formats, ['text-translation:v4']);
    assert.equal(selected[0].criticalFlow, 'interactive-workbooks');
    const value = snapshot();
    assert.ok(
        evaluateReadiness(value, env, 'runtime', selected).every(
            (check) => check.status === 'pass',
        ),
    );
    value.workers.forEach((worker) => {
        worker.text_ai_supported_formats =
            worker.text_ai_supported_formats.filter(
                (format) => format !== 'text-translation:v4',
            );
    });
    assert.equal(
        evaluateReadiness(value, env, 'runtime', selected).find(
            (check) => check.id === 'knowledge-actions:worker',
        ).status,
        'blocked',
    );
    assert.equal(
        evaluateReadiness(
            value,
            env,
            'runtime',
            selectCapabilities(env, ['texts']),
        ).find((check) => check.id === 'texts:worker').status,
        'pass',
    );
});

test('knowledge action readiness follows Texts enablement, execution identity and funding', () => {
    const selected = selectCapabilities(env, ['knowledge-actions']);
    const value = snapshot();
    const disabled = { ...env, TEXTS_AI_ENABLED: 'false' };
    assert.ok(
        !selectCapabilities(disabled).some(
            (capability) => capability.id === 'knowledge-actions',
        ),
    );
    assert.equal(
        evaluateReadiness(value, disabled, 'runtime', selected).find(
            (check) => check.id === 'knowledge-actions:enabled',
        ).status,
        'blocked',
    );
    value.workers.forEach((worker) => {
        worker.texts_execution_revision = null;
    });
    assert.equal(
        evaluateReadiness(value, env, 'runtime', selected).find(
            (check) => check.id === 'knowledge-actions:worker',
        ).status,
        'blocked',
    );
    const free = snapshot();
    free.policies = [{ capability: 'text-translation', funding: 'operator' }];
    delete free.routing.configuration.flowTariffs['text-translation'];
    assert.equal(
        evaluateReadiness(free, env, 'configuration', selected).find(
            (check) => check.id === 'customer-tariff',
        ).status,
        'pass',
    );
    free.policies[0].funding = 'customer';
    assert.equal(
        evaluateReadiness(free, env, 'configuration', selected).find(
            (check) => check.id === 'customer-tariff',
        ).status,
        'blocked',
    );
});
