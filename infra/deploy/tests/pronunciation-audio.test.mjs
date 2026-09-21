import assert from 'node:assert/strict';
import test from 'node:test';
import {
    normalizePronunciationAudio,
    assertPronunciationAudioCompatibility,
} from '../lib/pronunciation-audio.mjs';

const capabilities = (apiEnqueued = []) =>
    normalizePronunciationAudio({
        phase: apiEnqueued.length ? 'activate' : 'expand',
        workerProcessable: [1],
        apiReadable: [1],
        webReadable: [1],
        purgeReadable: [1],
        apiEnqueued,
        speechBudget: {
            maxCharacters: 2000,
            maxCostUnitsPerClip: 2000,
            ownerDailyCostUnits: 20000,
            globalDailyCostUnits: 200000,
        },
    });
test('historical metadata stays absent and dormant expansion needs no prior support', () => {
    assert.equal(normalizePronunciationAudio(undefined), undefined);
    assertPronunciationAudioCompatibility(
        { pronunciationAudio: capabilities() },
        {},
    );
});
test('activation requires the entire rollback floor including purge worker', () => {
    const active = { pronunciationAudio: capabilities([1]) };
    assert.throws(
        () => assertPronunciationAudioCompatibility(active, {}),
        /Rollback-floor/,
    );
    const expand = { pronunciationAudio: capabilities() };
    assertPronunciationAudioCompatibility(active, expand);
    assert.throws(
        () =>
            assertPronunciationAudioCompatibility(active, {
                pronunciationAudio: { ...capabilities(), purgeReadable: [] },
            }),
        /purgeReadable/,
    );
});
test('disabling generation preserves stored audio lifecycle and budget compatibility', () => {
    assertPronunciationAudioCompatibility(
        { pronunciationAudio: capabilities() },
        { pronunciationAudio: capabilities([1]) },
        { direction: 'rollback' },
    );
    assert.throws(
        () =>
            assertPronunciationAudioCompatibility(
                {},
                { pronunciationAudio: capabilities() },
            ),
        /retained audio/,
    );
    const changed = capabilities();
    changed.speechBudget.maxCharacters = 1000;
    assert.throws(
        () =>
            assertPronunciationAudioCompatibility(
                { pronunciationAudio: changed },
                { pronunciationAudio: capabilities() },
            ),
        /stable/,
    );
});
test('expand cannot silently activate and invalid budgets fail closed', () => {
    assert.throws(
        () =>
            assertPronunciationAudioCompatibility(
                {
                    pronunciationAudio: {
                        ...capabilities([1]),
                        phase: 'expand',
                    },
                },
                { pronunciationAudio: capabilities() },
            ),
        /cannot activate/,
    );
    assert.throws(
        () =>
            normalizePronunciationAudio({
                ...capabilities(),
                speechBudget: {},
            }),
        /speechBudget/,
    );
});
