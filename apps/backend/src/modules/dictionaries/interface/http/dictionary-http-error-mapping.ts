import { AuthenticationRequiredError } from '../../../authentication/application/authentication-errors';
import { InvalidAccessTokenError } from '../../../authentication/application/ports/access-token';
import {
    InvalidBearerAuthorizationError,
    InvalidRequestOriginError,
} from '../../../authentication/interface/http/auth-http-policy';
import {
    DictionaryCardNotFoundError,
    DictionaryDocumentUploadCapacityError,
    DictionaryDocumentUploadConflictError,
    DictionaryDocumentUploadNotFoundError,
    DictionaryGenerationCandidateConflictError,
    DictionaryGenerationJobNotFoundError,
    DictionaryGenerationNotAvailableError,
    DictionaryGenerationNotReviewableError,
    DictionaryGenerationProposalExpiredError,
    DictionaryIdempotencyConflictError,
    DictionaryLanguagePairLockedError,
    DictionaryNotFoundError,
    DictionaryRateLimitError,
    DictionaryServiceUnavailableError,
    DictionaryVersionConflictError,
    InvalidDictionaryRequestError,
    SharedDictionaryNotFoundError,
} from '../../application/dictionary-errors';
import { DictionaryCardCapacityError } from '../../domain/ordering';
import { InvalidDictionaryLanguagePairError } from '../../domain/language-pair';
import { InvalidDictionarySettingsError } from '../../domain/settings';
import {
    DictionaryOwnerCapacityError,
    InvalidDictionaryTextError,
} from '../../domain/limits';
import { InvalidDictionaryBatchInputError } from '../../domain/batch-generation';
import { InvalidDictionaryInterchangeError } from '../../domain/interchange';
import { DictionaryHttpError } from './dictionary-http-error';

export function mapDictionaryHttpError(error: Error): DictionaryHttpError {
    if (error instanceof DictionaryHttpError) return error;
    if (
        error instanceof InvalidBearerAuthorizationError ||
        error instanceof InvalidAccessTokenError ||
        error instanceof AuthenticationRequiredError
    ) {
        return new DictionaryHttpError(
            'authentication_required',
            'Authentication is required.',
            401,
        );
    }
    if (error instanceof DictionaryNotFoundError)
        return new DictionaryHttpError(
            'dictionary_not_found',
            'The requested dictionary was not found.',
            404,
        );
    if (error instanceof DictionaryCardNotFoundError)
        return new DictionaryHttpError(
            'card_not_found',
            'The requested card was not found.',
            404,
        );
    if (error instanceof DictionaryGenerationJobNotFoundError)
        return new DictionaryHttpError(
            'generation_job_not_found',
            'The requested generation job was not found.',
            404,
        );
    if (error instanceof DictionaryDocumentUploadNotFoundError)
        return new DictionaryHttpError(
            'generation_job_not_found',
            'The requested document upload was not found.',
            404,
        );
    if (error instanceof DictionaryDocumentUploadConflictError)
        return new DictionaryHttpError(
            'version_conflict',
            'The uploaded object does not match its authorization.',
            409,
        );
    if (error instanceof DictionaryDocumentUploadCapacityError)
        return new DictionaryHttpError(
            'owner_capacity_exceeded',
            'The document upload capacity was reached.',
            409,
        );
    if (error instanceof DictionaryGenerationNotAvailableError)
        return new DictionaryHttpError(
            'generation_not_available',
            'Dictionary generation is temporarily unavailable.',
            503,
            error.retryAfterSeconds,
        );
    if (error instanceof DictionaryGenerationNotReviewableError)
        return new DictionaryHttpError(
            'generation_not_reviewable',
            'The generation proposal is not reviewable.',
            409,
        );
    if (error instanceof DictionaryGenerationProposalExpiredError)
        return new DictionaryHttpError(
            'generation_proposal_expired',
            'The generation proposal expired.',
            409,
        );
    if (error instanceof DictionaryGenerationCandidateConflictError)
        return new DictionaryHttpError(
            'generation_candidate_conflict',
            'A different candidate was already accepted.',
            409,
        );
    if (error instanceof SharedDictionaryNotFoundError)
        return new DictionaryHttpError(
            'shared_dictionary_not_found',
            'The shared dictionary was not found.',
            404,
        );
    if (error instanceof DictionaryVersionConflictError)
        return new DictionaryHttpError(
            'version_conflict',
            'The resource changed since it was loaded.',
            409,
        );
    if (error instanceof DictionaryIdempotencyConflictError)
        return new DictionaryHttpError(
            'idempotency_conflict',
            'The idempotency key conflicts with an earlier request.',
            409,
        );
    if (
        error instanceof DictionaryLanguagePairLockedError ||
        (error instanceof InvalidDictionaryLanguagePairError &&
            error.reason === 'locked')
    )
        return new DictionaryHttpError(
            'language_pair_locked',
            'The language pair is locked after the first card.',
            409,
        );
    if (error instanceof DictionaryCardCapacityError)
        return new DictionaryHttpError(
            'card_capacity_exceeded',
            'The dictionary card capacity was reached.',
            409,
        );
    if (error instanceof DictionaryOwnerCapacityError)
        return new DictionaryHttpError(
            'owner_capacity_exceeded',
            'The account dictionary storage capacity was reached.',
            409,
        );
    if (error instanceof DictionaryRateLimitError)
        return new DictionaryHttpError(
            'rate_limited',
            'Too many dictionary requests.',
            429,
            error.retryAfterSeconds,
        );
    if (error instanceof DictionaryServiceUnavailableError)
        return new DictionaryHttpError(
            'service_unavailable',
            'The dictionary service is temporarily unavailable.',
            503,
        );
    if (
        error instanceof InvalidRequestOriginError ||
        error instanceof InvalidDictionaryRequestError ||
        error instanceof InvalidDictionaryBatchInputError ||
        error instanceof InvalidDictionaryInterchangeError ||
        error instanceof InvalidDictionaryTextError ||
        error instanceof InvalidDictionarySettingsError ||
        error instanceof InvalidDictionaryLanguagePairError
    ) {
        return new DictionaryHttpError(
            'invalid_request',
            'The dictionary request is invalid.',
            400,
        );
    }
    return new DictionaryHttpError(
        'internal_error',
        'The dictionary service could not complete the request.',
        500,
    );
}
