import type {
    AuthCapabilitiesResponse,
    AuthenticationSuccessResponse,
    ChangePasswordRequest,
    CurrentUserResponse,
    EmailVerificationResendRequest,
    EmailVerificationResendResponse,
    EmailVerificationVerifyRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LogoutAllResponse,
    LogoutResponse,
    PasswordLoginRequest,
    PasswordLoginResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
    SignUpRequest,
    SignUpResponse,
} from '@languon/contracts';

export interface AuthenticationHttpResult {
    refreshCredential: string;
    response: AuthenticationSuccessResponse;
}

export interface PasswordLoginHttpResult {
    refreshCredential?: string;
    response: PasswordLoginResponse;
}

export interface AuthHttpRequestMetadata {
    clientAddress: string;
    correlationId: string;
    signal: AbortSignal;
}

export interface AuthenticationHttpOperations {
    capabilities(): Promise<AuthCapabilitiesResponse>;
    changePassword(
        accessToken: string,
        input: ChangePasswordRequest,
        metadata: AuthHttpRequestMetadata,
    ): Promise<AuthenticationHttpResult>;
    currentUser(
        accessToken: string,
        metadata: AuthHttpRequestMetadata,
    ): Promise<CurrentUserResponse>;
    forgotPassword(
        input: ForgotPasswordRequest,
        metadata: AuthHttpRequestMetadata,
    ): Promise<ForgotPasswordResponse>;
    logout(
        refreshCredential: string | null,
        metadata: AuthHttpRequestMetadata,
    ): Promise<LogoutResponse>;
    logoutAll(
        accessToken: string,
        refreshCredential: string | null,
        metadata: AuthHttpRequestMetadata,
    ): Promise<LogoutAllResponse>;
    loginWithPassword(
        input: PasswordLoginRequest,
        metadata: AuthHttpRequestMetadata,
    ): Promise<PasswordLoginHttpResult>;
    refresh(
        refreshCredential: string,
        metadata: AuthHttpRequestMetadata,
    ): Promise<AuthenticationHttpResult>;
    resendEmailVerification(
        input: EmailVerificationResendRequest,
        metadata: AuthHttpRequestMetadata,
    ): Promise<EmailVerificationResendResponse>;
    resetPassword(
        input: ResetPasswordRequest,
        metadata: AuthHttpRequestMetadata,
    ): Promise<ResetPasswordResponse>;
    signUp(
        input: SignUpRequest,
        metadata: AuthHttpRequestMetadata,
    ): Promise<SignUpResponse>;
    verifyEmail(
        input: EmailVerificationVerifyRequest,
        metadata: AuthHttpRequestMetadata,
    ): Promise<AuthenticationHttpResult>;
}
