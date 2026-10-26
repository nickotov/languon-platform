import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dataset = JSON.parse(
    await readFile(
        new URL('./fixtures/multilingual-v1.json', import.meta.url),
        'utf8',
    ),
);

test('versioned synthetic references cover all agreed languages without claiming live quality', () => {
    assert.equal(dataset.version, 'text-ai-multilingual:v1');
    assert.match(dataset.review.scope, /not a native-speaker certification/);
    assert.match(dataset.review.scope, /not exact string grading/);
    assert.deepEqual(
        dataset.cases.map((item) => item.language).sort(),
        [
            'ru',
            'en',
            'fr',
            'es',
            'de',
            'sr',
            'pl',
            'tr',
            'hu',
            'zh',
            'ja',
            'ko',
        ].sort(),
    );
    assert.equal(
        new Set(dataset.cases.map((item) => item.id)).size,
        dataset.cases.length,
    );
});

for (const item of dataset.cases) {
    test(`${item.id}: sentence, translation and explanation references are complete and distinct`, () => {
        assert.notEqual(item.sentenceCheck.valid, item.sentenceCheck.invalid);
        assert.equal(
            item.sentenceCheck.expectedCorrection,
            item.sentenceCheck.valid,
        );
        assert.ok(item.sentenceCheck.expectedReason.length > 10);
        assert.equal(item.translation.source, item.sentenceCheck.valid);
        assert.equal(item.translation.targetLanguage, 'en');
        assert.ok(
            item.translation.acceptableMeanings.every((value) =>
                value.startsWith('I '),
            ),
        );
        assert.ok(
            item.translation.mustPreserve.includes('first-person singular'),
        );
        assert.ok(item.translation.mustNotAdd.includes('diagnosis'));
        assert.ok(
            item.explanation.request.includes(item.sentenceCheck.invalid),
        );
        assert.ok(
            item.sentenceCheck.valid.includes(item.explanation.mustAddress[0]),
        );
        assert.ok(
            item.explanation.mustAvoid.includes(
                'claim of assessed proficiency',
            ),
        );
        assert.equal(item.explanation.maximumSentences, 3);
    });
}
