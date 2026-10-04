import { z } from 'zod';
import {
    SentenceCheckRequestSchema,
    SentenceFeedbackSchema,
    SentenceFeedbackIssueSchema,
    SentenceTargetAssessmentSchema,
    SENTENCE_LIMITS,
} from '@languon/contracts';
import type { SentenceFeedback, SentenceRating } from '@languon/contracts';
import { SentenceInvalidModelOutputError } from './sentence-errors';
import { sentenceGraphemeBoundaries } from './sentence-content';
import type { SentenceCheckDraft, SentenceCheckInput } from './sentence-types';
export const SentenceCheckDraftSchema = z
    .object({
        proposedPercentage: z.number().int().min(0).max(100),
        meaning: SentenceFeedbackSchema.shape.meaning,
        grammar: SentenceFeedbackSchema.shape.grammar,
        targets: z
            .array(SentenceTargetAssessmentSchema)
            .min(1)
            .max(SENTENCE_LIMITS.requiredTargets),
        issues: z
            .array(SentenceFeedbackIssueSchema.omit({ id: true }))
            .max(SENTENCE_LIMITS.issues),
        improvedTranslation: SentenceFeedbackSchema.shape.improvedTranslation,
        explanation: SentenceFeedbackSchema.shape.explanation,
    })
    .strict();
export function sentenceRating(percentage: number): SentenceRating {
    if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100)
        throw new RangeError('Invalid percentage');
    return percentage === 100
        ? 'perfect'
        : percentage >= 80
          ? 'good'
          : percentage >= 50
            ? 'not-bad'
            : 'practise-again-later';
}
export function isSentenceSpanValid(
    answer: string,
    span: { start: number; end: number; quote: string },
): boolean {
    const boundaries = sentenceGraphemeBoundaries(answer);
    return (
        Number.isInteger(span.start) &&
        Number.isInteger(span.end) &&
        span.start >= 0 &&
        span.end > span.start &&
        boundaries.has(span.start) &&
        boundaries.has(span.end) &&
        answer.slice(span.start, span.end) === span.quote
    );
}
export function validateSentenceCheck(
    input: SentenceCheckInput,
    value: SentenceCheckDraft,
): SentenceFeedback {
    if (
        !SentenceCheckRequestSchema.shape.answer.safeParse(input.answer).success
    )
        throw new SentenceInvalidModelOutputError('Invalid immutable answer');
    const parsed = SentenceCheckDraftSchema.safeParse(value);
    if (!parsed.success) throw new SentenceInvalidModelOutputError();
    const draft = parsed.data;
    const admitted = new Set(input.targets.map((target) => target.entryId));
    if (
        admitted.size < 1 ||
        admitted.size > 3 ||
        admitted.size !== input.targets.length ||
        draft.targets.length !== admitted.size ||
        new Set(draft.targets.map((target) => target.entryId)).size !==
            admitted.size ||
        draft.targets.some((target) => !admitted.has(target.entryId)) ||
        draft.issues.some(
            (issue) =>
                issue.span !== null &&
                !isSentenceSpanValid(input.answer, issue.span),
        )
    )
        throw new SentenceInvalidModelOutputError(
            'Invalid target assessment or answer span',
        );
    let percentage = draft.proposedPercentage;
    if (draft.targets.some((target) => target.status === 'missing'))
        percentage = Math.min(percentage, 79);
    if (
        draft.meaning !== 'correct' ||
        draft.grammar !== 'correct' ||
        draft.issues.length > 0
    )
        percentage = Math.min(percentage, 99);
    return {
        percentage,
        rating: sentenceRating(percentage),
        meaning: draft.meaning,
        grammar: draft.grammar,
        targets: draft.targets,
        issues: draft.issues.map((issue, index) => ({
            ...issue,
            id: `issue-${index + 1}`,
        })),
        improvedTranslation: draft.improvedTranslation,
        explanation: draft.explanation,
    };
}
