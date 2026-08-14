import { z } from 'zod';

import { AuthenticationSuccessResponseSchema } from './models';
import {
    AuthIdSchema,
    AuthTimestampSchema,
    Base64UrlSchema,
    EmailSchema,
    EmptyAuthBodySchema,
} from './primitives';

export const PasskeyNameSchema = z
    .string()
    .trim()
    .max(160)
    .superRefine((name, context) => {
        const codePointLength = Array.from(name).length;

        if (codePointLength < 1 || codePointLength > 80) {
            context.addIssue({
                code: 'custom',
                message:
                    'Passkey name must contain between 1 and 80 characters',
            });
        }
    });

export const AuthenticatorTransportSchema = z.enum([
    'ble',
    'cable',
    'hybrid',
    'internal',
    'nfc',
    'smart-card',
    'usb',
]);

const PublicKeyCredentialDescriptorSchema = z
    .object({
        id: Base64UrlSchema.max(2_048),
        type: z.literal('public-key'),
        transports: z.array(AuthenticatorTransportSchema).max(7).optional(),
    })
    .strict();

const ClientExtensionResultsSchema = z
    .object({
        credProps: z
            .object({
                rk: z.boolean().optional(),
            })
            .strict()
            .optional(),
    })
    .strict();

export const PasskeyRegistrationPublicKeyOptionsSchema = z
    .object({
        rp: z
            .object({
                id: z.string().min(1).max(253),
                name: z.string().min(1).max(100),
            })
            .strict(),
        user: z
            .object({
                id: Base64UrlSchema.max(512),
                name: EmailSchema,
                displayName: z.string().min(1).max(254),
            })
            .strict(),
        challenge: Base64UrlSchema.max(512),
        pubKeyCredParams: z
            .array(
                z
                    .object({
                        alg: z.number().int().min(-65_536).max(65_536),
                        type: z.literal('public-key'),
                    })
                    .strict(),
            )
            .min(1)
            .max(16),
        timeout: z.number().int().min(1).max(600_000),
        attestation: z.literal('none'),
        excludeCredentials: z
            .array(PublicKeyCredentialDescriptorSchema)
            .max(64)
            .optional(),
        authenticatorSelection: z
            .object({
                authenticatorAttachment: z
                    .enum(['cross-platform', 'platform'])
                    .optional(),
                residentKey: z.literal('required'),
                requireResidentKey: z.literal(true).optional(),
                userVerification: z.literal('required'),
            })
            .strict(),
        hints: z
            .array(z.enum(['client-device', 'hybrid', 'security-key']))
            .max(3)
            .optional(),
    })
    .strict();

export const PasskeyRegistrationOptionsRequestSchema = EmptyAuthBodySchema;

export const PasskeyRegistrationOptionsResponseSchema = z
    .object({
        flowId: AuthIdSchema,
        expiresAt: AuthTimestampSchema,
        options: PasskeyRegistrationPublicKeyOptionsSchema,
    })
    .strict();

export const PasskeyRegistrationCredentialSchema = z
    .object({
        id: Base64UrlSchema.max(2_048),
        rawId: Base64UrlSchema.max(2_048),
        response: z
            .object({
                clientDataJSON: Base64UrlSchema.max(32_768),
                attestationObject: Base64UrlSchema.max(200_000),
                transports: z
                    .array(AuthenticatorTransportSchema)
                    .max(7)
                    .optional(),
                publicKeyAlgorithm: z
                    .number()
                    .int()
                    .min(-65_536)
                    .max(65_536)
                    .optional(),
                publicKey: Base64UrlSchema.max(32_768).optional(),
                authenticatorData: Base64UrlSchema.max(32_768).optional(),
            })
            .strict(),
        type: z.literal('public-key'),
        authenticatorAttachment: z
            .enum(['cross-platform', 'platform'])
            .optional(),
        clientExtensionResults: ClientExtensionResultsSchema,
    })
    .strict();

export const PasskeyRegistrationVerifyRequestSchema = z
    .object({
        flowId: AuthIdSchema,
        name: PasskeyNameSchema,
        credential: PasskeyRegistrationCredentialSchema,
    })
    .strict();

export const PasskeyMetadataSchema = z
    .object({
        id: AuthIdSchema,
        name: PasskeyNameSchema,
        createdAt: AuthTimestampSchema,
        lastUsedAt: AuthTimestampSchema.nullable(),
    })
    .strict();

export const PasskeyRegistrationVerifyResponseSchema = z
    .object({
        status: z.literal('passkey_registered'),
        passkey: PasskeyMetadataSchema,
    })
    .strict();

export const PasskeyAuthenticationPublicKeyOptionsSchema = z
    .object({
        challenge: Base64UrlSchema.max(512),
        timeout: z.number().int().min(1).max(600_000),
        rpId: z.string().min(1).max(253),
        userVerification: z.literal('required'),
        hints: z
            .array(z.enum(['client-device', 'hybrid', 'security-key']))
            .max(3)
            .optional(),
    })
    .strict();

export const PasskeyAuthenticationOptionsRequestSchema = EmptyAuthBodySchema;

export const PasskeyAuthenticationOptionsResponseSchema = z
    .object({
        flowId: AuthIdSchema,
        expiresAt: AuthTimestampSchema,
        options: PasskeyAuthenticationPublicKeyOptionsSchema,
    })
    .strict();

export const PasskeyAuthenticationCredentialSchema = z
    .object({
        id: Base64UrlSchema.max(2_048),
        rawId: Base64UrlSchema.max(2_048),
        response: z
            .object({
                clientDataJSON: Base64UrlSchema.max(32_768),
                authenticatorData: Base64UrlSchema.max(32_768),
                signature: Base64UrlSchema.max(32_768),
                userHandle: Base64UrlSchema.max(2_048),
            })
            .strict(),
        type: z.literal('public-key'),
        authenticatorAttachment: z
            .enum(['cross-platform', 'platform'])
            .optional(),
        clientExtensionResults: ClientExtensionResultsSchema,
    })
    .strict();

export const PasskeyAuthenticationVerifyRequestSchema = z
    .object({
        flowId: AuthIdSchema,
        credential: PasskeyAuthenticationCredentialSchema,
    })
    .strict();

export const PasskeyAuthenticationVerifyResponseSchema =
    AuthenticationSuccessResponseSchema;

export const PasskeyListResponseSchema = z
    .object({
        passkeys: z.array(PasskeyMetadataSchema).max(50),
    })
    .strict();

export const PasskeyIdParamsSchema = z
    .object({ passkeyId: AuthIdSchema })
    .strict();

export const RenamePasskeyRequestSchema = z
    .object({ name: PasskeyNameSchema })
    .strict();

export const RenamePasskeyResponseSchema = z
    .object({ passkey: PasskeyMetadataSchema })
    .strict();

export const RevokePasskeyResponseSchema = z
    .object({ status: z.literal('passkey_revoked') })
    .strict();

export type PasskeyName = z.infer<typeof PasskeyNameSchema>;
export type AuthenticatorTransport = z.infer<
    typeof AuthenticatorTransportSchema
>;
export type PasskeyRegistrationPublicKeyOptions = z.infer<
    typeof PasskeyRegistrationPublicKeyOptionsSchema
>;
export type PasskeyRegistrationOptionsRequest = z.infer<
    typeof PasskeyRegistrationOptionsRequestSchema
>;
export type PasskeyRegistrationOptionsResponse = z.infer<
    typeof PasskeyRegistrationOptionsResponseSchema
>;
export type PasskeyRegistrationCredential = z.infer<
    typeof PasskeyRegistrationCredentialSchema
>;
export type PasskeyRegistrationVerifyRequest = z.infer<
    typeof PasskeyRegistrationVerifyRequestSchema
>;
export type PasskeyMetadata = z.infer<typeof PasskeyMetadataSchema>;
export type PasskeyRegistrationVerifyResponse = z.infer<
    typeof PasskeyRegistrationVerifyResponseSchema
>;
export type PasskeyAuthenticationPublicKeyOptions = z.infer<
    typeof PasskeyAuthenticationPublicKeyOptionsSchema
>;
export type PasskeyAuthenticationOptionsRequest = z.infer<
    typeof PasskeyAuthenticationOptionsRequestSchema
>;
export type PasskeyAuthenticationOptionsResponse = z.infer<
    typeof PasskeyAuthenticationOptionsResponseSchema
>;
export type PasskeyAuthenticationCredential = z.infer<
    typeof PasskeyAuthenticationCredentialSchema
>;
export type PasskeyAuthenticationVerifyRequest = z.infer<
    typeof PasskeyAuthenticationVerifyRequestSchema
>;
export type PasskeyAuthenticationVerifyResponse = z.infer<
    typeof PasskeyAuthenticationVerifyResponseSchema
>;
export type PasskeyListResponse = z.infer<typeof PasskeyListResponseSchema>;
export type PasskeyIdParams = z.infer<typeof PasskeyIdParamsSchema>;
export type RenamePasskeyRequest = z.infer<typeof RenamePasskeyRequestSchema>;
export type RenamePasskeyResponse = z.infer<typeof RenamePasskeyResponseSchema>;
export type RevokePasskeyResponse = z.infer<typeof RevokePasskeyResponseSchema>;
