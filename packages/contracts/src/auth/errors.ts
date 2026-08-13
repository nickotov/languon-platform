import { z } from "zod";

export const AuthErrorCodeSchema = z.enum([
  "invalid_request",
  "invalid_credentials",
  "email_verification_required",
  "verification_failed",
  "password_policy_failed",
  "authentication_required",
  "forbidden",
  "recent_authentication_required",
  "not_found",
  "conflict",
  "rate_limited",
  "capability_unavailable",
  "service_unavailable",
  "passkey_verification_failed",
  "internal_error",
]);

export const AuthValidationIssueSchema = z
  .object({
    path: z.array(z.string().min(1).max(64)).max(8),
    message: z.string().min(1).max(256),
  })
  .strict();

export const AuthErrorSchema = z
  .object({
    code: AuthErrorCodeSchema,
    message: z.string().min(1).max(256),
    correlationId: z.string().min(1).max(128),
    issues: z.array(AuthValidationIssueSchema).max(20).optional(),
    retryAfterSeconds: z.number().int().min(1).max(86_400).optional(),
  })
  .strict();

export const AuthErrorResponseSchema = z
  .object({
    error: AuthErrorSchema,
  })
  .strict();

export type AuthErrorCode = z.infer<typeof AuthErrorCodeSchema>;
export type AuthValidationIssue = z.infer<typeof AuthValidationIssueSchema>;
export type AuthError = z.infer<typeof AuthErrorSchema>;
export type AuthErrorResponse = z.infer<typeof AuthErrorResponseSchema>;
