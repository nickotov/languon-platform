import { expect, it } from 'vitest';
import { compareDictation } from './dictation';

it('ignores case, incidental punctuation and typographic apostrophes while retaining accents', () => {
    const result = compareDictation(
        'L’école est fermée.',
        "l'école est fermee!",
        'fr',
    );

    expect(result.map((word) => word.kind)).toEqual([
        'matched',
        'matched',
        'changed',
    ]);
});

it('aligns a missing word without marking the rest wrong', () => {
    expect(
        compareDictation(
            'On leur a donné la parole.',
            'On a donné la parole',
            'fr',
        ).map((word) => word.kind),
    ).toEqual([
        'matched',
        'missing',
        'matched',
        'matched',
        'matched',
        'matched',
    ]);
});

it('aligns Japanese words without whitespace', () => {
    const words = compareDictation('今日は雨です。', '今日は雪です。', 'ja');
    expect(words).toContainEqual({
        kind: 'changed',
        expected: '雨',
        submitted: '雪',
    });

    expect(
        words.filter((item) => item.kind === 'matched').length,
    ).toBeGreaterThan(1);
});
