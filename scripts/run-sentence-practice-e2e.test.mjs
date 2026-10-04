import assert from 'node:assert/strict';
import test from 'node:test';

import {
    assertDisposableEnvironment,
    runSentencePracticeE2e,
} from './run-sentence-practice-e2e.mjs';

const disposableEnvironment = {
    ALLOW_DISPOSABLE_DATABASE_TESTS: 'true',
    AUTH_TEST_DATABASE_CONFIRM: 'languon_auth_sentence_journey_e2e_test',
    AUTH_TEST_DATABASE_URL:
        'postgresql://test:test@127.0.0.1:55435/languon_auth_sentence_journey_e2e_test',
    ALLOW_DISPOSABLE_REDIS_TESTS: 'true',
    AUTH_TEST_REDIS_CONFIRM: '127.0.0.1:56335/13',
    AUTH_TEST_REDIS_URL: 'redis://127.0.0.1:56335/13',
};

test('accepts confirmed dedicated targets and runs only the sentence journey', async () => {
    const calls = [];
    assert.doesNotThrow(() =>
        assertDisposableEnvironment(disposableEnvironment),
    );
    const original = { ...process.env };
    Object.assign(process.env, disposableEnvironment);
    try {
        await runSentencePracticeE2e(async (command) => {
            calls.push(command);
        });
    } finally {
        for (const name of Object.keys(disposableEnvironment)) {
            if (original[name] === undefined) delete process.env[name];
            else process.env[name] = original[name];
        }
    }
    assert.deepEqual(calls, [
        [
            'pnpm',
            '--filter',
            '@languon/backend',
            'exec',
            'vitest',
            'run',
            'tests/integration/modules/learning/sentence-practice.journeys.test.ts',
        ],
    ]);
});

test('rejects default-port, non-sentence database, and mismatched Redis targets', () => {
    assert.throws(() => assertDisposableEnvironment({}), /DATABASE_TESTS/);
    assert.throws(
        () =>
            assertDisposableEnvironment({
                ...disposableEnvironment,
                AUTH_TEST_DATABASE_URL:
                    'postgresql://test:test@127.0.0.1:5432/languon_auth_sentence_journey_e2e_test',
            }),
        /non-default port/,
    );
    assert.throws(
        () =>
            assertDisposableEnvironment({
                ...disposableEnvironment,
                AUTH_TEST_DATABASE_CONFIRM: 'languon_auth_feature035_test',
            }),
        /languon_auth_sentence/,
    );
    assert.throws(
        () =>
            assertDisposableEnvironment({
                ...disposableEnvironment,
                AUTH_TEST_REDIS_CONFIRM: '127.0.0.1:56335/12',
            }),
        /confirmed loopback Redis/,
    );
});
