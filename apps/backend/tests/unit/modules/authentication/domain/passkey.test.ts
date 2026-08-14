import { describe, expect, it } from 'vitest';

import {
    InvalidPasskeyNameError,
    Passkey,
} from '../../../../../src/modules/authentication/domain/passkey';

const now = new Date('2026-08-13T10:00:00.000Z');

function createPasskey(): Passkey {
    return Passkey.register({
        backedUp: false,
        counter: 0,
        createdAt: now,
        credentialId: 'credential-id',
        credentialPublicKey: new Uint8Array([1, 2, 3]),
        deviceType: 'single_device',
        id: '0198a941-7824-7de6-8200-e54baa45a926',
        name: '  Laptop  ',
        transports: ['internal'],
        userHandle: 'user-handle',
        userId: '0198a941-8ace-7115-aec6-d2b594aaee06',
    });
}

describe('Passkey', () => {
    it('trims its name and exposes a deterministic canonical name', () => {
        const passkey = createPasskey();

        expect(passkey.name).toBe('Laptop');
        expect(passkey.canonicalName).toBe('laptop');
    });

    it.each(['', '   ', 'x'.repeat(81)])('rejects invalid name %j', (name) => {
        expect(() =>
            Passkey.register({ ...createPasskey().toProperties(), name }),
        ).toThrow(InvalidPasskeyNameError);
    });

    it('renames without changing credential material', () => {
        const original = createPasskey();
        const renamed = original.rename('Security Key', now);

        expect(renamed.name).toBe('Security Key');
        expect(renamed.credentialPublicKey).toEqual(
            original.credentialPublicKey,
        );
        expect(renamed.id).toBe(original.id);
    });

    it('updates authentication metadata and revokes idempotently', () => {
        const used = createPasskey().recordUse({
            backedUp: true,
            counter: 1,
            deviceType: 'multi_device',
            now,
        });
        const revoked = used.revoke(now);

        expect(used).toMatchObject({
            backedUp: true,
            counter: 1,
            deviceType: 'multi_device',
            lastUsedAt: now,
        });
        expect(revoked.revokedAt).toEqual(now);
        expect(revoked.revoke(now)).toBe(revoked);
    });
});
