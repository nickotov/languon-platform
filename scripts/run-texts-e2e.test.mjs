import assert from 'node:assert/strict';
import test from 'node:test';

import { assertDisposableEnvironment, runTextsE2e } from './run-texts-e2e.mjs';

const disposableEnvironment = {
    ALLOW_DISPOSABLE_DATABASE_TESTS: 'true',
    AUTH_TEST_DATABASE_CONFIRM: 'languon_auth_texts_test',
    AUTH_TEST_DATABASE_URL:
        'postgresql://test:test@127.0.0.1:55443/languon_auth_texts_test',
    ALLOW_DISPOSABLE_REDIS_TESTS: 'true',
    AUTH_TEST_REDIS_CONFIRM: '127.0.0.1:56443/1',
    AUTH_TEST_REDIS_URL: 'redis://127.0.0.1:56443/1',
};

test('accepts the dedicated Texts targets and runs only the mapped journey', async () => {
    const calls = [];
    assert.doesNotThrow(() =>
        assertDisposableEnvironment(disposableEnvironment),
    );
    const original = { ...process.env };
    Object.assign(process.env, disposableEnvironment);
    try {
        await runTextsE2e(async (command) => calls.push(command));
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
            'tests/integration/modules/texts/texts.journeys.test.ts',
        ],
    ]);
});

test('rejects a non-Texts database, default database port, and unconfirmed Redis', () => {
    assert.throws(
        () => assertDisposableEnvironment({}),
        /ALLOW_DISPOSABLE_DATABASE_TESTS=true/,
    );
    assert.throws(
        () =>
            assertDisposableEnvironment({
                ...disposableEnvironment,
                AUTH_TEST_DATABASE_URL:
                    'postgresql://test:test@127.0.0.1:55443/languon_auth_feature043_test',
            }),
        /languon_auth_texts/,
    );
    assert.throws(
        () =>
            assertDisposableEnvironment({
                ...disposableEnvironment,
                AUTH_TEST_DATABASE_URL:
                    'postgresql://test:test@127.0.0.1:5432/languon_auth_texts_test',
            }),
        /non-default port/,
    );
    assert.throws(
        () =>
            assertDisposableEnvironment({
                ...disposableEnvironment,
                AUTH_TEST_REDIS_CONFIRM: '127.0.0.1:56443/2',
            }),
        /confirmed loopback Redis/,
    );
});
