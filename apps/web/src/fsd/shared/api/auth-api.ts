import { BrowserApiError, createBrowserApiClient } from '@languon/browser-auth';
import {
    AccountDeletionScheduleRequestSchema,
    AccountDeletionScheduleResponseSchema,
    AuthCapabilitiesResponseSchema,
    AuthErrorResponseSchema,
    ChangePasswordRequestSchema,
    ChangePasswordResponseSchema,
    CurrentUserResponseSchema,
    EmailVerificationResendRequestSchema,
    EmailVerificationResendResponseSchema,
    EmailVerificationVerifyRequestSchema,
    EmailVerificationVerifyResponseSchema,
    ForgotPasswordRequestSchema,
    ForgotPasswordResponseSchema,
    LogoutAllResponseSchema,
    LogoutAllRequestSchema,
    LogoutRequestSchema,
    LogoutResponseSchema,
    PasswordLoginRequestSchema,
    PasswordLoginResponseSchema,
    PasskeyAuthenticationOptionsResponseSchema,
    PasskeyAuthenticationOptionsRequestSchema,
    PasskeyAuthenticationVerifyRequestSchema,
    PasskeyAuthenticationVerifyResponseSchema,
    PasskeyListResponseSchema,
    PasskeyRegistrationOptionsResponseSchema,
    PasskeyRegistrationOptionsRequestSchema,
    PasskeyRegistrationVerifyRequestSchema,
    PasskeyRegistrationVerifyResponseSchema,
    RenamePasskeyRequestSchema,
    RenamePasskeyResponseSchema,
    ResetPasswordRequestSchema,
    ResetPasswordResponseSchema,
    UpdateHandleRequestSchema,
    UpdateHandleResponseSchema,
    RevokePasskeyResponseSchema,
    SignUpRequestSchema,
    SignUpResponseSchema,
    RefreshRequestSchema,
    type AuthCapabilitiesResponse,
    type AccountDeletionScheduleResponse,
    type AuthError,
    type ChangePasswordRequest,
    type ChangePasswordResponse,
    type CurrentUserResponse,
    type EmailVerificationResendRequest,
    type EmailVerificationResendResponse,
    type EmailVerificationVerifyRequest,
    type EmailVerificationVerifyResponse,
    type ForgotPasswordRequest,
    type ForgotPasswordResponse,
    type LogoutAllResponse,
    type LogoutResponse,
    type PasswordLoginRequest,
    type PasswordLoginResponse,
    type PasskeyAuthenticationOptionsResponse,
    type PasskeyAuthenticationVerifyRequest,
    type PasskeyAuthenticationVerifyResponse,
    type PasskeyListResponse,
    type PasskeyRegistrationOptionsResponse,
    type PasskeyRegistrationVerifyRequest,
    type PasskeyRegistrationVerifyResponse,
    type RenamePasskeyRequest,
    type RenamePasskeyResponse,
    type ResetPasswordRequest,
    type ResetPasswordResponse,
    type UpdateHandleRequest,
    type UpdateHandleResponse,
    type RevokePasskeyResponse,
    type SignUpRequest,
    type SignUpResponse,
} from '@languon/contracts';

export function resolveApiUrl(
    nodeEnvironment: string | undefined,
    configuredUrl: string | undefined,
): string {
    return (
        configuredUrl ??
        (nodeEnvironment === 'production' ? '/api' : 'http://localhost:4000')
    ).replace(/\/$/, '');
}

const apiUrl = resolveApiUrl(
    process.env.NODE_ENV,
    process.env.NEXT_PUBLIC_API_URL,
);
export class AuthApiError extends BrowserApiError<AuthError> {
    public override readonly name = 'AuthApiError';
}

const request = createBrowserApiClient<AuthError>({
    baseUrl: apiUrl,
    createError: (status, detail) => new AuthApiError(status, detail),
    errorResponseSchema: AuthErrorResponseSchema,
    invalidErrorResponseMessage:
        'Authentication is temporarily unavailable. Please try again.',
    invalidResponseMessage:
        'The authentication service returned an invalid response.',
    networkErrorMessage:
        'Authentication is temporarily unavailable. Please try again.',
}).request;

export const authApi = {
    capabilities: (signal?: AbortSignal) =>
        request('/auth/capabilities', {
            responseSchema: AuthCapabilitiesResponseSchema,
            signal,
        }) as Promise<AuthCapabilitiesResponse>,
    signUp: (body: SignUpRequest, signal?: AbortSignal) =>
        request('/auth/sign-up', {
            body,
            bodySchema: SignUpRequestSchema,
            method: 'POST',
            responseSchema: SignUpResponseSchema,
            signal,
        }) as Promise<SignUpResponse>,
    resendVerification: (
        body: EmailVerificationResendRequest,
        signal?: AbortSignal,
    ) =>
        request('/auth/email-verification/resend', {
            body,
            bodySchema: EmailVerificationResendRequestSchema,
            method: 'POST',
            responseSchema: EmailVerificationResendResponseSchema,
            signal,
        }) as Promise<EmailVerificationResendResponse>,
    verifyEmail: (body: EmailVerificationVerifyRequest, signal?: AbortSignal) =>
        request('/auth/email-verification/verify', {
            body,
            bodySchema: EmailVerificationVerifyRequestSchema,
            method: 'POST',
            responseSchema: EmailVerificationVerifyResponseSchema,
            signal,
        }) as Promise<EmailVerificationVerifyResponse>,
    passwordLogin: (body: PasswordLoginRequest, signal?: AbortSignal) =>
        request('/auth/login/password', {
            body,
            bodySchema: PasswordLoginRequestSchema,
            method: 'POST',
            responseSchema: PasswordLoginResponseSchema,
            signal,
        }) as Promise<PasswordLoginResponse>,
    refresh: (signal?: AbortSignal) =>
        request('/auth/refresh', {
            body: {},
            bodySchema: RefreshRequestSchema,
            method: 'POST',
            responseSchema: EmailVerificationVerifyResponseSchema,
            signal,
        }) as Promise<EmailVerificationVerifyResponse>,
    logout: (accessToken?: string, signal?: AbortSignal) =>
        request('/auth/logout', {
            accessToken,
            body: {},
            bodySchema: LogoutRequestSchema,
            method: 'POST',
            responseSchema: LogoutResponseSchema,
            signal,
        }) as Promise<LogoutResponse>,
    logoutAll: (accessToken: string, signal?: AbortSignal) =>
        request('/auth/logout-all', {
            accessToken,
            body: {},
            bodySchema: LogoutAllRequestSchema,
            method: 'POST',
            responseSchema: LogoutAllResponseSchema,
            signal,
        }) as Promise<LogoutAllResponse>,
    forgotPassword: (body: ForgotPasswordRequest, signal?: AbortSignal) =>
        request('/auth/password/forgot', {
            body,
            bodySchema: ForgotPasswordRequestSchema,
            method: 'POST',
            responseSchema: ForgotPasswordResponseSchema,
            signal,
        }) as Promise<ForgotPasswordResponse>,
    resetPassword: (body: ResetPasswordRequest, signal?: AbortSignal) =>
        request('/auth/password/reset', {
            body,
            bodySchema: ResetPasswordRequestSchema,
            method: 'POST',
            responseSchema: ResetPasswordResponseSchema,
            signal,
        }) as Promise<ResetPasswordResponse>,
    changePassword: (
        body: ChangePasswordRequest,
        accessToken: string,
        signal?: AbortSignal,
    ) =>
        request('/auth/password/change', {
            accessToken,
            body,
            bodySchema: ChangePasswordRequestSchema,
            method: 'POST',
            responseSchema: ChangePasswordResponseSchema,
            signal,
        }) as Promise<ChangePasswordResponse>,
    currentUser: (accessToken: string, signal?: AbortSignal) =>
        request('/users/me', {
            accessToken,
            responseSchema: CurrentUserResponseSchema,
            signal,
        }) as Promise<CurrentUserResponse>,
    updateHandle: (
        body: UpdateHandleRequest,
        accessToken: string,
        signal?: AbortSignal,
    ) =>
        request('/users/me/handle', {
            accessToken,
            body,
            bodySchema: UpdateHandleRequestSchema,
            method: 'PATCH',
            responseSchema: UpdateHandleResponseSchema,
            signal,
        }) as Promise<UpdateHandleResponse>,
    scheduleAccountDeletion: (accessToken: string, signal?: AbortSignal) =>
        request('/users/me/deletion', {
            accessToken,
            body: {},
            bodySchema: AccountDeletionScheduleRequestSchema,
            method: 'POST',
            responseSchema: AccountDeletionScheduleResponseSchema,
            signal,
        }) as Promise<AccountDeletionScheduleResponse>,
    passkeyAuthenticationOptions: (signal?: AbortSignal) =>
        request('/auth/passkeys/authentication/options', {
            body: {},
            bodySchema: PasskeyAuthenticationOptionsRequestSchema,
            method: 'POST',
            responseSchema: PasskeyAuthenticationOptionsResponseSchema,
            signal,
        }) as Promise<PasskeyAuthenticationOptionsResponse>,
    verifyPasskeyAuthentication: (
        body: PasskeyAuthenticationVerifyRequest,
        signal?: AbortSignal,
    ) =>
        request('/auth/passkeys/authentication/verify', {
            body,
            bodySchema: PasskeyAuthenticationVerifyRequestSchema,
            method: 'POST',
            responseSchema: PasskeyAuthenticationVerifyResponseSchema,
            signal,
        }) as Promise<PasskeyAuthenticationVerifyResponse>,
    passkeyRegistrationOptions: (accessToken: string, signal?: AbortSignal) =>
        request('/auth/passkeys/registration/options', {
            accessToken,
            body: {},
            bodySchema: PasskeyRegistrationOptionsRequestSchema,
            method: 'POST',
            responseSchema: PasskeyRegistrationOptionsResponseSchema,
            signal,
        }) as Promise<PasskeyRegistrationOptionsResponse>,
    verifyPasskeyRegistration: (
        body: PasskeyRegistrationVerifyRequest,
        accessToken: string,
        signal?: AbortSignal,
    ) =>
        request('/auth/passkeys/registration/verify', {
            accessToken,
            body,
            bodySchema: PasskeyRegistrationVerifyRequestSchema,
            method: 'POST',
            responseSchema: PasskeyRegistrationVerifyResponseSchema,
            signal,
        }) as Promise<PasskeyRegistrationVerifyResponse>,
    listPasskeys: (accessToken: string, signal?: AbortSignal) =>
        request('/auth/passkeys', {
            accessToken,
            responseSchema: PasskeyListResponseSchema,
            signal,
        }) as Promise<PasskeyListResponse>,
    renamePasskey: (
        passkeyId: string,
        body: RenamePasskeyRequest,
        accessToken: string,
        signal?: AbortSignal,
    ) =>
        request(`/auth/passkeys/${encodeURIComponent(passkeyId)}`, {
            accessToken,
            body,
            bodySchema: RenamePasskeyRequestSchema,
            method: 'PATCH',
            responseSchema: RenamePasskeyResponseSchema,
            signal,
        }) as Promise<RenamePasskeyResponse>,
    revokePasskey: (
        passkeyId: string,
        accessToken: string,
        signal?: AbortSignal,
    ) =>
        request(`/auth/passkeys/${encodeURIComponent(passkeyId)}`, {
            accessToken,
            method: 'DELETE',
            responseSchema: RevokePasskeyResponseSchema,
            signal,
        }) as Promise<RevokePasskeyResponse>,
};

export function authErrorMessage(error: unknown): string {
    if (error instanceof AuthApiError) {
        if (
            error.detail.code === 'rate_limited' &&
            error.detail.retryAfterSeconds
        ) {
            return `${error.detail.message} Try again in ${error.detail.retryAfterSeconds} seconds.`;
        }
        return error.detail.message;
    }
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
        return 'The passkey request was cancelled or timed out.';
    }
    if (error instanceof DOMException && error.name === 'InvalidStateError') {
        return 'That passkey is already registered or is unavailable.';
    }
    if (
        error instanceof Error &&
        (error.message.startsWith('Passkeys are not supported') ||
            error.message.startsWith('The browser did not return') ||
            error.message.startsWith('The browser returned'))
    ) {
        return error.message;
    }
    return 'Something went wrong. Please try again.';
}
