import type { AuthErrorCode } from '@languon/contracts';

import { AuthApiError } from '@/fsd/shared/api/auth-api';
import type { MessageKey, Translate } from '@/fsd/shared/i18n';

const errorKeys: Record<AuthErrorCode, MessageKey> = {
    authentication_required: 'error.authentication_required',
    capability_unavailable: 'error.capability_unavailable',
    conflict: 'error.conflict',
    email_verification_required: 'error.email_verification_required',
    forbidden: 'error.forbidden',
    internal_error: 'error.internal_error',
    invalid_credentials: 'error.invalid_credentials',
    invalid_request: 'error.invalid_request',
    not_found: 'error.not_found',
    owner_transfer_required: 'profile.deleteOwnerTransfer',
    passkey_verification_failed: 'error.passkey_verification_failed',
    password_policy_failed: 'error.password_policy_failed',
    rate_limited: 'error.rate_limited',
    recent_authentication_required: 'error.recent_authentication_required',
    service_unavailable: 'error.service_unavailable',
    verification_failed: 'error.verification_failed',
};

export function localizedAuthError(error: unknown, t: Translate): string {
    if (error instanceof AuthApiError) {
        return t(errorKeys[error.detail.code], {
            seconds: error.detail.retryAfterSeconds ?? 0,
        });
    }
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
        return t('error.passkeyCancelled');
    }
    if (error instanceof DOMException && error.name === 'InvalidStateError') {
        return t('error.passkeyUnavailable');
    }
    return t('error.generic');
}
