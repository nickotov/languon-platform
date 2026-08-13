import { AuthErrorResponseSchema } from "./errors";
import {
  AuthCapabilitiesResponseSchema,
  CurrentUserResponseSchema,
} from "./models";
import {
  ChangePasswordRequestSchema,
  ChangePasswordResponseSchema,
  EmailVerificationResendRequestSchema,
  EmailVerificationResendResponseSchema,
  EmailVerificationVerifyRequestSchema,
  EmailVerificationVerifyResponseSchema,
  ForgotPasswordRequestSchema,
  ForgotPasswordResponseSchema,
  LogoutAllRequestSchema,
  LogoutAllResponseSchema,
  LogoutRequestSchema,
  LogoutResponseSchema,
  PasswordLoginRequestSchema,
  PasswordLoginResponseSchema,
  RefreshRequestSchema,
  RefreshResponseSchema,
  ResetPasswordRequestSchema,
  ResetPasswordResponseSchema,
  SignUpRequestSchema,
  SignUpResponseSchema,
} from "./password-email";
import {
  PasskeyAuthenticationOptionsRequestSchema,
  PasskeyAuthenticationOptionsResponseSchema,
  PasskeyAuthenticationVerifyRequestSchema,
  PasskeyAuthenticationVerifyResponseSchema,
  PasskeyIdParamsSchema,
  PasskeyListResponseSchema,
  PasskeyRegistrationOptionsRequestSchema,
  PasskeyRegistrationOptionsResponseSchema,
  PasskeyRegistrationVerifyRequestSchema,
  PasskeyRegistrationVerifyResponseSchema,
  RenamePasskeyRequestSchema,
  RenamePasskeyResponseSchema,
  RevokePasskeyResponseSchema,
} from "./passkeys";

export const AuthEndpointSchemas = {
  signUp: {
    body: SignUpRequestSchema,
    response: SignUpResponseSchema,
    error: AuthErrorResponseSchema,
  },
  resendEmailVerification: {
    body: EmailVerificationResendRequestSchema,
    response: EmailVerificationResendResponseSchema,
    error: AuthErrorResponseSchema,
  },
  verifyEmail: {
    body: EmailVerificationVerifyRequestSchema,
    response: EmailVerificationVerifyResponseSchema,
    error: AuthErrorResponseSchema,
  },
  passwordLogin: {
    body: PasswordLoginRequestSchema,
    response: PasswordLoginResponseSchema,
    error: AuthErrorResponseSchema,
  },
  refresh: {
    body: RefreshRequestSchema,
    response: RefreshResponseSchema,
    error: AuthErrorResponseSchema,
  },
  logout: {
    body: LogoutRequestSchema,
    response: LogoutResponseSchema,
    error: AuthErrorResponseSchema,
  },
  logoutAll: {
    body: LogoutAllRequestSchema,
    response: LogoutAllResponseSchema,
    error: AuthErrorResponseSchema,
  },
  forgotPassword: {
    body: ForgotPasswordRequestSchema,
    response: ForgotPasswordResponseSchema,
    error: AuthErrorResponseSchema,
  },
  resetPassword: {
    body: ResetPasswordRequestSchema,
    response: ResetPasswordResponseSchema,
    error: AuthErrorResponseSchema,
  },
  changePassword: {
    body: ChangePasswordRequestSchema,
    response: ChangePasswordResponseSchema,
    error: AuthErrorResponseSchema,
  },
  capabilities: {
    response: AuthCapabilitiesResponseSchema,
    error: AuthErrorResponseSchema,
  },
  passkeyRegistrationOptions: {
    body: PasskeyRegistrationOptionsRequestSchema,
    response: PasskeyRegistrationOptionsResponseSchema,
    error: AuthErrorResponseSchema,
  },
  verifyPasskeyRegistration: {
    body: PasskeyRegistrationVerifyRequestSchema,
    response: PasskeyRegistrationVerifyResponseSchema,
    error: AuthErrorResponseSchema,
  },
  passkeyAuthenticationOptions: {
    body: PasskeyAuthenticationOptionsRequestSchema,
    response: PasskeyAuthenticationOptionsResponseSchema,
    error: AuthErrorResponseSchema,
  },
  verifyPasskeyAuthentication: {
    body: PasskeyAuthenticationVerifyRequestSchema,
    response: PasskeyAuthenticationVerifyResponseSchema,
    error: AuthErrorResponseSchema,
  },
  listPasskeys: {
    response: PasskeyListResponseSchema,
    error: AuthErrorResponseSchema,
  },
  renamePasskey: {
    params: PasskeyIdParamsSchema,
    body: RenamePasskeyRequestSchema,
    response: RenamePasskeyResponseSchema,
    error: AuthErrorResponseSchema,
  },
  revokePasskey: {
    params: PasskeyIdParamsSchema,
    response: RevokePasskeyResponseSchema,
    error: AuthErrorResponseSchema,
  },
  currentUser: {
    response: CurrentUserResponseSchema,
    error: AuthErrorResponseSchema,
  },
} as const;
