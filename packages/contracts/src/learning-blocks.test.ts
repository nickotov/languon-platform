import { describe, expect, it } from 'vitest';
import {
    LearningBlockSchema,
    LearningMediaUrlSchema,
    LearningTranscriptSchema,
} from './learning-blocks';

const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const exercise = {
    id,
    type: 'exercise',
    question: 'Choose',
    referenceAnswer: 'Yes',
    explanation: 'Agreement.',
};

describe('learning block content contracts', () => {
    it('rejects aggregate oversized and cyclic content before structured parsing', () => {
        const block = {
            id,
            type: 'bilingual-text',
            language: 'en',
            translations: [],
            segments: Array.from({ length: 20 }, () => ({
                id,
                text: 'a'.repeat(8_000),
            })),
        };
        expect(LearningBlockSchema.safeParse(block).success).toBe(false);
        const cycle: { self?: unknown } = {};
        cycle.self = cycle;
        expect(LearningBlockSchema.safeParse(cycle).success).toBe(false);
    });
    it('accepts each standalone block without owner or library coupling', () => {
        const blocks = [
            {
                id,
                type: 'video',
                source: { kind: 'youtube', videoId: 'abcdefghijk' },
            },
            {
                id,
                type: 'video',
                source: { kind: 'url', url: 'https://example.com/movie.mp4' },
            },
            {
                id,
                type: 'vocabulary',
                language: 'en',
                translationLanguage: 'es',
                entries: [{ id, term: 'Hello', translation: 'Hola' }],
            },
            {
                id,
                type: 'bilingual-text',
                language: 'en',
                segments: [{ id, text: 'Hello.' }],
                translations: [
                    {
                        language: 'es',
                        segments: [{ sourceSegmentId: id, text: 'Hola.' }],
                    },
                ],
            },
            { id, type: 'audio', assetId: other },
            { id, type: 'grammar', language: 'en', pattern: 'subject + verb' },
            {
                ...exercise,
                format: 'multiple-choice',
                choices: [
                    { id, text: 'Yes' },
                    { id: other, text: 'No' },
                ],
                correctChoiceId: id,
            },
            {
                ...exercise,
                format: 'fill-in-the-blank',
                parts: [
                    { kind: 'text', text: 'I ' },
                    { kind: 'gap', id, acceptedAnswers: ['am'] },
                ],
            },
            { ...exercise, format: 'free-text' },
        ];
        for (const block of blocks)
            expect(LearningBlockSchema.safeParse(block).success).toBe(true);
    });

    it('preserves literal markup as text but rejects executable fields', () => {
        const block = {
            id,
            type: 'grammar',
            language: 'en',
            rule: '<script>alert(1)</script>',
        };
        expect(LearningBlockSchema.parse(block)).toEqual(block);
        for (const fields of [
            { html: '<img onerror=alert(1)>' },
            { onclick: 'alert(1)' },
            { ownerId: other },
            { attrs: { style: 'x' } },
        ])
            expect(
                LearningBlockSchema.safeParse({ ...block, ...fields }).success,
            ).toBe(false);
        expect(
            LearningBlockSchema.safeParse({
                id,
                type: 'audio',
                assetId: other,
                url: 'https://private.example/audio',
            }).success,
        ).toBe(false);
        expect(
            LearningBlockSchema.safeParse({
                id,
                type: 'video',
                source: {
                    kind: 'youtube',
                    videoId: 'abcdefghijk',
                    html: '<iframe>',
                },
            }).success,
        ).toBe(false);
    });

    it.each([
        'javascript:alert(1)',
        'data:text/html,test',
        '//example.com/a',
        'http://example.com/a',
        'https://user:pass@example.com/a',
        'https://example.com/\nscript',
        'https:\\example.com/a',
        ' https://example.com/a',
    ])('rejects unsafe media syntax %s', (url) => {
        expect(LearningMediaUrlSchema.safeParse(url).success).toBe(false);
    });

    it('rejects invalid or duplicate answer choices and gaps', () => {
        const choice = { id, text: 'Yes' };
        expect(
            LearningBlockSchema.safeParse({
                ...exercise,
                format: 'multiple-choice',
                choices: [choice, choice],
                correctChoiceId: id,
            }).success,
        ).toBe(false);
        expect(
            LearningBlockSchema.safeParse({
                ...exercise,
                format: 'multiple-choice',
                choices: [choice, { id: other, text: 'No' }],
                correctChoiceId: '33333333-3333-4333-8333-333333333333',
            }).success,
        ).toBe(false);
        const gap = { kind: 'gap', id, acceptedAnswers: ['yes'] };
        expect(
            LearningBlockSchema.safeParse({
                ...exercise,
                format: 'fill-in-the-blank',
                parts: [gap, gap],
            }).success,
        ).toBe(false);
        expect(
            LearningBlockSchema.safeParse({
                ...exercise,
                format: 'fill-in-the-blank',
                parts: [{ kind: 'text', text: 'No gap' }],
            }).success,
        ).toBe(false);
    });

    it('rejects incomplete or duplicate translation alignments', () => {
        const block = {
            id,
            type: 'bilingual-text',
            language: 'en',
            segments: [
                { id, text: 'Hello' },
                { id: other, text: 'Bye' },
            ],
        };
        for (const segments of [
            [{ sourceSegmentId: id, text: 'Hola' }],
            [
                { sourceSegmentId: id, text: 'Hola' },
                { sourceSegmentId: id, text: 'Adios' },
            ],
        ])
            expect(
                LearningBlockSchema.safeParse({
                    ...block,
                    translations: [{ language: 'es', segments }],
                }).success,
            ).toBe(false);
    });

    it('validates transcript ordering, intervals and segment identity', () => {
        const segment = {
            id,
            text: 'Hello',
            timing: { startSeconds: 0, endSeconds: 1 },
        };
        expect(
            LearningTranscriptSchema.safeParse({
                language: 'en',
                segments: [
                    segment,
                    {
                        id: other,
                        text: 'Bye',
                        timing: { startSeconds: 1, endSeconds: 2 },
                    },
                ],
            }).success,
        ).toBe(true);
        for (const segments of [
            [segment, segment],
            [{ ...segment, timing: { startSeconds: 2, endSeconds: 1 } }],
            [
                segment,
                {
                    id: other,
                    text: 'Bye',
                    timing: { startSeconds: 0.5, endSeconds: 2 },
                },
            ],
        ])
            expect(
                LearningTranscriptSchema.safeParse({ language: 'en', segments })
                    .success,
            ).toBe(false);
    });

    it('bounds content and requires meaningful grammar without altering source whitespace', () => {
        const block = { id, type: 'grammar', language: 'en' };
        for (const fields of [
            {},
            { rule: '   ' },
            { rule: '\u0000' },
            { rule: '\ud800' },
            { rule: 'a'.repeat(8_001) },
            { examples: [] },
        ])
            expect(
                LearningBlockSchema.safeParse({ ...block, ...fields }).success,
            ).toBe(false);
        expect(
            LearningBlockSchema.parse({ ...block, rule: '  rule  ' }),
        ).toMatchObject({ rule: '  rule  ' });
    });
});

it('preserves bounded literal definitions in vocabulary entries', () => {
    const value = {
        id,
        type: 'vocabulary',
        language: 'en',
        translationLanguage: 'fr',
        entries: [
            {
                id: other,
                term: 'cat',
                translation: 'chat',
                definition: '<script>literal</script>',
            },
        ],
    };
    expect(LearningBlockSchema.parse(value)).toMatchObject({
        entries: [{ definition: '<script>literal</script>' }],
    });
    expect(
        LearningBlockSchema.safeParse({
            ...value,
            entries: [{ ...value.entries[0], definition: 'x'.repeat(2001) }],
        }).success,
    ).toBe(false);
});
