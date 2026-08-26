import { describe, expect, it } from 'vitest';

import { HmacDictionaryCryptography } from '../../../../../src/modules/dictionaries/infrastructure/crypto/dictionary-cryptography';

class DeterministicEntropy {
    private value = 0;

    public randomBytes(length: number): Uint8Array {
        this.value += 1;
        return new Uint8Array(length).fill(this.value);
    }
}

describe('HmacDictionaryCryptography', () => {
    it('issues opaque capabilities and verifies digests in constant-shape paths', () => {
        const cryptography = new HmacDictionaryCryptography({
            entropy: new DeterministicEntropy(),
            secret: 'dictionary-test-secret-that-is-longer-than-thirty-two-bytes',
        });
        const first = cryptography.issueShare(1);
        const rotated = cryptography.issueShare(1);

        expect(first.key).toHaveLength(43);
        expect(first.locator).toHaveLength(32);
        expect(first.digest).toMatch(/^hmac-sha256:v1:/);
        expect(cryptography.verifyShare(first.key, first.digest)).toBe(true);
        expect(cryptography.verifyShare(rotated.key, first.digest)).toBe(false);
        expect(cryptography.verifyShare(first.key, null)).toBe(false);
        expect(rotated.locator).not.toBe(first.locator);
    });

    it('uses stable canonical and domain-separated idempotency fingerprints', () => {
        const cryptography = new HmacDictionaryCryptography({
            entropy: new DeterministicEntropy(),
            secret: 'dictionary-test-secret-that-is-longer-than-thirty-two-bytes',
        });
        expect(cryptography.fingerprint({ a: 1, b: 2 })).toBe(
            cryptography.fingerprint({ b: 2, a: 1 }),
        );
        expect(cryptography.fingerprint({ a: 1 })).not.toBe(
            cryptography.shareDigest('{"a":1}', 1),
        );
    });
});
