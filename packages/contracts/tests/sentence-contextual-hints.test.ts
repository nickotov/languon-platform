import { describe, expect, it } from 'vitest';
import {
    SentenceCheckRequestSchema,
    SentenceExerciseSchema,
    SentenceReferenceRevealRequestSchema,
} from '../src/learning/sentences';

const id = '00000000-0000-4000-8000-000000000001';
const exercise = {
    id,
    dictionaryId: id,
    direction: 'source-to-target',
    sourceLanguage: 'en',
    targetLanguage: 'fr',
    sourceText: 'Stay inside.',
    generationPolicyVersion: 2,
    createdAt: '2026-10-05T00:00:00.000Z',
    segments: [
        {
            id: 'segment-1',
            start: 0,
            end: 4,
            text: 'Stay',
            target: {
                entryId: id,
                occurrenceId: 'occurrence-1',
                hintId: 'hint-1',
            },
        },
        { id: 'segment-2', start: 4, end: 5, text: ' ', target: null },
        {
            id: 'segment-3',
            start: 5,
            end: 11,
            text: 'inside',
            target: null,
            contextualHintId: 'hint-2',
        },
        { id: 'segment-4', start: 11, end: 12, text: '.', target: null },
    ],
    hints: [
        { id: 'hint-1', text: 'rester', kind: 'dictionary' },
        { id: 'hint-2', text: 'à l’intérieur', kind: 'contextual' },
    ],
};
describe('versioned contextual hint contracts', () => {
    it('accepts correctly linked contextual hints without fabricated target identity', () => {
        expect(
            SentenceExerciseSchema.parse(exercise).segments[2]?.target,
        ).toBeNull();
    });
    it('accepts unchanged legacy content and rejects version hybrids', () => {
        const legacy = {
            ...exercise,
            generationPolicyVersion: 1,
            segments: exercise.segments.map(
                ({ contextualHintId: _hint, ...segment }) => segment,
            ),
            hints: [{ id: 'hint-1', text: 'rester' }],
        };
        expect(SentenceExerciseSchema.safeParse(legacy).success).toBe(true);
        expect(
            SentenceExerciseSchema.safeParse({
                ...exercise,
                generationPolicyVersion: 1,
            }).success,
        ).toBe(false);
        expect(
            SentenceExerciseSchema.safeParse({
                ...legacy,
                generationPolicyVersion: 2,
            }).success,
        ).toBe(false);
    });
    it('rejects missing, conflicting, duplicate and unreferenced associations', () => {
        for (const malformed of [
            {
                ...exercise,
                hints: exercise.hints.map(({ kind: _kind, ...hint }) => hint),
            },
            {
                ...exercise,
                hints: [
                    exercise.hints[0],
                    { ...exercise.hints[1], id: 'hint-1' },
                ],
            },
            {
                ...exercise,
                segments: exercise.segments.map((segment, index) =>
                    index === 0
                        ? { ...segment, contextualHintId: 'hint-2' }
                        : segment,
                ),
            },
            {
                ...exercise,
                segments: exercise.segments.map((segment, index) =>
                    index === 2
                        ? { ...segment, contextualHintId: 'hint-9' }
                        : segment,
                ),
            },
            {
                ...exercise,
                hints: [
                    ...exercise.hints,
                    { id: 'hint-3', text: 'ailleurs', kind: 'contextual' },
                ],
            },
        ])
            expect(SentenceExerciseSchema.safeParse(malformed).success).toBe(
                false,
            );
    });
    it('admits disclosed helper IDs for AI checking while free reference review stays unchanged', () => {
        const request = {
            operationId: id,
            sessionId: id,
            revealedHintIds: Array.from(
                { length: 43 },
                (_, index) => `hint-${index + 1}`,
            ),
        };
        expect(
            SentenceReferenceRevealRequestSchema.safeParse({
                operationId: id,
                sessionId: id,
            }).success,
        ).toBe(true);
        expect(
            SentenceCheckRequestSchema.safeParse({
                ...request,
                answer: 'Je reste.',
                explanationLanguage: 'en',
            }).success,
        ).toBe(true);
        expect(
            SentenceCheckRequestSchema.safeParse({
                ...request,
                revealedHintIds: [...request.revealedHintIds, 'hint-44'],
                answer: 'Je reste.',
                explanationLanguage: 'en',
            }).success,
        ).toBe(false);
    });
});
