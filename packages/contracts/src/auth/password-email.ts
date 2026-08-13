import { z } from "zod";

import { AuthenticationSuccessResponseSchema } from "./models";
import {
  AuthIdSchema,
  AuthTimestampSchema,
  EmailSchema,
  EmptyAuthBodySchema,
  PasswordSchema,
  VerificationCodeSchema,
} from "./primitives";

export const AuthFlowSchema = z
  .object({
    flowId: AuthIdSchema,
    expiresAt: AuthTimestampSchema,
    resendAvailableAt: AuthTimestampSchema,
  })
  .strict();

export const SignUpRequestSchema = z
  .object({
    email: EmailSchema,
    password: PasswordSchema,
  })
  .strict();

export const SignUpResponseSchema = z
  .object({
    status: z.literal("verification_pending"),
    verification: AuthFlowSchema,
  })
  .strict();

export const EmailVerificationResendRequestSchema = z
  .object({
    flowId: AuthIdSchema,
  })
  .strict();

export const EmailVerificationResendResponseSchema = SignUpResponseSchema;

export const EmailVerificationVerifyRequestSchema = z
  .object({
    flowId: AuthIdSchema,
    code: VerificationCodeSchema,
  })
  .strict();

export const EmailVerificationVerifyResponseSchema =
  AuthenticationSuccessResponseSchema;

export const PasswordLoginRequestSchema = z
  .object({
    email: EmailSchema,
    password: z.string().min(1).max(256),
  })
  .strict();

export const EmailVerificationRequiredResponseSchema = z
  .object({
    status: z.literal("email_verification_required"),
    verification: AuthFlowSchema,
  })
  .strict();

export const PasswordLoginResponseSchema = z.discriminatedUnion("status", [
  AuthenticationSuccessResponseSchema,
  EmailVerificationRequiredResponseSchema,
]);

export const RefreshRequestSchema = EmptyAuthBodySchema;
export const RefreshResponseSchema = AuthenticationSuccessResponseSchema;

export const LogoutRequestSchema = EmptyAuthBodySchema;
export const LogoutResponseSchema = z
  .object({ status: z.literal("signed_out") })
  .strict();

export const LogoutAllRequestSchema = EmptyAuthBodySchema;
export const LogoutAllResponseSchema = z
  .object({ status: z.literal("all_sessions_revoked") })
  .strict();

export const ForgotPasswordRequestSchema = z
  .object({ email: EmailSchema })
  .strict();

export const ForgotPasswordResponseSchema = z
  .object({
    status: z.literal("recovery_pending"),
    recovery: AuthFlowSchema,
  })
  .strict();

export const ResetPasswordRequestSchema = z
  .object({
    flowId: AuthIdSchema,
    code: VerificationCodeSchema,
    newPassword: PasswordSchema,
  })
  .strict();

export const ResetPasswordResponseSchema = z
  .object({ status: z.literal("password_reset") })
  .strict();

export const ChangePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1).max(256),
    newPassword: PasswordSchema,
  })
  .strict()
  .superRefine(({ currentPassword, newPassword }, context) => {
    if (currentPassword === newPassword) {
      context.addIssue({
        code: "custom",
        message: "New password must differ from the current password",
        path: ["newPassword"],
      });
    }
  });

export const ChangePasswordResponseSchema = AuthenticationSuccessResponseSchema;

export type AuthFlow = z.infer<typeof AuthFlowSchema>;
export type SignUpRequest = z.infer<typeof SignUpRequestSchema>;
export type SignUpResponse = z.infer<typeof SignUpResponseSchema>;
export type EmailVerificationResendRequest = z.infer<
  typeof EmailVerificationResendRequestSchema
>;
export type EmailVerificationResendResponse = z.infer<
  typeof EmailVerificationResendResponseSchema
>;
export type EmailVerificationVerifyRequest = z.infer<
  typeof EmailVerificationVerifyRequestSchema
>;
export type EmailVerificationVerifyResponse = z.infer<
  typeof EmailVerificationVerifyResponseSchema
>;
export type PasswordLoginRequest = z.infer<typeof PasswordLoginRequestSchema>;
export type EmailVerificationRequiredResponse = z.infer<
  typeof EmailVerificationRequiredResponseSchema
>;
export type PasswordLoginResponse = z.infer<typeof PasswordLoginResponseSchema>;
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;
export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;
export type LogoutAllRequest = z.infer<typeof LogoutAllRequestSchema>;
export type LogoutAllResponse = z.infer<typeof LogoutAllResponseSchema>;
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;
export type ForgotPasswordResponse = z.infer<
  typeof ForgotPasswordResponseSchema
>;
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;
export type ResetPasswordResponse = z.infer<typeof ResetPasswordResponseSchema>;
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
export type ChangePasswordResponse = z.infer<
  typeof ChangePasswordResponseSchema
>;
