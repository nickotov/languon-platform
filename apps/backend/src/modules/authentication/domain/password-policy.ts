import { commonPasswords } from './common-passwords';

export type PasswordPolicyViolationReason = 'common' | 'too_long' | 'too_short';

export class PasswordPolicyViolationError extends Error {
    public constructor(public readonly reason: PasswordPolicyViolationReason) {
        super('The password does not satisfy the password policy.');
        this.name = 'PasswordPolicyViolationError';
    }
}

export class PasswordPolicy {
    public static readonly maximumCodePoints = 128;
    public static readonly minimumCodePoints = 15;

    public assertAcceptable(password: string): void {
        const length = [...password].length;

        if (length < PasswordPolicy.minimumCodePoints) {
            throw new PasswordPolicyViolationError('too_short');
        }

        if (length > PasswordPolicy.maximumCodePoints) {
            throw new PasswordPolicyViolationError('too_long');
        }

        if (commonPasswords.has(password.toLowerCase())) {
            throw new PasswordPolicyViolationError('common');
        }
    }

    public areEqual(first: string, second: string): boolean {
        return first === second;
    }
}
