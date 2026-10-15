import assert from 'node:assert/strict';
import test from 'node:test';
import { assertTextsCombinedEnvironment } from './run-texts-all-e2e.mjs';
const environment = {
    ALLOW_DISPOSABLE_DATABASE_TESTS: 'true',
    AUTH_TEST_DATABASE_URL:
        'postgres://synthetic:local@127.0.0.1:55443/languon_auth_texts_ui_web_test',
    AUTH_TEST_DATABASE_CONFIRM: 'languon_auth_texts_ui_web_test',
    ALLOW_DISPOSABLE_REDIS_TESTS: 'true',
    AUTH_TEST_REDIS_URL: 'redis://127.0.0.1:56443/1',
    AUTH_TEST_REDIS_CONFIRM: '127.0.0.1:56443/1',
};
test('accepts the exact guarded combined disposable target', () => {
    assert.doesNotThrow(() => assertTextsCombinedEnvironment(environment));
});
test('refuses a different test database before either child can reset data', () => {
    assert.throws(
        () =>
            assertTextsCombinedEnvironment({
                ...environment,
                AUTH_TEST_DATABASE_URL:
                    environment.AUTH_TEST_DATABASE_URL.replace(
                        'ui_web',
                        'ui_metadata',
                    ),
                AUTH_TEST_DATABASE_CONFIRM:
                    'languon_auth_texts_ui_metadata_test',
            }),
        /exclusive/,
    );
});
test('refuses shared/nonlocal targets and live debug-server reuse', () => {
    assert.throws(() =>
        assertTextsCombinedEnvironment({
            ...environment,
            AUTH_TEST_DATABASE_URL: environment.AUTH_TEST_DATABASE_URL.replace(
                '127.0.0.1',
                'shared.example.test',
            ),
        }),
    );
    assert.throws(
        () =>
            assertTextsCombinedEnvironment({
                ...environment,
                TEXTS_WEB_REUSE_SERVERS: 'true',
            }),
        /fresh owned/,
    );
});

test('refuses an unexpected disposable port or Redis database before the backend reset', () => {
    assert.throws(
        () =>
            assertTextsCombinedEnvironment({
                ...environment,
                AUTH_TEST_DATABASE_URL:
                    environment.AUTH_TEST_DATABASE_URL.replace(
                        '55443',
                        '55444',
                    ),
            }),
        /PostgreSQL/,
    );
    assert.throws(
        () =>
            assertTextsCombinedEnvironment({
                ...environment,
                AUTH_TEST_REDIS_URL: 'redis://127.0.0.1:56443/2',
                AUTH_TEST_REDIS_CONFIRM: '127.0.0.1:56443/2',
            }),
        /Redis/,
    );
});
