import { describe, expect, it } from 'vitest';

import {
    AuthenticationCapabilityUnavailableError,
    AuthenticationRequiredError,
    InvalidCredentialsError,
    PasskeyOperationFailedError,
    PasswordUnchangedError,
    RateLimitExceededError,
    RecentAuthenticationRequiredError,
    VerificationFailedError,
} from '../../../../../../src/modules/authentication/application/authentication-errors';
import { InvalidAccessTokenError } from '../../../../../../src/modules/authentication/application/ports/access-token';
import { RateLimitUnavailableError } from '../../../../../../src/modules/authentication/application/ports/rate-limiter';
import { PasswordPolicyViolationError } from '../../../../../../src/modules/authentication/domain/password-policy';
import { AuthenticationPersistenceConflictError } from '../../../../../../src/modules/authentication/infrastructure/persistence/drizzle/drizzle-authentication-repository';
import { mapAuthenticationHttpError } from '../../../../../../src/modules/authentication/interface/http/auth-http-error-mapping';

describe('authentication HTTP error mapping', () => {
    it.each([
        [new InvalidCredentialsError(), 401, 'invalid_credentials'],
        [new AuthenticationRequiredError(), 401, 'authentication_required'],
        [new InvalidAccessTokenError(), 401, 'authentication_required'],
        [new VerificationFailedError(), 400, 'verification_failed'],
        [
            new PasswordPolicyViolationError('too_short'),
            400,
            'password_policy_failed',
        ],
        [new PasswordUnchangedError(), 400, 'password_policy_failed'],
        [
            new RecentAuthenticationRequiredError(),
            403,
            'recent_authentication_required',
        ],
        [
            new AuthenticationCapabilityUnavailableError(),
            503,
            'capability_unavailable',
        ],
        [new RateLimitUnavailableError(), 503, 'service_unavailable'],
        [new PasskeyOperationFailedError(), 400, 'passkey_verification_failed'],
        [
            new AuthenticationPersistenceConflictError('passkey_name'),
            409,
            'conflict',
        ],
    ])('maps %s to a stable public response', (error, status, code) => {
        const mapped = mapAuthenticationHttpError(error);

        expect(mapped.status).toBe(status);
        expect(mapped.response('correlation-id')).toMatchObject({
            error: { code, correlationId: 'correlation-id' },
        });
    });

    it('preserves safe rate-limit retry metadata', () => {
        const mapped = mapAuthenticationHttpError(
            new RateLimitExceededError(37),
        );

        expect(mapped.status).toBe(429);
        expect(mapped.response('correlation-id')).toMatchObject({
            error: { code: 'rate_limited', retryAfterSeconds: 37 },
        });
    });

    it('does not disclose unexpected internal errors', () => {
        const mapped = mapAuthenticationHttpError(
            new Error('postgres://user:secret@database/private'),
        );

        expect(JSON.stringify(mapped.response('correlation-id'))).not.toContain(
            'secret',
        );
        expect(mapped.status).toBe(500);
    });
});
