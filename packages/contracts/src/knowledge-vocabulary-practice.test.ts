import { describe, expect, it } from 'vitest';
import { SentenceExerciseSchema } from './learning/sentences';
import { KnowledgeVocabularyPracticeSourceSchema } from './knowledge-vocabulary-practice';
const id = '00000000-0000-4000-8000-000000000001';
const blockId = '00000000-0000-4000-8000-000000000002';
const exercise = {
    id,
    dictionaryId: id,
    direction: 'source-to-target',
    sourceLanguage: 'en',
    targetLanguage: 'es',
    sourceText: 'Hello',
    segments: [
        {
            id: 'segment-0',
            start: 0,
            end: 5,
            text: 'Hello',
            target: {
                entryId: id,
                occurrenceId: 'occurrence-0',
                hintId: 'hint-0',
            },
        },
    ],
    hints: [{ id: 'hint-0', text: 'Hola' }],
    generationPolicyVersion: 1,
    createdAt: '2026-10-28T00:00:00.000Z',
};
describe('independent note vocabulary source', () => {
    it('retains legacy dictionary exercises and accepts explicit note source without fictitious dictionary', () => {
        expect(SentenceExerciseSchema.safeParse(exercise).success).toBe(true);
        expect(
            SentenceExerciseSchema.safeParse({
                ...exercise,
                dictionaryId: null,
                knowledgeSource: { noteId: id, blockId },
            }).success,
        ).toBe(true);
    });
    it('rejects ambiguous and absent sources and raw sharing secrets in public exercise', () => {
        expect(
            SentenceExerciseSchema.safeParse({
                ...exercise,
                knowledgeSource: { noteId: id, blockId },
            }).success,
        ).toBe(false);
        expect(
            SentenceExerciseSchema.safeParse({
                ...exercise,
                dictionaryId: null,
            }).success,
        ).toBe(false);
        expect(
            SentenceExerciseSchema.safeParse({
                ...exercise,
                dictionaryId: null,
                knowledgeSource: { noteId: id, blockId, key: 'secret' },
            }).success,
        ).toBe(false);
    });
    it('bounds request-only share capability and rejects caller-provided actor identity', () => {
        const source = { kind: 'knowledge-vocabulary', noteId: id, blockId };
        expect(
            KnowledgeVocabularyPracticeSourceSchema.safeParse(source).success,
        ).toBe(true);
        expect(
            KnowledgeVocabularyPracticeSourceSchema.safeParse({
                ...source,
                actorId: id,
            }).success,
        ).toBe(false);
        expect(
            KnowledgeVocabularyPracticeSourceSchema.safeParse({
                ...source,
                access: { kind: 'workbook', locator: 'x', key: 'bad' },
            }).success,
        ).toBe(false);
    });
});
