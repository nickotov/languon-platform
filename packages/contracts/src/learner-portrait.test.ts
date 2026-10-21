import { describe, expect, it } from 'vitest';
import {
    PortraitAnswerSchema,
    PortraitInterviewChatSchema,
    PortraitItemsSchema,
    PortraitInterviewerOutputSchema,
    portraitCharacterCount,
    portraitSerializedByteLength,
    PORTRAIT_ITEMS_MAX_BYTES,
} from './learner-portrait';

describe('learner portrait boundaries', () => {
    it('rejects ambiguous duplicated option identifiers from the interviewer', () => {
        const question = {
            message: 'What helps you learn?',
            topic: 'style',
            multiSelect: true,
            options: [
                { id: 'examples', label: 'Examples' },
                { id: 'examples', label: 'Theory' },
            ],
        };
        expect(
            PortraitInterviewerOutputSchema.safeParse(question).success,
        ).toBe(false);
        expect(
            PortraitInterviewerOutputSchema.safeParse({
                ...question,
                options: [
                    { id: 'examples', label: 'Examples' },
                    { id: 'theory', label: 'Theory' },
                ],
            }).success,
        ).toBe(true);
    });
    it('counts combined accents and family emoji as visible characters', () => {
        expect(portraitCharacterCount('e\u0301👩‍👩‍👧‍👦')).toBe(2);
        expect(PortraitAnswerSchema.safeParse('👩‍👩‍👧‍👦'.repeat(200)).success).toBe(
            true,
        );
        expect(
            PortraitAnswerSchema.safeParse('e\u0301'.repeat(201)).success,
        ).toBe(false);
        expect(
            PortraitInterviewChatSchema.safeParse('a'.repeat(1000)).success,
        ).toBe(true);
        expect(
            PortraitInterviewChatSchema.safeParse('a'.repeat(1001)).success,
        ).toBe(false);
    });
    it('rejects malformed text, unknown psychological fields, duplicate languages and oversized proposals', () => {
        expect(PortraitAnswerSchema.safeParse('\ud800').success).toBe(false);
        expect(PortraitAnswerSchema.safeParse('\u0000hello').success).toBe(
            false,
        );
        expect(
            PortraitItemsSchema.safeParse({ diagnosis: 'anything' }).success,
        ).toBe(false);
        expect(
            PortraitItemsSchema.safeParse({
                languages: [
                    { language: 'en', learning: true },
                    { language: 'EN', learning: false },
                ],
            }).success,
        ).toBe(false);
        expect(
            PortraitInterviewerOutputSchema.safeParse({
                message: 'Review this',
                topic: 'goals',
                options: [],
                multiSelect: false,
                answerSummary: 'a'.repeat(201),
            }).success,
        ).toBe(false);
    });
    it('leaves absent answers unknown and accepts partial input', () => {
        expect(PortraitItemsSchema.parse({ goals: ['Travel'] })).toEqual({
            languages: [],
            explanationLanguages: [],
            goals: ['Travel'],
            accommodations: [],
            hobbies: [],
        });
    });
    it('rejects aggregate storage exhaustion without imposing a smaller per-answer character limit', () => {
        const answer = '👩‍👩‍👧‍👦'.repeat(200);
        expect(PortraitAnswerSchema.safeParse(answer).success).toBe(true);
        const oversized = { goals: Array.from({ length: 12 }, () => answer) };
        expect(portraitSerializedByteLength(oversized)).toBeGreaterThan(
            PORTRAIT_ITEMS_MAX_BYTES,
        );
        const result = PortraitItemsSchema.safeParse(oversized);
        expect(result.success).toBe(false);
        if (!result.success)
            expect(
                result.error.issues.some((issue) =>
                    issue.message.includes('storage limit'),
                ),
            ).toBe(true);
    });
    it.each([
        ['helpful', true],
        ['sometimes', true],
        ['avoid', false],
    ] as const)(
        'round-trips the %s mixed-language choice and rejects contradictory legacy values',
        (mixedLanguageFrequency, mixedLanguage) => {
            const items = PortraitItemsSchema.parse({
                mixedLanguageFrequency,
                mixedLanguage,
            });
            expect(
                PortraitItemsSchema.parse(JSON.parse(JSON.stringify(items))),
            ).toEqual(items);
            expect(
                PortraitItemsSchema.safeParse({
                    mixedLanguageFrequency,
                    mixedLanguage: !mixedLanguage,
                }).success,
            ).toBe(false);
            expect(
                PortraitItemsSchema.safeParse({ mixedLanguageFrequency })
                    .success,
            ).toBe(true);
        },
    );
    it('preserves unknown new fields in legacy portraits and bounds confirmed note identity and answers', () => {
        const old = PortraitItemsSchema.parse({ mixedLanguage: true });
        expect(old.mixedLanguageFrequency).toBeUndefined();
        expect(old.mixingNote).toBeUndefined();
        expect(old.notes).toBeUndefined();
        const note = {
            id: '00000000-0000-4000-8000-000000000001',
            topic: 'style' as const,
            text: 'e\u0301'.repeat(200),
        };
        expect(
            PortraitItemsSchema.safeParse({
                notes: [note],
                mixingNote: note.text,
            }).success,
        ).toBe(true);
        expect(
            PortraitItemsSchema.safeParse({
                notes: [{ ...note, text: 'e\u0301'.repeat(201) }],
            }).success,
        ).toBe(false);
        expect(
            PortraitItemsSchema.safeParse({ mixingNote: 'e\u0301'.repeat(201) })
                .success,
        ).toBe(false);
        expect(
            PortraitItemsSchema.safeParse({ notes: [note, note] }).success,
        ).toBe(false);
        expect(
            PortraitItemsSchema.safeParse({
                notes: [{ ...note, id: 'not-a-uuid' }],
            }).success,
        ).toBe(false);
        expect(
            PortraitItemsSchema.safeParse({
                notes: Array.from({ length: 13 }, (_, i) => ({
                    ...note,
                    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
                })),
            }).success,
        ).toBe(false);
        expect(
            PortraitItemsSchema.safeParse({
                notes: Array.from({ length: 12 }, (_, i) => ({
                    ...note,
                    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
                    text: '👩‍👩‍👧‍👦'.repeat(200),
                })),
            }).success,
        ).toBe(false);
    });
});
