import { z } from 'zod';
import { TextLanguageSchema } from './texts';
import { ActionAllowanceQuoteSchema, ActionBillingSchema } from './ai-action';
import {
    WorkbookExerciseRevisionSchema,
    WorkbookLearnerAttemptSchema,
} from './workbook-learning';

const feedback = z
    .string()
    .trim()
    .min(1)
    .max(2_000)
    .refine(
        (value) => !/[\uD800-\uDFFF]/u.test(value) && !value.includes('\u0000'),
        'Expected valid Unicode feedback.',
    );

/** A private attempt identity, never client-selected correctness or reference material. */
export const RequestKnowledgeExerciseEvaluationSchema = z
    .object({
        operationId: z.uuid(),
        attemptId: z.uuid(),
        replyLanguage: TextLanguageSchema.optional(),
    })
    .strict();
export const KnowledgeExerciseEvaluationResultSchema = z
    .object({
        status: z.enum(['correct', 'incorrect']),
        feedback,
        validAlternative: z.boolean(),
    })
    .strict()
    .refine(
        (value) => !value.validAlternative || value.status === 'correct',
        'A valid alternative must be correct.',
    );
export const KnowledgeExerciseEvaluationJobSchema = z
    .object({
        id: z.uuid(),
        noteId: z.uuid(),
        attemptId: z.uuid(),
        exerciseId: z.uuid(),
        exerciseRevision: WorkbookExerciseRevisionSchema,
        status: z.enum([
            'queued',
            'running',
            'completed',
            'failed',
            'cancelled',
        ]),
        result: KnowledgeExerciseEvaluationResultSchema.nullable(),
        attempt: WorkbookLearnerAttemptSchema.nullable(),
        failureCode: z.string().min(1).max(100).nullable(),
        billing: ActionBillingSchema.optional(),
        createdAt: z.iso.datetime(),
        completedAt: z.iso.datetime().nullable(),
    })
    .strict()
    .superRefine((value, context) => {
        const terminal = ['completed', 'failed', 'cancelled'].includes(
            value.status,
        );
        const completed = value.status === 'completed';
        const evaluation = value.attempt?.evaluation;
        const resultMismatch =
            value.result !== null &&
            (!evaluation ||
                evaluation.status === 'unchecked' ||
                evaluation.method !== 'ai' ||
                evaluation.status !== value.result.status ||
                evaluation.feedback !== value.result.feedback ||
                (evaluation.status === 'correct' &&
                    evaluation.validAlternative !==
                        value.result.validAlternative));
        if (
            resultMismatch ||
            terminal !== (value.completedAt !== null) ||
            completed !== (value.result !== null) ||
            completed !== (value.attempt !== null) ||
            (value.status === 'failed') !== (value.failureCode !== null) ||
            (value.attempt !== null &&
                (value.attempt.noteId !== value.noteId ||
                    value.attempt.id !== value.attemptId ||
                    value.attempt.exerciseId !== value.exerciseId ||
                    value.attempt.exerciseRevision !== value.exerciseRevision))
        )
            context.addIssue({
                code: 'custom',
                message:
                    'Exercise evaluation state and source are inconsistent.',
            });
    });
export const KnowledgeExerciseEvaluationResponseSchema = z
    .object({
        job: KnowledgeExerciseEvaluationJobSchema,
    })
    .strict();
export type RequestKnowledgeExerciseEvaluation = z.infer<
    typeof RequestKnowledgeExerciseEvaluationSchema
>;
export type KnowledgeExerciseEvaluationResult = z.infer<
    typeof KnowledgeExerciseEvaluationResultSchema
>;
export type KnowledgeExerciseEvaluationJob = z.infer<
    typeof KnowledgeExerciseEvaluationJobSchema
>;

export const KnowledgeExerciseEvaluationErrorSchema = z.object({
    error: z.object({
        code: z.string(),
        message: z.string(),
        correlationId: z.uuid(),
        details: z.object({ quote: ActionAllowanceQuoteSchema }).optional(),
    }),
});
