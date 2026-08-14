import { describe, expect, it } from 'vitest';

import { PasswordCredential } from '../../../../../src/modules/authentication/domain/password-credential';

const now = new Date('2026-08-13T10:00:00.000Z');

describe('PasswordCredential', () => {
    it('stores only versioned hash metadata', () => {
        const credential = PasswordCredential.create({
            algorithm: 'argon2id',
            createdAt: now,
            hash: '$argon2id$hash',
            parametersVersion: 1,
            userId: '0198a941-7824-7de6-8200-e54baa45a926',
        });

        expect(credential).toMatchObject({
            algorithm: 'argon2id',
            hash: '$argon2id$hash',
            parametersVersion: 1,
        });
        expect('password' in credential).toBe(false);
    });

    it('replaces hash metadata while preserving initial creation time', () => {
        const replacedAt = new Date('2026-08-13T10:05:00.000Z');
        const original = PasswordCredential.create({
            algorithm: 'argon2id',
            createdAt: now,
            hash: 'old-hash',
            parametersVersion: 1,
            userId: '0198a941-7824-7de6-8200-e54baa45a926',
        });
        const updated = original.replace({
            algorithm: 'argon2id',
            hash: 'new-hash',
            now: replacedAt,
            parametersVersion: 2,
        });

        expect(updated.createdAt).toEqual(now);
        expect(updated.updatedAt).toEqual(replacedAt);
        expect(updated.hash).toBe('new-hash');
        expect(updated.parametersVersion).toBe(2);
    });
});
