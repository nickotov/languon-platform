import test from 'node:test';
import assert from 'node:assert/strict';
import {
    validateApplyEnvironment,
    assertAdminBinding,
    assertRevisionBinding,
} from './target-binding.mjs';

test('apply requires explicit exact local environment and database confirmation', () => {
    const env = {
        APP_ENV: 'test',
        DATABASE_URL: 'postgres://test:private@127.0.0.1:5432/local_test',
        POSTGRES_DB: 'local_test',
    };
    assert.equal(
        validateApplyEnvironment(env, 'local_test').database,
        'local_test',
    );
    assert.throws(() => validateApplyEnvironment(env));
    assert.throws(() => validateApplyEnvironment(env, 'other_database'));
    for (const patch of [
        { APP_ENV: 'production' },
        { NODE_ENV: 'production' },
        { DATABASE_URL: 'postgres://user:private@remote.example/db' },
        { POSTGRES_DB: 'other' },
    ])
        assert.throws(() =>
            validateApplyEnvironment({ ...env, ...patch }, 'local_test'),
        );
});
test('wrong server identity fails closed even when configuration is empty', () => {
    const actor = {
        id: 'random-local-admin-id',
        primaryEmail: 'owner@example.test',
        role: 'owner',
    };
    const admin = {
        id: actor.id,
        email: actor.primaryEmail,
        status: 'active',
        role: 'owner',
    };
    assertAdminBinding(admin, actor);
    for (const wrong of [
        null,
        { ...admin, id: 'other-id' },
        { ...admin, status: 'disabled' },
        { ...admin, email: 'different@example.test' },
        { ...admin, role: 'other' },
    ])
        assert.throws(
            () => assertAdminBinding(wrong, actor),
            /confirmed local database/,
        );
});
test('revision identity or configuration mismatch refuses further mutations', () => {
    const db = {
        configuration: { version: 2 },
        settings: { version: 3 },
        customer: [{ id: 'customer-revision', version: 1 }],
        provider: [{ id: 'provider-revision', version: 1 }],
    };
    const api = {
        ai: { settings: { version: 2 } },
        accounting: { version: 3 },
        tariffs: {
            prices: [{ rateRevisionId: 'customer-revision', version: 1 }],
        },
        providers: { prices: [{ id: 'provider-revision', version: 1 }] },
    };
    assertRevisionBinding(db, api);
    api.providers.prices[0].id = 'wrong-server-revision';
    assert.throws(() => assertRevisionBinding(db, api), /revisions differ/);
});
