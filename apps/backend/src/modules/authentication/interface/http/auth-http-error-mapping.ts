import {
    AuthenticationCapabilityUnavailableError,
    AuthenticationRequiredError,
    InvalidCredentialsError,
    PasskeyOperationFailedError,
    PasswordUnchangedError,
    RateLimitExceededError,
    RecentAuthenticationRequiredError,
    VerificationFailedError,
} from '../../application/authentication-errors';
import { InvalidAccessTokenError } from '../../application/ports/access-token';
import { EmailDeliveryUnavailableError } from '../../application/ports/email-sender';
import { PasskeyVerificationError } from '../../application/ports/passkey-verifier';
import { RateLimitUnavailableError } from '../../application/ports/rate-limiter';
import {
    WebAuthnChallengeAlreadyExistsError,
    WebAuthnChallengeStoreUnavailableError,
} from '../../application/ports/webauthn-challenge-store';
import { InvalidPasskeyNameError } from '../../domain/passkey';
import { PasswordPolicyViolationError } from '../../domain/password-policy';
import { AuthHttpError } from './auth-http-error';
import {
    InvalidBearerAuthorizationError,
    InvalidRequestOriginError,
} from './auth-http-policy';

export function mapAuthenticationHttpError(error: Error): AuthHttpError {
    if (error instanceof AuthHttpError) return error;
    if (error instanceof InvalidRequestOriginError) {
        return new AuthHttpError(
            'forbidden',
            'The request is not allowed.',
            403,
        );
    }
    if (
        error instanceof InvalidBearerAuthorizationError ||
        error instanceof InvalidAccessTokenError ||
        error instanceof AuthenticationRequiredError
    ) {
        return new AuthHttpError(
            'authentication_required',
            'Authentication is required.',
            401,
        );
    }
    if (error instanceof InvalidCredentialsError) {
        return new AuthHttpError(
            'invalid_credentials',
            'The credentials are invalid.',
            401,
        );
    }
    if (error instanceof VerificationFailedError) {
        return new AuthHttpError(
            'verification_failed',
            'The verification code is invalid or unavailable.',
            400,
        );
    }
    if (
        error instanceof PasswordPolicyViolationError ||
        error instanceof PasswordUnchangedError
    ) {
        return new AuthHttpError(
            'password_policy_failed',
            'The password does not satisfy the password policy.',
            400,
        );
    }
    if (error instanceof RateLimitExceededError) {
        return new AuthHttpError(
            'rate_limited',
            'Too many authentication attempts.',
            429,
            error.retryAfterSeconds,
        );
    }
    if (error instanceof RecentAuthenticationRequiredError) {
        return new AuthHttpError(
            'recent_authentication_required',
            'Recent authentication is required.',
            403,
        );
    }
    if (error instanceof AuthenticationCapabilityUnavailableError) {
        return new AuthHttpError(
            'capability_unavailable',
            'This authentication capability is unavailable.',
            503,
        );
    }
    if (
        error instanceof RateLimitUnavailableError ||
        error instanceof EmailDeliveryUnavailableError ||
        error instanceof WebAuthnChallengeStoreUnavailableError
    ) {
        return new AuthHttpError(
            'service_unavailable',
            'The authentication service is temporarily unavailable.',
            503,
        );
    }
    if (
        error instanceof PasskeyOperationFailedError ||
        error instanceof PasskeyVerificationError ||
        error instanceof InvalidPasskeyNameError
    ) {
        return new AuthHttpError(
            'passkey_verification_failed',
            'The passkey operation could not be completed.',
            400,
        );
    }
    if (error instanceof WebAuthnChallengeAlreadyExistsError) {
        return new AuthHttpError(
            'conflict',
            'The passkey operation could not be completed.',
            409,
        );
    }
    // Persistence errors stay behind the infrastructure boundary. Match the
    // deliberately stable public error identity instead of importing a concrete
    // infrastructure implementation into the HTTP interface layer.
    if (error.name === 'AuthenticationPersistenceConflictError') {
        return new AuthHttpError(
            'conflict',
            'The authentication operation conflicts with existing data.',
            409,
        );
    }
    return new AuthHttpError(
        'internal_error',
        'The authentication service could not complete the request.',
        500,
    );
}
