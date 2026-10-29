import { describe, expect, it } from 'vitest';
import {
    BilingualTextLearningBlockSchema,
    VocabularyLearningBlockSchema,
} from '@languon/contracts';
import { vocabularyLibraryRows } from './library-copy-vocabulary';
import { textLibraryContent } from './library-copy-text';
import { appendLibraryAlignment } from '../../../../texts/infrastructure/persistence/drizzle/text-library-publication';
const id = '00000000-0000-4000-8000-000000000001';
const segmentId = '00000000-0000-4000-8000-000000000002';
const entryId = '00000000-0000-4000-8000-000000000003';
const freshId = '00000000-0000-4000-8000-000000000004';
const vocabulary = VocabularyLearningBlockSchema.parse({
    id,
    type: 'vocabulary',
    language: 'en',
    translationLanguage: 'ru',
    entries: [
        {
            id: entryId,
            term: 'cat',
            translation: 'кот',
            pronunciation: 'kæt',
            definition: 'A small animal.',
            example: 'A cat sleeps.',
            exampleTranslation: 'Кот спит.',
        },
    ],
});
const bilingual = BilingualTextLearningBlockSchema.parse({
    id,
    type: 'bilingual-text',
    language: 'en',
    segments: [{ id: segmentId, text: 'A cat sleeps.' }],
    translations: [
        {
            language: 'ru',
            segments: [{ sourceSegmentId: segmentId, text: 'Кот спит.' }],
        },
    ],
});
describe('library copy projections', () => {
    it('preserves prepared pronunciation/examples without AI regeneration', () => {
        const result = vocabularyLibraryRows(vocabulary, [entryId]);
        expect(result.rows).toEqual([
            {
                rowIndex: 1,
                source: 'cat',
                translation: 'кот',
                prepared: {
                    definition: 'A small animal.',
                    transcription: 'kæt',
                    example: 'A cat sleeps.',
                    exampleTranslation: 'Кот спит.',
                },
            },
        ]);
        expect(vocabulary.entries[0]?.term).toBe('cat');
    });
    it('refuses fabricated selections or mismatched block types', () => {
        expect(() => vocabularyLibraryRows(vocabulary, [id])).toThrow(
            'unavailable',
        );
        expect(() => vocabularyLibraryRows(bilingual, [entryId])).toThrow(
            'vocabulary',
        );
    });
    it('creates independent aligned identities in source order', () => {
        const copied = textLibraryContent(bilingual, 'ru', () => freshId);
        expect(copied.alignment!.source[0]).toEqual({
            pairId: freshId,
            text: 'A cat sleeps.',
            startOffset: 0,
            endOffset: 13,
            paragraphIndex: 0,
        });
        expect(copied.alignment!.translation[0]).toEqual({
            pairId: freshId,
            text: 'Кот спит.',
        });
        expect(textLibraryContent(bilingual, 'de').alignment).toBeNull();
    });
    it('appends aligned pairs without rewriting old identities or manual translations', () => {
        const first = textLibraryContent(
            bilingual,
            'ru',
            () => freshId,
        ).alignment!;
        const second = textLibraryContent(
            bilingual,
            'ru',
            () => entryId,
        ).alignment!;
        const joined = appendLibraryAlignment(first, second);
        expect(joined.source[0]).toEqual(first.source[0]);
        expect(joined.translation[0]).toEqual(first.translation[0]);
        expect(joined.source[1]).toEqual({
            pairId: entryId,
            text: '\n\nA cat sleeps.',
            startOffset: 13,
            endOffset: 28,
            paragraphIndex: 1,
        });
        expect(joined.source.map((s) => s.text).join('')).toBe(
            'A cat sleeps.\n\nA cat sleeps.',
        );
    });
    it('preserves passage boundaries and contiguous offsets for authored or private translations', () => {
        const secondId = '00000000-0000-4000-8000-000000000005';
        const block = BilingualTextLearningBlockSchema.parse({
            ...bilingual,
            segments: [
                ...bilingual.segments,
                { id: secondId, text: 'A dog runs.' },
            ],
            translations: [
                {
                    language: 'fr',
                    segments: [
                        { sourceSegmentId: segmentId, text: 'Un chat dort.' },
                        { sourceSegmentId: secondId, text: 'Un chien court.' },
                    ],
                },
            ],
        });
        const identities = [freshId, entryId];
        const copied = textLibraryContent(block, 'fr', () =>
            identities.shift()!,
        );
        expect(copied.sourceText).toBe('A cat sleeps.\n\nA dog runs.');
        expect(copied.alignment!.source).toEqual([
            {
                pairId: freshId,
                text: 'A cat sleeps.',
                startOffset: 0,
                endOffset: 13,
                paragraphIndex: 0,
            },
            {
                pairId: entryId,
                text: '\n\nA dog runs.',
                startOffset: 13,
                endOffset: 26,
                paragraphIndex: 1,
            },
        ]);
        expect(
            copied.alignment!.translation.map((pair) => pair.text).join(''),
        ).toBe('Un chat dort.\n\nUn chien court.');
        expect(textLibraryContent(block, 'de').sourceText).toBe(
            copied.sourceText,
        );
        const existing = textLibraryContent(
            bilingual,
            'ru',
            () => secondId,
        ).alignment!;
        const appended = appendLibraryAlignment(existing, copied.alignment!);
        expect(appended.source.map((pair) => pair.text).join('')).toBe(
            'A cat sleeps.\n\nA cat sleeps.\n\nA dog runs.',
        );
        expect(appended.source[2]).toMatchObject({
            startOffset: 28,
            endOffset: 41,
            paragraphIndex: 2,
        });
        expect(appended.translation[2]?.text).toBe('\n\nUn chien court.');
    });
    it('rejects duplicate inserted pair identities and aggregate destination overflow', () => {
        const first = textLibraryContent(
            bilingual,
            'ru',
            () => freshId,
        ).alignment!;
        expect(() => appendLibraryAlignment(first, first)).toThrow();
        const oversized = {
            ...first,
            source: [
                {
                    ...first.source[0]!,
                    text: 'x'.repeat(20_000),
                    endOffset: 20_000,
                },
            ],
        };
        expect(() =>
            appendLibraryAlignment(
                oversized,
                textLibraryContent(bilingual, 'ru', () => entryId).alignment!,
            ),
        ).toThrow();
    });
});
