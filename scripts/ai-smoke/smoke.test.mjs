import test from 'node:test';
import assert from 'node:assert/strict';
import {
    mkdtemp,
    rm,
    readFile,
    writeFile,
    chmod,
    unlink,
    symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as c from '../../packages/contracts/dist/index.js';
import { parseOptions } from '../ai-smoke.mjs';
import { withJournal, privateRead } from './journal.mjs';
import { assertSnapshot, EMAIL, ROUTE, micros } from './policy.mjs';
import { createApi, runJourney } from './journey.mjs';
import { journeyFixture } from './journey.fixture.mjs';

const userId = randomUUID();
const day = '2026-10-31';
async function fixture(t) {
    const root = await mkdtemp(join(tmpdir(), 'languon-ai-smoke-'));
    t.after(() => rm(root, { recursive: true, force: true }));

    return root;
}

async function initialize(root) {
    await withJournal(root, userId, (journal) => journal.initialize(0));
}

test('paid actions require explicit run and stable task, with no target/prompt override', () => {
    assert.equal(parseOptions([]).run, false);
    assert.throws(() => parseOptions(['--run']));
    assert.throws(() => parseOptions(['--run', '--task', '../other']));
    assert.throws(() =>
        parseOptions(['--run', '--initialize', '--task', 'safe']),
    );

    assert.throws(() => parseOptions(['--url', 'https://example.com']));
    assert.throws(() => parseOptions(['--prompt', 'anything']));
    assert.throws(() => parseOptions(['--scenario', 'shopping-vocabulary']));
    assert.throws(() =>
        parseOptions(['--run', '--task', 'safe', '--scenario', 'anything']),
    );

    assert.equal(
        parseOptions([
            '--run',
            '--task',
            'durable-record',
            '--scenario',
            'shopping-vocabulary',
        ]).scenario,
        'shopping-vocabulary',
    );

    assert.equal(
        parseOptions(['--run', '--task', 'durable-record']).task,
        'durable-record',
    );
});

test('unknown outcomes consume both lifetime task slots and day quota', async (t) => {
    const root = await fixture(t);
    await initialize(root);
    await assert.rejects(
        withJournal(root, userId, async (journal) => {
            await journal.reserve('same-task', day, 0);

            throw new Error('ambiguous transport failure');
        }),
    );

    await withJournal(root, userId, (journal) =>
        journal.reserve('same-task', day, 0),
    );

    await assert.rejects(
        withJournal(root, userId, (journal) =>
            journal.reserve('same-task', '2026-11-01', 0),
        ),
        /task-call-limit/,
    );

    await assert.rejects(
        withJournal(root, userId, (journal) =>
            journal.reserve('other-task', day, 200001),
        ),
        /daily-call-limit/,
    );

    await withJournal(root, userId, (journal) =>
        journal.reserve('other-task', day, 200000),
    );

    const state = JSON.parse(
        await readFile(join(root, '.env.ai-smoke.state.json'), 'utf8'),
    );

    assert.equal(state.entries.length, 3);
    assert.ok(
        state.entries.every(
            (entry) =>
                entry.status === 'reserved' && entry.reservedMicros === 100000,
        ),
    );
});

test('journal refuses concurrent ownership, historical reset, corrupt or missing state', async (t) => {
    const root = await fixture(t);
    await assert.rejects(
        withJournal(root, userId, (journal) => journal.initialize(1)),
        /used-account/,
    );

    await initialize(root);
    await withJournal(root, userId, async () => {
        await assert.rejects(
            withJournal(root, userId, () => assert.fail('lock bypass')),
            { code: 'EEXIST' },
        );
    });

    await assert.rejects(
        withJournal(root, userId, (journal) => journal.initialize(0)),
        /already-initialized/,
    );

    const state = join(root, '.env.ai-smoke.state.json');
    await writeFile(state, '{broken', { mode: 0o600 });
    await assert.rejects(
        withJournal(root, userId, (journal) => journal.reserve('task', day, 0)),
    );

    await unlink(state);
    await assert.rejects(
        withJournal(root, userId, (journal) => journal.read()),
    );

    await assert.rejects(
        withJournal(root, userId, (journal) => journal.initialize(0)),
        /already-initialized/,
    );
});

test('private files reject public modes and symlinks', async (t) => {
    const root = await fixture(t);
    const file = join(root, 'credential');
    await writeFile(file, 'not-a-real-secret', { mode: 0o644 });
    await assert.rejects(privateRead(file), /unsafe-local-file/);
    await chmod(file, 0o600);
    await symlink(file, join(root, 'link'));
    await assert.rejects(privateRead(join(root, 'link')));
    assert.equal(await privateRead(file), 'not-a-real-secret');
});

function safeSnapshot() {
    return {
        routing: {
            configuration: {
                default: { primaryRouteId: ROUTE, fallbackRouteIds: [] },
                enabledRouteIds: [ROUTE],
            },
        },
        settings: {
            max_provider_cost_usd_per_action: '0.10',
            max_provider_cost_usd_per_account_day: '1',
            max_provider_cost_usd_per_day: '5',
        },
        learner: {
            unlimited: false,
            max_credits_per_action: '50',
            available_milli: '200000',
        },
        policies: [],
    };
}

const account = {
    id: userId,
    email: EMAIL,
    status: 'active',
    verified: true,
    admin: false,
};

test('production preflight fails closed on route fallback, limits, user identity and unlimited wallet', () => {
    assert.equal(micros('0.1'), 100000);
    for (const amount of ['1e-1', '-1', '0.0000001', 0.1]) {
        assert.throws(() => micros(amount));
    }

    assertSnapshot(safeSnapshot(), account, userId);
    const mutations = [
        (s) => {
            s.routing.configuration.default.primaryRouteId =
                'openrouter/unapproved';
        },
        (s) => {
            s.routing.configuration.default.fallbackRouteIds = [ROUTE];
        },
        (s) => {
            s.settings.max_provider_cost_usd_per_action = '0.100001';
        },
        (s) => {
            s.settings.max_provider_cost_usd_per_day = null;
        },
        (s) => {
            s.learner.unlimited = true;
        },
        (s) => {
            s.learner.max_credits_per_action = '50.001';
        },
        (s) => {
            s.learner.max_credits_per_action = '100';
        },
        (s) => {
            s.learner.available_milli = '1';
        },
        (s) => {
            s.policies = [{ capability: 'conversation', funding: 'unlimited' }];
        },
    ];

    for (const mutate of mutations) {
        const snapshot = safeSnapshot();
        mutate(snapshot);
        assert.throws(() => assertSnapshot(snapshot, account, userId));
    }

    assert.throws(() =>
        assertSnapshot(safeSnapshot(), { ...account, admin: true }, userId),
    );

    assert.throws(() => assertSnapshot(safeSnapshot(), account, randomUUID()));
});

test('synthetic journey validates real contracts, persists output and charged terminal billing', async () => {
    const fixture = journeyFixture();
    const result = await runJourney(fixture);
    assert.equal(result.status, 'succeeded');
    assert.equal(result.billing, 'charged');
    assert.equal(
        fixture.calls.filter((call) => call.path.endsWith('/turns')).length,
        1,
    );

    assert.ok(!JSON.stringify(result).includes('Hello, friend.'));
    assert.equal(fixture.evidence.at(-1)[1].status, 'succeeded');
});

test('changed readiness prevents dispatch, free billing or empty output cannot pass', async () => {
    const changed = journeyFixture();
    changed.inspect = async () => ({
        ...changed.initial,
        routingRevision: randomUUID(),
    });

    await assert.rejects(runJourney(changed), /preflight-changed/);
    assert.equal(
        changed.calls.filter((call) => call.path.endsWith('/turns')).length,
        0,
    );

    for (const mutate of [
        (detail) => {
            detail.turns[0].billing.state = 'free';
        },
        (detail) => {
            detail.messages[0].content = '';
        },
        (detail) => {
            detail.turns[0].status = 'failed';
        },
    ]) {
        const fixture = journeyFixture();
        mutate(fixture.detail);
        await assert.rejects(runJourney(fixture));
        assert.equal(
            fixture.calls.filter((call) => call.path.endsWith('/turns')).length,
            1,
        );

        assert.ok(
            !fixture.evidence.some((entry) => entry[1].status === 'succeeded'),
        );
    }
});

test('existing operator funding requires free learner billing and settled provider expense', async () => {
    const fixture = journeyFixture();
    fixture.initial.funding = 'operator';
    fixture.detail.turns[0].billing.state = 'free';
    fixture.detail.turns[0].billing.chargedCredits = '0';
    let verified = false;
    fixture.verifyExpense = async (turnId, funding) => {
        assert.equal(turnId, fixture.detail.turns[0].id);
        assert.equal(funding, 'operator');
        verified = true;

        return 1500;
    };

    const result = await runJourney(fixture);
    assert.equal(result.billing, 'free');
    assert.equal(result.providerExpenseMicros, 1500);
    assert.equal(verified, true);
    fixture.verifyExpense = async () => {
        throw new Error('missing expense');
    };

    await assert.rejects(runJourney(fixture), /missing expense/);
});

test('queued or held turns time out with one dispatch and retained reservation', async () => {
    for (const state of ['queued', 'held']) {
        const fixture = journeyFixture();
        if (state === 'queued') {
            fixture.detail.turns[0].status = 'queued';
        }

        fixture.detail.turns[0].billing.state = 'held';
        let clock = 0;
        fixture.now = () => clock;
        fixture.sleep = async () => {
            clock += 60000;
        };

        await assert.rejects(
            runJourney(fixture),
            /poll-timeout-no-retry-reservation-retained/,
        );

        assert.equal(
            fixture.calls.filter((call) => call.path.endsWith('/turns')).length,
            1,
        );

        assert.ok(
            !fixture.evidence.some((entry) => entry[1].status === 'succeeded'),
        );
    }
});

test('HTTP transport pins local origin, disallows redirects and never retries ambiguous failures', async () => {
    let calls = 0;
    const api = createApi(c, async (url, options) => {
        calls++;
        assert.equal(url, 'http://127.0.0.1:4000/users/me/ai-credits');
        assert.equal(options.headers.Origin, 'http://localhost:3333');
        assert.equal(options.redirect, 'error');

        throw new Error('secret-upstream-error');
    });

    await assert.rejects(
        api.request('/users/me/ai-credits', c.LearnerAiCreditBalanceSchema),
        /http-outcome-unknown-no-retry/,
    );

    assert.equal(calls, 1);
});

test('workspace smoke rejects legacy output that bypassed intent resolution', async () => {
    const fixture = journeyFixture();
    delete fixture.detail.messages[0].responseMetadata;
    await assert.rejects(runJourney(fixture), /workspace-routing-unverified/);
    assert.equal(
        fixture.calls.filter((call) => call.path.endsWith('/turns')).length,
        1,
    );
});
