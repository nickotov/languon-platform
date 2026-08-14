import { describe, expect, it } from 'vitest';

import { Argon2idPasswordHasher } from '../../../../../../src/modules/authentication/infrastructure/crypto/argon2id-password-hasher';

describe('Argon2idPasswordHasher', () => {
    it('hashes and verifies with the approved Argon2id security floor', async () => {
        const hasher = new Argon2idPasswordHasher();
        const passwordHash = await hasher.hash(
            'correct horse battery staple 🐴',
        );

        expect(passwordHash.encoded).toMatch(
            /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/,
        );
        await expect(
            hasher.verify('correct horse battery staple 🐴', passwordHash),
        ).resolves.toEqual({ matches: true, needsRehash: false });
        await expect(
            hasher.verify('an incorrect password phrase', passwordHash),
        ).resolves.toEqual({ matches: false, needsRehash: false });
    });

    it('requests opportunistic rehash when deployment parameters advance', async () => {
        const previousHasher = new Argon2idPasswordHasher({
            parametersVersion: 1,
        });
        const currentHasher = new Argon2idPasswordHasher({
            memoryCostKiB: 20 * 1024,
            parametersVersion: 2,
            timeCost: 3,
        });
        const password = 'another long password phrase';
        const previousHash = await previousHasher.hash(password);

        await expect(
            currentHasher.verify(password, previousHash),
        ).resolves.toEqual({ matches: true, needsRehash: true });
    });

    it('treats malformed or unsupported hashes as a failed verification', async () => {
        const hasher = new Argon2idPasswordHasher();

        await expect(
            hasher.verify('long enough password', {
                encoded: 'not-a-password-hash',
                parametersVersion: 1,
            }),
        ).resolves.toEqual({ matches: false, needsRehash: false });
    });

    it('rejects parameter sets weaker than the approved floor', () => {
        expect(
            () => new Argon2idPasswordHasher({ memoryCostKiB: 19 * 1024 - 1 }),
        ).toThrow(RangeError);
        expect(() => new Argon2idPasswordHasher({ timeCost: 1 })).toThrow(
            RangeError,
        );
    });
});
