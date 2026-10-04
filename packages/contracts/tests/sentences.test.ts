import { describe, expect, it } from 'vitest';
import {
    SentenceCheckRequestSchema,
    SentenceNextRequestSchema,
    SentenceCapabilitiesResponseSchema,
    SENTENCE_LIMITS,
    SentenceErrorResponseSchema,
    SentenceManualReviewSchema,
    SentenceReferenceRevealRequestSchema,
    SentenceReferenceRevealResponseSchema,
    SentenceExerciseSchema,
    SentenceManualReviewsQuerySchema,
} from '../src/learning/sentences';
import { LearningErrorResponseSchema } from '../src/learning';
const uuid = '00000000-0000-4000-8000-000000000001';
const check = {
    operationId: uuid,
    sessionId: uuid,
    answer: '  hello 😀\n',
    explanationLanguage: 'en',
    revealedHintIds: ['hint-1'],
};
describe('sentence boundary contracts', () => {
    it('retains exact answer and counts code points rather than UTF16 units', () => {
        expect(SentenceCheckRequestSchema.parse(check).answer).toBe(
            check.answer,
        );
        expect(
            SentenceCheckRequestSchema.safeParse({
                ...check,
                answer: '😀'.repeat(SENTENCE_LIMITS.answerCodePoints),
            }).success,
        ).toBe(true);
        expect(
            SentenceCheckRequestSchema.safeParse({
                ...check,
                answer: '😀'.repeat(SENTENCE_LIMITS.answerCodePoints + 1),
            }).success,
        ).toBe(false);
    });
    it('rejects blank answers, unsafe controls, duplicate hints and private fields', () => {
        for (const answer of [
            ' \n',
            'answer\u0000',
            'answer\u007f',
            'answer\ud800',
        ])
            expect(
                SentenceCheckRequestSchema.safeParse({ ...check, answer })
                    .success,
            ).toBe(false);
        expect(
            SentenceCheckRequestSchema.safeParse({
                ...check,
                revealedHintIds: ['hint-1', 'hint-1'],
            }).success,
        ).toBe(false);
        expect(
            SentenceCheckRequestSchema.safeParse({
                ...check,
                referenceTranslation: 'private',
            }).success,
        ).toBe(false);
    });
    it('bounds and deduplicates scopes and visited IDs', () => {
        const next = {
            operationId: uuid,
            sessionId: uuid,
            direction: 'source-to-target',
            mode: 'saved-first',
            scope: { type: 'all' },
            visitedExerciseIds: [],
        };
        expect(SentenceNextRequestSchema.safeParse(next).success).toBe(true);
        expect(
            SentenceNextRequestSchema.safeParse({
                ...next,
                visitedExerciseIds: [uuid, uuid],
            }).success,
        ).toBe(false);
        expect(
            SentenceNextRequestSchema.safeParse({
                ...next,
                scope: { type: 'manual', entryIds: [] },
            }).success,
        ).toBe(false);
        expect(
            SentenceNextRequestSchema.safeParse({
                ...next,
                scope: { type: 'manual', entryIds: [uuid, uuid] },
            }).success,
        ).toBe(false);
    });
    it('publishes isolated bounded sentence errors without extending legacy flashcard errors', () => {
        for (const code of [
            'model_unavailable',
            'ai_credits_exhausted',
            'feature_disabled',
            'stale_content',
            'job_not_found',
        ]) {
            const response = {
                error: {
                    code,
                    message: 'Sentence operation unavailable.',
                    correlationId: uuid,
                },
            };
            expect(
                SentenceErrorResponseSchema.safeParse(response).success,
            ).toBe(true);
            expect(
                LearningErrorResponseSchema.safeParse(response).success,
            ).toBe(false);
        }
        const error = {
            code: 'invalid_request',
            message: 'Invalid input.',
            correlationId: uuid,
        };
        expect(SentenceErrorResponseSchema.safeParse({ error }).success).toBe(
            true,
        );
        expect(
            SentenceErrorResponseSchema.safeParse({
                error: { ...error, message: 'x'.repeat(301) },
            }).success,
        ).toBe(false);
        expect(
            SentenceErrorResponseSchema.safeParse({
                error: { ...error, retryAfterSeconds: 0 },
            }).success,
        ).toBe(false);
        expect(
            SentenceErrorResponseSchema.safeParse({
                error: { ...error, providerResponse: 'private' },
            }).success,
        ).toBe(false);
    });
    it('isolates explicit manual reference reveal without inventing a score', () => {
        const exercise = {
            id: uuid,
            dictionaryId: uuid,
            direction: 'source-to-target',
            sourceLanguage: 'en',
            targetLanguage: 'de',
            sourceText: 'We go.',
            segments: [
                {
                    id: 'segment-1',
                    start: 0,
                    end: 3,
                    text: 'We ',
                    target: null,
                },
                {
                    id: 'segment-2',
                    start: 3,
                    end: 5,
                    text: 'go',
                    target: {
                        entryId: uuid,
                        occurrenceId: 'occurrence-1',
                        hintId: 'hint-1',
                    },
                },
                { id: 'segment-3', start: 5, end: 6, text: '.', target: null },
            ],
            hints: [{ id: 'hint-1', text: 'gehen' }],
            generationPolicyVersion: 1,
            createdAt: '2026-10-04T00:00:00.000Z',
        };
        const review = {
            id: uuid,
            exercise,
            contentState: 'current',
            sessionId: uuid,
            referenceTranslation: 'Wir gehen.',
            createdAt: '2026-10-04T00:00:00.000Z',
        };
        expect(
            SentenceReferenceRevealRequestSchema.parse({
                operationId: uuid,
                sessionId: uuid,
            }),
        ).toEqual({ operationId: uuid, sessionId: uuid });
        expect(
            SentenceReferenceRevealResponseSchema.parse({ review }).review
                .referenceTranslation,
        ).toBe('Wir gehen.');
        expect(
            SentenceManualReviewSchema.safeParse({ ...review, score: 100 })
                .success,
        ).toBe(false);
        expect(
            SentenceManualReviewSchema.safeParse({
                ...review,
                feedback: { percentage: 100 },
            }).success,
        ).toBe(false);
        expect(
            SentenceExerciseSchema.safeParse({
                ...exercise,
                referenceTranslation: 'Wir gehen.',
            }).success,
        ).toBe(false);
        expect(SentenceManualReviewsQuerySchema.parse({})).toEqual({
            limit: 25,
        });
        expect(
            SentenceManualReviewsQuerySchema.safeParse({ limit: 26 }).success,
        ).toBe(false);
        expect(
            SentenceManualReviewSchema.safeParse({
                ...review,
                referenceTranslation: '😀'.repeat(4001),
            }).success,
        ).toBe(false);
    });
    it('isolates sentence capability from strict flashcard capability', () => {
        expect(
            SentenceCapabilitiesResponseSchema.safeParse({
                sentencesEnabled: true,
            }).success,
        ).toBe(true);
        expect(
            SentenceCapabilitiesResponseSchema.safeParse({
                sentencesEnabled: true,
                flashcardsEnabled: true,
            }).success,
        ).toBe(false);
    });
});
