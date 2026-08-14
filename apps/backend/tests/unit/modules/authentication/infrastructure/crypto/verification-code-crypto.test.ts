import { describe, expect, it } from 'vitest';

import type { EntropySource } from '../../../../../../src/modules/authentication/application/ports/entropy';
import { HmacVerificationCodeDigester } from '../../../../../../src/modules/authentication/infrastructure/crypto/hmac-verification-code-digester';
import {
    FixedVerificationCodeGenerator,
    RandomVerificationCodeGenerator,
} from '../../../../../../src/modules/authentication/infrastructure/crypto/verification-code-generators';

const binding = {
    code: '0000',
    flowId: '0198a941-7824-7de6-8200-e54baa45a926',
    purpose: 'email_verification' as const,
    userId: '0198a941-8ace-7115-aec6-d2b594aaee06',
};

class QueuedEntropySource implements EntropySource {
    public constructor(private readonly values: Uint8Array[]) {}

    public randomBytes(_byteLength: number): Uint8Array {
        const value = this.values.shift();

        if (!value) {
            throw new Error('No deterministic entropy remains.');
        }

        return value;
    }
}

describe('verification-code crypto adapters', () => {
    it('always emits 0000 from the development/test generator', () => {
        const generator = new FixedVerificationCodeGenerator();

        expect(generator.generate()).toBe('0000');
        expect(generator.generate()).toBe('0000');
    });

    it('uses rejection sampling for a four-digit random code', () => {
        const generator = new RandomVerificationCodeGenerator(
            new QueuedEntropySource([
                new Uint8Array([0xff, 0xff]),
                new Uint8Array([0x00, 0x2a]),
            ]),
        );

        expect(generator.generate()).toBe('0042');
    });

    it('creates a deterministic purpose/user/flow-bound keyed digest', () => {
        const digester = new HmacVerificationCodeDigester(
            'code-hmac-secret-with-at-least-32-bytes-123456',
        );
        const digest = digester.digest(binding);

        expect(digest).toBe(digester.digest(binding));
        expect(digest).toMatch(/^hmac-sha256:v1:[A-Za-z0-9_-]{43}$/);
        expect(digester.matches({ ...binding, digest })).toBe(true);
        expect(digester.matches({ ...binding, code: '0001', digest })).toBe(
            false,
        );
        expect(
            digester.matches({ ...binding, purpose: 'password_reset', digest }),
        ).toBe(false);
        expect(
            digester.matches({ ...binding, flowId: 'different-flow', digest }),
        ).toBe(false);
        expect(
            digester.matches({ ...binding, userId: 'different-user', digest }),
        ).toBe(false);
    });

    it('rejects an HMAC key shorter than 32 bytes', () => {
        expect(() => new HmacVerificationCodeDigester('short-key')).toThrow(
            RangeError,
        );
    });
});
