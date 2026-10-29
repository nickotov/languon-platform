import { describe, expect, it } from 'vitest';
import {
    RequestKnowledgeExerciseEvaluationSchema,
    KnowledgeExerciseEvaluationResultSchema,
    KnowledgeExerciseEvaluationJobSchema,
} from './knowledge-exercise-evaluation';
import { WorkbookAttemptEvaluationSchema } from './workbook-learning';

const id = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const revision = 'a'.repeat(64);

describe('private inline exercise evaluation contracts', () => {
    it('accepts private attempt identities but rejects client-supplied references, answers and correctness', () => {
        const request = {
            operationId: id,
            attemptId: otherId,
            replyLanguage: 'ru',
        };
        expect(RequestKnowledgeExerciseEvaluationSchema.parse(request)).toEqual(
            request,
        );
        for (const extra of [
            { answer: 'A fabricated answer' },
            { correct: true },
            { exercise: { referenceAnswer: 'wrong' } },
            { actorId: otherId },
        ]) {
            expect(
                RequestKnowledgeExerciseEvaluationSchema.safeParse({
                    ...request,
                    ...extra,
                }).success,
            ).toBe(false);
        }
    });
    it('distinguishes accepted alternatives from incorrect answers and non-AI evaluations', () => {
        expect(
            KnowledgeExerciseEvaluationResultSchema.parse({
                status: 'correct',
                feedback: 'This wording is also valid.',
                validAlternative: true,
            }),
        ).toMatchObject({ validAlternative: true });
        expect(
            KnowledgeExerciseEvaluationResultSchema.safeParse({
                status: 'incorrect',
                feedback: 'Try again.',
                validAlternative: true,
            }).success,
        ).toBe(false);
        expect(
            WorkbookAttemptEvaluationSchema.safeParse({
                status: 'correct',
                method: 'deterministic',
                validAlternative: true,
            }).success,
        ).toBe(false);
        expect(
            WorkbookAttemptEvaluationSchema.safeParse({
                status: 'incorrect',
                method: 'ai',
                validAlternative: true,
            }).success,
        ).toBe(false);
        expect(
            KnowledgeExerciseEvaluationResultSchema.safeParse({
                status: 'correct',
                feedback: '\u0000',
                validAlternative: false,
            }).success,
        ).toBe(false);
    });
    it('refuses completion without its own exact private attempt and revision', () => {
        const pending = {
            id,
            noteId: id,
            attemptId: otherId,
            exerciseId: id,
            exerciseRevision: revision,
            status: 'queued',
            result: null,
            attempt: null,
            failureCode: null,
            createdAt: '2026-10-29T00:00:00Z',
            completedAt: null,
        };
        expect(
            KnowledgeExerciseEvaluationJobSchema.safeParse(pending).success,
        ).toBe(true);
        expect(
            KnowledgeExerciseEvaluationJobSchema.safeParse({
                ...pending,
                status: 'completed',
                completedAt: '2026-10-29T00:00:01Z',
            }).success,
        ).toBe(false);
        const attempt = {
            id: otherId,
            noteId: id,
            noteVersion: 1,
            exerciseId: id,
            exerciseRevision: revision,
            answer: { format: 'free-text', text: 'My answer' },
            evaluation: {
                status: 'correct',
                method: 'ai',
                feedback: 'Valid.',
                validAlternative: true,
            },
            createdAt: '2026-10-29T00:00:00Z',
        };
        const completed = {
            ...pending,
            status: 'completed',
            completedAt: '2026-10-29T00:00:01Z',
            attempt,
            result: {
                status: 'correct',
                feedback: 'Valid.',
                validAlternative: true,
            },
        };
        expect(
            KnowledgeExerciseEvaluationJobSchema.safeParse(completed).success,
        ).toBe(true);
        expect(
            KnowledgeExerciseEvaluationJobSchema.safeParse({
                ...completed,
                attempt: { ...attempt, exerciseRevision: 'b'.repeat(64) },
            }).success,
        ).toBe(false);
        expect(
            KnowledgeExerciseEvaluationJobSchema.safeParse({
                ...completed,
                attempt: { ...attempt, id },
            }).success,
        ).toBe(false);
    });
});
