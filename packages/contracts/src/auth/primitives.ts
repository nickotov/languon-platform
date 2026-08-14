import { z } from 'zod';

const ASCII_EMAIL_PATTERN = /^[\x21-\x7e]+$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export const AuthIdSchema = z.uuid();

export const AuthTimestampSchema = z.iso.datetime({ offset: true });

export const EmailSchema = z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .regex(
        ASCII_EMAIL_PATTERN,
        'Email addresses must contain only ASCII characters',
    )
    .email();

export const PasswordSchema = z
    .string()
    .max(256)
    .superRefine((password, context) => {
        const codePointLength = Array.from(password).length;

        if (codePointLength < 15) {
            context.addIssue({
                code: 'custom',
                message:
                    'Password must contain at least 15 Unicode code points',
            });
        }

        if (codePointLength > 128) {
            context.addIssue({
                code: 'custom',
                message:
                    'Password must contain at most 128 Unicode code points',
            });
        }
    });

export const VerificationCodeSchema = z.string().regex(/^\d{4}$/);

export const Base64UrlSchema = z
    .string()
    .min(1)
    .max(200_000)
    .regex(BASE64URL_PATTERN);

export const AccessTokenSchema = z
    .string()
    .min(1)
    .max(4_096)
    .regex(JWT_PATTERN);

export const EmptyAuthBodySchema = z.object({}).strict();

export type AuthId = z.infer<typeof AuthIdSchema>;
export type AuthTimestamp = z.infer<typeof AuthTimestampSchema>;
export type Email = z.infer<typeof EmailSchema>;
export type Password = z.infer<typeof PasswordSchema>;
export type VerificationCode = z.infer<typeof VerificationCodeSchema>;
export type Base64Url = z.infer<typeof Base64UrlSchema>;
export type AccessToken = z.infer<typeof AccessTokenSchema>;
export type EmptyAuthBody = z.infer<typeof EmptyAuthBodySchema>;
