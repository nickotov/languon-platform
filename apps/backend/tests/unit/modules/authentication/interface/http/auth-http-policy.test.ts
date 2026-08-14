import { describe, expect, it } from 'vitest';

import {
    AuthHttpPolicy,
    InvalidBearerAuthorizationError,
    InvalidRequestOriginError,
} from '../../../../../../src/modules/authentication/interface/http/auth-http-policy';

describe('AuthHttpPolicy', () => {
    it('accepts only an exact configured request origin', () => {
        const policy = new AuthHttpPolicy({
            allowedOrigins: ['https://app.languon.example'],
            appEnvironment: 'production',
            refreshTokenTtlSeconds: 14 * 24 * 60 * 60,
        });

        expect(() =>
            policy.assertCookieRequestOrigin('https://app.languon.example'),
        ).not.toThrow();
        expect(() =>
            policy.assertCookieRequestOrigin('https://evil.example'),
        ).toThrow(InvalidRequestOriginError);
        expect(() => policy.assertCookieRequestOrigin(null)).toThrow(
            InvalidRequestOriginError,
        );
    });

    it('creates a host-only production refresh cookie without exposing Domain', () => {
        const policy = new AuthHttpPolicy({
            allowedOrigins: ['https://app.languon.example'],
            appEnvironment: 'production',
            refreshTokenTtlSeconds: 1_209_600,
        });
        const cookie = policy.createRefreshCookie('opaque_value');

        expect(cookie).toContain('__Host-languon_refresh=opaque_value');
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('Secure');
        expect(cookie).toContain('SameSite=Lax');
        expect(cookie).toContain('Path=/');
        expect(cookie).not.toContain('Domain=');
    });

    it("does not extend the refresh family's absolute expiry on rotation", () => {
        const policy = new AuthHttpPolicy({
            allowedOrigins: ['https://app.languon.example'],
            appEnvironment: 'production',
            now: () => new Date('2026-08-13T10:00:00.000Z'),
            refreshTokenTtlSeconds: 14 * 24 * 60 * 60,
        });

        expect(
            policy.createRefreshCookie('rotated', '2026-08-20T10:00:00.000Z'),
        ).toContain('Max-Age=604800');
    });

    it('uses a clearly local-only cookie name without Secure in development', () => {
        const policy = new AuthHttpPolicy({
            allowedOrigins: ['http://localhost:3333'],
            appEnvironment: 'development',
            refreshTokenTtlSeconds: 1_209_600,
        });

        expect(policy.createRefreshCookie('opaque_value')).toBe(
            'languon_refresh=opaque_value; Max-Age=1209600; Path=/; HttpOnly; SameSite=Lax',
        );
    });

    it('clears the same cookie and parses exactly one Bearer credential', () => {
        const policy = new AuthHttpPolicy({
            allowedOrigins: ['https://app.languon.example'],
            appEnvironment: 'production',
            refreshTokenTtlSeconds: 1_209_600,
        });

        expect(policy.clearRefreshCookie()).toContain('Max-Age=0');
        expect(
            policy.parseBearerAuthorization('Bearer header.payload.signature'),
        ).toBe('header.payload.signature');
        expect(() => policy.parseBearerAuthorization('Basic token')).toThrow(
            InvalidBearerAuthorizationError,
        );
        expect(() => policy.parseBearerAuthorization('Bearer one two')).toThrow(
            InvalidBearerAuthorizationError,
        );
    });

    it('trusts forwarding only from configured peers and walks the chain from the right', () => {
        const policy = new AuthHttpPolicy({
            allowedOrigins: ['https://app.languon.example'],
            appEnvironment: 'production',
            refreshTokenTtlSeconds: 1_209_600,
            trustProxy: true,
            trustedProxyCidrs: ['10.0.0.0/24', '2001:db8:1234::/64'],
        });

        expect(policy.clientAddress('203.0.113.9', '198.51.100.2')).toBe(
            '203.0.113.9',
        );
        expect(
            policy.clientAddress(
                '10.0.0.3',
                'attacker.example, 198.51.100.7, 10.0.0.2',
            ),
        ).toBe('198.51.100.7');
        expect(
            policy.clientAddress(
                '10.0.0.3',
                '192.0.2.200, 198.51.100.7, 10.0.0.2',
            ),
        ).toBe('198.51.100.7');
        expect(
            policy.clientAddress('2001:db8:1234::2', '2001:db8:ffff::9'),
        ).toBe('2001:db8:ffff::9');
    });

    it('requires an explicit trusted proxy network when forwarding is enabled', () => {
        expect(
            () =>
                new AuthHttpPolicy({
                    allowedOrigins: ['https://app.languon.example'],
                    appEnvironment: 'production',
                    refreshTokenTtlSeconds: 1_209_600,
                    trustProxy: true,
                }),
        ).toThrow('Trusted proxy CIDRs are required');
    });
});
