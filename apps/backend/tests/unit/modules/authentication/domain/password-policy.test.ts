import { describe, expect, it } from 'vitest';

import {
    PasswordPolicy,
    PasswordPolicyViolationError,
} from '../../../../../src/modules/authentication/domain/password-policy';

describe('PasswordPolicy', () => {
    const policy = new PasswordPolicy();

    it('accepts long Unicode passwords, spaces, and paste-friendly phrases', () => {
        expect(() =>
            policy.assertAcceptable('correct horse battery staple 🐴'),
        ).not.toThrow();
    });

    it('counts Unicode code points rather than UTF-16 code units', () => {
        const fourteenEmoji = '😀'.repeat(14);
        const fifteenEmoji = '😀'.repeat(15);

        expect(() => policy.assertAcceptable(fourteenEmoji)).toThrow(
            PasswordPolicyViolationError,
        );
        expect(() => policy.assertAcceptable(fifteenEmoji)).not.toThrow();
    });

    it('does not trim passwords before validating or comparing them', () => {
        const withSpaces = '  long password phrase  ';

        expect(() => policy.assertAcceptable(withSpaces)).not.toThrow();
        expect(policy.areEqual(withSpaces, withSpaces.trim())).toBe(false);
    });

    it.each(['passwordpassword', 'PasswordPassword', '123456789012345'])(
        'rejects checked-in common password %j',
        (password) => {
            expect(() => policy.assertAcceptable(password)).toThrowError(
                expect.objectContaining({ reason: 'common' }),
            );
        },
    );

    it('rejects more than 128 code points', () => {
        expect(() => policy.assertAcceptable('a'.repeat(129))).toThrowError(
            expect.objectContaining({ reason: 'too_long' }),
        );
    });
});
