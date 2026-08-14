import { describe, expect, it } from 'vitest';

import { AccessTokenClaims } from '../../../../../src/modules/authentication/domain/access-token-claims';

describe('AccessTokenClaims', () => {
    it('contains only minimum authorization identity claims', () => {
        const claims = AccessTokenClaims.issue({
            audience: 'languon-web',
            expiresAt: new Date('2026-08-13T10:15:00.000Z'),
            issuedAt: new Date('2026-08-13T10:00:00.000Z'),
            issuer: 'languon',
            sessionId: '0198a941-7824-7de6-8200-e54baa45a926',
            tokenId: '0198a941-8ace-7115-aec6-d2b594aaee06',
            userId: '0198a941-9498-7b8f-be17-cac0b0aca5b9',
        });

        expect(claims.toJwtPayload()).toEqual({
            aud: 'languon-web',
            exp: 1_786_616_100,
            iat: 1_786_615_200,
            iss: 'languon',
            jti: '0198a941-8ace-7115-aec6-d2b594aaee06',
            sid: '0198a941-7824-7de6-8200-e54baa45a926',
            sub: '0198a941-9498-7b8f-be17-cac0b0aca5b9',
        });
        expect('email' in claims.toJwtPayload()).toBe(false);
    });

    it('requires expiry strictly after issue', () => {
        const boundary = new Date('2026-08-13T10:00:00.000Z');
        expect(() =>
            AccessTokenClaims.issue({
                audience: 'languon-web',
                expiresAt: boundary,
                issuedAt: boundary,
                issuer: 'languon',
                sessionId: 'session',
                tokenId: 'token',
                userId: 'user',
            }),
        ).toThrow(RangeError);
    });
});
