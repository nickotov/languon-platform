export const sentenceModelOutputReasons = [
    'model_output_invalid',
    'input_invalid',
    'schema_invalid',
    'target_assessments_invalid',
    'answer_span_invalid',
    'input_token_bound',
    'usage_invalid',
] as const;
export type SentenceModelOutputReason =
    (typeof sentenceModelOutputReasons)[number];

export class SentenceInvalidModelOutputError extends Error {
    readonly reason: SentenceModelOutputReason;
    constructor(
        message = 'Invalid sentence model output',
        reason: SentenceModelOutputReason = 'model_output_invalid',
    ) {
        super(message);
        this.reason = sentenceModelOutputReasons.includes(reason)
            ? reason
            : 'model_output_invalid';
    }
}
export class SentenceUnavailableError extends Error {}
export class SentenceConflictError extends Error {
    constructor(
        public readonly reason: 'operation_conflict' | 'stale_content',
    ) {
        super(reason);
    }
}
export class SentenceModelUnavailableError extends Error {
    executionOutcome?: 'rejected' | 'completed' | 'ambiguous';
}
export class SentenceCreditsExhaustedError extends Error {}

/** Temporary admission pressure; no exercise or job identity is missing. */
export class SentenceCapacityUnavailableError extends Error {
    constructor(public readonly retryAfterSeconds = 1) {
        super('Sentence AI capacity is temporarily unavailable');
    }
}
