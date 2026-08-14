import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import type { EntropySource } from '../../../../../../src/modules/authentication/application/ports/entropy';
import { OpaqueRefreshTokenService } from '../../../../../../src/modules/authentication/infrastructure/crypto/opaque-refresh-token';

describe('OpaqueRefreshTokenService', () => {
    it('issues a 256-bit base64url credential and stores only its SHA-256 digest', () => {
        const randomBytes = vi.fn(() =>
            Uint8Array.from({ length: 32 }, (_, i) => i),
        );
        const service = new OpaqueRefreshTokenService({ randomBytes });

        const credential = service.issue();

        expect(randomBytes).toHaveBeenCalledWith(32);
        expect(credential.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(credential.digest).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(credential.digest).not.toContain(credential.value);
        expect(credential.digest).toBe(
            createHash('sha256')
                .update(credential.value, 'utf8')
                .digest('base64url'),
        );
    });

    it('digests a presented credential deterministically for lookup', () => {
        const service = new OpaqueRefreshTokenService(unusedEntropy());

        expect(service.digest('presented-token')).toBe(
            service.digest('presented-token'),
        );
        expect(service.digest('presented-token')).not.toBe(
            service.digest('presented-toker'),
        );
    });

    it('fails closed when an entropy adapter violates the requested byte count', () => {
        const service = new OpaqueRefreshTokenService({
            randomBytes: () => new Uint8Array(31),
        });

        expect(() => service.issue()).toThrow(
            'The entropy source returned an invalid byte count.',
        );
    });
});

function unusedEntropy(): EntropySource {
    return {
        randomBytes: () => {
            throw new Error('Unexpected entropy request.');
        },
    };
}
