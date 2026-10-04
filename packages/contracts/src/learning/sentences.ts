import { z } from 'zod';
import { LearningErrorCodeSchema, LearningErrorResponseSchema } from './index';
import {
    DictionaryCursorSchema,
    DictionaryLanguageTagSchema,
} from '../dictionaries/primitives';

export const SENTENCE_LIMITS = {
    selectedEntries: 10_000,
    visitedExercises: 1_000,
    candidateEntries: 12,
    requiredTargets: 3,
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
export const SentencePrepareRequestSchema = z
    .object({
        direction: SentenceDirectionSchema,
        mode: SentenceModeSchema,
        scope: SentenceScopeSchema,
        explanationLanguage: DictionaryLanguageTagSchema.optional(),
    })
    .strict();
export const SentenceNextRequestSchema = SentencePrepareRequestSchema.extend({
    operationId: id,
    sessionId: id,
    visitedExerciseIds: distinctIds(SENTENCE_LIMITS.visitedExercises),
}).strict();
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
    })
    .strict();
export const SentenceHintSchema = z
    .object({ id: token('hint'), text: safeText(400) })
    .strict();
export const SentenceExerciseSchema = z
    .object({
        id,
        dictionaryId: id,
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
            .max(SENTENCE_LIMITS.requiredTargets),
        generationPolicyVersion: z.literal(1),
        createdAt: z.iso.datetime(),
    })
    .strict();
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
        operationId: id,
        sessionId: id,
        answer: safeText(SENTENCE_LIMITS.answerCodePoints),
        explanationLanguage: DictionaryLanguageTagSchema,
        revealedHintIds: z
            .array(token('hint'))
            .max(SENTENCE_LIMITS.requiredTargets)
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
            .max(SENTENCE_LIMITS.requiredTargets),
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
    'model_unavailable',
    'capacity_unavailable',
    'ai_credits_exhausted',
    'feature_disabled',
    'stale_content',
    'job_not_found',
]);
export const SentenceErrorResponseSchema = LearningErrorResponseSchema.extend({
    error: LearningErrorResponseSchema.shape.error
        .extend({ code: SentenceErrorCodeSchema })
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
