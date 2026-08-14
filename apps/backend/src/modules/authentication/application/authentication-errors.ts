export class AuthenticationCapabilityUnavailableError extends Error {
    public constructor() {
        super('This authentication capability is unavailable.');
        this.name = 'AuthenticationCapabilityUnavailableError';
    }
}

export class AuthenticationRequiredError extends Error {
    public constructor() {
        super('Authentication is required.');
        this.name = 'AuthenticationRequiredError';
    }
}

export class InvalidCredentialsError extends Error {
    public constructor() {
        super('The credentials are invalid.');
        this.name = 'InvalidCredentialsError';
    }
}

export class VerificationFailedError extends Error {
    public constructor() {
        super('The verification code is invalid or unavailable.');
        this.name = 'VerificationFailedError';
    }
}

export class PasswordUnchangedError extends Error {
    public constructor() {
        super('The new password must differ from the current password.');
        this.name = 'PasswordUnchangedError';
    }
}

export class RateLimitExceededError extends Error {
    public constructor(public readonly retryAfterSeconds: number) {
        super('Too many authentication attempts.');
        this.name = 'RateLimitExceededError';
    }
}

export class RecentAuthenticationRequiredError extends Error {
    public constructor() {
        super('Recent authentication is required.');
        this.name = 'RecentAuthenticationRequiredError';
    }
}

export class PasskeyOperationFailedError extends Error {
    public constructor() {
        super('The passkey operation could not be completed.');
        this.name = 'PasskeyOperationFailedError';
    }
}
