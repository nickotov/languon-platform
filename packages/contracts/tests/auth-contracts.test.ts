import { describe, expect, it } from 'vitest';

import {
    AuthEndpointSchemas,
    AuthErrorResponseSchema,
    AuthenticationSuccessResponseSchema,
    HandleSchema,
    UpdateHandleRequestSchema,
    ChangePasswordRequestSchema,
    EmailSchema,
    EmailVerificationVerifyRequestSchema,
    PasswordSchema,
    SignUpRequestSchema,
} from '../src';

const userId = '0198a941-8ace-7115-aec6-d2b594aaee06';
const sessionId = '0198a941-7824-7de6-8200-e54baa45a926';
const timestamp = '2026-08-13T10:00:00.000Z';

function authenticationResponse() {
    return {
        status: 'authenticated',
        accessToken: 'header.payload.signature',
        accessTokenExpiresAt: '2026-08-13T10:15:00.000Z',
        tokenType: 'Bearer',
        user: {
            id: userId,
            handle: null,
            primaryEmail: 'learner@example.com',
            status: 'active',
            emailVerified: true,
            createdAt: timestamp,
        },
        session: {
            id: sessionId,
            createdAt: timestamp,
            authenticatedAt: timestamp,
            expiresAt: '2026-08-27T10:00:00.000Z',
            recentAuthenticationExpiresAt: '2026-08-13T10:05:00.000Z',
        },
    } as const;
}

describe('authentication primitives', () => {
    it('normalizes only bounded lowercase ASCII handles', () => {
        expect(HandleSchema.parse('  Learner_123 ')).toBe('learner_123');
        expect(UpdateHandleRequestSchema.parse({ handle: 'LeArNeR' })).toEqual({ handle: 'learner' });
        for (const invalid of ['ab', 'a'.repeat(31), 'has space', 'ник', 'has-hyphen']) {
            expect(HandleSchema.safeParse(invalid).success).toBe(false);
        }
    });
    it('normalizes bounded ASCII email addresses', () => {
        expect(EmailSchema.parse('  Learner+Test@EXAMPLE.COM ')).toBe(
            'learner+test@example.com',
        );
    });

    it.each([
        'почта@example.com',
        'learner@пример.рф',
        `${'a'.repeat(245)}@example.com`,
    ])('rejects unsupported or oversized email address %j', (email) => {
        expect(EmailSchema.safeParse(email).success).toBe(false);
    });

    it('counts password length in Unicode code points and preserves contents', () => {
        const validPassword = ` ${'😀'.repeat(15)} `;

        expect(PasswordSchema.parse(validPassword)).toBe(validPassword);
        expect(PasswordSchema.safeParse('😀'.repeat(14)).success).toBe(false);
        expect(PasswordSchema.safeParse('😀'.repeat(129)).success).toBe(false);
    });
});

describe('password and email flow contracts', () => {
    it('strictly validates sign-up input without trimming passwords', () => {
        const parsed = SignUpRequestSchema.parse({
            email: ' LEARNER@EXAMPLE.COM ',
            password: '  a sufficiently long password  ',
        });

        expect(parsed).toEqual({
            email: 'learner@example.com',
            password: '  a sufficiently long password  ',
        });
        expect(
            SignUpRequestSchema.safeParse({
                ...parsed,
                passwordConfirmation: parsed.password,
            }).success,
        ).toBe(false);
    });

    it('requires a flow-bound four-digit verification code', () => {
        expect(
            EmailVerificationVerifyRequestSchema.parse({
                flowId: userId,
                code: '0000',
            }),
        ).toEqual({ flowId: userId, code: '0000' });

        expect(
            EmailVerificationVerifyRequestSchema.safeParse({
                flowId: userId,
                code: '00000',
            }).success,
        ).toBe(false);
    });

    it('rejects a same-password authenticated change at the boundary', () => {
        const password = 'a password long enough';

        expect(
            ChangePasswordRequestSchema.safeParse({
                currentPassword: password,
                newPassword: password,
            }).success,
        ).toBe(false);
    });
});

describe('shared authentication responses', () => {
    it('accepts a minimal access, session, and active-user payload', () => {
        expect(
            AuthenticationSuccessResponseSchema.parse(authenticationResponse()),
        ).toEqual(authenticationResponse());
    });

    it.each(['passwordHash', 'refreshToken', 'passkeys'])(
        'does not permit public user secret field %s',
        (field) => {
            const response = authenticationResponse();

            expect(
                AuthenticationSuccessResponseSchema.safeParse({
                    ...response,
                    user: { ...response.user, [field]: 'secret' },
                }).success,
            ).toBe(false);
        },
    );

    it('keeps errors stable, bounded, and free of arbitrary detail objects', () => {
        const error = {
            error: {
                code: 'rate_limited',
                message: 'Try again later',
                correlationId: 'request-123',
                retryAfterSeconds: 60,
            },
        } as const;

        expect(AuthErrorResponseSchema.parse(error)).toEqual(error);
        expect(
            AuthErrorResponseSchema.safeParse({
                error: { ...error.error, stack: 'internal details' },
            }).success,
        ).toBe(false);
        expect(
            AuthErrorResponseSchema.safeParse({
                error: { ...error.error, retryAfterSeconds: 86_401 },
            }).success,
        ).toBe(false);
    });

    it('publishes a schema boundary for every planned HTTP operation', () => {
        expect(Object.keys(AuthEndpointSchemas).sort()).toEqual(
            [
                'capabilities',
                'changePassword',
                'currentUser',
                'forgotPassword',
                'listPasskeys',
                'logout',
                'logoutAll',
                'passkeyAuthenticationOptions',
                'passkeyRegistrationOptions',
                'passwordLogin',
                'refresh',
                'renamePasskey',
                'resendEmailVerification',
                'resetPassword',
                'revokePasskey',
                'signUp',
                'verifyEmail',
                'verifyPasskeyAuthentication',
                'verifyPasskeyRegistration',
            ].sort(),
        );

        for (const contract of Object.values(AuthEndpointSchemas)) {
            expect(contract.error).toBe(AuthErrorResponseSchema);
            expect(contract.response).toBeDefined();
        }
    });
});
