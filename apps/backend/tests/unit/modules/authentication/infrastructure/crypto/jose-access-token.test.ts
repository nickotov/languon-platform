import { decodeJwt, decodeProtectedHeader, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { InvalidAccessTokenError } from '../../../../../../src/modules/authentication/application/ports/access-token';
import type { Clock } from '../../../../../../src/modules/authentication/application/ports/clock';
import { AccessTokenClaims } from '../../../../../../src/modules/authentication/domain/access-token-claims';
import { JoseAccessTokenSigner } from '../../../../../../src/modules/authentication/infrastructure/crypto/jose-access-token';

const secret = 'a-secure-jwt-secret-with-at-least-32-bytes';
const otherSecret = 'a-different-jwt-secret-with-32-bytes-minimum';
const now = new Date('2026-08-13T10:00:00.000Z');
const clock: Clock = { now: () => now };
const standardPayload = {
    aud: 'languon-api',
    exp: now.getTime() / 1000 + 900,
    iat: now.getTime() / 1000,
    iss: 'languon',
    jti: 'token-id',
    sid: 'session-id',
    sub: 'user-id',
};

describe('JoseAccessTokenSigner', () => {
    it('issues an explicitly typed HS256 token containing only minimal claims', async () => {
        const signer = createSigner();
        const claims = AccessTokenClaims.issue({
            audience: 'languon-api',
            expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
            issuedAt: now,
            issuer: 'languon',
            sessionId: 'session-id',
            tokenId: 'token-id',
            userId: 'user-id',
        });

        const token = await signer.sign(claims);

        expect(decodeProtectedHeader(token)).toEqual({
            alg: 'HS256',
            typ: 'JWT',
        });
        expect(decodeJwt(token)).toEqual(standardPayload);
        await expect(signer.verify(token)).resolves.toEqual(claims);
    });

    it('refuses to sign claims for another issuer or audience', async () => {
        const signer = createSigner();
        const claims = AccessTokenClaims.issue({
            audience: 'another-api',
            expiresAt: new Date(now.getTime() + 60_000),
            issuedAt: now,
            issuer: 'languon',
            sessionId: 'session-id',
            tokenId: 'token-id',
            userId: 'user-id',
        });

        await expect(signer.sign(claims)).rejects.toThrow(RangeError);
    });

    it.each([
        {
            name: 'the algorithm is not HS256',
            token: () => signToken(standardPayload, secret, 'HS384', 'JWT'),
        },
        {
            name: 'the signing key is different',
            token: () =>
                signToken(standardPayload, otherSecret, 'HS256', 'JWT'),
        },
        {
            name: 'the JWT type is missing',
            token: () => signToken(standardPayload, secret, 'HS256'),
        },
        {
            name: 'the JWT type is different',
            token: () =>
                signToken(standardPayload, secret, 'HS256', 'refresh+jwt'),
        },
        {
            name: 'a required claim is missing',
            token: () => {
                const { sid: _sid, ...payload } = standardPayload;
                return signToken(payload, secret, 'HS256', 'JWT');
            },
        },
        {
            name: 'the issuer is different',
            token: () =>
                signToken(
                    { ...standardPayload, iss: 'another-issuer' },
                    secret,
                    'HS256',
                    'JWT',
                ),
        },
        {
            name: 'the audience is an array',
            token: () =>
                signToken(
                    { ...standardPayload, aud: ['languon-api'] },
                    secret,
                    'HS256',
                    'JWT',
                ),
        },
        {
            name: 'the token is expired',
            token: () =>
                signToken(
                    { ...standardPayload, exp: now.getTime() / 1000 },
                    secret,
                    'HS256',
                    'JWT',
                ),
        },
        {
            name: 'the issue time exceeds the clock tolerance',
            token: () =>
                signToken(
                    {
                        ...standardPayload,
                        exp: now.getTime() / 1000 + 906,
                        iat: now.getTime() / 1000 + 6,
                    },
                    secret,
                    'HS256',
                    'JWT',
                ),
        },
    ])('rejects a token when $name', async ({ token }) => {
        await expect(createSigner().verify(await token())).rejects.toThrow(
            InvalidAccessTokenError,
        );
    });

    it('rejects malformed tokens without leaking parser errors', async () => {
        await expect(createSigner().verify('not-a-jwt')).rejects.toEqual(
            new InvalidAccessTokenError(),
        );
    });

    it('rejects weak secrets and excessive clock tolerance', () => {
        expect(
            () =>
                new JoseAccessTokenSigner({
                    audience: 'languon-api',
                    clock,
                    issuer: 'languon',
                    secret: 'too-short',
                }),
        ).toThrow(RangeError);
        expect(
            () =>
                new JoseAccessTokenSigner({
                    audience: 'languon-api',
                    clock,
                    clockToleranceSeconds: 31,
                    issuer: 'languon',
                    secret,
                }),
        ).toThrow(RangeError);
    });
});

function createSigner(): JoseAccessTokenSigner {
    return new JoseAccessTokenSigner({
        audience: 'languon-api',
        clock,
        issuer: 'languon',
        secret,
    });
}

async function signToken(
    payload: Record<string, unknown>,
    signingSecret: string,
    algorithm: 'HS256' | 'HS384',
    type?: string,
): Promise<string> {
    return new SignJWT(payload)
        .setProtectedHeader({ alg: algorithm, ...(type ? { typ: type } : {}) })
        .sign(new TextEncoder().encode(signingSecret));
}
