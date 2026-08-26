import type { DictionaryGenerationSafeFailure } from '@languon/contracts';

const retryableDictionaryGenerationFailureCodes = new Set<
    DictionaryGenerationSafeFailure['code']
>([
    'ocr_failed',
    'provider_rate_limited',
    'provider_timeout',
    'provider_unavailable',
]);

export function isDictionaryGenerationFailureRetryable(
    code: DictionaryGenerationSafeFailure['code'],
): boolean {
    return retryableDictionaryGenerationFailureCodes.has(code);
}

export class DictionaryNotFoundError extends Error {
    public constructor() {
        super('The dictionary was not found.');
        this.name = 'DictionaryNotFoundError';
    }
}

export class DictionaryCardNotFoundError extends Error {
    public constructor() {
        super('The dictionary card was not found.');
        this.name = 'DictionaryCardNotFoundError';
    }
}

export class SharedDictionaryNotFoundError extends Error {
    public constructor() {
        super('The shared dictionary was not found.');
        this.name = 'SharedDictionaryNotFoundError';
    }
}

export class DictionaryVersionConflictError extends Error {
    public constructor() {
        super('The dictionary changed since it was loaded.');
        this.name = 'DictionaryVersionConflictError';
    }
}

export class DictionaryIdempotencyConflictError extends Error {
    public constructor() {
        super('The idempotency key was already used for another request.');
        this.name = 'DictionaryIdempotencyConflictError';
    }
}

export class DictionaryLanguagePairLockedError extends Error {
    public constructor() {
        super('The language pair is locked after the first card.');
        this.name = 'DictionaryLanguagePairLockedError';
    }
}

export class DictionaryRateLimitError extends Error {
    public constructor(public readonly retryAfterSeconds: number) {
        super('Too many dictionary requests.');
        this.name = 'DictionaryRateLimitError';
    }
}

export class DictionaryServiceUnavailableError extends Error {
    public constructor() {
        super('The dictionary service is temporarily unavailable.');
        this.name = 'DictionaryServiceUnavailableError';
    }
}

export class InvalidDictionaryRequestError extends Error {
    public constructor() {
        super('The dictionary request is invalid.');
        this.name = 'InvalidDictionaryRequestError';
    }
}

export class DictionaryGenerationJobNotFoundError extends Error {
    public constructor() {
        super('The dictionary generation job was not found.');
        this.name = 'DictionaryGenerationJobNotFoundError';
    }
}

export class DictionaryGenerationNotAvailableError extends Error {
    public constructor(public readonly retryAfterSeconds = 60) {
        super('Dictionary generation is temporarily unavailable.');
        this.name = 'DictionaryGenerationNotAvailableError';
    }
}

export class DictionaryGenerationNotReviewableError extends Error {
    public constructor() {
        super('The dictionary generation proposal is not reviewable.');
        this.name = 'DictionaryGenerationNotReviewableError';
    }
}

export class DictionaryGenerationProposalExpiredError extends Error {
    public constructor() {
        super('The dictionary generation proposal expired.');
        this.name = 'DictionaryGenerationProposalExpiredError';
    }
}

export class DictionaryGenerationCandidateConflictError extends Error {
    public constructor() {
        super('A different candidate was already accepted.');
        this.name = 'DictionaryGenerationCandidateConflictError';
    }
}

export class DictionaryDocumentUploadNotFoundError extends Error {
    public constructor() {
        super('The dictionary document upload was not found.');
        this.name = 'DictionaryDocumentUploadNotFoundError';
    }
}

export class DictionaryDocumentUploadConflictError extends Error {
    public constructor() {
        super(
            'The dictionary document upload does not match its authorization.',
        );
        this.name = 'DictionaryDocumentUploadConflictError';
    }
}

export class DictionaryDocumentUploadCapacityError extends Error {
    public constructor() {
        super('The dictionary document upload capacity was reached.');
        this.name = 'DictionaryDocumentUploadCapacityError';
    }
}
