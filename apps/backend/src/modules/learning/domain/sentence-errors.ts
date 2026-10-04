export class SentenceInvalidModelOutputError extends Error {
    constructor(message = 'Invalid sentence model output') {
        super(message);
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
export class SentenceModelUnavailableError extends Error {}
export class SentenceCreditsExhaustedError extends Error {}

/** Temporary admission pressure; no exercise or job identity is missing. */
export class SentenceCapacityUnavailableError extends Error {
    constructor(public readonly retryAfterSeconds = 1) {
        super('Sentence AI capacity is temporarily unavailable');
    }
}
