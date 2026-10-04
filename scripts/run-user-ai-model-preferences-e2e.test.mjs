import assert from 'node:assert/strict';
import test from 'node:test';

import {
    assertDisposableEnvironment,
    runUserAiModelPreferencesE2e,
} from './run-user-ai-model-preferences-e2e.mjs';

const disposableEnvironment = {
    ALLOW_DISPOSABLE_DATABASE_TESTS: 'true',
    AUTH_TEST_DATABASE_CONFIRM: 'languon_auth_feature035_test',
    AUTH_TEST_DATABASE_URL:
        'postgresql://test:test@127.0.0.1:55435/languon_auth_feature035_test',
    ALLOW_DISPOSABLE_REDIS_TESTS: 'true',
    AUTH_TEST_REDIS_CONFIRM: '127.0.0.1:56335/15',
    AUTH_TEST_REDIS_URL: 'redis://127.0.0.1:56335/15',
};

test('accepts explicit dedicated loopback targets and runs only the mapped journey', async () => {
    const calls = [];
    assert.doesNotThrow(() =>
        assertDisposableEnvironment(disposableEnvironment),
    );
    const original = { ...process.env };
    Object.assign(process.env, disposableEnvironment);
    try {
        await runUserAiModelPreferencesE2e(async (command) => {
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
            'tests/integration/modules/text-ai/user-ai-model-preferences.journeys.test.ts',
        ],
    ]);
});

test('rejects missing, default-port, and mismatched targets before any test command', () => {
    assert.throws(
        () => assertDisposableEnvironment({}),
        /ALLOW_DISPOSABLE_DATABASE_TESTS=true/,
    );
    assert.throws(
        () =>
            assertDisposableEnvironment({
                ...disposableEnvironment,
                AUTH_TEST_DATABASE_URL:
                    'postgresql://test:test@127.0.0.1:5432/languon_auth_feature035_test',
            }),
        /non-default port/,
    );
    assert.throws(
        () =>
            assertDisposableEnvironment({
                ...disposableEnvironment,
                AUTH_TEST_REDIS_CONFIRM: '127.0.0.1:56335/14',
            }),
        /confirmed loopback Redis/,
    );
});
