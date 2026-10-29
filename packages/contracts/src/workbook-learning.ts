import { z } from 'zod';

export const WorkbookExerciseRevisionSchema = z
    .string()
    .regex(/^[a-f0-9]{64}$/u);
const answerText = z
    .string()
    .max(8_000)
    .refine(
        (value) => !/[\uD800-\uDFFF]/u.test(value) && !value.includes('\u0000'),
        'Answer must contain valid Unicode.',
    );
const version = z.number().int().positive();
export const WorkbookAttemptAnswerSchema = z.discriminatedUnion('format', [
    z
        .object({ format: z.literal('multiple-choice'), choiceId: z.uuid() })
        .strict(),
    z
        .object({
            format: z.literal('fill-in-the-blank'),
            gaps: z
                .array(z.object({ id: z.uuid(), answer: answerText }).strict())
                .min(1)
                .max(100)
                .refine(
                    (gaps) =>
                        new Set(gaps.map((gap) => gap.id)).size === gaps.length,
                    'Gap identities must be unique.',
                )
                .refine(
                    (gaps) =>
                        gaps.reduce(
                            (length, gap) => length + gap.answer.length,
                            0,
                        ) <= 32_000,
                    'Combined answers exceed the limit.',
                ),
        })
        .strict(),
    z.object({ format: z.literal('free-text'), text: answerText }).strict(),
]);

/** Correctness and actor identity are server-owned; retries reuse this request id. */
export const SubmitWorkbookAttemptRequestSchema = z
    .object({
        id: z.uuid(),
        noteVersion: version,
        exerciseId: z.uuid(),
        exerciseRevision: WorkbookExerciseRevisionSchema,
        answer: WorkbookAttemptAnswerSchema,
    })
    .strict();
export const WorkbookAttemptEvaluationSchema = z.discriminatedUnion('status', [
    z.object({ status: z.literal('unchecked') }).strict(),
    z
        .object({
            status: z.enum(['correct', 'incorrect']),
            method: z.enum(['deterministic', 'ai']),
            feedback: z.string().max(8_000).optional(),
            validAlternative: z.boolean().optional(),
        })
        .strict()
        .refine(
            (value) =>
                value.validAlternative === undefined ||
                (value.method === 'ai' && value.status === 'correct'),
            'Alternative-answer feedback belongs to correct AI evaluations.',
        ),
]);
export const WorkbookLearnerAttemptSchema =
    SubmitWorkbookAttemptRequestSchema.extend({
        noteId: z.uuid(),
        evaluation: WorkbookAttemptEvaluationSchema,
        createdAt: z.iso.datetime(),
    });

/** Observations are distinct from attempts; revealing an answer never implies correctness. */
export const RecordWorkbookLearningEventRequestSchema = z
    .object({
        id: z.uuid(),
        noteVersion: version,
        blockId: z.uuid(),
        exerciseRevision: WorkbookExerciseRevisionSchema.optional(),
        kind: z.enum(['hint-used', 'answer-revealed', 'transcript-revealed']),
    })
    .strict()
    .superRefine((value, ctx) => {
        if (value.kind !== 'transcript-revealed' && !value.exerciseRevision)
            ctx.addIssue({
                code: 'custom',
                path: ['exerciseRevision'],
                message:
                    'Exercise observations require their answered version.',
            });
    });
export const WorkbookLearningEventSchema =
    RecordWorkbookLearningEventRequestSchema.safeExtend({
        noteId: z.uuid(),
        createdAt: z.iso.datetime(),
    });
export const SetWorkbookNoteCompletionRequestSchema = z
    .object({
        id: z.uuid(),
        noteVersion: version,
        completed: z.boolean(),
    })
    .strict();
export const WorkbookNoteCompletionSchema = z
    .object({
        noteId: z.uuid(),
        completedNoteVersion: version,
        completedAt: z.iso.datetime(),
    })
    .strict();

/** Syntax validation only. An authenticated service must resolve this live grant. */
export const WorkbookLearningShareAccessSchema = z
    .object({
        kind: z.enum(['note', 'workbook']),
        locator: z.string().regex(/^[A-Za-z0-9_-]{32}$/u),
        key: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
    })
    .strict();
export const WorkbookLearningStateSchema = z
    .object({
        noteId: z.uuid(),
        noteVersion: version,
        attempts: z.array(WorkbookLearnerAttemptSchema).max(100),
        events: z.array(WorkbookLearningEventSchema).max(100),
        completion: WorkbookNoteCompletionSchema.nullable(),
        updatedSinceCompletion: z.boolean(),
        exerciseRevisions: z
            .array(
                z
                    .object({
                        exerciseId: z.uuid(),
                        revision: WorkbookExerciseRevisionSchema,
                    })
                    .strict(),
            )
            .max(5_000),
        truncated: z.boolean(),
    })
    .strict();
export const WorkbookAttemptResponseSchema = z
    .object({ attempt: WorkbookLearnerAttemptSchema })
    .strict();
export const WorkbookLearningEventResponseSchema = z
    .object({ event: WorkbookLearningEventSchema })
    .strict();
export const WorkbookNoteCompletionResponseSchema = z
    .object({ completion: WorkbookNoteCompletionSchema.nullable() })
    .strict();

export type WorkbookAttemptAnswer = z.infer<typeof WorkbookAttemptAnswerSchema>;
export type SubmitWorkbookAttemptRequest = z.infer<
    typeof SubmitWorkbookAttemptRequestSchema
>;
export type WorkbookAttemptEvaluation = z.infer<
    typeof WorkbookAttemptEvaluationSchema
>;
export type WorkbookLearnerAttempt = z.infer<
    typeof WorkbookLearnerAttemptSchema
>;
export type RecordWorkbookLearningEventRequest = z.infer<
    typeof RecordWorkbookLearningEventRequestSchema
>;
export type WorkbookLearningEvent = z.infer<typeof WorkbookLearningEventSchema>;
export type SetWorkbookNoteCompletionRequest = z.infer<
    typeof SetWorkbookNoteCompletionRequestSchema
>;
export type WorkbookNoteCompletion = z.infer<
    typeof WorkbookNoteCompletionSchema
>;
export type WorkbookLearningShareAccess = z.infer<
    typeof WorkbookLearningShareAccessSchema
>;
export type WorkbookLearningState = z.infer<typeof WorkbookLearningStateSchema>;

/** The authenticated learner's explicit completion of currently saved members. */
export const WorkbookProgressSchema = z
    .object({
        workbookId: z.uuid(),
        workbookVersion: z.number().int().positive(),
        totalNotes: z.number().int().min(0).max(500),
        completedNotes: z.number().int().min(0).max(500),
        updatedSinceCompletion: z.number().int().min(0).max(500),
    })
    .strict()
    .refine(
        (value) =>
            value.updatedSinceCompletion <= value.completedNotes &&
            value.completedNotes <= value.totalNotes,
    );
export type WorkbookProgress = z.infer<typeof WorkbookProgressSchema>;
