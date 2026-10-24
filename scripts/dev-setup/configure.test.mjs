import test from 'node:test';
import assert from 'node:assert/strict';
import { configure, createAdminClient, localOrigin } from './configure.mjs';
import {
    loadContracts,
    setupProfiles,
    validateProfile,
    renderProfileDocumentation,
} from './profiles.mjs';
import { grantTestLearner } from './learner-grant.mjs';

const contracts = await loadContracts();
const silent = () => {};
const runtimeEnvironment = {
    APP_ENV: 'test',
    DICTIONARY_AI_PROVIDER_FIXTURE_MODE: 'deterministic',
};
function fixture() {
    const state = {
        '/admin/ai-settings': {
            settings: {
                version: 0,
                activeProvider: null,
                defaultModel: null,
                enabledModels: ['other-enabled-model'],
            },
        },
        '/admin/ai/accounting-settings': { version: 0 },
        '/admin/ai/model-prices': { prices: [] },
        '/admin/ai/accounting/provider-prices': { prices: [] },
    };
    const writes = [];
    const request = async (path, schema, method = 'GET', body) => {
        if (method === 'GET') return state[path];
        writes.push({ path, body });
        const record = { ...body, version: body.expectedVersion + 1 };
        state[path] = path.endsWith('prices')
            ? { prices: [record] }
            : path.endsWith('ai-settings')
              ? { settings: record }
              : record;
        return state[path];
    };
    return { state, writes, request };
}
test('all preset bodies satisfy current public contracts and docs expose their exact values', () => {
    for (const profile of Object.values(setupProfiles))
        validateProfile(profile, contracts);
    const docs = renderProfileDocumentation();
    assert.match(docs, /inputUsdPerMillionTokens \| 0.30/);
    assert.match(docs, /defaultMaxCreditsPerAction \| 10/);
});
test('preview makes no writes; apply converges and repeats publish no revisions', async () => {
    const f = fixture();
    const options = {
        profileName: 'deepseek-local-testing',
        contracts,
        request: f.request,
        log: silent,
    };
    assert.equal(await configure(options), 4);
    assert.equal(f.writes.length, 0);
    assert.equal(await configure({ ...options, apply: true }), 4);
    assert.equal(f.writes.length, 4);
    assert.ok(
        f.state['/admin/ai-settings'].settings.enabledModels.includes(
            'other-enabled-model',
        ),
    );
    // Database decimal normalization does not create a new revision.
    f.state['/admin/ai/accounting-settings'].maxProviderCostUsdPerAction =
        '0.100000';
    f.state['/admin/ai/model-prices'].prices[0].inputCreditsPerMillionTokens =
        '100';
    assert.equal(await configure({ ...options, apply: true }), 0);
    assert.equal(f.writes.length, 4);
});
test('future provider revision cannot masquerade as currently usable calibration', async () => {
    const f = fixture();
    const options = {
        profileName: 'deepseek-local-testing',
        contracts,
        request: f.request,
        apply: true,
        log: silent,
    };
    await configure(options);
    f.state['/admin/ai/accounting/provider-prices'].prices[0].effectiveAt =
        '2099-01-01T00:00:00.000Z';
    assert.equal(await configure(options), 1);
});
test('synthetic profile rejects ordinary server environment before requesting anything', async () => {
    let called = false;
    await assert.rejects(
        configure({
            profileName: 'deterministic-demo',
            contracts,
            request: async () => {
                called = true;
            },
            log: silent,
        }),
        /isolated test runtime/,
    );
    assert.equal(called, false);
    const f = fixture();
    await configure({
        profileName: 'deterministic-demo',
        contracts,
        request: f.request,
        runtimeEnvironment,
        log: silent,
    });
});
test('no retry after a conflicting or ambiguous mutation; later operations are not sent', async () => {
    const f = fixture();
    let writes = 0;
    const request = async (...args) => {
        if (args[2]) {
            writes += 1;
            throw new Error('conflict');
        }
        return f.request(...args);
    };
    await assert.rejects(
        configure({
            profileName: 'deepseek-local-testing',
            contracts,
            request,
            apply: true,
            log: silent,
        }),
        /conflict/,
    );
    assert.equal(writes, 1);
});
test('client accepts loopback only, forbids redirects, and redacts response failures', async () => {
    for (const origin of [
        'https://example.com',
        'http://127.0.0.1.evil.com',
        'http://user:secret@localhost',
        'http://localhost/path',
        'http://localhost?token=secret',
    ])
        assert.throws(() => localOrigin(origin));
    let options;
    let requestedUrl;
    const request = createAdminClient({
        origin: 'http://127.0.0.1:4000',
        adminOrigin: 'http://localhost:3001',
        token: 'private-token',
        fetchImpl: async (url, input) => {
            requestedUrl = url;
            options = input;
            return { ok: false, status: 403 };
        },
    });
    await assert.rejects(
        request('/admin/ai-settings', {}),
        (error) =>
            !error.message.includes('private-token') &&
            /403/.test(error.message),
    );
    assert.equal(options.redirect, 'error');
    assert.equal(requestedUrl, 'http://127.0.0.1:4000/admin/ai-settings');
    assert.equal(options.headers.Origin, 'http://localhost:3001');
});

const learnerId = '10000000-0000-4000-8000-000000000001';
test('synthetic learner grant survives repeat runs and refuses real emails or holds', async () => {
    const user = {
        primaryEmail: 'learner@example.test',
        status: 'active',
        isOwner: false,
    };
    const credits = {
        account: {
            managementVersion: 0,
            reservedCredits: 0,
            effectiveMode: 'limited',
        },
        history: [],
        total: 0,
    };
    let mutations = 0;
    const request = async (path, schema, method, body) => {
        if (method === 'POST') {
            mutations += 1;
            credits.history.push({ kind: 'grant', reason: body.reason });
            credits.total += 1;
            credits.account.managementVersion += 1;
            return credits;
        }
        return path.includes('ai-credits') ? credits : { user };
    };
    const options = { learnerId, contracts, request, log: silent };
    await grantTestLearner(options);
    assert.equal(mutations, 0);
    await grantTestLearner({ ...options, apply: true });
    await grantTestLearner({ ...options, apply: true });
    assert.equal(mutations, 1);
    user.primaryEmail = 'learner@example.com';
    await assert.rejects(grantTestLearner(options), /synthetic learner/);
    user.primaryEmail = 'learner@example.test';
    credits.account.reservedCredits = 1;
    await assert.rejects(
        grantTestLearner(options),
        /no active credit reservations/,
    );
});
