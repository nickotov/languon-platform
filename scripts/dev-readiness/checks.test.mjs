import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    capabilityRequirements,
    selectCapabilities,
    evaluateReadiness,
    validateLocalEnvironment,
} from './checks.mjs';
import { migrationStatus } from './database.mjs';

const env = {
    APP_ENV: 'development',
    DATABASE_URL: 'postgres://local:secret@127.0.0.1:55444/local_test',
    DICTIONARY_AI_MANAGED_ROUTING_ENABLED: 'true',
    DICTIONARY_AI_DEEPSEEK_CREDENTIAL_CONFIGURED: 'true',
    TEXTS_AI_ENABLED: 'true',
    DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS: capabilityRequirements
        .flatMap((c) => c.formats)
        .join(','),
};
function snapshot() {
    return {
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
        result.find((c) => c.id === 'texts:environment').message,
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
