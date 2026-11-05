import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { journeyFixture } from './journey.fixture.mjs';
import { runJourney } from './journey.mjs';

test('unknown scenarios stop before any learner request', async () => {
    const fixture = journeyFixture();
    fixture.scenario = 'unreviewed-prompt';
    await assert.rejects(runJourney(fixture));
    assert.equal(fixture.calls.length, 0);
    assert.equal(fixture.evidence.length, 0);
});

test('shopping scenario dispatches only the fixed request and verifies 50 canonical entries', async () => {
    const fixture = journeyFixture('shopping-vocabulary');
    const result = await runJourney(fixture);
    assert.equal(result.generatedVocabularyEntries, 50);
    const dispatches = fixture.calls.filter((call) =>
        call.path.endsWith('/turns'),
    );

    assert.equal(dispatches.length, 1);
    assert.equal(
        dispatches[0].body.content,
        'Generate one interactive vocabulary block containing exactly 50 distinct common English words used when shopping, with Russian translations. Keep each entry to its term and translation.',
    );

    assert.ok(
        fixture.calls.some(
            (call) =>
                call.path.endsWith('/block-proposals') &&
                call.body === undefined,
        ),
    );

    assert.ok(
        !fixture.calls.some((call) =>
            /\/(apply|publish|save)$/u.test(call.path),
        ),
    );

    assert.ok(!JSON.stringify(result).includes('shopping word'));
    assert.equal(fixture.evidence.at(-1)[1].status, 'succeeded');
});

test('shopping scenario refuses absent, duplicate, incomplete or mismatched persisted proposals', async () => {
    const mutations = [
        (fixture) => {
            fixture.proposals.length = 0;
        },
        (fixture) => {
            fixture.proposals.push(structuredClone(fixture.proposals[0]));
        },
        (fixture) => {
            fixture.proposals[0].blocks[0].entries.pop();
        },
        (fixture) => {
            fixture.proposals[0].blocks[0].entries[1].term =
                ' SHOPPING WORD 1 ';
        },
        (fixture) => {
            fixture.proposals[0].blocks[0].entries[1].id =
                fixture.proposals[0].blocks[0].entries[0].id;
        },
        (fixture) => {
            fixture.proposals[0].turnId = randomUUID();
        },
        (fixture) => {
            fixture.proposals[0].branchId = randomUUID();
        },
        (fixture) => {
            fixture.proposals[0].blocks[0].translationLanguage = 'en';
        },
        (fixture) => {
            fixture.proposals[0].appliedAt = '2026-10-31T10:00:00.000Z';
        },
        (fixture) => {
            fixture.detail.messages[0].responseMetadata.kind = 'limitation';
        },
    ];

    for (const mutate of mutations) {
        const fixture = journeyFixture('shopping-vocabulary');
        mutate(fixture);
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
