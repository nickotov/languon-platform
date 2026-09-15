export class AdminAccessDeniedError extends Error {
    public constructor() {
        super('Administrator access is required.');
        this.name = 'AdminAccessDeniedError';
    }
}

export class AdminUserNotFoundError extends Error {
    public constructor() {
        super('The requested user was not found.');
        this.name = 'AdminUserNotFoundError';
    }
}

export class AdminUserStateConflictError extends Error {
    public constructor() {
        super('The user changed since it was loaded.');
        this.name = 'AdminUserStateConflictError';
    }
}
export class AdminDeletionCancellationUnavailableError extends Error {
    public constructor() {
        super('Account deletion can no longer be cancelled.');
        this.name = 'AdminDeletionCancellationUnavailableError';
    }
}
export class AdminCancellationJournalUnavailableError extends Error {
    public constructor() {
        super('Account deletion cancellation is temporarily unavailable.');
        this.name = 'AdminCancellationJournalUnavailableError';
    }
}

export class AdminSelfDisableForbiddenError extends Error {
    public constructor() {
        super('An administrator cannot disable their own account.');
        this.name = 'AdminSelfDisableForbiddenError';
    }
}

export class AdminLastOwnerForbiddenError extends Error {
    public constructor() {
        super('The last active owner cannot be disabled or revoked.');
        this.name = 'AdminLastOwnerForbiddenError';
    }
}

export class AdminMembershipConflictError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'AdminMembershipConflictError';
    }
}

export class AdminOperatorActorRequiredError extends Error {
    public constructor() {
        super('An active owner actor is required for this operation.');
        this.name = 'AdminOperatorActorRequiredError';
    }
}
