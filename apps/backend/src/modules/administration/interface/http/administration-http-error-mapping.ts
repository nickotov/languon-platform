import { RecentAuthenticationRequiredError } from '../../../authentication/application/authentication-errors';
import { mapAuthenticationHttpError } from '../../../authentication/interface/http/auth-http-error-mapping';
import {
    AdminAccessDeniedError,
    AdminCancellationJournalUnavailableError,
    AdminDeletionCancellationUnavailableError,
    AdminLastOwnerForbiddenError,
    AdminSelfDisableForbiddenError,
    AdminUserNotFoundError,
    AdminUserStateConflictError,
} from '../../application/administration-errors';
import { AdministrationHttpError } from './administration-http-error';

export function mapAdministrationHttpError(
    error: Error,
): AdministrationHttpError {
    if (error instanceof AdministrationHttpError) return error;
    if (error instanceof AdminAccessDeniedError) {
        return new AdministrationHttpError(
            'admin_access_denied',
            'Administrator access is required.',
            403,
        );
    }
    if (error instanceof RecentAuthenticationRequiredError) {
        return new AdministrationHttpError(
            'recent_authentication_required',
            'Recent authentication is required.',
            403,
        );
    }
    if (error instanceof AdminUserNotFoundError) {
        return new AdministrationHttpError(
            'user_not_found',
            'The requested user was not found.',
            404,
        );
    }
    if (error instanceof AdminUserStateConflictError) {
        return new AdministrationHttpError(
            'user_state_conflict',
            'The user changed since it was loaded.',
            409,
        );
    }
    if (error instanceof AdminDeletionCancellationUnavailableError) {
        return new AdministrationHttpError(
            'deletion_cancellation_unavailable',
            'The purge has started or this account is not scheduled for deletion.',
            409,
        );
    }
    if (error instanceof AdminCancellationJournalUnavailableError) {
        return new AdministrationHttpError(
            'service_unavailable',
            'Account deletion cancellation is temporarily unavailable. Please retry.',
            503,
        );
    }
    if (error instanceof AdminSelfDisableForbiddenError) {
        return new AdministrationHttpError(
            'self_disable_forbidden',
            'An administrator cannot disable their own account.',
            403,
        );
    }
    if (error instanceof AdminLastOwnerForbiddenError) {
        return new AdministrationHttpError(
            'last_owner_forbidden',
            'The last active owner cannot be disabled.',
            409,
        );
    }

    const auth = mapAuthenticationHttpError(error);
    const supportedCodes = {
        authentication_required: 'authentication_required',
        capability_unavailable: 'capability_unavailable',
        conflict: 'user_state_conflict',
        forbidden: 'admin_access_denied',
        internal_error: 'internal_error',
        invalid_credentials: 'invalid_credentials',
        invalid_request: 'invalid_request',
        passkey_verification_failed: 'passkey_verification_failed',
        rate_limited: 'rate_limited',
        recent_authentication_required: 'recent_authentication_required',
        service_unavailable: 'service_unavailable',
        verification_failed: 'verification_failed',
    } as const;
    const code = supportedCodes[auth.code as keyof typeof supportedCodes];
    return new AdministrationHttpError(
        code ?? 'internal_error',
        auth.message,
        auth.status,
        auth.retryAfterSeconds,
    );
}
