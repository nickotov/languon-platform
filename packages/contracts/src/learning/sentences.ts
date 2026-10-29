import { ActionAllowanceQuoteSchema } from '../ai-action';
import { ActionBillingSchema } from '../ai-action';
import { z } from 'zod';
import { LearningErrorCodeSchema, LearningErrorResponseSchema } from './index';
import {
    DictionaryCursorSchema,
    DictionaryLanguageTagSchema,
} from '../dictionaries/primitives';

export const SENTENCE_LIMITS = {
    selectedEntries: 100,
    visitedExercises: 100,
    candidateEntries: 12,
    requiredTargets: 3,
    contextualHints: 40,
    sourceCodePoints: 1_000,
    answerCodePoints: 4_000,
    feedbackCodePoints: 4_000,
    explanationCodePoints: 1_000,
    segments: 256,
    issues: 50,
    historyPage: 25,
} as const;
const safeText = (maximum: number, nonblank = true) =>
    z.string().refine(
        (v) =>
            [...v].length <= maximum &&
            (!nonblank || v.trim().length > 0) &&
            [...v].every((character) => {
                const code = character.codePointAt(0)!;
                return !(
                    code <= 8 ||
                    code === 11 ||
                    code === 12 ||
                    (code >= 14 && code <= 31) ||
                    (code >= 127 && code <= 159) ||
                    (code >= 0xd800 && code <= 0xdfff)
                );
            }),
        'Text is empty, too long or contains unsafe controls',
    );
const id = z.uuid();
const distinctIds = (maximum: number, minimum = 0) =>
    z
        .array(id)
        .min(minimum)
        .max(maximum)
        .refine((v) => new Set(v).size === v.length, 'IDs must be unique');
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const offset = z.number().int().nonnegative().max(8_000);
const token = (prefix: string) =>
    z
        .string()
        .max(40)
        .regex(new RegExp(`^${prefix}-[0-9]+$`));
export const SentenceDirectionSchema = z.enum([
    'source-to-target',
    'target-to-source',
]);
export const SentenceModeSchema = z.enum([
    'saved-first',
    'new-only',
    'review-only',
]);
export const SentenceRatingSchema = z.enum([
    'perfect',
    'good',
    'not-bad',
    'practise-again-later',
]);
export const SentenceScopeSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('all') }).strict(),
    z
        .object({
            type: z.literal('manual'),
            entryIds: distinctIds(SENTENCE_LIMITS.selectedEntries, 1),
        })
        .strict(),
]);
const SentenceSetupRequestSchema = z
    .object({
        direction: SentenceDirectionSchema,
        mode: SentenceModeSchema,
        scope: SentenceScopeSchema,
        explanationLanguage: DictionaryLanguageTagSchema.optional(),
        preparedBatchId: id.optional(),
    })
    .strict();
export const SentencePrepareRequestSchema = SentenceSetupRequestSchema.extend({
    confirmedQuoteId: z.uuid().optional(),
    replayExerciseIds: distinctIds(
        SENTENCE_LIMITS.visitedExercises,
        1,
    ).optional(),
})
    .strict()
    .refine(
        (input) => !input.replayExerciseIds || input.mode === 'review-only',
        {
            path: ['replayExerciseIds'],
            message: 'Exact replay requires review-only mode',
        },
    );
export const SentenceNextRequestSchema = SentenceSetupRequestSchema.extend({
    confirmedQuoteId: z.uuid().optional(),
    operationId: id,
    sessionId: id,
    visitedExerciseIds: distinctIds(SENTENCE_LIMITS.visitedExercises),
    replayExerciseId: id.optional(),
})
    .strict()
    .refine(
        (input) => !input.replayExerciseId || input.mode === 'review-only',
        {
            path: ['replayExerciseId'],
            message: 'Exact replay requires review-only mode',
        },
    );
export const SentencePrepareResponseSchema = z
    .object({
        direction: SentenceDirectionSchema,
        mode: SentenceModeSchema,
        sourceLanguage: DictionaryLanguageTagSchema,
        targetLanguage: DictionaryLanguageTagSchema,
        explanationLanguage: DictionaryLanguageTagSchema,
        eligibleCount: count,
        skippedCount: count,
        usedCount: count,
        remainingCount: count,
        savedUncheckedCount: count,
        savedReviewCount: count,
    })
    .strict();
export const SentenceSegmentSchema = z
    .object({
        id: token('segment'),
        start: offset,
        end: offset,
        text: safeText(SENTENCE_LIMITS.sourceCodePoints, false),
        target: z
            .object({
                entryId: id,
                occurrenceId: token('occurrence'),
                hintId: token('hint'),
            })
            .strict()
            .nullable(),
        contextualHintId: token('hint').optional(),
    })
    .strict();
export const SentenceHintSchema = z
    .object({
        id: token('hint'),
        text: safeText(400),
        kind: z.enum(['dictionary', 'contextual']).optional(),
    })
    .strict();
export const SentenceExerciseSchema = z
    .object({
        id,
        dictionaryId: id.nullable(),
        knowledgeSource: z
            .object({ noteId: id, blockId: id })
            .strict()
            .optional(),
        direction: SentenceDirectionSchema,
        sourceLanguage: DictionaryLanguageTagSchema,
        targetLanguage: DictionaryLanguageTagSchema,
        sourceText: safeText(SENTENCE_LIMITS.sourceCodePoints),
        segments: z
            .array(SentenceSegmentSchema)
            .min(1)
            .max(SENTENCE_LIMITS.segments),
        hints: z
            .array(SentenceHintSchema)
            .min(1)
            .max(
                SENTENCE_LIMITS.requiredTargets +
                    SENTENCE_LIMITS.contextualHints,
            ),
        generationPolicyVersion: z.union([z.literal(1), z.literal(2)]),
        createdAt: z.iso.datetime(),
    })
    .strict()
    .superRefine((exercise, context) => {
        if (
            (exercise.dictionaryId === null) !==
            (exercise.knowledgeSource !== undefined)
        )
            context.addIssue({
                code: 'custom',
                message: 'Exactly one sentence vocabulary source is required.',
            });
        if (exercise.generationPolicyVersion === 1) {
            if (
                exercise.hints.length > SENTENCE_LIMITS.requiredTargets ||
                exercise.hints.some((hint) => hint.kind !== undefined) ||
                exercise.segments.some(
                    (segment) => segment.contextualHintId !== undefined,
                )
            )
                context.addIssue({
                    code: 'custom',
                    message:
                        'Unexpected contextual metadata in legacy exercise',
                });
            return;
        }
        const hints = new Map(exercise.hints.map((hint) => [hint.id, hint]));
        const contextual = exercise.hints.filter(
            (hint) => hint.kind === 'contextual',
        );
        const required = exercise.hints.filter(
            (hint) => hint.kind === 'dictionary',
        );
        const used = new Set<string>();
        if (
            hints.size !== exercise.hints.length ||
            contextual.length < 1 ||
            contextual.length > SENTENCE_LIMITS.contextualHints ||
            required.length < 1 ||
            required.length > SENTENCE_LIMITS.requiredTargets ||
            contextual.length + required.length !== exercise.hints.length
        )
            context.addIssue({
                code: 'custom',
                message: 'Invalid version 2 hint inventory',
            });
        for (const segment of exercise.segments) {
            if (segment.target) {
                used.add(segment.target.hintId);
                if (
                    segment.contextualHintId !== undefined ||
                    hints.get(segment.target.hintId)?.kind !== 'dictionary'
                )
                    context.addIssue({
                        code: 'custom',
                        message: 'Invalid dictionary hint association',
                    });
            } else if (segment.contextualHintId !== undefined) {
                used.add(segment.contextualHintId);
                if (hints.get(segment.contextualHintId)?.kind !== 'contextual')
                    context.addIssue({
                        code: 'custom',
                        message: 'Invalid contextual hint association',
                    });
            }
        }
        if (exercise.hints.some((hint) => !used.has(hint.id)))
            context.addIssue({
                code: 'custom',
                message: 'Unreferenced version 2 hint',
            });
    });
export const SentenceFeedbackIssueSchema = z
    .object({
        id: token('issue'),
        kind: z.enum(['meaning', 'grammar', 'target']),
        severity: z.enum(['minor', 'substantive']),
        span: z
            .object({
                start: offset,
                end: offset,
                quote: safeText(SENTENCE_LIMITS.answerCodePoints),
            })
            .strict()
            .nullable(),
        explanation: safeText(SENTENCE_LIMITS.explanationCodePoints),
        correction: safeText(
            SENTENCE_LIMITS.answerCodePoints,
            false,
        ).nullable(),
    })
    .strict();
export const SentenceTargetAssessmentSchema = z
    .object({
        entryId: id,
        status: z.enum(['used', 'missing']),
        explanation: safeText(SENTENCE_LIMITS.explanationCodePoints),
    })
    .strict();
export const SentenceFeedbackSchema = z
    .object({
        percentage: z.number().int().min(0).max(100),
        rating: SentenceRatingSchema,
        meaning: z.enum(['correct', 'partial', 'incorrect']),
        grammar: z.enum(['correct', 'minor-errors', 'substantive-errors']),
        targets: z
            .array(SentenceTargetAssessmentSchema)
            .min(1)
            .max(SENTENCE_LIMITS.requiredTargets),
        issues: z
            .array(SentenceFeedbackIssueSchema)
            .max(SENTENCE_LIMITS.issues),
        improvedTranslation: safeText(SENTENCE_LIMITS.feedbackCodePoints),
        explanation: safeText(SENTENCE_LIMITS.explanationCodePoints),
    })
    .strict();
export const SentenceCheckRequestSchema = z
    .object({
        confirmedQuoteId: z.uuid().optional(),
        operationId: id,
        sessionId: id,
        answer: safeText(SENTENCE_LIMITS.answerCodePoints),
        explanationLanguage: DictionaryLanguageTagSchema,
        revealedHintIds: z
            .array(token('hint'))
            .max(
                SENTENCE_LIMITS.requiredTargets +
                    SENTENCE_LIMITS.contextualHints,
            )
            .refine(
                (v) => new Set(v).size === v.length,
                'Hints must be unique',
            ),
    })
    .strict();
export const SentenceAttemptSchema = z
    .object({
        id,
        exercise: SentenceExerciseSchema,
        contentState: z.enum(['current', 'outdated']),
        sessionId: id,
        answer: safeText(SENTENCE_LIMITS.answerCodePoints),
        explanationLanguage: DictionaryLanguageTagSchema,
        revealedHintIds: z
            .array(token('hint'))
            .max(
                SENTENCE_LIMITS.requiredTargets +
                    SENTENCE_LIMITS.contextualHints,
            ),
        assisted: z.boolean(),
        referenceRevealed: z.boolean(),
        feedback: SentenceFeedbackSchema,
        createdAt: z.iso.datetime(),
    })
    .strict();
export const SentenceJobFailureSchema = z.enum([
    'invalid_model_output',
    'provider_unavailable',
    'provider_timeout',
    'provider_rate_limited',
    'ai_credits_exhausted',
    'model_unavailable',
    'capacity_unavailable',
    'stale_content',
    'access_revoked',
]);
export const SentenceJobSchema = z
    .object({
        billing: ActionBillingSchema.optional(),
        id,
        kind: z.enum(['sentence-generation', 'sentence-check']),
        state: z.enum([
            'queued',
            'running',
            'completed',
            'failed',
            'cancelled',
        ]),
        cancellationRequested: z.boolean(),
        attemptCount: count,
        createdAt: z.iso.datetime(),
        updatedAt: z.iso.datetime(),
        failureCode: SentenceJobFailureSchema.nullable(),
        result: z
            .discriminatedUnion('kind', [
                z
                    .object({
                        kind: z.literal('exercise'),
                        exercise: SentenceExerciseSchema,
                    })
                    .strict(),
                z
                    .object({
                        kind: z.literal('attempt'),
                        attempt: SentenceAttemptSchema,
                    })
                    .strict(),
            ])
            .nullable(),
    })
    .strict()
    .superRefine((v, ctx) => {
        if (
            (v.state === 'completed') !== (v.result !== null) ||
            (v.state === 'failed') !== (v.failureCode !== null) ||
            (v.state === 'completed' &&
                (v.kind === 'sentence-generation'
                    ? v.result?.kind !== 'exercise'
                    : v.result?.kind !== 'attempt'))
        )
            ctx.addIssue({ code: 'custom', message: 'Invalid job outcome' });
    });
export const SentenceNextResponseSchema = z.discriminatedUnion('kind', [
    z
        .object({
            kind: z.literal('exercise'),
            exercise: SentenceExerciseSchema,
        })
        .strict(),
    z.object({ kind: z.literal('job'), job: SentenceJobSchema }).strict(),
    z
        .object({
            kind: z.literal('empty'),
            reason: z.enum(['no-eligible-entries', 'review-exhausted']),
        })
        .strict(),
]);
export const SentenceCapabilitiesResponseSchema = z
    .object({ sentencesEnabled: z.boolean() })
    .strict();
export const SentenceAttemptsQuerySchema = z
    .object({
        direction: SentenceDirectionSchema.optional(),
        exerciseId: id.optional(),
        cursor: DictionaryCursorSchema.optional(),
        limit: z.coerce
            .number()
            .int()
            .min(1)
            .max(SENTENCE_LIMITS.historyPage)
            .default(25),
    })
    .strict();
export const SentenceAttemptsResponseSchema = z
    .object({
        attempts: z
            .array(SentenceAttemptSchema)
            .max(SENTENCE_LIMITS.historyPage),
        nextCursor: DictionaryCursorSchema.nullable(),
    })
    .strict();
export const SentenceProgressQuerySchema = z
    .object({ direction: SentenceDirectionSchema })
    .strict();
export const SentenceProgressResponseSchema = z
    .object({
        direction: SentenceDirectionSchema,
        eligibleCount: count,
        usedCount: count,
        remainingCount: count,
        completedCheckCount: count,
        manualReviewCount: count,
        assistedCheckCount: count,
        ratings: z
            .object({
                perfect: count,
                good: count,
                notBad: count,
                practiseAgainLater: count,
            })
            .strict(),
    })
    .strict();
export type SentenceDirection = z.infer<typeof SentenceDirectionSchema>;
export type SentenceMode = z.infer<typeof SentenceModeSchema>;
export type SentenceRating = z.infer<typeof SentenceRatingSchema>;
export type SentenceScope = z.infer<typeof SentenceScopeSchema>;
export type SentencePrepareRequest = z.infer<
    typeof SentencePrepareRequestSchema
>;
export type SentenceNextRequest = z.infer<typeof SentenceNextRequestSchema>;
export type SentencePrepareResponse = z.infer<
    typeof SentencePrepareResponseSchema
>;
export type SentenceSegment = z.infer<typeof SentenceSegmentSchema>;
export type SentenceHint = z.infer<typeof SentenceHintSchema>;
export type SentenceExercise = z.infer<typeof SentenceExerciseSchema>;
export type SentenceFeedbackIssue = z.infer<typeof SentenceFeedbackIssueSchema>;
export type SentenceTargetAssessment = z.infer<
    typeof SentenceTargetAssessmentSchema
>;
export type SentenceFeedback = z.infer<typeof SentenceFeedbackSchema>;
export type SentenceCheckRequest = z.infer<typeof SentenceCheckRequestSchema>;
export type SentenceAttempt = z.infer<typeof SentenceAttemptSchema>;
export type SentenceJobFailure = z.infer<typeof SentenceJobFailureSchema>;
export type SentenceJob = z.infer<typeof SentenceJobSchema>;
export type SentenceNextResponse = z.infer<typeof SentenceNextResponseSchema>;
export type SentenceCapabilitiesResponse = z.infer<
    typeof SentenceCapabilitiesResponseSchema
>;
export type SentenceAttemptsQuery = z.infer<typeof SentenceAttemptsQuerySchema>;
export type SentenceAttemptsResponse = z.infer<
    typeof SentenceAttemptsResponseSchema
>;
export type SentenceProgressQuery = z.infer<typeof SentenceProgressQuerySchema>;
export type SentenceProgressResponse = z.infer<
    typeof SentenceProgressResponseSchema
>;

/** Sentence-specific failures remain separate from the legacy flashcard envelope. */
export const SentenceErrorCodeSchema = z.enum([
    ...LearningErrorCodeSchema.options,
    'action_confirmation_required',
    'model_unavailable',
    'capacity_unavailable',
    'ai_credits_exhausted',
    'feature_disabled',
    'stale_content',
    'job_not_found',
]);
export const SentenceErrorResponseSchema = LearningErrorResponseSchema.extend({
    error: LearningErrorResponseSchema.shape.error
        .extend({
            code: SentenceErrorCodeSchema,
            details: z
                .object({ quote: ActionAllowanceQuoteSchema })
                .strict()
                .optional(),
        })
        .strict(),
}).strict();
export type SentenceErrorCode = z.infer<typeof SentenceErrorCodeSchema>;
export type SentenceErrorResponse = z.infer<typeof SentenceErrorResponseSchema>;

export const SentenceReferenceRevealRequestSchema = z
    .object({ operationId: id, sessionId: id })
    .strict();
export const SentenceManualReviewSchema = z
    .object({
        id,
        exercise: SentenceExerciseSchema,
        contentState: z.enum(['current', 'outdated']),
        sessionId: id,
        referenceTranslation: safeText(SENTENCE_LIMITS.feedbackCodePoints),
        createdAt: z.iso.datetime(),
    })
    .strict();
export const SentenceReferenceRevealResponseSchema = z
    .object({ review: SentenceManualReviewSchema })
    .strict();
export const SentenceManualReviewsQuerySchema = SentenceAttemptsQuerySchema;
export const SentenceManualReviewsResponseSchema = z
    .object({
        reviews: z
            .array(SentenceManualReviewSchema)
            .max(SENTENCE_LIMITS.historyPage),
        nextCursor: DictionaryCursorSchema.nullable(),
    })
    .strict();
export type SentenceReferenceRevealRequest = z.infer<
    typeof SentenceReferenceRevealRequestSchema
>;
export type SentenceManualReview = z.infer<typeof SentenceManualReviewSchema>;
export type SentenceReferenceRevealResponse = z.infer<
    typeof SentenceReferenceRevealResponseSchema
>;
export type SentenceManualReviewsQuery = z.infer<
    typeof SentenceManualReviewsQuerySchema
>;
export type SentenceManualReviewsResponse = z.infer<
    typeof SentenceManualReviewsResponseSchema
>;
