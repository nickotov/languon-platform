import { z } from 'zod';

import {
    AccessTokenSchema,
    AuthIdSchema,
    AuthTimestampSchema,
    EmailSchema,
} from './primitives';
import { HandleSchema } from './user-profile';

export const AuthUserSchema = z
    .object({
        id: AuthIdSchema,
        handle: HandleSchema.nullable(),
        primaryEmail: EmailSchema,
        status: z.literal('active'),
        emailVerified: z.literal(true),
        createdAt: AuthTimestampSchema,
    })
    .strict();

export const AuthSessionSchema = z
    .object({
        id: AuthIdSchema,
        createdAt: AuthTimestampSchema,
        authenticatedAt: AuthTimestampSchema,
        expiresAt: AuthTimestampSchema,
        recentAuthenticationExpiresAt: AuthTimestampSchema.nullable(),
    })
    .strict();

export const AuthenticationSuccessResponseSchema = z
    .object({
        status: z.literal('authenticated'),
        accessToken: AccessTokenSchema,
        accessTokenExpiresAt: AuthTimestampSchema,
        tokenType: z.literal('Bearer'),
        user: AuthUserSchema,
        session: AuthSessionSchema,
    })
    .strict();

export const CurrentUserResponseSchema = z
    .object({
        user: AuthUserSchema,
        session: AuthSessionSchema,
    })
    .strict();

export const AuthCapabilitiesResponseSchema = z
    .object({
        email: z
            .object({
                signUp: z.boolean(),
                verification: z.boolean(),
                passwordRecovery: z.boolean(),
            })
            .strict(),
        passwordAuthentication: z.boolean(),
        passkeys: z
            .object({
                authentication: z.boolean(),
                registration: z.boolean(),
            })
            .strict(),
    })
    .strict();

export type AuthUser = z.infer<typeof AuthUserSchema>;
export type AuthSession = z.infer<typeof AuthSessionSchema>;
export type AuthenticationSuccessResponse = z.infer<
    typeof AuthenticationSuccessResponseSchema
>;
export type CurrentUserResponse = z.infer<typeof CurrentUserResponseSchema>;
export type AuthCapabilitiesResponse = z.infer<
    typeof AuthCapabilitiesResponseSchema
>;
